import { NextRequest, NextResponse } from 'next/server'
import { fetchAtmosphere } from '@/lib/weather-server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lon = parseFloat(sp.get('lon') ?? '')

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: 'مختصات نامعتبر است' }, { status: 400 })
  }

  try {
    const data = await fetchAtmosphere(lat, lon)
    return NextResponse.json(data)
  } catch (e) {
    console.error('atmosphere error', e)
    return NextResponse.json({ error: 'خطا در دریافت داده‌های لایه‌های جو' }, { status: 502 })
  }
}
