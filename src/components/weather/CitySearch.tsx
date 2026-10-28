'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, MapPin, Building2, Globe2, Loader2, Command } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useWeatherStore } from '@/store/weather-store'
import type { CityPoint } from '@/lib/weather-types'
import { cn } from '@/lib/utils'

export default function CitySearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [iranCities, setIranCities] = useState<CityPoint[]>([])
  const [worldCities, setWorldCities] = useState<CityPoint[]>([])
  const [loading, setLoading] = useState(false)
  const setCity = useWeatherStore((s) => s.setCity)
  const flyTo = useWeatherStore((s) => s.flyTo)
  const city = useWeatherStore((s) => s.city)
  const inputRef = useRef<HTMLInputElement>(null)

  // debounce search
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    const t = setTimeout(() => {
      if (!q) {
        // default: show capitals
        fetch('/api/cities')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cities failed'))))
          .then((d) => setIranCities((d.cities ?? []).slice(0, 20)))
          .catch(() => {})
        setWorldCities([])
        setLoading(false)
        return
      }
      setLoading(true)
      Promise.allSettled([
        fetch(`/api/cities?q=${encodeURIComponent(q)}`).then((r) => r.json()),
        fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json()),
      ]).then(([iran, world]) => {
        if (iran.status === 'fulfilled') setIranCities(iran.value.cities ?? [])
        else setIranCities([])
        if (world.status === 'fulfilled') setWorldCities(world.value.results ?? [])
        else setWorldCities([])
        setLoading(false)
      })
    }, 280)
    return () => clearTimeout(t)
  }, [query, open])

  const select = (c: CityPoint) => {
    setCity(c)
    flyTo(c.lat, c.lon, 9)
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'glass flex items-center gap-2 rounded-xl border-border/60 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
            compact ? 'px-2.5 py-1.5' : 'w-full max-w-xs px-3 py-2'
          )}
        >
          <Search className="h-4 w-4 text-primary" />
          <span className="truncate">
            {city.source === 'custom' ? 'جستجوی شهر...' : `${city.name}${city.province ? '، ' + city.province : ''}`}
          </span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/40 px-1 text-[9px]">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>
      </DialogTrigger>
      <DialogContent className="glass-strong max-w-lg border-border/60 p-0" dir="rtl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">جستجوی شهر یا موقعیت</DialogTitle>
        </DialogHeader>
        <div className="relative px-4 pb-2">
          <Search className="absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: اصفهان، مشهد، دبی، London..."
            className="pr-9 bg-muted/40"
          />
        </div>
        <div className="nice-scroll max-h-[55vh] overflow-y-auto px-2 pb-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال جستجو...
            </div>
          )}

          {!loading && iranCities.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> شهرهای ایران
              </div>
              {iranCities.map((c) => (
                <button
                  key={`${c.name}-${c.province}`}
                  onClick={() => select({ ...c, source: 'iran' })}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-primary/15"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary/70" />
                    {c.name}
                    {c.isCapital && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                        مرکز استان
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.province}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && worldCities.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5" /> مکان‌های جهانی
              </div>
              {worldCities.map((c, i) => (
                <button
                  key={`w-${i}`}
                  onClick={() => select({ ...c, source: 'world' })}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-primary/15"
                >
                  <span className="flex items-center gap-2">
                    <Globe2 className="h-3.5 w-3.5 text-amber-300/70" />
                    {c.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.province ? c.province + '، ' : ''}
                    {c.country}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!loading && iranCities.length === 0 && worldCities.length === 0 && query.trim().length > 1 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              نتیجه‌ای یافت نشد
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
