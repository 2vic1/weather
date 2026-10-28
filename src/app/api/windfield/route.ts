import { NextRequest, NextResponse } from 'next/server'
import { fetchWindField } from '@/lib/weather-server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const latMin = parseFloat(sp.get('latMin') ?? '')
  const latMax = parseFloat(sp.get('latMax') ?? '')
  const lonMin = parseFloat(sp.get('lonMin') ?? '')
  const lonMax = parseFloat(sp.get('lonMax') ?? '')

  if ([latMin, latMax, lonMin, lonMax].some(Number.isNaN)) {
    return NextResponse.json({ error: 'bounds نامعتبر است' }, { status: 400 })
  }

  const size = parseFloat(sp.get('res') ?? '9')
  const n = Math.min(Math.max(Math.round(size), 5), 13)

  try {
    const data = await fetchWindField(
      Math.min(latMin, latMax),
      Math.max(latMin, latMax),
      Math.min(lonMin, lonMax),
      Math.max(lonMin, lonMax),
      n
    )
    return NextResponse.json({
      points: data.points,
      bounds: { latMin, latMax, lonMin, lonMax },
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('windfield error', e)
    return NextResponse.json({ error: 'خطا در دریافت میدان باد' }, { status: 502 })
  }
}
