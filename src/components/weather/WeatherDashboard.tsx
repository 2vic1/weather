'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { CloudSun, PanelLeftClose, PanelLeftOpen, Globe2, LocateFixed } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useWeatherStore } from '@/store/weather-store'
import CitySearch from './CitySearch'
import LayerSwitcher from './LayerSwitcher'
import RegionJump from './RegionJump'
import TimelineControl from './TimelineControl'
import SidebarContent from './SidebarContent'
import { faNum } from '@/lib/format'

const MapPanel = dynamic(() => import('./map/MapPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <CloudSun className="h-10 w-10 text-primary spin-slow" />
        <span className="text-sm font-bold">در حال بارگذاری نقشه لایو...</span>
      </div>
    </div>
  ),
})

const IRAN_OVERVIEW = { lat: 32.6, lon: 52.5, zoom: 5 }

/** Floating button that appears when the map is zoomed into a city / far from Iran —
 *  lets the user return to the general country view without refreshing or zooming out.
 *  variant "pill" = labeled pill for desktop top-center, "fab" = round button for mobile. */
function OverviewButton({ variant }: { variant: 'pill' | 'fab' }) {
  const mapView = useWeatherStore((s) => s.mapView)
  const flyTo = useWeatherStore((s) => s.flyTo)

  const dLat = mapView.lat - IRAN_OVERVIEW.lat
  const dLon =
    (mapView.lon - IRAN_OVERVIEW.lon) * Math.cos((IRAN_OVERVIEW.lat * Math.PI) / 180)
  const distKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111
  const focused = mapView.zoom > 6 || distKm > 700

  if (!focused) return null

  if (variant === 'fab') {
    return (
      <button
        onClick={() => flyTo(IRAN_OVERVIEW.lat, IRAN_OVERVIEW.lon, IRAN_OVERVIEW.zoom)}
        className="glass-strong pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border-amber-400/60 text-amber-300 shadow-lg transition-all active:scale-95"
        title="بازگشت به نمای کلی ایران"
        aria-label="بازگشت به نمای کلی ایران"
      >
        <LocateFixed className="h-5 w-5" />
      </button>
    )
  }

  return (
    <button
      onClick={() => flyTo(IRAN_OVERVIEW.lat, IRAN_OVERVIEW.lon, IRAN_OVERVIEW.zoom)}
      className="glass-strong pointer-events-auto flex items-center gap-1.5 rounded-full border-amber-400/40 px-3 py-1.5 text-[11px] font-bold text-amber-300 shadow-lg transition-all hover:border-amber-400/70 hover:bg-amber-400/15"
      title="بازگشت به نمای کلی نقشه ایران"
    >
      <LocateFixed className="h-3.5 w-3.5" />
      بازگشت به نمای کلی ایران
    </button>
  )
}

function TehranClock() {
  const [now, setNow] = useState<string>('')
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Tehran',
        })
      )
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return <span dir="ltr" className="tabular-nums">{now}</span>
}

export default function WeatherDashboard() {
  const mobilePanelOpen = useWeatherStore((s) => s.mobilePanelOpen)
  const setMobilePanelOpen = useWeatherStore((s) => s.setMobilePanelOpen)
  const [desktopPanel, setDesktopPanel] = useState(true)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ===== Header ===== */}
      <header className="glass-strong relative z-[1100] flex h-14 items-center gap-3 px-3 sm:px-4" dir="rtl">
        <button
          onClick={() => setDesktopPanel((v) => !v)}
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-muted/30 text-muted-foreground transition-colors hover:text-foreground lg:flex"
          title={desktopPanel ? 'بستن پنل' : 'نمایش پنل'}
        >
          {desktopPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 shadow-[0_0_16px] shadow-primary/30">
            <CloudSun className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-black leading-tight">آسمان‌نگار</div>
            <div className="text-[10px] text-muted-foreground">سامانه جامع رصد جوّ و هواشناسی</div>
          </div>
          <span
            className="shrink-0 whitespace-nowrap rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300"
            title="طراحی و ساخت اختصاصی برای عبدالامیر"
          >
            به سفارش عبدالامیر ✨
          </span>
        </div>

        <div className="hidden flex-1 sm:block" />
        <div className="min-w-0 flex-1 sm:flex-none">
          <CitySearch />
        </div>
        <div className="hidden items-center gap-1.5 rounded-xl border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground md:flex">
          <Globe2 className="h-3.5 w-3.5 text-amber-300" />
          <TehranClock />
        </div>

        {/* mobile panel trigger */}
        <button
          onClick={() => setMobilePanelOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary/20 px-3 text-xs font-bold text-primary lg:hidden"
        >
          <PanelLeftOpen className="h-4 w-4" />
          جزئیات
        </button>
      </header>

      {/* ===== Map area ===== */}
      <main className="relative isolate flex-1">
        <MapPanel />

        {/* floating controls */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1000] flex max-h-full flex-col justify-between p-3">
          <div className="flex flex-col gap-2">
            <LayerSwitcher />
          </div>
          <div className="mb-2 hidden sm:block">
            <RegionJump />
          </div>
        </div>

        {/* back-to-overview — labeled pill (desktop, top center) / round button (mobile, above timeline) */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1001] hidden -translate-x-1/2 sm:block">
          <OverviewButton variant="pill" />
        </div>
        <div className="pointer-events-none absolute bottom-24 right-3 z-[1001] sm:hidden">
          <OverviewButton variant="fab" />
        </div>

        {/* timeline bottom center — centered between the side panels on desktop */}
        <div
          className={`pointer-events-none absolute bottom-4 left-1/2 z-[1000] w-[min(94vw,560px)] -translate-x-1/2 ${
            desktopPanel ? 'lg:translate-x-[calc(-50%_-_82px)]' : ''
          }`}
        >
          <TimelineControl />
        </div>

        {/* desktop sidebar (right side in RTL) */}
        {desktopPanel && (
          <aside className="glass-strong absolute inset-y-0 right-0 z-[1000] hidden w-[400px] border-r-0 border-s border-border/50 lg:block">
            <SidebarContent />
          </aside>
        )}

        {/* mobile bottom sheet */}
        <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
          <SheetContent
            side="bottom"
            aria-describedby={undefined}
            className="glass-strong h-[72vh] rounded-t-3xl border-border/60 p-0"
          >
            <SheetTitle className="sr-only">جزئیات هواشناسی</SheetTitle>
            <div className="flex justify-center pt-2">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
            </div>
            <div className="h-[calc(72vh-16px)]">
              <SidebarContent />
            </div>
          </SheetContent>
        </Sheet>
      </main>

      {/* ===== Footer (sticky bottom status bar) ===== */}
      <footer className="glass-strong relative z-[1100] mt-auto flex h-7 items-center justify-between px-3 text-[10px] text-muted-foreground sm:px-4" dir="rtl">
        <span className="truncate">
          منابع: Open-Meteo (ECMWF/GFS/ICON) · RainViewer · NASA GIBS · EUMETSAT/NOAA · Esri
        </span>
        <span className="hidden shrink-0 sm:block" dir="ltr">
          {faNum(new Date().toLocaleDateString('fa-IR'), 0)}
        </span>
      </footer>
    </div>
  )
}
