'use client'

import dynamic from 'next/dynamic'

const WeatherDashboard = dynamic(() => import('@/components/weather/WeatherDashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-2xl bg-primary/20 shadow-[0_0_30px] shadow-primary/40" />
        <div className="text-lg font-black text-foreground">آسمان‌نگار</div>
        <div className="mt-1 text-xs text-muted-foreground">
          در حال آماده‌سازی سامانه رصد جوّ...
        </div>
      </div>
    </div>
  ),
})

export default function Page() {
  return <WeatherDashboard />
}
