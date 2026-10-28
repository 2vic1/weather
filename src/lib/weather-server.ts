// Server-side Open-Meteo helpers with in-memory caching
import https from 'node:https'
import type { WeatherData, AtmosphereData } from './weather-types'

const UA = 'AsmanNegar/1.0 (weather app)'

/**
 * IPv4-forced HTTPS GET with JSON parsing.
 * Fallback for sandboxed hosts where the undici global fetch tries a broken
 * IPv6 route first and fails (ETIMEDOUT/ENETUNREACH) even though IPv4 works.
 */
function https4Get<T>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.get(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        family: 4,
        timeout: timeoutMs,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume()
          reject(new Error(`Upstream fetch failed: ${res.statusCode ?? '?'}`))
          return
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T)
          } catch (e) {
            reject(e as Error)
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('upstream timeout')))
  })
}

const cache = new Map<string, { data: unknown; ts: number }>()

async function rawFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Upstream fetch failed: ${res.status}`)
  }
  return (await res.json()) as T
}

export async function cachedFetch<T>(key: string, url: string, ttlMs: number): Promise<T> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.ts < ttlMs) return hit.data as T

  let data: T
  try {
    data = await rawFetch<T>(url)
  } catch {
    // global fetch failed → IPv4-forced fallback, then one retry after a beat
    try {
      data = await https4Get<T>(url)
    } catch {
      await new Promise((r) => setTimeout(r, 900))
      data = await https4Get<T>(url)
    }
  }
  cache.set(key, { data, ts: now })
  // prune old entries
  if (cache.size > 500) {
    for (const [k, v] of cache) {
      if (now - v.ts > 3600_000) cache.delete(k)
    }
  }
  return data
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ===== Full weather =====

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly:
      'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  })
  const url = `https://api.open-meteo.com/v1/forecast?${params}`
  const raw = await cachedFetch<Record<string, unknown>>(`wx:${round2(lat)},${round2(lon)}`, url, 10 * 60_000)

  const current = raw.current as WeatherData['current']
  const hourlyRaw = raw.hourly as {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    precipitation: number[]
    weather_code: number[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    relative_humidity_2m: number[]
  }
  const daily = raw.daily as WeatherData['daily']

  // Slice hourly: from current hour, next 48h
  const nowIso = (current.time as string).slice(0, 13)
  let startIdx = hourlyRaw.time.findIndex((t) => t.slice(0, 13) === nowIso)
  if (startIdx < 0) startIdx = 0
  const endIdx = Math.min(startIdx + 48, hourlyRaw.time.length)
  const slice = <T,>(arr: T[]): T[] => arr.slice(startIdx, endIdx)

  const hourly: HourlySliceType = {
    time: slice(hourlyRaw.time),
    temperature_2m: slice(hourlyRaw.temperature_2m),
    precipitation_probability: slice(hourlyRaw.precipitation_probability),
    precipitation: slice(hourlyRaw.precipitation),
    weather_code: slice(hourlyRaw.weather_code),
    wind_speed_10m: slice(hourlyRaw.wind_speed_10m),
    wind_direction_10m: slice(hourlyRaw.wind_direction_10m),
    relative_humidity_2m: slice(hourlyRaw.relative_humidity_2m),
  }

  return {
    latitude: raw.latitude as number,
    longitude: raw.longitude as number,
    elevation: raw.elevation as number,
    timezone: raw.timezone as string,
    current,
    hourly,
    daily,
    fetchedAt: new Date().toISOString(),
    sources: [
      'Open-Meteo (ECMWF IFS, GFS, ICON)',
      'رادارهای هواشناسی — RainViewer',
      'ماهواره METEOSAT / GOES — EUMETSAT/NOAA',
    ],
  }
}

type HourlySliceType = WeatherData['hourly']

// ===== Atmosphere / pressure levels =====

const LEVELS = [1000, 925, 850, 700, 500, 300, 200]

function magnusDewpoint(tC: number, rh: number): number {
  const rhMin = Math.max(rh, 1)
  const a = 17.625
  const b = 243.04
  const alpha = Math.log(rhMin / 100) + (a * tC) / (b + tC)
  return (b * alpha) / (a - alpha)
}

export async function fetchAtmosphere(lat: number, lon: number): Promise<AtmosphereData> {
  const vars = ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height']
  const levelVars: string[] = []
  for (const v of vars) for (const lv of LEVELS) levelVars.push(`${v}_${lv}hPa`)
  const surfaceVars = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'surface_pressure']
  const stability = ['cape', 'lifted_index']

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [...levelVars, ...surfaceVars, ...stability].join(','),
    timezone: 'auto',
    forecast_days: '3',
    wind_speed_unit: 'kmh',
  })
  const url = `https://api.open-meteo.com/v1/forecast?${params}`
  const raw = await cachedFetch<Record<string, unknown>>(`atm:${round2(lat)},${round2(lon)}`, url, 15 * 60_000)

  const hourly = raw.hourly as Record<string, (number | null)[] | string[]>
  const time = hourly.time as string[]

  // Slice from current hour → next 6 hours (7 entries)
  const nowKey = new Date().toLocaleString('sv-SE', { timeZone: raw.timezone as string }).slice(0, 13)
  let startIdx = time.findIndex((t) => t.slice(0, 13) === nowKey)
  if (startIdx < 0) startIdx = 0
  const endIdx = Math.min(startIdx + 7, time.length)
  const n = endIdx - startIdx

  const sliceNum = (key: string): number[] => {
    const arr = (hourly[key] as (number | null)[] | undefined) ?? []
    const out: number[] = []
    for (let i = startIdx; i < endIdx; i++) out.push(arr[i] ?? NaN)
    return out
  }

  const levels = LEVELS.map((level) => ({
    level,
    temperature: sliceNum(`temperature_${level}hPa`),
    relativeHumidity: sliceNum(`relative_humidity_${level}hPa`),
    windSpeed: sliceNum(`wind_speed_${level}hPa`),
    windDirection: sliceNum(`wind_direction_${level}hPa`),
    geopotentialHeight: sliceNum(`geopotential_height_${level}hPa`),
    dewpoint: sliceNum(`temperature_${level}hPa`).map((t, i) =>
      magnusDewpoint(t, sliceNum(`relative_humidity_${level}hPa`)[i] ?? 50)
    ),
  }))

  return {
    time: time.slice(startIdx, endIdx),
    levels,
    cape: sliceNum('cape'),
    liftedIndex: sliceNum('lifted_index'),
    surface: {
      temperature: sliceNum('temperature_2m'),
      relativeHumidity: sliceNum('relative_humidity_2m'),
      windSpeed: sliceNum('wind_speed_10m'),
      windDirection: sliceNum('wind_direction_10m'),
      pressure: sliceNum('surface_pressure'),
    },
  }
}

// ===== Wind + temperature field (for map particle overlay) =====

export interface WindFieldResult {
  points: Array<{ lat: number; lon: number; speed: number; dir: number; temp: number }>
}

/** Fetch `current` variables for many coordinates in chunks, with per-point retry for missing values */
async function multiPointCurrent<T>(
  lats: number[],
  lons: number[],
  vars: string,
  cachePrefix: string,
  ttlMs: number
): Promise<Array<T | null>> {
  const N = lats.length
  const results: Array<T | null> = new Array(N).fill(null)

  const chunkSize = 50
  const chunks: number[][] = []
  for (let i = 0; i < N; i += chunkSize) chunks.push(Array.from({ length: Math.min(chunkSize, N - i) }, (_, k) => i + k))

  const fetchChunk = async (idx: number[]): Promise<void> => {
    const params = new URLSearchParams({
      latitude: idx.map((i) => lats[i]).join(','),
      longitude: idx.map((i) => lons[i]).join(','),
      current: vars,
      wind_speed_unit: 'kmh',
      timezone: 'GMT',
    })
    const url = `https://api.open-meteo.com/v1/forecast?${params}`
    const data = await cachedFetch<{ current?: Record<string, number | null> } | { current?: Record<string, number | null> }[]>(
      `${cachePrefix}:${idx.map((i) => `${lats[i]},${lons[i]}`).join(';')}`,
      url,
      ttlMs
    )
    const arr = Array.isArray(data) ? data : [data]
    for (let k = 0; k < idx.length; k++) {
      const el = arr[k]
      // store the unwrapped `current` object so callers read flat variables
      if (el && el.current) results[idx[k]] = el.current as T
    }
  }

  // first pass (parallel chunks)
  await Promise.all(chunks.map((c) => fetchChunk(c).catch(() => {})))

  // retry pass for missing points, in small batches
  const missing = results.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0)
  if (missing.length > 0) {
    const retryChunks: number[][] = []
    for (let i = 0; i < missing.length; i += 10) retryChunks.push(missing.slice(i, i + 10))
    await Promise.all(
      retryChunks.map((c) => fetchChunk(c).catch(() => {}))
    )
  }

  return results
}

export async function fetchWindField(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  n = 9
): Promise<WindFieldResult> {
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      lats.push(round2(latMin + ((latMax - latMin) * i) / (n - 1)))
      lons.push(round2(lonMin + ((lonMax - lonMin) * j) / (n - 1)))
    }
  }

  const data = await multiPointCurrent<{
    wind_speed_10m: number | null
    wind_direction_10m: number | null
    temperature_2m: number | null
  }>(lats, lons, 'wind_speed_10m,wind_direction_10m,temperature_2m', 'wf', 20 * 60_000)

  return {
    points: data.map((d, i) => ({
      lat: lats[i],
      lon: lons[i],
      speed: d?.wind_speed_10m ?? NaN,
      dir: d?.wind_direction_10m ?? NaN,
      temp: d?.temperature_2m ?? NaN,
    })),
  }
}

// ===== Dense temperature field (temp heatmap, res up to 25×25) =====

export interface TempFieldResult {
  points: Array<{ lat: number; lon: number; temp: number }>
  n: number
}

export async function fetchTempField(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  n = 25
): Promise<TempFieldResult> {
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      lats.push(round2(latMin + ((latMax - latMin) * i) / (n - 1)))
      lons.push(round2(lonMin + ((lonMax - lonMin) * j) / (n - 1)))
    }
  }

  const data = await multiPointCurrent<{ temperature_2m: number | null }>(
    lats,
    lons,
    'temperature_2m',
    'tf',
    15 * 60_000
  )

  return {
    points: data.map((d, i) => ({
      lat: lats[i],
      lon: lons[i],
      temp: d?.temperature_2m ?? NaN,
    })),
    n,
  }
}

// ===== Animated forecast field (precip / temp / clouds grid × time steps) =====
// 15-day horizon, 3-hourly steps → ~120 frames, like the big weather maps.

export interface ForecastFieldResult {
  times: string[]
  points: Array<{ lat: number; lon: number; precip: number[]; temp: number[]; clouds: number[] }>
  n: number
}

/** Assembled-result cache (separate from raw URL cache) */
const ffCache = new Map<string, { data: ForecastFieldResult; ts: number }>()
const FF_TTL = 30 * 60_000
const MAX_STEPS = 128

/** Snap a coordinate outward to the 0.5° lattice so nearby pans share one cache entry */
function snapOut(v: number, dir: 'floor' | 'ceil'): number {
  const f = Math.round(v * 2) / 2
  return dir === 'floor' ? (f > v ? f - 0.5 : f) : f < v ? f + 0.5 : f
}

export async function fetchForecastField(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  n = 22,
  stepHours = 3
): Promise<ForecastFieldResult> {
  // snap bounds outward to 0.5° → stable cache keys while panning
  const bLatMin = snapOut(latMin, 'floor')
  const bLatMax = snapOut(latMax, 'ceil')
  const bLonMin = snapOut(lonMin, 'floor')
  const bLonMax = snapOut(lonMax, 'ceil')

  const nn = Math.min(Math.max(Math.round(n), 8), 24)
  const ST = Math.min(Math.max(Math.round(stepHours), 1), 6)

  const key = `ff:${bLatMin}:${bLatMax}:${bLonMin}:${bLonMax}:${nn}:${ST}`
  const hit = ffCache.get(key)
  if (hit && Date.now() - hit.ts < FF_TTL) return hit.data

  // build lat/lon lattice (row-major: i = lat from south → north, j = lon west → east)
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < nn; i++) {
    for (let j = 0; j < nn; j++) {
      lats.push(round2(bLatMin + ((bLatMax - bLatMin) * i) / (nn - 1)))
      lons.push(round2(bLonMin + ((bLonMax - bLonMin) * j) / (nn - 1)))
    }
  }

  const N = lats.length
  const points: ForecastFieldResult['points'] = new Array(N)
  let times: string[] = []

  const chunkSize = 40 // keep URLs short
  const chunks: number[][] = []
  for (let i = 0; i < N; i += chunkSize) {
    chunks.push(Array.from({ length: Math.min(chunkSize, N - i) }, (_, k) => i + k))
  }

  // hourly arrays start today 00:00 UTC (forecast_days=16) → first frame = current hour
  const nowKey = new Date().toISOString().slice(0, 13) // "2025-11-14T09"

  const fetchChunk = async (idx: number[]): Promise<void> => {
    const params = new URLSearchParams({
      latitude: idx.map((i) => lats[i]).join(','),
      longitude: idx.map((i) => lons[i]).join(','),
      hourly: 'precipitation,temperature_2m,cloud_cover',
      forecast_days: '16',
      timezone: 'UTC',
    })
    const url = `https://api.open-meteo.com/v1/forecast?${params}`
    const raw = await cachedFetch<unknown>(`ffr:${idx.map((i) => `${lats[i]},${lons[i]}`).join(';')}`, url, 45 * 60_000)
    const arr = (Array.isArray(raw) ? raw : [raw]) as Array<{
      hourly?: { time?: string[]; precipitation?: (number | null)[]; temperature_2m?: (number | null)[]; cloud_cover?: (number | null)[] }
    }>
    for (let k = 0; k < idx.length; k++) {
      const h = arr[k]?.hourly
      if (!h?.time || h.time.length === 0) continue
      const t = h.time
      const val = (a: (number | null)[] | undefined, i: number) => (a && a[i] != null ? a[i] : NaN) as number

      // slice from the current UTC hour, keep every ST-th hour → ~120 steps over 15 days
      let start = t.findIndex((x) => x.slice(0, 13) === nowKey)
      if (start < 0) start = 0
      const sel: number[] = []
      for (let i = start; i < t.length && sel.length < MAX_STEPS; i += ST) sel.push(i)

      const sub = (a: (number | null)[] | undefined, round: (v: number) => number) =>
        sel.map((i) => round(val(a, i)))

      points[idx[k]] = {
        lat: lats[idx[k]],
        lon: lons[idx[k]],
        precip: sub(h.precipitation, (v) => Math.round(v * 100) / 100),
        temp: sub(h.temperature_2m, (v) => Math.round(v * 10) / 10),
        clouds: sub(h.cloud_cover, (v) => Math.round(v)),
      }
      if (sel.length > times.length) times = sel.map((i) => t[i])
    }
  }

  await Promise.all(chunks.map((c) => fetchChunk(c).catch(() => {})))

  // fill any missing points with NaN series so grid stays aligned
  const nan = times.map(() => NaN)
  for (let i = 0; i < N; i++) {
    if (!points[i]) {
      points[i] = { lat: lats[i], lon: lons[i], precip: [...nan], temp: [...nan], clouds: [...nan] }
    }
  }

  const data: ForecastFieldResult = { times, points, n: nn }
  ffCache.set(key, { data, ts: Date.now() })
  if (ffCache.size > 40) {
    const now = Date.now()
    for (const [k, v] of ffCache) if (now - v.ts > FF_TTL) ffCache.delete(k)
  }
  return data
}
