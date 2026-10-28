import { NextRequest, NextResponse } from 'next/server'
import { fetchForecastField } from '@/lib/weather-server'

/**
 * Animated model forecast field for the map timeline.
 * Returns a lat/lon grid where each point carries hourly series of
 * precipitation (mm), temperature (°C) and cloud cover (%) for the next 48h.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const latMin = parseFloat(sp.get('latMin') ?? '')
  const latMax = parseFloat(sp.get('latMax') ?? '')
  const lonMin = parseFloat(sp.get('lonMin') ?? '')
  const lonMax = parseFloat(sp.get('lonMax') ?? '')

  if ([latMin, latMax, lonMin, lonMax].some(Number.isNaN)) {
    return NextResponse.json({ error: 'bounds نامعتبر است' }, { status: 400 })
  }

  // grid side capped at 20 → max 400 points (chunked upstream)
  const size = parseFloat(sp.get('res') ?? '20')
  const n = Math.min(Math.max(Math.round(size), 8), 20)
  const hours = Math.min(Math.max(Math.round(parseFloat(sp.get('hours') ?? '49')), 12), 49)

  try {
    const data = await fetchForecastField(
      Math.min(latMin, latMax),
      Math.max(latMin, latMax),
      Math.min(lonMin, lonMax),
      Math.max(lonMin, lonMax),
      n,
      hours
    )
    return NextResponse.json({
      ...data,
      bounds: { latMin, latMax, lonMin, lonMax },
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('forecastfield error', e)
    return NextResponse.json({ error: 'خطا در دریافت میدان پیش‌بینی' }, { status: 502 })
  }
}
