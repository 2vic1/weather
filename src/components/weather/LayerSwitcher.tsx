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
} from 'lucide-react'
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
  id: 'radar' | 'satellite' | 'wind' | 'temp'
  label: string
  source: string
  icon: typeof CloudRain
}> = [
  { id: 'radar', label: 'رادار بارش', source: 'RainViewer', icon: CloudRain },
  { id: 'satellite', label: 'ماهواره ابر (IR)', source: 'NASA GIBS', icon: SatelliteIcon },
  { id: 'wind', label: 'حرکت توده‌های هوا', source: 'Open-Meteo', icon: Wind },
  { id: 'temp', label: 'لایه دما', source: 'Open-Meteo', icon: Thermometer },
]

export default function LayerSwitcher() {
  const baseLayer = useWeatherStore((s) => s.baseLayer)
  const setBaseLayer = useWeatherStore((s) => s.setBaseLayer)
  const overlays = useWeatherStore((s) => s.overlays)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const [open, setOpen] = useState(true)

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
              const active = on && (id === 'radar' || id === 'satellite') && timelineMode !== id
              return (
                <button
                  key={id}
                  onClick={() => {
                    toggleOverlay(id)
                    if ((id === 'radar' || id === 'satellite') && !on) setTimelineMode(id)
                  }}
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

          {/* temp legend */}
          {overlays.temp && (
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
