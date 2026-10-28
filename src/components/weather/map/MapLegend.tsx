'use client'

// Compact on-map legend that explains WHAT the user is looking at, live:
// - real ground radar (RainViewer dBZ) while the slider is before «اکنون»
// - 15-day numerical model field (Open-Meteo GFS/ICON) once the slider
//   crosses into the future — radar physically cannot see the future,
//   so colors switch from measured dBZ to the model mm ramp.
// Pure indicator: pointer-events-none, never blocks map interaction.

import { useWeatherStore } from '@/store/weather-store'
import { RADAR_PALETTES, PRECIP_LEGEND_CSS } from '@/lib/map-legends'
import { tempColor } from '@/lib/weather-codes'
import { useForecastState } from './forecastCache'

const FIELD_FA: Record<string, string> = {
  precip: 'بارش (mm/h)',
  temp: 'دما (°C)',
  clouds: 'پوشش ابر (٪)',
}

export default function MapLegend() {
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const radarFuture = useWeatherStore((s) => s.radarFuture)
  const radarOn = useWeatherStore((s) => s.overlays.radar)
  const tropicalOn = useWeatherStore((s) => s.overlays.tropical)
  const forecastOn = useWeatherStore((s) => s.overlays.forecast)
  const forecastField = useWeatherStore((s) => s.forecastField)
  const radarColor = useWeatherStore((s) => s.radarColor)
  const fc = useForecastState()

  const radarReal = timelineMode === 'radar' && !radarFuture && (radarOn || tropicalOn)
  const modelField =
    (timelineMode === 'radar' && radarFuture) || (timelineMode === 'forecast' && forecastOn)

  if (!radarReal && !modelField) return null

  const palette = RADAR_PALETTES.find((p) => p.id === radarColor) ?? RADAR_PALETTES[4]

  return (
    <div
      dir="rtl"
      className="glass-strong pointer-events-none absolute bottom-[132px] left-3 z-[1001] w-[190px] rounded-xl border border-border/50 px-2.5 py-2 shadow-lg sm:bottom-[112px] sm:left-[248px] sm:w-[215px]"
    >
      {radarReal && (
        <>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-cyan-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </span>
            رادار زمینی — اندازه‌گیری واقعی
          </p>
          <div
            className="h-2 w-full rounded-full border border-white/15"
            style={{ background: palette.swatch }}
            aria-hidden
          />
          <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground">
            <span>خفیف</span>
            <span>متوسط</span>
            <span>شدید</span>
            <span>رگبار</span>
          </div>
          <p className="mt-1 leading-3.5 text-muted-foreground">
            بازه رادار: ~۲ ساعت قبل تا ~۳۰ دقیقه بعد
          </p>
        </>
      )}

      {modelField && (
        <>
          <p className="mb-1 text-[10px] font-bold text-emerald-300">
            پیش‌بینی مدل ۱۵ روزه — {FIELD_FA[forecastField] ?? ''}
          </p>
          {forecastField === 'precip' && (
            <>
              <div className="h-2 w-full rounded-full" style={{ background: PRECIP_LEGEND_CSS }} />
              <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                <span>۰٫۱</span>
                <span>۱</span>
                <span>۳</span>
                <span>۷</span>
                <span>۱۵</span>
                <span>۴۵+</span>
              </div>
            </>
          )}
          {forecastField === 'temp' && (
            <>
              <div
                className="h-2 w-full rounded-full"
                style={{
                  background: `linear-gradient(to left, rgb(${tempColor(-15).join(',')}), rgb(${tempColor(0).join(',')}), rgb(${tempColor(10).join(',')}), rgb(${tempColor(20).join(',')}), rgb(${tempColor(30).join(',')}), rgb(${tempColor(42).join(',')}))`,
                }}
              />
              <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                <span>-۱۵</span>
                <span>۰</span>
                <span>۱۰</span>
                <span>۲۰</span>
                <span>۳۰</span>
                <span>+۴۲</span>
              </div>
            </>
          )}
          {forecastField === 'clouds' && (
            <>
              <div className="h-2 w-full rounded-full bg-gradient-to-l from-slate-200/70 to-slate-600/70" />
              <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground" dir="ltr">
                <span>۰</span>
                <span>۵۰</span>
                <span>۱۰۰</span>
              </div>
            </>
          )}
          {fc.synthetic && (
            <p className="mt-1 leading-3.5 text-amber-500/90">
              نمایش آزمایشی — سهمیه مدل عددی موقتاً پر شده؛ به‌زودی داده واقعی برمی‌گردد
            </p>
          )}
        </>
      )}
    </div>
  )
}
