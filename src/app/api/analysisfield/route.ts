import { NextResponse } from 'next/server'
import { cachedFetch } from '@/lib/weather-server'
import { ANALYSIS_CITIES } from '@/lib/analysis-cities'
import type { AnalysisFieldData, AQPoint, CapePoint } from '@/lib/weather-types'

/**
 * Analysis dots for the map: air quality (PM2.5/PM10/dust from CAMS via
 * Open-Meteo Air Quality) + current CAPE (instability) for ~40 key cities.
 * Two upstream calls in parallel, cached for 15 minutes.
 */

interface AQRaw {
  hourly?: { time?: string[]; pm2_5?: (number | null)[]; pm10?: (number | null)[]; dust?: (number | null)[] }
}

interface CapeRaw {
  current?: { time?: string; cape?: number | null }
}

const n0 = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : NaN

export async function GET() {
  try {
    const lats = ANALYSIS_CITIES.map((c) => c.lat).join(',')
    const lons = ANALYSIS_CITIES.map((c) => c.lon).join(',')

    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&hourly=pm2_5,pm10,dust&timezone=GMT&forecast_days=1&domains=cams_global`
    const capeUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=cape&timezone=GMT`

    const [aqRaw, capeRaw] = await Promise.all([
      cachedFetch<unknown>('analysis:aq', aqUrl, 15 * 60_000),
      cachedFetch<unknown>('analysis:cape', capeUrl, 15 * 60_000),
    ])

    // ---- AQ: pick the current UTC hour from the hourly arrays ----
    const aqArr = (Array.isArray(aqRaw) ? aqRaw : [aqRaw]) as AQRaw[]
    const nowHour = new Date().toISOString().slice(0, 13) // "2026-10-28T16"
    const aqTime = aqArr[0]?.hourly?.time?.[0]?.slice(0, 13) === nowHour ? nowHour : ''
    const aqPoints: AQPoint[] = ANALYSIS_CITIES.map((c, i) => {
      const h = aqArr[i]?.hourly
      let idx = h?.time?.findIndex((t) => t.slice(0, 13) === nowHour) ?? -1
      if (idx < 0) idx = Math.max((h?.time?.length ?? 0) - 1, 0)
      return {
        name: c.name,
        province: c.province,
        lat: c.lat,
        lon: c.lon,
        pm25: n0(h?.pm2_5?.[idx]),
        pm10: n0(h?.pm10?.[idx]),
        dust: n0(h?.dust?.[idx]),
        hot: !!c.hot,
      }
    })

    // ---- CAPE: current value per point ----
    const capeArr = (Array.isArray(capeRaw) ? capeRaw : [capeRaw]) as CapeRaw[]
    const capePoints: CapePoint[] = ANALYSIS_CITIES.map((c, i) => ({
      name: c.name,
      province: c.province,
      lat: c.lat,
      lon: c.lon,
      cape: n0(capeArr[i]?.current?.cape),
      hot: !!c.hot,
    }))

    const data: AnalysisFieldData = {
      aq: { time: aqTime, points: aqPoints },
      cape: { time: capeArr[0]?.current?.time ?? '', points: capePoints },
      fetchedAt: new Date().toISOString(),
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('analysisfield error', e)
    return NextResponse.json({ error: 'خطا در دریافت داده‌های تحلیلی' }, { status: 502 })
  }
}
