'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  Clock,
  Gauge,
  Globe2,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Timer,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { faNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AIAnalysis } from '@/lib/weather-types'
import { useWeatherStore } from '@/store/weather-store'

// ===== Module-level per-city cache (kept across mounts) =====
const analysisCache = new Map<string, AIAnalysis>()

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

const STATUS_MESSAGES = [
  'در حال بررسی داده‌های ایستگاه‌ها و رادار...',
  'تحلیل نقشه‌های سینوپتیک ۵۰۰ هکتوپاسکال...',
  'محاسبه ناپایداری (CAPE و شاخص برخاستگی)...',
  'ردیابی توده‌های هوا و مسیر سامانه‌ها...',
  'بررسی لایه‌های جو و برش باد...',
  'نهایی‌سازی تحلیل فوق‌قوی...',
]

const EMPTY_DESCRIPTION =
  'هوش مصنوعی داده‌های رادار، ماهواره و مدل‌های ECMWF/GFS را تحلیل می‌کند و توده‌های هوا، لایه‌های جو و روند ۷ روزه را به فارسی برای شما پیش‌بینی می‌کند.'

const FOOTER_NOTE =
  'تحلیل ماشینی است؛ در شرایط بحرانی به اطلاعیه رسمی هواشناسی کشور اعتماد کنید.'

/** Narrow unknown API payload to AIAnalysis without `any` */
function parseAnalysis(raw: unknown): AIAnalysis | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const str = (key: string): string => (typeof r[key] === 'string' ? (r[key] as string) : '')
  const summary = str('summary')
  if (!summary) return null
  const warnings = Array.isArray(r.warnings)
    ? r.warnings.filter((w): w is string => typeof w === 'string')
    : []
  const hazards = Array.isArray(r.hazardsTimeline)
    ? r.hazardsTimeline.filter((w): w is string => typeof w === 'string')
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
    hazardsTimeline: hazards,
    warnings,
    tips: str('tips'),
    confidence,
  }
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

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusIndex, setStatusIndex] = useState(0)

  const abortRef = useRef<AbortController | null>(null)

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

  // City changed → reset local display (cache is intentionally kept)
  useEffect(() => {
    abortRef.current?.abort()
    setAnalysis(null)
    setFromCache(false)
    setError(null)
    setStatusIndex(0)
  }, [city])

  const runAnalysis = useCallback(
    async (force: boolean) => {
      const key = cacheKey(city.lat, city.lon)

      if (!force) {
        const cached = analysisCache.get(key)
        if (cached) {
          setError(null)
          setFromCache(true)
          setAnalysis(cached)
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
          }),
          signal: controller.signal,
        })

        const payload = (await res.json()) as { analysis?: unknown; error?: unknown }

        if (!res.ok) {
          const msg =
            typeof payload.error === 'string' && payload.error.trim().length > 0
              ? payload.error
              : 'خطا در دریافت تحلیل از سرور'
          throw new Error(msg)
        }

        const parsed = parseAnalysis(payload.analysis)
        if (!parsed) throw new Error('ساختار پاسخ تحلیل نامعتبر بود')

        analysisCache.set(key, parsed)
        setAnalysis(parsed)
        setFromCache(false)
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

  const pct = analysis
    ? Math.min(100, Math.max(0, Math.round(analysis.confidence * 100)))
    : 0

  return (
    <div dir="rtl" className="flex flex-col gap-4">
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
            onClick={() => void runAnalysis(true)}
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
          <Button onClick={() => void runAnalysis(false)} disabled={loading} className="gap-2">
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
                پرو
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
              onClick={() => void runAnalysis(true)}
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

          {/* 6) 7-day outlook */}
          {analysis.weeklyOutlook && (
            <Section icon={CalendarDays} title="۷ روز آینده">
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
