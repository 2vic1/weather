'use client'

import dynamic from 'next/dynamic'

const WeatherDashboard = dynamic(() => import('@/components/weather/WeatherDashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-2xl bg-primary/20 shadow-[0_0_30px] shadow-primary/40" />
        <div className="text-lg font-black text-foreground">آسمان‌نگار</div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold text-amber-300">
          ✨ به سفارش عبدالامیر
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          در حال آماده‌سازی سامانه رصد جوّ...
        </div>
      </div>
    </div>
  ),
})

export default function Page() {
  return <WeatherDashboard />
}
