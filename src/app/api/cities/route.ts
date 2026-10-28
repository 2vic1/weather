import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  try {
    if (req.nextUrl.searchParams.get('all') === '1') {
      const cities = await db.city.findMany({
        orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
      })
      return NextResponse.json({ cities })
    }

    if (!q) {
      const cities = await db.city.findMany({
        orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
        take: 60,
      })
      return NextResponse.json({ cities })
    }

    const cities = await db.city.findMany({
      where: {
        OR: [{ name: { contains: q } }, { province: { contains: q } }],
      },
      orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
      take: 20,
    })
    return NextResponse.json({ cities })
  } catch (e) {
    console.error('cities search error', e)
    return NextResponse.json({ cities: [], error: 'خطا در جستجو' }, { status: 500 })
  }
}
