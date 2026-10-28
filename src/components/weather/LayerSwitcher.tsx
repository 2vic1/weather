'use client'

import {
  Layers,
  Moon,
  Sun,
  Satellite as SatelliteIcon,
  Mountain,
  CloudRain,
  Wind,
  Thermometer,
  MapPinned,
  Info,
  Tornado,
  Zap,
  Palette,
  CloudRainWind,
  Cloud,
} from 'lucide-react'
// this lucide version has no Hurricane icon — Tornado is the closest match
const Hurricane = Tornado
import { useState } from 'react'
import { useWeatherStore, type BaseLayerId } from '@/store/weather-store'
import { cn } from '@/lib/utils'
import { tempColor } from '@/lib/weather-codes'

const BASES: Array<{ id: BaseLayerId; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: 'تیره', icon: Moon },
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'satellite', label: 'ماهواره‌ای', icon: SatelliteIcon },
  { id: 'terrain', label: 'توپوگرافی', icon: Mountain },
]

const OVERLAYS: Array<{
  id: 'radar' | 'satellite' | 'wind' | 'temp' | 'tropical' | 'fx' | 'forecast'
  label: string
  source: string
  icon: typeof CloudRain
}> = [
  { id: 'radar', label: 'رادار بارش (زمینی)', source: 'RainViewer', icon: CloudRain },
  { id: 'forecast', label: 'پیش‌بینی رنگی ۱۵ روز', source: 'Open-Meteo', icon: CloudRainWind },
  { id: 'tropical', label: 'حاره‌ای | طوفان‌ها', source: 'RainViewer', icon: Hurricane },
  { id: 'satellite', label: 'ماهواره ابر (IR)', source: 'NASA GIBS', icon: SatelliteIcon },
  { id: 'wind', label: 'حرکت توده‌های هوا', source: 'Open-Meteo', icon: Wind },
  { id: 'temp', label: 'لایه دما', source: 'Open-Meteo', icon: Thermometer },
  { id: 'fx', label: 'جلوه‌های طوفانی', source: 'زنده', icon: Zap },
]

/**
 * RainViewer color palettes — REAL palette ids 0..8 used in the tile URL.
 * https://www.rainviewer.com/api/color-schemes.html
 */
const PALETTES: Array<{ id: number; label: string; swatch: string }> = [
  { id: 0, label: 'سیاه‌وسفید dBZ', swatch: 'linear-gradient(90deg,#0b0f14,#5c6672,#b9c2cc,#ffffff)' },
  { id: 1, label: 'اصلی (NWS)', swatch: 'linear-gradient(90deg,#04e9e7,#019ff4,#0300f4,#02fd02,#01c501,#008e00,#fdf802,#fd9500,#fd0000,#f800fd)' },
  { id: 2, label: 'آبی جهانی', swatch: 'linear-gradient(90deg,#8ecaff,#2f9bd8,#42d6c8,#a8e05f,#f9d64a,#f95d4a,#d371dd)' },
  { id: 3, label: 'تایتان', swatch: 'linear-gradient(90deg,#21a358,#64b332,#ffd700,#ff8c00,#ff0000,#c0c0c0)' },
  { id: 4, label: 'کانال آب‌وهوا', swatch: 'linear-gradient(90deg,#04e9e7,#00b300,#fdf802,#fd9500,#fd0000,#f800fd)' },
  { id: 5, label: 'مت استونی', swatch: 'linear-gradient(90deg,#a1d0ff,#4a92ff,#32c800,#f4c800,#ff8000,#ff0000,#b40000)' },
  { id: 6, label: 'متئورد', swatch: 'linear-gradient(90deg,#cfe8ff,#7fc8f8,#3f8fe0,#26c281,#f7e347,#f5a623,#e04b3a,#9c27b0)' },
  { id: 7, label: 'نکس‌رَد', swatch: 'linear-gradient(90deg,#00c853,#ffeb3b,#ff9800,#f44336,#9c27b0)' },
  { id: 8, label: 'رنگین‌کمان', swatch: 'linear-gradient(90deg,#2962ff,#00bcd4,#4caf50,#ffeb3b,#ff5722,#d500f9)' },
]

const FORECAST_FIELDS = [
  { id: 'precip', label: 'بارش', icon: CloudRain },
  { id: 'temp', label: 'دما', icon: Thermometer },
  { id: 'clouds', label: 'ابر', icon: Cloud },
] as const

const PRECIP_LEGEND_CSS =
  'linear-gradient(90deg, rgba(170,215,150,.55) 0%, rgba(110,195,105,.6) 12%, rgba(45,160,95,.65) 25%, rgba(35,125,200,.68) 38%, rgba(45,185,215,.7) 50%, rgba(250,220,80,.75) 63%, rgba(245,150,45,.78) 76%, rgba(230,65,55,.82) 88%, rgba(200,55,165,.85) 100%)'

export default function LayerSwitcher() {
  const baseLayer = useWeatherStore((s) => s.baseLayer)
  const setBaseLayer = useWeatherStore((s) => s.setBaseLayer)
  const overlays = useWeatherStore((s) => s.overlays)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const radarColor = useWeatherStore((s) => s.radarColor)
  const setRadarColor = useWeatherStore((s) => s.setRadarColor)
  const forecastField = useWeatherStore((s) => s.forecastField)
  const setForecastField = useWeatherStore((s) => s.setForecastField)
  const setPlaying = useWeatherStore((s) => s.setPlaying)
  const flyTo = useWeatherStore((s) => s.flyTo)
  const [open, setOpen] = useState(true)

  const radarPaletteVisible = (overlays.radar || overlays.tropical) && timelineMode === 'radar'

  const handleOverlay = (id: (typeof OVERLAYS)[number]['id']) => {
    const turningOn = !overlays[id]
    toggleOverlay(id)
    if (id === 'radar' && turningOn && timelineMode !== 'radar') setTimelineMode('radar')
    if (id === 'satellite' && turningOn) setTimelineMode('satellite')
    if (id === 'tropical' && turningOn) {
      // tropical storm mode: radar timeline + storm effects + jump to the tropical belt
      if (timelineMode !== 'radar') setTimelineMode('radar')
      if (!overlays.fx) toggleOverlay('fx')
      flyTo(14, 62, 4)
    }
    if (id === 'forecast' && turningOn) {
      // animated model timeline — auto-play like Windy
      setTimelineMode('forecast')
      setPlaying(true)
    }
  }

  return (
    <div className="glass-strong pointer-events-auto w-56 rounded-2xl" dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          لایه‌های نقشه
        </span>
        <span className={cn('transition-transform text-xs text-muted-foreground', open && 'rotate-180')}>
          ▲
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {/* base layers */}
          <div className="mb-1 text-[10px] font-bold text-muted-foreground">نقشه پایه</div>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {BASES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setBaseLayer(id)}
                title={label}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[9px] transition-all',
                  baseLayer === id
                    ? 'border-primary/70 bg-primary/20 text-primary font-bold'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* overlays */}
          <div className="mb-1.5 text-[10px] font-bold text-muted-foreground">
            لایه‌های هواشناسی <span className="font-normal">(منبع هر لایه)</span>
          </div>
          <div className="flex flex-col gap-1">
            {OVERLAYS.map(({ id, label, source, icon: Icon }) => {
              const on = overlays[id]
              const active = on && (id === 'radar' || id === 'satellite' || id === 'forecast') && timelineMode !== id
              return (
                <button
                  key={id}
                  onClick={() => handleOverlay(id)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-2 py-1.5 text-[11px] transition-all',
                    on
                      ? 'border-primary/50 bg-primary/15 text-foreground'
                      : 'border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5', on ? 'text-primary' : '')} />
                    {label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[8px] text-muted-foreground/80" dir="ltr">
                      {source}
                    </span>
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        on ? 'bg-primary shadow-[0_0_6px] shadow-primary/70' : 'bg-muted-foreground/40',
                        active && 'opacity-50'
                      )}
                    />
                  </span>
                </button>
              )
            })}
          </div>

          {/* ===== forecast field selector + legends ===== */}
          {overlays.forecast && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
                <CloudRainWind className="h-3 w-3" />
                لایه پیش‌بینی ۱۵ روز آینده
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {FORECAST_FIELDS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setForecastField(id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] transition-all',
                      forecastField === id
                        ? 'border-emerald-400/70 bg-emerald-400/15 font-bold text-emerald-200'
                        : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {forecastField === 'precip' && (
                <div className="mt-2">
                  <div className="mb-1 text-[9px] text-muted-foreground">شدت بارش (mm/h)</div>
                  <div className="h-2 w-full rounded-full" style={{ background: PRECIP_LEGEND_CSS }} />
                  <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                    <span>۰٫۱</span>
                    <span>۱</span>
                    <span>۵</span>
                    <span>۱۰</span>
                    <span>۲۰</span>
                    <span>۴۰+</span>
                  </div>
                </div>
              )}
              {forecastField === 'temp' && (
                <div className="mt-2">
                  <div className="mb-1 text-[9px] text-muted-foreground">دمای ۲ متری (°C)</div>
                  <div
                    className="h-2 w-full rounded-full"
                    style={{
                      background: `linear-gradient(to left, rgb(${tempColor(-15).join(',')}), rgb(${tempColor(0).join(',')}), rgb(${tempColor(10).join(',')}), rgb(${tempColor(20).join(',')}), rgb(${tempColor(30).join(',')}), rgb(${tempColor(42).join(',')}))`,
                    }}
                  />
                  <div className="flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                    <span>-۱۵</span>
                    <span>۰</span>
                    <span>۱۰</span>
                    <span>۲۰</span>
                    <span>۳۰</span>
                    <span>+۴۲</span>
                  </div>
                </div>
              )}
              {forecastField === 'clouds' && (
                <div className="mt-2">
                  <div className="mb-1 text-[9px] text-muted-foreground">پوشش ابر (٪)</div>
                  <div className="h-2 w-full rounded-full bg-gradient-to-l from-slate-200/70 to-slate-600/70" />
                  <div className="flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                    <span>۰</span>
                    <span>۵۰</span>
                    <span>۱۰۰</span>
                  </div>
                </div>
              )}

              <p className="mt-2 text-[9px] leading-4 text-emerald-200/70">
                میله زمان پایین صفحه را با موس بکشید — از «امروز» تا ۱۵ روز آینده؛ لایه‌های رنگی بر
                اساس دیتای مدل جابه‌جا می‌شوند. دکمه پخش را هم بزنید تا حرکت سامانه‌ها را ببینید.
              </p>
            </div>
          )}

          {/* radar / tropical color palette */}
          {radarPaletteVisible && (
            <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                <Palette className="h-3 w-3 text-primary" />
                رنگ‌بندی رادار {overlays.tropical && <span className="text-primary">(حاره‌ای)</span>}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setRadarColor(p.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2 py-1 text-[10px] transition-all',
                      radarColor === p.id
                        ? 'border-primary/70 bg-primary/15 font-bold text-primary'
                        : 'border-transparent text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <span
                      className="h-3 w-10 shrink-0 rounded-full border border-white/20"
                      style={{ background: p.swatch }}
                      aria-hidden
                    />
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                توجه: رادار زمینی ایران محدود است (پوشش اصلی: بندرعباس و چند ایستگاه دیگر). برای
                پوشش کامل و دقیق کل ایران حالت «پیش‌بینی رنگی ۴۸س» را فعال کنید.
              </p>
            </div>
          )}

          {/* tropical badge */}
          {overlays.tropical && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-[9px] leading-4 text-amber-300/90">
              <Hurricane className="mt-0.5 h-3 w-3 shrink-0" />
              حالت حاره‌ای فعال است: رادار زنده با رنگ دلخواه + رصد چرخندها در اقیانوس هند، دریای عرب و خلیج بنگال.
            </div>
          )}

          {/* temp legend (static current-hour layer) */}
          {overlays.temp && timelineMode !== 'forecast' && (
            <div className="mt-3">
              <div className="mb-1 text-[9px] text-muted-foreground">مقیاس دما (°C)</div>
              <div
                className="h-2 w-full rounded-full"
                style={{
                  background: `linear-gradient(to left, rgb(${tempColor(-15).join(',')}), rgb(${tempColor(0).join(',')}), rgb(${tempColor(10).join(',')}), rgb(${tempColor(20).join(',')}), rgb(${tempColor(30).join(',')}), rgb(${tempColor(42).join(',')}))`,
                }}
              />
              <div className="flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                <span>-۱۵</span>
                <span>۰</span>
                <span>۱۰</span>
                <span>۲۰</span>
                <span>۳۰</span>
                <span>+۴۲</span>
              </div>
            </div>
          )}

          {/* wind legend */}
          {overlays.wind && (
            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <Wind className="h-3 w-3 text-cyan-300" />
              هر ذره = جریان باد سطحی؛ رنگ از آرام (آبی) تا شدید (نارنجی)
            </div>
          )}

          <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/30 p-2 text-[9px] leading-4 text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            برای انتخاب هر نقطه از دنیا، دکمه «انتخاب نقطه» در بالای صفحه را بزنید و روی نقشه کلیک کنید.
            <MapPinned className="hidden" />
          </div>
        </div>
      )}
    </div>
  )
}
