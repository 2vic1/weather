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
  Haze,
  AirVent,
  CloudLightning,
} from 'lucide-react'
// this lucide version has no Hurricane icon — Tornado is the closest match
const Hurricane = Tornado
import { useState } from 'react'
import { useWeatherStore, type BaseLayerId } from '@/store/weather-store'
import { cn } from '@/lib/utils'
import { tempColor } from '@/lib/weather-codes'
import { aqColor, aqLabel, capeColor, capeLabel } from '@/lib/analysis-scale'
import {
  RADAR_PALETTES as PALETTES,
  PRECIP_LEGEND_CSS,
  NASA_DUST_LEGEND_CSS as DUST_LEGEND_CSS,
} from '@/lib/map-legends'

const BASES: Array<{ id: BaseLayerId; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: 'تیره', icon: Moon },
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'satellite', label: 'ماهواره‌ای', icon: SatelliteIcon },
  { id: 'terrain', label: 'توپوگرافی', icon: Mountain },
]

const OVERLAYS: Array<{
  id:
    | 'radar'
    | 'satellite'
    | 'wind'
    | 'temp'
    | 'tropical'
    | 'fx'
    | 'forecast'
    | 'dust'
    | 'aq'
    | 'cape'
  label: string
  source: string
  icon: typeof CloudRain
}> = [
  { id: 'radar', label: 'رادار بارش (زمینی)', source: 'RainViewer', icon: CloudRain },
  { id: 'forecast', label: 'پیش‌بینی رنگی ۱۵ روز', source: 'Open-Meteo', icon: CloudRainWind },
  { id: 'tropical', label: 'حاره‌ای | طوفان‌ها', source: 'RainViewer', icon: Hurricane },
  { id: 'satellite', label: 'ماهواره ابر زنده (IR)', source: 'RainViewer', icon: SatelliteIcon },
  { id: 'dust', label: 'گرد و غبار', source: 'NASA GIBS', icon: Haze },
  { id: 'aq', label: 'کیفیت هوا (ذرات)', source: 'Open-Meteo', icon: AirVent },
  { id: 'cape', label: 'ناپایداری و رعدوبرق', source: 'Open-Meteo', icon: CloudLightning },
  { id: 'wind', label: 'حرکت توده‌های هوا', source: 'Open-Meteo', icon: Wind },
  { id: 'temp', label: 'لایه دما', source: 'Open-Meteo', icon: Thermometer },
  { id: 'fx', label: 'جلوه‌های طوفانی', source: 'زنده', icon: Zap },
]

const FORECAST_FIELDS = [
  { id: 'precip', label: 'بارش', icon: CloudRain },
  { id: 'temp', label: 'دما', icon: Thermometer },
  { id: 'clouds', label: 'ابر', icon: Cloud },
] as const

/** representative sample values per band → drives the legend rows automatically */
const AQ_SAMPLES = [6, 25, 45, 100, 200, 300]
const CAPE_SAMPLES = [100, 500, 1000, 1500, 2500, 3500]

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
  // start collapsed on phones so the panel doesn't bury the map and controls
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 640
  )

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
    <div
      className="glass-strong pointer-events-auto flex max-h-[calc(100dvh-180px)] w-56 flex-col rounded-2xl"
      dir="rtl"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full shrink-0 items-center justify-between px-3 py-2.5 text-sm font-bold"
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
        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
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
                    <span>۳</span>
                    <span>۷</span>
                    <span>۱۵</span>
                    <span>۴۵+</span>
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

          {/* dust legend */}
          {overlays.dust && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <Haze className="h-3 w-3 text-amber-300" />
                شاخص غبار جوّی (Aerosol Index)
              </div>
              <div className="h-2 w-full rounded-full" style={{ background: DUST_LEGEND_CSS }} />
              <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                <span>۰</span>
                <span>۱</span>
                <span>۲</span>
                <span>۳</span>
                <span>۴+</span>
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                تصویر روزانه ماهواره Suomi-NPP (دیشب UTC)؛ رنگ قرمز تیره = توفان گرد و غبار —
                برای خوزستان، سیستان و ساحل خلیج فارس. در بزرگ‌نمایی زیاد محو می‌شود.
              </p>
            </div>
          )}

          {/* air quality legend */}
          {overlays.aq && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <AirVent className="h-3 w-3 text-emerald-300" />
                کیفیت هوا — PM۲٫۵ (µg/m³) · ۴۰ شهر
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {AQ_SAMPLES.map((v) => (
                  <div key={v} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                      style={{ background: aqColor(v) }}
                    />
                    <span className="truncate">{aqLabel(v)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                دایره‌ها را لمس کنید: جزئیات هواشناسی همان شهر باز می‌شود. غبار CAMS در تولتیپ نقاط
                مستعد نشان داده می‌شود.
              </p>
            </div>
          )}

          {/* CAPE legend */}
          {overlays.cape && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <CloudLightning className="h-3 w-3 text-orange-300" />
                ناپایداری جوّی — CAPE (J/kg)
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {CAPE_SAMPLES.map((v) => (
                  <div key={v} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                      style={{ background: capeColor(v) }}
                    />
                    <span className="truncate">{capeLabel(v)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                حلقه‌های بزرگ = انرژی رعدوبرق زاگرس و شمال‌غرب؛ برای توفان‌های بهاری و پاییزی به‌کار می‌آید.
              </p>
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
