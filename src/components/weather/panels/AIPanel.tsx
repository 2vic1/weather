'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  Check,
  Clock,
  CloudRain,
  Droplets,
  Gauge,
  Globe2,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  Snowflake,
  Sparkles,
  Sun,
  Timer,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { faNum, faWeekday, windDirArrow } from '@/lib/format'
import { weatherCodeInfo, windDirectionFa } from '@/lib/weather-codes'
import { cn } from '@/lib/utils'
import type { AIDayData, AIDayForecast, AIAnalysis } from '@/lib/weather-types'
import { useWeatherStore } from '@/store/weather-store'

// ===== Module-level per-city+horizon caches (kept across mounts) =====
const analysisCache = new Map<string, AIAnalysis>()
const dayDataCache = new Map<string, AIDayData[]>()

const HORIZONS = [3, 7, 14] as const
type Horizon = (typeof HORIZONS)[number]

const HORIZON_FA: Record<Horizon, string> = { 3: '۳ روزه', 7: '۷ روزه', 14: '۱۴ روزه' }

function cacheKey(lat: number, lon: number, hz: Horizon): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}:${hz}`
}

const STATUS_MESSAGES = [
  'در حال بررسی داده‌های ایستگاه‌ها و رادار...',
  'تحلیل نقشه‌های سینوپتیک ۵۰۰ هکتوپاسکال...',
  'محاسبه ناپایداری (CAPE و شاخص برخاستگی)...',
  'ردیابی توده‌های هوا و مسیر سامانه‌ها...',
  'بررسی لایه‌های جو و برش باد...',
  'نگارش پیش‌بینی روزبه‌روز کارشناسی...',
  'نهایی‌سازی تحلیل فوق‌قوی...',
]

const EMPTY_DESCRIPTION =
  'هوش مصنوعی داده‌های رادار، ماهواره و مدل‌های ECMWF/GFS را تحلیل می‌کند و پیش‌بینی روزبه‌روز کارشناسی — با مقدار بارش، سرعت باد، رطوبت و برف — را برای ۳، ۷ یا ۱۴ روز به فارسی می‌نویسد.'

const FOOTER_NOTE =
  'تحلیل ماشینی است؛ در شرایط بحرانی به اطلاعیه رسمی هواشناسی کشور اعتماد کنید.'

/** Narrow unknown API payload to AIAnalysis without `any` */
function parseAnalysis(raw: unknown, hz: Horizon): AIAnalysis | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const str = (key: string): string => (typeof r[key] === 'string' ? (r[key] as string) : '')
  const summary = str('summary')
  if (!summary) return null
  const toArr = (key: string): string[] =>
    Array.isArray(r[key]) ? (r[key] as unknown[]).filter((w): w is string => typeof w === 'string') : []
  const dailyForecast: AIDayForecast[] = Array.isArray(r.dailyForecast)
    ? (r.dailyForecast as unknown[])
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((o) => ({
          date: typeof o.date === 'string' ? o.date : '',
          headline: typeof o.headline === 'string' ? o.headline : '',
          details: typeof o.details === 'string' ? o.details : '',
        }))
        .filter((x) => x.date && (x.headline || x.details))
    : []
  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? Math.min(Math.max(r.confidence, 0), 1)
      : 0.8
  return {
    summary,
    currentAnalysis: str('currentAnalysis'),
    synoptic: str('synoptic'),
    airMasses: str('airMasses'),
    instability: str('instability'),
    atmosphereLayers: str('atmosphereLayers'),
    hourlyOutlook: str('hourlyOutlook'),
    weeklyOutlook: str('weeklyOutlook'),
    dailyForecast,
    hazardsTimeline: toArr('hazardsTimeline'),
    warnings: toArr('warnings'),
    tips: str('tips'),
    confidence,
    horizon: hz,
  }
}

/** Narrow the server-computed per-day numbers */
function parseDayData(raw: unknown): AIDayData[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: AIDayData[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    if (typeof o.date !== 'string') continue
    const num = (k: string): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : 0)
    out.push({
      date: o.date,
      weatherCode: num('weatherCode'),
      tMax: num('tMax'),
      tMin: num('tMin'),
      precipMm: num('precipMm'),
      precipProb: num('precipProb'),
      precipHours: num('precipHours'),
      snowCm: num('snowCm'),
      windMax: num('windMax'),
      gustMax: num('gustMax'),
      windDir: num('windDir'),
      humidityMean: num('humidityMean'),
      uvMax: num('uvMax'),
      sunrise: typeof o.sunrise === 'string' ? o.sunrise : '',
      sunset: typeof o.sunset === 'string' ? o.sunset : '',
    })
  }
  return out.length > 0 ? out : null
}

// ===== Presentational helpers =====

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        <h3 className="text-sm font-bold text-primary">{title}</h3>
      </div>
      <p className="text-sm leading-7 text-foreground/90">{children}</p>
    </section>
  )
}

function Chip({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon
  label: string
  tone?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone ?? 'border-border/60 bg-muted/30 text-foreground/80'
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

function jalaliDate(dateIso: string): string {
  try {
    return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString('fa-IR', {
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return ''
  }
}

function gregShort(dateIso: string): string {
  try {
    return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

/** One expert day card: exact numbers from the model + AI narrative */
function DayCard({ day, idx, fc }: { day: AIDayData; idx: number; fc?: AIDayForecast }) {
  const info = weatherCodeInfo(day.weatherCode)
  const Icon = info.icon
  const rainy = day.precipMm >= 0.1
  const precipTone =
    day.precipMm >= 10
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : day.precipMm >= 2
        ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
        : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-200'
  const windy = day.windMax >= 30 || day.gustMax >= 50
  const windyTone = windy
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    : undefined

  return (
    <article
      className={cn(
        'rounded-2xl border p-3',
        idx === 0 ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/60 bg-card/40'
      )}
    >
      {/* header: weekday + Jalali date + temps */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30',
              info.tone
            )}
          >
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-5">
              {idx === 0 ? 'امروز' : idx === 1 ? 'فردا' : faWeekday(day.date)}
              <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                {jalaliDate(day.date)}
              </span>
              {idx === 0 && (
                <span className="mr-1.5 rounded-full bg-primary/20 px-1.5 py-px text-[9px] font-bold text-primary">
                  اکنون در حال وقوع
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {info.fa}
              <span className="mx-1 text-border">|</span>
              <span dir="ltr">{gregShort(day.date)}</span>
              {day.sunrise && (
                <>
                  <span className="mx-1 text-border">|</span>
                  طلوع {new Date(day.sunrise).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                </>
              )}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-base font-black tabular-nums" dir="ltr">
          {faNum(day.tMax)}°
          <span className="mr-1 text-xs font-semibold text-muted-foreground">
            {faNum(day.tMin)}°
          </span>
        </p>
      </div>

      {/* numeric chips — always from real model data */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {rainy ? (
          <Chip
            icon={CloudRain}
            label={`${faNum(day.precipMm, 1)} میلی‌متر بارش · ${faNum(day.precipProb)}٪`}
            tone={precipTone}
          />
        ) : (
          <Chip icon={CloudRain} label={day.precipProb >= 25 ? `بارش محتمل (${faNum(day.precipProb)}٪)` : 'بدون بارش'} />
        )}
        {day.snowCm > 0 && (
          <Chip
            icon={Snowflake}
            label={`${faNum(day.snowCm, 1)} سانتی‌متر برف`}
            tone="border-blue-300/40 bg-blue-400/10 text-blue-100"
          />
        )}
        <Chip
          icon={Wind}
          label={
            `باد ${faNum(day.windMax)} کیلومتر ${windDirectionFa(day.windDir)} ` +
            `${windDirArrow(day.windDir)}` +
            (day.gustMax >= 40 ? ` · تندباد ${faNum(day.gustMax)}` : '')
          }
          tone={windyTone}
        />
        <Chip icon={Droplets} label={`رطوبت ${faNum(day.humidityMean)}٪`} />
        {day.precipHours > 0 && (
          <Chip icon={Clock} label={`${faNum(day.precipHours)} ساعت بارش`} />
        )}
        {day.uvMax >= 6 && (
          <Chip
            icon={Sun}
            label={`UV ${faNum(day.uvMax)}`}
            tone="border-orange-500/40 bg-orange-500/10 text-orange-300"
          />
        )}
      </div>

      {/* AI expert narrative */}
      {(fc?.headline || fc?.details) && (
        <div className="mt-2.5 rounded-xl border-r-2 border-primary/50 bg-primary/5 px-3 py-2">
          {fc?.headline && <p className="text-[13px] font-bold text-primary">{fc.headline}</p>}
          {fc?.details && (
            <p className="mt-1 text-[13px] leading-7 text-foreground/90">{fc.details}</p>
          )}
        </div>
      )}
    </article>
  )
}

function LoadingState({ statusIndex }: { statusIndex: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="flex items-center gap-2.5" aria-live="polite">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-sm font-medium text-foreground/90">
          {STATUS_MESSAGES[statusIndex % STATUS_MESSAGES.length]}
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-[95%]" />
          <Skeleton className="h-3 w-[82%]" />
          <Skeleton className="h-3 w-[88%]" />
          <Skeleton className="h-3 w-[64%]" />
        </div>
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-[90%]" />
          <Skeleton className="h-3 w-[76%]" />
          <Skeleton className="h-3 w-[58%]" />
        </div>
      </div>
    </div>
  )
}

// ===== Main panel =====

function AIPanel() {
  const city = useWeatherStore((s) => s.city)

  const [horizon, setHorizon] = useState<Horizon>(7)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [dayData, setDayData] = useState<AIDayData[] | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusIndex, setStatusIndex] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  // which cache key the currently displayed analysis belongs to
  const loadedKeyRef = useRef<string | null>(null)

  // Rotating Persian status messages while loading (every 1.8s)
  useEffect(() => {
    if (!loading) return
    const id = window.setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 1800)
    return () => window.clearInterval(id)
  }, [loading])

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const runAnalysis = useCallback(
    async (force: boolean, hz: Horizon) => {
      const key = cacheKey(city.lat, city.lon, hz)

      if (!force) {
        const cached = analysisCache.get(key)
        if (cached) {
          setError(null)
          setFromCache(true)
          setDayData(dayDataCache.get(key) ?? null)
          setAnalysis(cached)
          loadedKeyRef.current = key
          return
        }
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      setFromCache(false)
      setStatusIndex(0)

      try {
        const res = await fetch('/api/ai-forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: city.lat,
            lon: city.lon,
            name: city.name,
            province: city.province ?? '',
            days: hz,
          }),
          signal: controller.signal,
        })

        const payload = (await res.json()) as { analysis?: unknown; dayData?: unknown; error?: unknown }

        if (!res.ok) {
          const msg =
            typeof payload.error === 'string' && payload.error.trim().length > 0
              ? payload.error
              : 'خطا در دریافت تحلیل از سرور'
          throw new Error(msg)
        }

        const parsed = parseAnalysis(payload.analysis, hz)
        if (!parsed) throw new Error('ساختار پاسخ تحلیل نامعتبر بود')

        const dd = parseDayData(payload.dayData)
        analysisCache.set(key, parsed)
        if (dd) dayDataCache.set(key, dd)
        setAnalysis(parsed)
        setDayData(dd)
        setFromCache(false)
        loadedKeyRef.current = key
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const msg =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : 'خطای ناشناخته در انجام تحلیل'
        setError(msg)
      } finally {
        if (abortRef.current === controller) setLoading(false)
      }
    },
    [city]
  )

  // City changed → reset local display (caches are intentionally kept)
  useEffect(() => {
    abortRef.current?.abort()
    setAnalysis(null)
    setDayData(null)
    setFromCache(false)
    setError(null)
    setStatusIndex(0)
    loadedKeyRef.current = null
    setLoading(false)
  }, [city])

  // Horizon changed → show cached instantly, or auto-fetch if a forecast is on screen
  useEffect(() => {
    const key = cacheKey(city.lat, city.lon, horizon)
    const cached = analysisCache.get(key)
    if (cached) {
      setError(null)
      setFromCache(true)
      setDayData(dayDataCache.get(key) ?? null)
      setAnalysis(cached)
      loadedKeyRef.current = key
      return
    }
    if (loadedKeyRef.current && loadedKeyRef.current !== key) {
      // user is switching range while viewing another range → fetch seamlessly
      void runAnalysis(false, horizon)
    }
  }, [horizon, city.lat, city.lon, runAnalysis])

  const pct = analysis
    ? Math.min(100, Math.max(0, Math.round(analysis.confidence * 100)))
    : 0

  // merge narratives onto the server-computed day rows by date
  const dayRows = dayData ?? []
  const fcByDate = new Map<string, AIDayForecast>()
  for (const f of analysis?.dailyForecast ?? []) fcByDate.set(f.date, f)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* Duration selector — ۳ روزه / ۷ روزه / ۱۴ روزه */}
      <div
        className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1"
        role="radiogroup"
        aria-label="افق پیش‌بینی"
      >
        {HORIZONS.map((h) => {
          const active = horizon === h
          return (
            <button
              key={h}
              role="radio"
              aria-checked={active}
              disabled={loading}
              onClick={() => setHorizon(h)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all',
                active
                  ? 'bg-primary/20 text-primary shadow-[inset_0_0_0_1px] shadow-primary/40'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                loading && 'opacity-60'
              )}
            >
              {active ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <CalendarDays className="size-3.5 opacity-60" aria-hidden />
              )}
              {HORIZON_FA[h]}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && <LoadingState statusIndex={statusIndex} />}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-8 text-center">
          <AlertTriangle className="size-7 text-destructive" aria-hidden />
          <p className="text-sm leading-7 text-foreground/90">
            دریافت تحلیل هوش مصنوعی ناموفق بود{error ? `: ${error}` : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runAnalysis(true, horizon)}
            className="gap-2"
          >
            <RefreshCw className="size-4" aria-hidden />
            تلاش مجدد
          </Button>
        </div>
      )}

      {/* Empty state (before first run) */}
      {!loading && !error && !analysis && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card/40 px-6 py-10 text-center">
          <Brain
            className="size-12 animate-pulse text-primary [animation-duration:3s]"
            aria-hidden
          />
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            {EMPTY_DESCRIPTION}
          </p>
          <Button
            onClick={() => void runAnalysis(false, horizon)}
            disabled={loading}
            className="gap-2"
          >
            <Sparkles className="size-4" aria-hidden />
            تحلیل با هوش مصنوعی
          </Button>
        </div>
      )}

      {/* Result */}
      {!loading && analysis && (
        <div className="flex flex-col gap-5">
          {/* Header: cache badge + regenerate */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">تحلیل فوق‌قوی هوش مصنوعی</span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/90">
                {HORIZON_FA[horizon]}
              </span>
              {fromCache && (
                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  نسخه ذخیره‌شده
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void runAnalysis(true, horizon)}
              disabled={loading}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={cn('size-3.5', loading && 'animate-spin')}
                aria-hidden
              />
              تحلیل مجدد
            </Button>
          </div>

          {/* 0) Day-by-day expert forecast — the centerpiece */}
          {dayRows.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">
                  پیش‌بینی روزبه‌روز — {HORIZON_FA[horizon]}
                </h3>
              </div>
              <div className="flex flex-col gap-2">
                {dayRows.map((d, i) => (
                  <DayCard key={`${d.date}-${i}`} day={d} idx={i} fc={fcByDate.get(d.date)} />
                ))}
              </div>
              {analysis.dailyForecast && analysis.dailyForecast.length === 0 && (
                <p className="text-[11px] leading-5 text-muted-foreground">
                  روایت کارشناسی هوش مصنوعی برای این افق در دسترس نیست؛ اعداد بالا مستقیم از مدل
                  عددی است.
                </p>
              )}
            </section>
          )}

          {/* 1) Summary */}
          {analysis.summary && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Gauge className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">خلاصه</h3>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
                <p className="text-[0.95rem] leading-8 text-foreground">
                  {analysis.summary}
                </p>
              </div>
            </section>
          )}

          {/* 2) Current analysis */}
          {analysis.currentAnalysis && (
            <Section icon={Activity} title="تحلیل وضعیت فعلی">
              {analysis.currentAnalysis}
            </Section>
          )}

          {/* 2.5) Synoptic analysis */}
          {analysis.synoptic && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Globe2 className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">تحلیل سینوپتیک (نقشه‌های هم‌اکنون)</h3>
              </div>
              <div className="rounded-lg border-l-2 border-violet-400/40 bg-violet-500/5 px-3 py-2.5">
                <p className="text-sm leading-7 text-foreground/90">{analysis.synoptic}</p>
              </div>
            </section>
          )}

          {/* 3) Air masses (cyan left-border block) */}
          {analysis.airMasses && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Wind className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">
                  توده‌های هوا و مسیر سامانه‌ها
                </h3>
              </div>
              <div className="rounded-lg border-l-2 border-cyan-400/40 bg-cyan-500/5 px-3 py-2.5">
                <p className="text-sm leading-7 text-foreground/90">{analysis.airMasses}</p>
              </div>
            </section>
          )}

          {/* 4) Atmosphere layers */}
          {analysis.atmosphereLayers && (
            <Section icon={Layers} title="لایه‌های جو">
              {analysis.atmosphereLayers}
            </Section>
          )}

          {/* 4.5) Instability analysis */}
          {analysis.instability && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Zap className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">ناپایداری و همرفت</h3>
              </div>
              <div className="rounded-lg border-l-2 border-amber-400/40 bg-amber-500/5 px-3 py-2.5">
                <p className="text-sm leading-7 text-foreground/90">{analysis.instability}</p>
              </div>
            </section>
          )}

          {/* 4.6) Hazards timeline */}
          {analysis.hazardsTimeline && analysis.hazardsTimeline.length > 0 && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Timer className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold text-primary">خط زمانی خطرات ۴۸ ساعت</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                {analysis.hazardsTimeline.map((hz, i) => (
                  <div
                    key={`${i}-${hz.slice(0, 14)}`}
                    className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-2.5 py-1.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
                    <p className="text-[13px] leading-6 text-foreground/90">{hz}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5) 48h outlook */}
          {analysis.hourlyOutlook && (
            <Section icon={Clock} title="۴۸ ساعت آینده">
              {analysis.hourlyOutlook}
            </Section>
          )}

          {/* 6) Whole-period trend */}
          {analysis.weeklyOutlook && (
            <Section icon={CalendarDays} title={`روند کلی ${HORIZON_FA[horizon]}`}>
              {analysis.weeklyOutlook}
            </Section>
          )}

          {/* 7) Warnings */}
          {analysis.warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {analysis.warnings.map((w, i) => (
                <div
                  key={`${i}-${w.slice(0, 16)}`}
                  className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
                  <p className="text-sm leading-7 text-foreground/90">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* 8) Tips */}
          {analysis.tips && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-3">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-primary">توصیه</h3>
                  <p className="text-sm leading-7 text-foreground/90">{analysis.tips}</p>
                </div>
              </div>
            </div>
          )}

          {/* 9) Confidence */}
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground/80">دقت تحلیل</span>
              <span className="font-bold text-primary">{faNum(pct)}٪</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer disclaimer */}
      <p className="text-center text-[11px] leading-5 text-muted-foreground/70">
        {FOOTER_NOTE}
      </p>
    </div>
  )
}

export default AIPanel
