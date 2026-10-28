'use client'

import { MapPin } from 'lucide-react'
import { useWeatherStore } from '@/store/weather-store'

const REGIONS: Array<{ label: string; sub: string; lat: number; lon: number; zoom: number }> = [
  { label: 'کل ایران', sub: 'نمای کشوری', lat: 32.6, lon: 52.5, zoom: 5 },
  { label: 'خلیج فارس', sub: 'منطقه حاره‌ای', lat: 26.6, lon: 52.5, zoom: 6 },
  { label: 'دریای عمان', sub: 'مجاور حاره', lat: 24.8, lon: 58.5, zoom: 6 },
  { label: 'اقیانوس هند', sub: 'منشأ سامانه‌ها', lat: 15, lon: 62, zoom: 4 },
  { label: 'دریای خزر', sub: 'توده‌های شمالی', lat: 41.5, lon: 51.5, zoom: 6 },
  { label: 'مدیترانه', sub: 'ناوه‌های بارشی', lat: 34.5, lon: 25, zoom: 4 },
  { label: 'شبه‌جزیره عربستان', sub: 'توده‌های گرم', lat: 23.5, lon: 45, zoom: 5 },
  { label: 'سوئس/اروپا', sub: 'ناوه‌های غربی', lat: 47, lon: 10, zoom: 4 },
]

export default function RegionJump() {
  const flyTo = useWeatherStore((s) => s.flyTo)

  return (
    <div className="glass-strong pointer-events-auto w-48 rounded-2xl p-2" dir="rtl">
      <div className="mb-1.5 flex items-center gap-1.5 px-1.5 text-[11px] font-bold text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        پرش سریع به مناطق
      </div>
      <div className="grid grid-cols-2 gap-1">
        {REGIONS.map((r) => (
          <button
            key={r.label}
            onClick={() => flyTo(r.lat, r.lon, r.zoom)}
            className="rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5 text-start transition-all hover:border-primary/50 hover:bg-primary/15"
          >
            <div className="text-[11px] font-bold">{r.label}</div>
            <div className="text-[8px] text-muted-foreground">{r.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
