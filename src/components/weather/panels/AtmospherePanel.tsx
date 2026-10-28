'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Compass,
  Gauge,
  Layers3,
  Wind,
  Zap,
  Rewind,
} from 'lucide-react'
import { useWeatherStore } from '@/store/weather-store'
import { useAtmosphere } from '@/hooks/use-weather-data'
import type { AtmosphereData, PressureLevelData } from '@/lib/weather-types'
import { faNum, faRound, faDateTime, windDirArrow } from '@/lib/format'
import { windDirectionFa } from '@/lib/weather-codes'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import TimeBar, { dayTicksFromTimes, relHoursFa } from '../TimeSlider'

// ---------- SVG geometry ----------
const SVG_W = 580
const SVG_H = 340
const TOP_PAD = 22
const BOTTOM_PAD = 30
const LEFT_PAD = 56
const RIGHT_PAD = 78
const PLOT_W = SVG_W - LEFT_PAD - RIGHT_PAD
const PLOT_H = SVG_H - TOP_PAD - BOTTOM_PAD
const LOG_SPAN = Math.log(1000 / 200)

/** Log-pressure Y position: 1000 hPa at plot bottom, 200 hPa at plot top */
function yOf(level: number): number {
  const frac = Math.log(1000 / level) / LOG_SPAN
  return TOP_PAD + (1 - frac) * PLOT_H
}

function rhColor(rh: number): string {
  if (rh < 40) return '#4ade80'
  if (rh <= 70) return '#facc15'
  return '#38bdf8'
}

interface StabilityInfo {
  label: string
  className: string
}

function capeInterp(cape: number): StabilityInfo {
  if (cape < 300) return { label: 'پایدار', className: 'text-emerald-400' }
  if (cape < 1000) return { label: 'ناپایداری متوسط', className: 'text-yellow-400' }
  if (cape < 2500) return { label: 'ناپایداری قوی', className: 'text-orange-400' }
  return { label: 'ناپایداری بسیار شدید', className: 'text-red-400' }
}

function liInterp(li: number): StabilityInfo {
  if (li < -6) return { label: 'ناپایداری بسیار شدید', className: 'text-red-400' }
  if (li < 0) return { label: 'ناپایدار', className: 'text-orange-400' }
  if (li < 3) return { label: 'مرزی', className: 'text-yellow-400' }
  return { label: 'پایدار', className: 'text-emerald-400' }
}

function shearInterp(shear: number): StabilityInfo {
  if (shear > 40) return { label: 'پتانسیل بالای توفان تندری', className: 'text-red-400' }
  if (shear > 25) return { label: 'برش متوسط، همرفت سازمان‌پذیر', className: 'text-amber-400' }
  return { label: 'برش ضعیف، همرفت محدود', className: 'text-emerald-400' }
}

/** Guess air-mass source from wind direction (meteorological, octants: N NE E SE S SW W NW) */
function airMassOf(deg: number): string {
  const oct = ((Math.round(deg / 45) % 8) + 8) % 8
  if (oct === 0 || oct === 1 || oct === 7) return 'توده قطبی/سرد'
  if (oct === 4 || oct === 5) return 'توده حاره‌ای/گرم'
  if (oct === 2) return 'توده خزری/مرطوب'
  if (oct === 6) return 'توده مدیترانه‌ای'
  return 'توده ترکیبی/گذری'
}

function levelAt(data: AtmosphereData, level: number): PressureLevelData | undefined {
  return data.levels.find((l) => l.level === level)
}

interface ProfilePoint {
  level: number
  temp: number
  dew: number
  rh: number
  ws: number
  wd: number
  gh: number
}

export default function AtmospherePanel() {
  const city = useWeatherStore((s) => s.city)
  const { data, loading, error } = useAtmosphere(city)
  const [hourIdx, setHourIdx] = useState(0)
  const [prevCity, setPrevCity] = useState(city)

  // reset selected hour when the city changes (render-time adjustment)
  if (prevCity !== city) {
    setPrevCity(city)
    setHourIdx(0)
  }

  const idx = Math.min(hourIdx, Math.max((data?.time.length ?? 1) - 1, 0))

  // day ticks + relative label for the 15-day scrubber
  const tMax = Math.max((data?.time.length ?? 1) - 1, 0)
  const ticks = useMemo(
    () => (data ? dayTicksFromTimes(data.time, tMax) : []),
    [data, tMax]
  )
  const rel = useMemo(() => {
    if (!data || data.time.length < 2 || idx === 0) return relHoursFa(0)
    const a = new Date(`${data.time[0].slice(0, 13)}:00Z`).getTime()
    const b = new Date(`${data.time[idx].slice(0, 13)}:00Z`).getTime()
    if (Number.isNaN(a) || Number.isNaN(b)) return relHoursFa(0)
    return relHoursFa(Math.max(0, Math.round((b - a) / 3_600_000)))
  }, [data, idx])

  const points: ProfilePoint[] = useMemo(() => {
    if (!data) return []
    return [...data.levels]
      .sort((a, b) => b.level - a.level)
      .map((lv) => ({
        level: lv.level,
        temp: lv.temperature[idx] ?? NaN,
        dew: lv.dewpoint[idx] ?? NaN,
        rh: lv.relativeHumidity[idx] ?? NaN,
        ws: lv.windSpeed[idx] ?? NaN,
        wd: lv.windDirection[idx] ?? NaN,
        gh: lv.geopotentialHeight[idx] ?? NaN,
      }))
      .filter((p) => Number.isFinite(p.temp) && Number.isFinite(p.dew))
  }, [data, idx])

  const xDomain = useMemo<{ min: number; max: number } | null>(() => {
    if (points.length === 0) return null
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      min = Math.min(min, p.temp, p.dew)
      max = Math.max(max, p.temp, p.dew)
    }
    return { min: min - 5, max: max + 5 }
  }, [points])

  function xOf(t: number): number {
    if (!xDomain || xDomain.max === xDomain.min) return LEFT_PAD + PLOT_W / 2
    return LEFT_PAD + ((t - xDomain.min) / (xDomain.max - xDomain.min)) * PLOT_W
  }

  const gridTemps = useMemo(() => {
    if (!xDomain) return []
    const out: number[] = []
    const start = Math.ceil(xDomain.min / 10) * 10
    for (let t = start; t <= xDomain.max; t += 10) out.push(t)
    return out
  }, [xDomain])

  // ---------- derived stats ----------
  const capeVal = data?.cape[idx]
  const liVal = data?.liftedIndex[idx]
  const lv500 = data ? levelAt(data, 500) : undefined
  const lv850 = data ? levelAt(data, 850) : undefined
  const lv1000 = data ? levelAt(data, 1000) : undefined

  const ws500 = lv500?.windSpeed[idx]
  const ws1000 = lv1000?.windSpeed[idx]
  const shear =
    ws500 !== undefined && ws1000 !== undefined ? Math.abs(ws500 - ws1000) : NaN

  const capeInfo = capeVal !== undefined && Number.isFinite(capeVal) ? capeInterp(capeVal) : null
  const liInfo = liVal !== undefined && Number.isFinite(liVal) ? liInterp(liVal) : null
  const shearInfo = Number.isFinite(shear) ? shearInterp(shear) : null

  const airMassParts: string[] = []
  const wd850 = lv850?.windDirection[idx]
  const wd500 = lv500?.windDirection[idx]
  if (wd850 !== undefined && Number.isFinite(wd850)) {
    airMassParts.push(
      `باد تراز ${faNum(850)}: ${windDirectionFa(wd850)} (${airMassOf(wd850)})`
    )
  }
  if (wd500 !== undefined && Number.isFinite(wd500)) {
    airMassParts.push(
      `باد تراز ${faNum(500)}: ${windDirectionFa(wd500)} (${airMassOf(wd500)})`
    )
  }

  // ---------- early states ----------
  if (loading && !data) {
    return (
      <div dir="rtl" className="space-y-3">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-[340px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div
        dir="rtl"
        className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center"
      >
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <span className="text-sm font-bold text-red-300">
          دریافت داده‌های ترازهای جو ناموفق بود
        </span>
        <span className="text-[11px] text-red-300/80">{error}</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div
        dir="rtl"
        className="rounded-2xl border border-border/50 bg-muted/30 p-6 text-center text-sm text-muted-foreground"
      >
        داده‌ای برای نمایش وجود ندارد
      </div>
    )
  }

  // ---------- chart geometry strings ----------
  const tempLine = points
    .map((p) => `${xOf(p.temp).toFixed(1)},${yOf(p.level).toFixed(1)}`)
    .join(' ')
  const dewLine = points
    .map((p) => `${xOf(p.dew).toFixed(1)},${yOf(p.level).toFixed(1)}`)
    .join(' ')
  const areaD =
    points.length >= 2
      ? `M ${points
          .map((p) => `${xOf(p.temp).toFixed(1)},${yOf(p.level).toFixed(1)}`)
          .join(' L ')} L ${[...points]
          .reverse()
          .map((p) => `${xOf(p.dew).toFixed(1)},${yOf(p.level).toFixed(1)}`)
          .join(' L ')} Z`
      : null

  return (
    <div dir="rtl" className="space-y-3 text-sm">
      {/* header */}
      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-bold">لایه‌های جو</div>
            <div className="text-[11px] text-muted-foreground">
              نیم‌رخ عمودی اتمسفر — {city.name}
            </div>
          </div>
        </div>
        {data.time[idx] ? (
          <div className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">
            {faDateTime(data.time[idx])}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          هشدار: نمایش داده پیشین — {error}
        </div>
      ) : null}

      {/* 15-day time scrubber — drag from now up to +15 days */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 px-3 py-1">
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <button
              onClick={() => setHourIdx(0)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 transition-all hover:scale-105 hover:bg-amber-500/30"
              title="بازگشت به اکنون"
            >
              <Rewind className="h-3.5 w-3.5" />
            </button>
          )}
          <TimeBar
            value={idx}
            max={tMax}
            ticks={ticks}
            onChange={setHourIdx}
            ariaLabel="اسلایدر زمان نیم‌رخ جو ۱۵ روزه"
            ariaValueText={`${rel} — ${data.time[idx] ? faDateTime(data.time[idx]) : ''}`}
          />
          <span
            className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
            dir="rtl"
          >
            {rel}
          </span>
        </div>
      </div>

      {/* profile chart */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
        <div dir="ltr" className="w-full">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="h-auto w-full"
            role="img"
            aria-label="نیم‌رخ دما و نقطه شبنم در ترازهای فشار جو"
          >
            <defs>
              <linearGradient id="atmoSpread" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgba(251,146,60,0.20)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.10)" />
              </linearGradient>
            </defs>

            {/* vertical temperature gridlines (every 10°C) + labels */}
            {gridTemps.map((t) => (
              <g key={`gx-${t}`}>
                <line
                  x1={xOf(t)}
                  x2={xOf(t)}
                  y1={TOP_PAD}
                  y2={TOP_PAD + PLOT_H}
                  stroke="rgba(148,163,184,0.14)"
                  strokeWidth={1}
                />
                <text
                  x={xOf(t)}
                  y={SVG_H - 10}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#64748b"
                >
                  {faNum(t)}
                </text>
              </g>
            ))}

            {/* horizontal pressure gridlines */}
            {points.map((p) => (
              <line
                key={`gy-${p.level}`}
                x1={LEFT_PAD}
                x2={LEFT_PAD + PLOT_W}
                y1={yOf(p.level)}
                y2={yOf(p.level)}
                stroke="rgba(148,163,184,0.10)"
                strokeWidth={1}
              />
            ))}

            {/* pressure level labels on Y axis */}
            {points.map((p) => (
              <text
                key={`yl-${p.level}`}
                x={LEFT_PAD - 8}
                y={yOf(p.level) + 3}
                textAnchor="end"
                fontSize={9}
                fill="#64748b"
              >
                {faNum(p.level)} hPa
              </text>
            ))}

            {/* humidity-ish fill between temperature and dewpoint */}
            {areaD ? <path d={areaD} fill="url(#atmoSpread)" stroke="none" /> : null}

            {/* dewpoint line (dashed cyan) */}
            <polyline
              points={dewLine}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* temperature line (orange) */}
            <polyline
              points={tempLine}
              fill="none"
              stroke="#fb923c"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* per-level nodes: dot, humidity dot, wind readout, 500 hPa height */}
            {points.map((p) => {
              const cx = xOf(p.temp)
              const cy = yOf(p.level)
              return (
                <g key={`n-${p.level}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={2.8}
                    fill="#fb923c"
                    stroke="#0f172a"
                    strokeWidth={1}
                  />
                  {Number.isFinite(p.rh) ? (
                    <circle cx={cx} cy={cy + 9} r={3} fill={rhColor(p.rh)} opacity={0.9} />
                  ) : null}
                  {Number.isFinite(p.ws) && Number.isFinite(p.wd) ? (
                    <text x={LEFT_PAD + PLOT_W + 8} y={cy + 3.5} fontSize={10} fill="#94a3b8">
                      {windDirArrow(p.wd)} {faRound(p.ws)}
                      <tspan fontSize={7.5} fill="#64748b">
                        {' '}
                        km/h
                      </tspan>
                    </text>
                  ) : null}
                  {p.level === 500 && Number.isFinite(p.gh) ? (
                    <text
                      x={cx - 10}
                      y={cy + 3.5}
                      textAnchor="end"
                      fontSize={9.5}
                      fill="#c4b5fd"
                    >
                      {faNum(Math.round(p.gh / 10))}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>

        {/* legend + axis caption */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#fb923c]" />
              دما
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded bg-[#22d3ee]" />
              نقطه شبنم
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
              <span className="inline-block h-2 w-2 rounded-full bg-[#facc15]" />
              <span className="inline-block h-2 w-2 rounded-full bg-[#38bdf8]" />
              رطوبت نسبی (کم/متوسط/زیاد)
            </span>
            <span className="text-[#c4b5fd]">ارتفاع ژئوپتانسیل تراز ۵۰۰ (dam)</span>
          </div>
          <span>محور افقی: دما (°C)</span>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            انرژی موثر (CAPE)
          </div>
          <div className="text-lg font-extrabold">
            {faNum(capeVal)}{' '}
            <span className="text-[11px] font-medium text-muted-foreground">J/kg</span>
          </div>
          <div className={cn('mt-0.5 text-[11px] font-bold', capeInfo?.className)}>
            {capeInfo ? capeInfo.label : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            شاخص LI
          </div>
          <div className="text-lg font-extrabold">
            {faNum(liVal)}{' '}
            <span className="text-[11px] font-medium text-muted-foreground">°C</span>
          </div>
          <div className={cn('mt-0.5 text-[11px] font-bold', liInfo?.className)}>
            {liInfo ? liInfo.label : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Wind className="h-3.5 w-3.5" />
            برش باد (۵۰۰−۱۰۰۰)
          </div>
          <div className="text-lg font-extrabold">
            {faRound(shear)}{' '}
            <span className="text-[11px] font-medium text-muted-foreground">km/h</span>
          </div>
          <div className={cn('mt-0.5 text-[11px] font-bold', shearInfo?.className)}>
            {shearInfo ? shearInfo.label : '—'}
          </div>
        </div>
      </div>

      {/* air-mass hint */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <Compass className="h-3.5 w-3.5" />
          تحلیل توده هوا
        </div>
        <div className="text-xs leading-6 text-foreground/90">
          {airMassParts.length > 0
            ? airMassParts.join(' • ')
            : 'داده باد ترازهای ۸۵۰ و ۵۰۰ در دسترس نیست'}
        </div>
      </div>

      {/* source */}
      <div className="px-1 text-center text-[10px] text-muted-foreground">
        منبع: Open-Meteo — سطوح فشار (ECMWF/GFS)
      </div>
    </div>
  )
}
