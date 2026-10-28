'use client'

import { useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Cloud,
  CloudOff,
  Droplets,
  Gauge,
  Sun,
  Sunrise,
  Sunset,
  Umbrella,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useWeather } from '@/hooks/use-weather-data'
import {
  faDate,
  faDateTime,
  faNum,
  faRound,
  faTime,
  faWeekday,
  windDirArrow,
} from '@/lib/format'
import { uvFa, weatherCodeInfo, windDirectionFa } from '@/lib/weather-codes'
import type { WeatherData } from '@/lib/weather-types'
import { useWeatherStore } from '@/store/weather-store'
import { cn } from '@/lib/utils'

/* ---------------- shared bits ---------------- */

function Fade({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

const cardCls = 'glass gap-3 rounded-2xl border-border/40 p-4 shadow-none'

function PanelError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-10 text-center"
    >
      <CloudOff className="h-8 w-8 text-red-300/80" aria-hidden />
      <p className="text-sm font-medium text-red-200">دریافت اطلاعات هواشناسی ممکن نشد</p>
      <p className="text-xs text-muted-foreground">
        {message || 'لطفاً چند لحظه بعد دوباره تلاش کنید.'}
      </p>
    </div>
  )
}

/* ================= CurrentPanel ================= */

function DetailTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function CurrentSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-border/50 p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-24 rounded-lg" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  )
}

function CurrentContent({ data }: { data: WeatherData }) {
  const c = data.current
  const info = weatherCodeInfo(c.weather_code, c.is_day)
  const WIcon = info.icon
  const uv = data.daily.uv_index_max[0]

  const tiles: Array<{ icon: LucideIcon; label: string; value: string; sub?: string }> = [
    { icon: Droplets, label: 'رطوبت', value: `${faNum(c.relative_humidity_2m)}٪` },
    {
      icon: Wind,
      label: 'باد',
      value: `${faNum(c.wind_speed_10m)} km/h`,
      sub: `${windDirArrow(c.wind_direction_10m)} ${windDirectionFa(c.wind_direction_10m)} · تندباد ${faNum(c.wind_gusts_10m)} km/h`,
    },
    { icon: Gauge, label: 'فشار', value: `${faNum(c.pressure_msl)} hPa`, sub: 'تراز دریا' },
    { icon: Cloud, label: 'ابر', value: `${faNum(c.cloud_cover)}٪` },
    { icon: Umbrella, label: 'بارش', value: `${faNum(c.precipitation, 1)} mm`, sub: 'ساعت گذشته' },
    {
      icon: Sun,
      label: 'شاخص UV',
      value: uv !== undefined ? faNum(uv, 1) : '—',
      sub: uv !== undefined ? uvFa(uv) : undefined,
    },
  ]

  return (
    <Fade className="flex flex-col gap-3">
      {/* hero */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-gradient-to-l from-sky-500/10 via-transparent to-amber-400/10 p-4">
        <div className="flex flex-col">
          <span className="text-6xl font-bold leading-none tracking-tighter">
            {faRound(c.temperature_2m)}°
          </span>
          <span className="mt-3 text-base font-medium">{info.fa}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">
            احساس واقعی: {faRound(c.apparent_temperature)}°
          </span>
        </div>
        <WIcon className={cn('h-16 w-16 shrink-0', info.tone)} strokeWidth={1.25} aria-hidden />
      </div>

      {/* detail tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <DetailTile key={t.label} icon={t.icon} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </div>

      {/* sunrise / sunset */}
      <div className="flex items-center justify-around rounded-2xl border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Sunrise className="h-5 w-5 text-amber-300" aria-hidden />
          <span className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">طلوع</span>
            <span className="text-sm font-semibold">
              {data.daily.sunrise.length > 0 ? faTime(data.daily.sunrise[0]) : '—'}
            </span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-8" />
        <div className="flex items-center gap-2">
          <Sunset className="h-5 w-5 text-orange-300" aria-hidden />
          <span className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">غروب</span>
            <span className="text-sm font-semibold">
              {data.daily.sunset.length > 0 ? faTime(data.daily.sunset[0]) : '—'}
            </span>
          </span>
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          به‌روزرسانی: {faDateTime(c.time)}
        </span>
        <Badge
          variant="outline"
          className="border-border/50 bg-muted/30 text-[9px] font-normal text-muted-foreground"
        >
          Open-Meteo
        </Badge>
      </div>
    </Fade>
  )
}

export function CurrentPanel() {
  const city = useWeatherStore((s) => s.city)
  const { data, loading, error } = useWeather(city)
  return (
    <Card className={cardCls}>
      {loading ? (
        <CurrentSkeleton />
      ) : error ? (
        <PanelError message={error} />
      ) : data ? (
        <CurrentContent data={data} />
      ) : (
        <CurrentSkeleton />
      )}
    </Card>
  )
}

/* ================= HourlyPanel ================= */

interface HourPoint {
  time: string
  label: string
  temp: number
  pop: number
  code: number
  isDay: number
}

/** 1 if the given local ISO hour falls between sunrise and sunset */
function hourIsDay(t: string, data: WeatherData): number {
  const sr = data.daily.sunrise
  const ss = data.daily.sunset
  if (sr.length === 0 || ss.length === 0) return 1
  let di = sr.findIndex((s) => s.slice(0, 10) === t.slice(0, 10))
  if (di < 0) di = 0
  return t >= sr[di] && t <= ss[di] ? 1 : 0
}

function HourlyTip(props: {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ value?: number | string; dataKey?: string | number }>
}) {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null
  const temp = payload.find((p) => p.dataKey === 'temp')?.value
  const pop = payload.find((p) => p.dataKey === 'pop')?.value
  return (
    <div
      dir="rtl"
      className="min-w-[130px] rounded-xl border border-border/60 bg-slate-950/85 px-3 py-2 shadow-xl backdrop-blur-md"
    >
      {label !== undefined && (
        <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>
      )}
      {temp !== undefined && (
        <p className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">دما</span>
          <span className="font-semibold text-amber-300">{faRound(Number(temp))}°</span>
        </p>
      )}
      {pop !== undefined && (
        <p className="mt-0.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">احتمال بارش</span>
          <span className="font-semibold text-cyan-300">{faNum(Number(pop))}٪</span>
        </p>
      )}
    </div>
  )
}

function HourlySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3.5 w-44" />
      <Skeleton className="h-[220px] rounded-2xl" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] min-w-[64px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function HourlyContent({ data }: { data: WeatherData }) {
  const h = data.hourly

  const points = useMemo<HourPoint[]>(() => {
    if (h.time.length === 0) return []
    // next 24h starting from the current hour
    const nowKey = data.current.time.slice(0, 13)
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey)
    if (start < 0) start = 0
    const end = Math.min(start + 24, h.time.length)
    const out: HourPoint[] = []
    for (let i = start; i < end; i++) {
      out.push({
        time: h.time[i],
        label: faTime(h.time[i]),
        temp: h.temperature_2m[i] ?? 0,
        pop: h.precipitation_probability[i] ?? 0,
        code: h.weather_code[i] ?? 3,
        isDay: hourIsDay(h.time[i], data),
      })
    }
    return out
  }, [h, data])

  if (points.length === 0) {
    return (
      <Fade>
        <p className="py-8 text-center text-xs text-muted-foreground">داده ساعتی در دسترس نیست</p>
      </Fade>
    )
  }

  return (
    <Fade className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          پیش‌بینی ساعتی — ۲۴ ساعت آینده
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> دما (°C)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> احتمال بارش (٪)
          </span>
        </div>
      </div>

      {/* chart is LTR so recharts lays out left-to-right; tick labels stay Persian */}
      <div dir="ltr" className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="hourlyTempAmber" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={3}
              tickMargin={6}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="temp"
              width={36}
              domain={['auto', 'auto']}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${faNum(v)}°`}
            />
            <YAxis yAxisId="pop" orientation="right" hide domain={[0, 100]} />
            <Tooltip
              cursor={{ stroke: 'rgba(148,163,184,0.35)', strokeDasharray: '4 4' }}
              content={<HourlyTip />}
            />
            <Bar
              yAxisId="pop"
              dataKey="pop"
              fill="rgba(103,232,249,0.45)"
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
            />
            <Area
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#hourlyTempAmber)"
              dot={false}
              activeDot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* hour cards */}
      <div className="nice-scroll flex gap-2 overflow-x-auto pb-1">
        {points.map((p, i) => {
          const inf = weatherCodeInfo(p.code, p.isDay)
          const HIcon = inf.icon
          return (
            <div
              key={p.time}
              className={cn(
                'flex min-w-[64px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2',
                i === 0
                  ? 'border-amber-400/40 bg-amber-400/10'
                  : 'border-border/50 bg-muted/30'
              )}
            >
              <span className="text-[10px] text-muted-foreground">{p.label}</span>
              <HIcon className={cn('h-5 w-5', inf.tone)} strokeWidth={1.75} aria-hidden />
              <span className="text-sm font-semibold">{faRound(p.temp)}°</span>
              {p.pop > 20 ? (
                <span className="text-[10px] font-medium text-cyan-300">{faNum(p.pop)}٪</span>
              ) : (
                <span className="h-[13px]" />
              )}
            </div>
          )
        })}
      </div>
    </Fade>
  )
}

export function HourlyPanel() {
  const city = useWeatherStore((s) => s.city)
  const { data, loading, error } = useWeather(city)
  return (
    <Card className={cardCls}>
      {loading ? (
        <HourlySkeleton />
      ) : error ? (
        <PanelError message={error} />
      ) : data ? (
        <HourlyContent data={data} />
      ) : (
        <HourlySkeleton />
      )}
    </Card>
  )
}

/* ================= DailyPanel ================= */

function DailySkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3.5 w-36" />
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-[52px] rounded-2xl" />
      ))}
    </div>
  )
}

function DailyContent({ data }: { data: WeatherData }) {
  const d = data.daily
  const n = Math.min(7, d.time.length)

  const weekMin = useMemo(() => Math.min(...d.temperature_2m_min.slice(0, n)), [d, n])
  const weekMax = useMemo(() => Math.max(...d.temperature_2m_max.slice(0, n)), [d, n])
  const range = Math.max(weekMax - weekMin, 1)

  if (n === 0) {
    return (
      <Fade>
        <p className="py-8 text-center text-xs text-muted-foreground">داده روزانه در دسترس نیست</p>
      </Fade>
    )
  }

  return (
    <Fade className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">پیش‌بینی ۷ روز آینده</span>
        <span className="text-[10px] text-muted-foreground">کمترین / بیشترین دما (°C)</span>
      </div>

      {Array.from({ length: n }).map((_, i) => {
        const inf = weatherCodeInfo(d.weather_code[i], 1)
        const DIcon = inf.icon
        const min = d.temperature_2m_min[i]
        const max = d.temperature_2m_max[i]
        const left = ((min - weekMin) / range) * 100
        const width = Math.max(((max - min) / range) * 100, 4)
        const pop = d.precipitation_probability_max[i]
        return (
          <Fade
            key={d.time[i]}
            delay={i * 0.04}
            className="flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/30 p-2.5"
          >
            <div className="flex w-16 shrink-0 flex-col sm:w-20">
              <span className="text-xs font-semibold">{i === 0 ? 'امروز' : faWeekday(d.time[i])}</span>
              <span className="text-[10px] text-muted-foreground">{faDate(d.time[i])}</span>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 sm:w-32 sm:shrink-0">
              <DIcon className={cn('h-4 w-4 shrink-0', inf.tone)} aria-hidden />
              <span className="truncate text-[11px] text-muted-foreground">{inf.fa}</span>
            </div>

            <div className="flex w-9 shrink-0">
              {pop > 20 ? (
                <Badge
                  variant="outline"
                  className="border-cyan-400/30 bg-cyan-400/10 px-1.5 text-[10px] text-cyan-200"
                >
                  {faNum(pop)}٪
                </Badge>
              ) : null}
            </div>

            <div dir="ltr" className="flex min-w-[110px] flex-1 items-center gap-1.5">
              <span className="w-7 shrink-0 text-left text-[11px] text-sky-300">
                {faRound(min)}°
              </span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400/80 via-cyan-300/80 to-amber-400/90"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-[11px] text-amber-300">
                {faRound(max)}°
              </span>
            </div>

            <div className="hidden w-[74px] shrink-0 items-center justify-end gap-1 text-[10px] text-muted-foreground sm:flex">
              <Wind className="h-3 w-3" aria-hidden />
              <span>{faNum(d.wind_speed_10m_max[i])} km/h</span>
            </div>
          </Fade>
        )
      })}
    </Fade>
  )
}

export function DailyPanel() {
  const city = useWeatherStore((s) => s.city)
  const { data, loading, error } = useWeather(city)
  return (
    <Card className={cardCls}>
      {loading ? (
        <DailySkeleton />
      ) : error ? (
        <PanelError message={error} />
      ) : data ? (
        <DailyContent data={data} />
      ) : (
        <DailySkeleton />
      )}
    </Card>
  )
}
