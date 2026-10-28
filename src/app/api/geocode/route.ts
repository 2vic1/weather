import { NextRequest, NextResponse } from 'next/server'
import { cachedFetch } from '@/lib/weather-server'

interface GeoResult {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const data = await cachedFetch<{ results?: GeoResult[] }>(
      `geo:${q}`,
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=fa&format=json`,
      60 * 60_000
    )
    const results = (data.results ?? []).map((r) => ({
      name: r.name,
      province: r.admin1,
      country: r.country,
      lat: r.latitude,
      lon: r.longitude,
      source: 'world' as const,
    }))
    return NextResponse.json({ results })
  } catch (e) {
    console.error('geocode error', e)
    return NextResponse.json({ results: [], error: 'خطا در جستجوی جهانی' }, { status: 500 })
  }
}
