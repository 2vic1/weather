'use client'

// Windy-style timeline bar.
// - رادار / ماهواره: frame playback (past → nowcast / daily satellite)
// - پیش‌بینی: 15-day drag bar — امروز تا +۱۵ روز، گام‌های ۳ ساعته،
//   با تیک روزها، پخش خودکار و پرش به امروز.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Radar, Satellite, CloudRainWind, Rewind } from 'lucide-react'
import { useWeatherStore } from '@/store/weather-store'
import type { RainViewerData } from '@/lib/weather-types'
import { unixToFaTime, faTehranHour, faNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getForecastState, useForecastState } from './map/forecastCache'

const FIELD_LABEL: Record<string, string> = {
  precip: 'بارش',
  temp: 'دما',
  clouds: 'ابر',
}

const WD_FA: Record<string, string> = {
  Sat: 'شنبه',
  Sun: 'یکشنبه',
  Mon: 'دوشنبه',
  Tue: 'سه‌شنبه',
  Wed: 'چهارشنبه',
  Thu: 'پنجشنبه',
  Fri: 'جمعه',
}

/* ============ draggable bar (mouse / touch / keyboard) ============ */

interface Tick {
  pct: number
  label: string
}

function TimeBar({
  value,
  max,
  onChange,
  disabled,
  ticks,
  ariaLabel,
  ariaValueText,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
  ticks?: Tick[]
  ariaLabel: string
  ariaValueText: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [barW, setBarW] = useState(0)
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  // measure bar width → how many day labels actually fit (no overlap)
  useEffect(() => {
    const el = ref.current
    if (!el || !ticks?.length) return
    const measure = () => setBarW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ticks?.length])
  const labelStep =
    ticks && ticks.length > 0 && barW > 40
      ? Math.max(1, Math.ceil((ticks.length * 40) / barW))
      : 1

  const valueFromX = (clientX: number): number => {
    const el = ref.current
    if (!el || max <= 0) return 0
    const r = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round(t * max)
  }

  return (
    <div
      ref={ref}
      dir="ltr"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={ariaValueText}
      aria-disabled={disabled}
      className={cn(
        'group relative flex-1 cursor-pointer touch-none select-none py-2.5',
        disabled && 'pointer-events-none opacity-50'
      )}
      onPointerDown={(e) => {
        if (max <= 0) return
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange(valueFromX(e.clientX))
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return
        onChange(valueFromX(e.clientX))
      }}
      onPointerUp={(e) => {
        draggingRef.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
      onKeyDown={(e) => {
        if (max <= 0) return
        let v = value
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - 1
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + 1
        else if (e.key === 'Home') v = 0
        else if (e.key === 'End') v = max
        else return
        e.preventDefault()
        onChange(Math.min(max, Math.max(0, v)))
      }}
    >
      {/* track */}
      <div className="relative h-2 rounded-full border border-white/10 bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400/80 via-teal-300/90 to-amber-400"
          style={{ width: `${pct * 100}%` }}
        />
        {/* day ticks */}
        {ticks?.map((t, i) => (
          <div
            key={i}
            className="absolute -top-0.5 h-3 w-px bg-white/35"
            style={{ left: `${t.pct * 100}%` }}
          />
        ))}
      </div>
      {/* day labels — thinned to fit the bar width */}
      {ticks && ticks.length > 0 && (
        <div className="relative mt-1 hidden h-3 sm:block">
          {ticks.map((t, i) => {
            const show = i % labelStep === 0 || i === 0
            if (!show) return null
            return (
              <span
                key={i}
                className={cn(
                  'absolute whitespace-nowrap text-[8px] leading-3 text-white/60',
                  i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                )}
                style={{ left: `${t.pct * 100}%` }}
              >
                {t.label}
              </span>
            )
          })}
        </div>
      )}
      {/* thumb */}
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(34,211,238,0.8)] ring-2 ring-primary transition-transform',
          'group-hover:scale-125'
        )}
        style={{ left: `${pct * 100}%` }}
      />
    </div>
  )
}

/* ================= main control ================= */

export default function TimelineControl() {
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const frames = useWeatherStore((s) => s.frames)
  const satFrames = useWeatherStore((s) => s.satFrames)
  const frameIndex = useWeatherStore((s) => s.frameIndex)
  const satIndex = useWeatherStore((s) => s.satIndex)
  const setFrameIndex = useWeatherStore((s) => s.setFrameIndex)
  const setSatIndex = useWeatherStore((s) => s.setSatIndex)
  const playing = useWeatherStore((s) => s.playing)
  const setPlaying = useWeatherStore((s) => s.setPlaying)
  const setRainViewer = useWeatherStore((s) => s.setRainViewer)
  const overlays = useWeatherStore((s) => s.overlays)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)
  const forecastHour = useWeatherStore((s) => s.forecastHour)
  const setForecastHour = useWeatherStore((s) => s.setForecastHour)
  const forecastField = useWeatherStore((s) => s.forecastField)
  const fc = useForecastState()

  const [error, setError] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isRadarMode = timelineMode === 'radar'
  const isForecastMode = timelineMode === 'forecast'
  const modeFrames = isRadarMode ? frames : satFrames

  // fetch rainviewer frames
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/rainviewer')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: RainViewerData) => {
          if (!cancelled) setRainViewer(d)
        })
        .catch(() => {
          if (!cancelled) setError(true)
        })
    load()
    const iv = setInterval(load, 2 * 60_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [setRainViewer])

  // autoplay loop (radar/satellite frames or forecast steps)
  useEffect(() => {
    if (!playing) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    if (isForecastMode) {
      if (fc.times.length === 0) return
      tickRef.current = setInterval(() => {
        const s = useWeatherStore.getState()
        const len = getForecastState().times.length
        if (len > 0) s.setForecastHour((s.forecastHour + 1) % len)
      }, 450)
      return () => {
        if (tickRef.current) clearInterval(tickRef.current)
      }
    }
    if (modeFrames.length === 0) return
    tickRef.current = setInterval(() => {
      const s = useWeatherStore.getState()
      if (s.timelineMode === 'radar') {
        s.setFrameIndex((s.frameIndex + 1) % s.frames.length)
      } else if (s.satFrames.length > 0) {
        s.setSatIndex((s.satIndex + 1) % s.satFrames.length)
      }
    }, 750)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [playing, isForecastMode, modeFrames.length, fc.times.length])

  const selectMode = (m: 'radar' | 'satellite' | 'forecast') => {
    if (timelineMode === m) return
    setTimelineMode(m)
    if (m === 'radar' && !overlays.radar && !overlays.tropical) toggleOverlay('radar')
    if (m === 'satellite' && !overlays.satellite) toggleOverlay('satellite')
    if (m === 'forecast') {
      if (!overlays.forecast) toggleOverlay('forecast')
      useWeatherStore.getState().setForecastHour(0)
      setPlaying(true)
    }
  }

  // radar / satellite frame meta
  const idx = isRadarMode ? frameIndex : satIndex
  const frame = modeFrames[idx]
  const lastPastIdx = (() => {
    for (let i = modeFrames.length - 1; i >= 0; i--) {
      if (!modeFrames[i]?.nowcast) return i
    }
    return -1
  })()
  const minutesAhead =
    frame?.nowcast && lastPastIdx >= 0
      ? Math.max(0, Math.round((frame.time - modeFrames[lastPastIdx].time) / 60))
      : 0

  const satelliteNoFrames = timelineMode === 'satellite' && satFrames.length === 0

  // forecast steps
  const fcLen = fc.times.length
  const fcMax = Math.max(fcLen - 1, 0)
  const fcHour = Math.min(forecastHour, fcMax)
  const fcReady = isForecastMode && fcLen > 0

  // day ticks + labels for the 15-day bar (Tehran local days)
  const dayTicks: Tick[] = useMemo(() => {
    if (fcLen < 4) return []
    const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' })
    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const ticks: Tick[] = []
    let lastKey = ''
    for (let i = 0; i < fcLen; i++) {
      const d = new Date(`${fc.times[i]}Z`)
      if (Number.isNaN(d.getTime())) continue
      // Tehran local day boundary → one tick per day
      const dateKey = dateFmt.format(d)
      if (dateKey === lastKey) continue
      lastKey = dateKey
      const wd = wdFmt.format(d)
      ticks.push({
        pct: i / fcMax,
        label: i === 0 ? 'امروز' : WD_FA[wd] ?? wd,
      })
    }
    return ticks
  }, [fc.times, fcLen, fcMax])

  const diffH = fcHour * 3
  const relLabel =
    diffH === 0
      ? 'اکنون'
      : diffH < 24
        ? `+${faNum(diffH)} ساعت`
        : diffH % 24 === 0
          ? `+${faNum(diffH / 24)} روز`
          : `+${faNum(Math.floor(diffH / 24))} روز و ${faNum(diffH % 24)} ساعت`

  const timeLabel = isForecastMode
    ? fc.error
      ? 'خطا در دریافت پیش‌بینی'
      : fcLen === 0
        ? 'در حال دریافت میدان ۱۵ روزه...'
        : fcHour === 0
          ? 'اکنون'
          : faTehranHour(fc.times[fcHour])
    : modeFrames.length === 0
      ? error
        ? 'عدم اتصال به رادار'
        : satelliteNoFrames
          ? 'تصویر روزانه GIBS'
          : 'در حال دریافت...'
      : frame
        ? unixToFaTime(frame.time)
        : '...'

  const hintStart = isForecastMode ? 'امروز' : '۲ ساعت قبل'
  const hintEnd = isForecastMode
    ? `+۱۵ روز`
    : isRadarMode
      ? '۳۰ دقیقه بعد'
      : 'تصاویر روزانه'

  return (
    <div
      className="glass-strong pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4"
      dir="rtl"
    >
      {/* mode switch */}
      <div className="flex overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-xs">
        <button
          onClick={() => selectMode('radar')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'radar'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="رادار بارش لحظه‌ای و حاره‌ای"
        >
          <Radar className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">رادار</span>
        </button>
        <button
          onClick={() => selectMode('forecast')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'forecast'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="پیش‌بینی رنگی ۱۵ روز آینده — میله زمان را بکشید"
        >
          <CloudRainWind className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">پیش‌بینی</span>
        </button>
        <button
          onClick={() => selectMode('satellite')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'satellite'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="ماهواره مادون قرمز"
        >
          <Satellite className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ماهواره</span>
        </button>
      </div>

      {/* play / pause */}
      <button
        onClick={() => setPlaying(!playing)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary transition-all hover:scale-105 hover:bg-primary/35"
        title={playing ? 'توقف انیمیشن' : 'پخش حرکت سامانه‌ها'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 -translate-x-px" />}
      </button>

      {/* jump to now (forecast mode) */}
      {isForecastMode && fcReady && fcHour > 0 && (
        <button
          onClick={() => {
            setPlaying(false)
            setForecastHour(0)
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 transition-all hover:scale-105 hover:bg-amber-500/30"
          title="بازگشت به امروز"
        >
          <Rewind className="h-4 w-4" />
        </button>
      )}

      {/* timeline */}
      <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 sm:min-w-[260px]">
        {isForecastMode ? (
          <TimeBar
            value={fcHour}
            max={fcMax}
            disabled={fcLen === 0}
            ticks={dayTicks}
            onChange={(v) => {
              setPlaying(false)
              setForecastHour(v)
            }}
            ariaLabel="میله زمان پیش‌بینی ۱۵ روزه"
            ariaValueText={`${relLabel} — ${timeLabel}`}
          />
        ) : (
          <TimeBar
            value={Math.min(idx, Math.max(modeFrames.length - 1, 0))}
            max={Math.max(modeFrames.length - 1, 0)}
            disabled={modeFrames.length === 0}
            onChange={(v) => {
              setPlaying(false)
              if (isRadarMode) setFrameIndex(v)
              else setSatIndex(v)
            }}
            ariaLabel="خط زمانی فریم‌ها"
            ariaValueText={timeLabel}
          />
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{hintStart}</span>
          <span className="font-bold text-foreground" dir="ltr">
            {timeLabel}
            {isForecastMode && fcReady && (
              <>
                <span className="ms-1 rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-300" dir="rtl">
                  {FIELD_LABEL[forecastField] ?? ''}
                </span>
                <span className="ms-1 rounded bg-cyan-500/20 px-1 text-[9px] text-cyan-300" dir="rtl">
                  {relLabel}
                </span>
              </>
            )}
            {isForecastMode && fc.loading && fcLen > 0 && (
              <span className="ms-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300" dir="rtl">
                به‌روزرسانی...
              </span>
            )}
            {satelliteNoFrames && (
              <span className="ms-1 rounded bg-cyan-500/20 px-1 text-[9px] text-cyan-300" dir="rtl">
                NASA GIBS
              </span>
            )}
            {!isForecastMode && frame?.nowcast && minutesAhead > 0 && (
              <span className="ms-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300" dir="rtl">
                کوتاه‌مدت
              </span>
            )}
          </span>
          <span>{hintEnd}</span>
        </div>
      </div>
    </div>
  )
}
