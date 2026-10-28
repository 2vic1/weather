'use client'

import {
  ThermometerSun,
  Clock3,
  CalendarDays,
  CloudRain,
  Layers3,
  Sparkles,
  MapPin,
  Crosshair,
  CrosshairIcon,
} from 'lucide-react'
import { useWeatherStore, type SidebarTab } from '@/store/weather-store'
import { useWeather } from '@/hooks/use-weather-data'
import { CurrentPanel, HourlyPanel, DailyPanel } from './panels/WeatherPanels'
import AtmospherePanel from './panels/AtmospherePanel'
import AIPanel from './panels/AIPanel'
import RainPanel from './panels/RainPanel'
import { cn } from '@/lib/utils'
import { faNum } from '@/lib/format'

const TABS: Array<{ id: SidebarTab; label: string; icon: typeof ThermometerSun }> = [
  { id: 'current', label: 'اکنون', icon: ThermometerSun },
  { id: 'hourly', label: 'ساعتی', icon: Clock3 },
  { id: 'daily', label: '۱۵ روزه', icon: CalendarDays },
  { id: 'rain', label: 'بارش', icon: CloudRain },
  { id: 'atmosphere', label: 'لایه‌های جو', icon: Layers3 },
  { id: 'ai', label: 'هوش مصنوعی', icon: Sparkles },
]

export default function SidebarContent() {
  const tab = useWeatherStore((s) => s.tab)
  const setTab = useWeatherStore((s) => s.setTab)
  const city = useWeatherStore((s) => s.city)
  const setPickMode = useWeatherStore((s) => s.setPickMode)
  const pickMode = useWeatherStore((s) => s.pickMode)
  const { loading } = useWeather(city)

  return (
    <div className="flex h-full flex-col" dir="rtl">
      {/* city header */}
      <div className="border-b border-border/50 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-lg font-black leading-tight">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{city.name}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {city.province ?? city.country ?? ''}
              <span className="mx-1.5 text-border">|</span>
              <span dir="ltr">
                {faNum(city.lat, 2)}°N, {faNum(city.lon, 2)}°E
              </span>
            </div>
          </div>
          <button
            onClick={() => setPickMode(!pickMode)}
            title="انتخاب نقطه روی نقشه"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all',
              pickMode
                ? 'border-primary bg-primary/25 text-primary animate-pulse'
                : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground'
            )}
          >
            {pickMode ? <CrosshairIcon className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-border/50 px-2 py-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-bold transition-all',
              tab === id
                ? 'bg-primary/20 text-primary shadow-[inset_0_0_0_1px] shadow-primary/40'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* content */}
      <div
        className={cn(
          'nice-scroll flex-1 overflow-y-auto p-3 pb-6',
          loading && 'opacity-80'
        )}
      >
        {tab === 'current' && <CurrentPanel />}
        {tab === 'hourly' && <HourlyPanel />}
        {tab === 'daily' && <DailyPanel />}
        {tab === 'rain' && <RainPanel />}
        {tab === 'atmosphere' && <AtmospherePanel />}
        {tab === 'ai' && <AIPanel />}
      </div>
    </div>
  )
}
