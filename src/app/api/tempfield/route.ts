import { NextRequest, NextResponse } from 'next/server'
import { fetchTempField } from '@/lib/weather-server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const latMin = parseFloat(sp.get('latMin') ?? '')
  const latMax = parseFloat(sp.get('latMax') ?? '')
  const lonMin = parseFloat(sp.get('lonMin') ?? '')
  const lonMax = parseFloat(sp.get('lonMax') ?? '')

  if ([latMin, latMax, lonMin, lonMax].some(Number.isNaN)) {
    return NextResponse.json({ error: 'bounds نامعتبر است' }, { status: 400 })
  }

  // dense grid for smooth temperature interpolation (max 25×25 = 625 points)
  const size = parseFloat(sp.get('res') ?? '25')
  const n = Math.min(Math.max(Math.round(size), 10), 25)

  try {
    const data = await fetchTempField(
      Math.min(latMin, latMax),
      Math.max(latMin, latMax),
      Math.min(lonMin, lonMax),
      Math.max(lonMin, lonMax),
      n
    )
    return NextResponse.json({
      points: data.points,
      n: data.n,
      bounds: { latMin, latMax, lonMin, lonMax },
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('tempfield error', e)
    return NextResponse.json({ error: 'خطا در دریافت میدان دما' }, { status: 502 })
  }
}
