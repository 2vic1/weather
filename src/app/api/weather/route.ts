import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weather-server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lon = parseFloat(sp.get('lon') ?? '')

  if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'مختصات نامعتبر است' }, { status: 400 })
  }

  try {
    const data = await fetchWeather(lat, lon)
    return NextResponse.json(data)
  } catch (e) {
    console.error('weather error', e)
    return NextResponse.json({ error: 'خطا در دریافت داده‌های هواشناسی' }, { status: 502 })
  }
}
