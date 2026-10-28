import { NextResponse } from 'next/server'
import { cachedFetch } from '@/lib/weather-server'

interface RvJson {
  host: string
  radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] }
  satellite?: { infrared?: { time: number; path: string }[] }
}

export async function GET() {
  try {
    const raw = await cachedFetch<RvJson>(
      'rainviewer',
      'https://api.rainviewer.com/public/weather-maps.json',
      2 * 60_000
    )
    return NextResponse.json({
      host: raw.host,
      radar: {
        past: (raw.radar?.past ?? []).slice(-9),
        nowcast: raw.radar?.nowcast ?? [],
      },
      satellite: (raw.satellite?.infrared ?? []).slice(-12),
    })
  } catch (e) {
    console.error('rainviewer error', e)
    return NextResponse.json({ error: 'خطا در دریافت فریم‌های رادار' }, { status: 502 })
  }
}
