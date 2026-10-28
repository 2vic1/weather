'use client'

// بارش — rainfall charts (hourly 48h + daily 7d) and advanced rain tools,
// wired to the animated forecast layer on the map.

import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CloudRainWind,
  Radar,
  Timer,
  Umbrella,
  Zap,
  CalendarDays,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useWeather } from '@/hooks/use-weather-data'
import { useWeatherStore } from '@/store/weather-store'
import { faDateTime, faNum, faRound, faTime, faWeekday } from '@/lib/format'
import type { WeatherData } from '@/lib/weather-types'
import { cn } from '@/lib/utils'

const cardCls = 'glass gap-3 rounded-2xl border-border/40 p-4 shadow-none'

/** bar color by mm/h intensity — mirrors the map precip ramp (Windy palette) */
function rainBarColor(mm: number): string {
  if (!Number.isFinite(mm) || mm < 0.1) return 'rgba(120,150,170,0.25)'
  if (mm < 0.5) return '#82e094'
  if (mm < 1) return '#34c66c'
  if (mm < 2) return '#2d8ceb'
  if (mm < 6) return '#1e64d7'
  if (mm < 10) return '#fae24e'
  if (mm < 16) return '#fa9c2d'
  if (mm < 26) return '#f03c2d'
  if (mm < 45) return '#ba2238'
  return '#5e106c'
}

const RAIN_BANDS: Array<[string, number]> = [
  ['خفیف', 0.5],
  ['متوسط', 2],
  ['شدید', 6],
  ['خیلی شدید', 16],
  ['رگبار سیل‌آسا', 45],
]

function RainTip(props: {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ value?: number | string; dataKey?: string | number }>
}) {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null
  const mm = payload.find((p) => p.dataKey === 'mm')?.value
  const pop = payload.find((p) => p.dataKey === 'pop')?.value
  return (
    <div
      dir="rtl"
      className="min-w-[130px] rounded-xl border border-border/60 bg-slate-950/85 px-3 py-2 shadow-xl backdrop-blur-md"
    >
      {label !== undefined && <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>}
      {mm !== undefined && (
        <p className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">بارش</span>
          <span className="font-semibold text-cyan-300">{faNum(Number(mm), 1)} mm</span>
        </p>
      )}
      {pop !== undefined && (
        <p className="mt-0.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">احتمال</span>
          <span className="font-semibold text-sky-300">{faNum(Number(pop))}٪</span>
        </p>
      )}
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-[190px] rounded-2xl" />
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-[150px] rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text-cyan-300',
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', tone)} aria-hidden />
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function RainContent({ data }: { data: WeatherData }) {
  const h = data.hourly
  const d = data.daily
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)
  const overlays = useWeatherStore((s) => s.overlays)
  const setForecastField = useWeatherStore((s) => s.setForecastField)
  const setPlaying = useWeatherStore((s) => s.setPlaying)

  const hours48 = useMemo(() => {
    if (h.time.length === 0) return []
    const nowKey = data.current.time.slice(0, 13)
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey)
    if (start < 0) start = 0
    const end = Math.min(start + 48, h.time.length)
    const out: Array<{ key: string; label: string; mm: number; pop: number }> = []
    for (let i = start; i < end; i++) {
      out.push({
        key: h.time[i],
        label: faTime(h.time[i]),
        mm: h.precipitation[i] ?? 0,
        pop: h.precipitation_probability[i] ?? 0,
      })
    }
    return out
  }, [h, data])

  const days15 = useMemo(() => {
    const n = Math.min(15, d.time.length)
    const out: Array<{ key: string; label: string; mm: number; pop: number }> = []
    for (let i = 0; i < n; i++) {
      out.push({
        key: d.time[i],
        label: i === 0 ? 'امروز' : faWeekday(d.time[i]),
        mm: d.precipitation_sum[i] ?? 0,
        pop: d.precipitation_probability_max[i] ?? 0,
      })
    }
    return out
  }, [d])

  const stats = useMemo(() => {
    const sum24 = hours48.slice(0, 24).reduce((a, p) => a + p.mm, 0)
    const sum48 = hours48.reduce((a, p) => a + p.mm, 0)
    let maxMm = 0
    let maxAt = ''
    let startAt = ''
    let wetHours = 0
    for (let i = 0; i < hours48.length; i++) {
      const p = hours48[i]
      if (p.mm > maxMm) {
        maxMm = p.mm
        maxAt = h.time[h.time.indexOf(p.key)]
      }
      if (p.mm >= 0.1) wetHours++
      if (!startAt && p.mm >= 0.15) startAt = p.key
    }
    const maxPop = hours48.reduce((a, p) => Math.max(a, p.pop), 0)
    const sum15 = days15.reduce((a, p) => a + p.mm, 0)
    const wetDays15 = days15.filter((p) => p.mm >= 1).length
    const maxDay15 = days15.reduce((a, p) => (p.mm > a.mm ? p : a), days15[0] ?? { key: '', label: '', mm: 0, pop: 0 })
    return { sum24, sum48, maxMm, maxAt, startAt, wetHours, maxPop, sum15, wetDays15, maxDay15 }
  }, [hours48, days15, h.time])

  const showForecastMap = () => {
    if (!overlays.forecast) toggleOverlay('forecast')
    setForecastField('precip')
    setTimelineMode('forecast')
    setPlaying(true)
  }
  const showRadar = () => {
    if (!overlays.radar) toggleOverlay('radar')
    setTimelineMode('radar')
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ===== 48h rainfall chart ===== */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Umbrella className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
          نمودار بارندگی — ۴۸ ساعت آینده
        </span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> mm
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> احتمال
          </span>
        </div>
      </div>
      <div dir="ltr" className="h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={hours48} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="rainBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={5}
              tickMargin={6}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="mm"
              width={30}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => faNum(v, 1)}
            />
            <YAxis yAxisId="pop" orientation="right" hide domain={[0, 100]} />
            <Tooltip
              cursor={{ stroke: 'rgba(148,163,184,0.35)', strokeDasharray: '4 4' }}
              content={<RainTip />}
            />
            <Bar yAxisId="mm" dataKey="mm" radius={[3, 3, 0, 0]} maxBarSize={12}>
              {hours48.map((p) => (
                <Cell key={p.key} fill={p.mm >= 2 ? rainBarColor(p.mm) : 'url(#rainBar)'} />
              ))}
            </Bar>
            <Line
              yAxisId="pop"
              type="monotone"
              dataKey="pop"
              stroke="#a5b4fc"
              strokeWidth={1.6}
              dot={false}
              strokeDasharray="5 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ===== 15-day rainfall chart ===== */}
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
        بارش ۱۵ روز آینده (میلی‌متر در روز)
      </div>
      <div dir="ltr" className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days15} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={1}
              tickMargin={6}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="mm"
              width={30}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => faNum(v, 1)}
            />
            <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} content={<RainTip />} />
            <Bar yAxisId="mm" dataKey="mm" radius={[4, 4, 0, 0]} maxBarSize={18} fill="url(#rainBar)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ===== stats ===== */}
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          icon={Umbrella}
          label="مجموع بارش ۲۴ ساعت"
          value={`${faNum(stats.sum24, 1)} mm`}
          sub="از همین ساعت"
        />
        <StatTile
          icon={Timer}
          label="مجموع ۴۸ ساعت"
          value={`${faNum(stats.sum48, 1)} mm`}
        />
        <StatTile
          icon={Zap}
          label="بیشترین بارش ساعتی"
          value={`${faNum(stats.maxMm, 1)} mm`}
          sub={stats.maxAt ? faTime(stats.maxAt) : '—'}
          tone="text-amber-300"
        />
        <StatTile
          icon={CloudRainWind}
          label="شروع بارش مؤثر"
          value={stats.startAt ? `${faWeekday(stats.startAt)} ${faTime(stats.startAt)}` : 'بارش قابل‌توجهی نیست'}
          sub="آستانه ۰٫۱۵ میلی‌متر"
          tone="text-emerald-300"
        />
        <StatTile icon={Activity} label="ساعت‌های بارانی" value={`${faNum(stats.wetHours)} ساعت`} />
        <StatTile
          icon={Timer}
          label="بیشترین احتمال بارش"
          value={`${faNum(stats.maxPop)}٪`}
          tone="text-indigo-300"
        />
        <StatTile
          icon={CalendarDays}
          label="مجموع بارش ۱۵ روز"
          value={`${faNum(stats.sum15, 1)} mm`}
          sub={stats.wetDays15 > 0 ? `${faNum(stats.wetDays15)} روز بارانی (≥۱ mm)` : 'بدون روز بارانی'}
          tone="text-cyan-200"
        />
        <StatTile
          icon={CloudRainWind}
          label="بارانی‌ترین روز ۱۵ روزه"
          value={stats.maxDay15?.label ? `${stats.maxDay15.label} — ${faNum(stats.maxDay15.mm, 1)} mm` : '—'}
          tone="text-sky-300"
        />
      </div>

      {/* ===== advanced tools ===== */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
          <Zap className="h-4 w-4 text-primary" />
          ابزار پیشرفته
        </div>
        <div className="flex flex-col gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={showForecastMap}
            className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-right text-[11px] font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20"
          >
            <span className="flex items-center gap-2">
              <CloudRainWind className="h-4 w-4" />
              نقشه متحرک بارش ۱۵ روز آینده
            </span>
            <span className="text-[9px] font-normal text-emerald-300/70">مثل ویندی →</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={showRadar}
            className="flex items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2.5 text-right text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20"
          >
            <span className="flex items-center gap-2">
              <Radar className="h-4 w-4" />
              رادار بارش زنده
            </span>
            <span className="text-[9px] font-normal text-cyan-300/70">۶۰ دقیقه قبل و بعد →</span>
          </motion.button>
        </div>

        {/* intensity scale */}
        <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">طبقه‌بندی شدت بارش (mm/h)</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
            {RAIN_BANDS.map(([label, mm]) => (
              <span key={label} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: rainBarColor(mm) }}
                  aria-hidden
                />
                {label} ({faNum(mm, 1)}+ mm)
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-[9px] text-muted-foreground">
        آخرین به‌روزرسانی: {faDateTime(data.current.time)} — منبع: Open-Meteo (ICON/ECMWF)
      </p>
    </div>
  )
}

export default function RainPanel() {
  const city = useWeatherStore((s) => s.city)
  const { data, loading, error } = useWeather(city)
  return (
    <Card className={cardCls}>
      {loading ? (
        <PanelSkeleton />
      ) : error ? (
        <p className="py-8 text-center text-xs text-red-300">دریافت داده بارش ممکن نشد</p>
      ) : data ? (
        <RainContent data={data} />
      ) : (
        <PanelSkeleton />
      )}
    </Card>
  )
}
