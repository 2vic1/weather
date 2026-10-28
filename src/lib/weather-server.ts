// Server-side Open-Meteo helpers with in-memory caching
import https from 'node:https'
import type { WeatherData, AtmosphereData } from './weather-types'

const UA = 'AsmanNegar/1.0 (weather app)'

/** Base URL of the Open-Meteo forecast API — overridable for tests / self-hosted proxies */
export const OM_BASE = process.env.OPEN_METEO_BASE?.replace(/\/$/, '') || 'https://api.open-meteo.com'

/**
 * Optional deterministic mock upstream (mini-services/om-mock). Consulted when
 * the real API is unreachable or quota-dead so the whole app keeps working:
 *   OPEN_METEO_FALLBACK_BASE=http://127.0.0.1:4444
 */
const OM_FALLBACK = process.env.OPEN_METEO_FALLBACK_BASE?.replace(/\/$/, '') || ''

function fallbackUrl(url: string): string | null {
  if (!OM_FALLBACK || !url.startsWith(OM_BASE)) return null
  return OM_FALLBACK + url.slice(OM_BASE.length)
}

/** Error with upstream status + body so callers can react to 429/400 precisely */
export class UpstreamError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Upstream fetch failed: ${status}`)
    this.status = status
    this.body = body
  }
}

function statusOf(e: unknown): number {
  const s = e instanceof UpstreamError ? e.status : Number((e as { message?: string })?.message?.match(/(\d{3})/)?.[1] ?? 0)
  return Number.isFinite(s) ? s : 0
}

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
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => (body += c))
          res.on('end', () => reject(new UpstreamError(res.statusCode ?? 0, body.slice(0, 300))))
          res.resume()
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
const STALE_MS = 24 * 3600_000 // serve up to 24h-old data when upstream is unreachable / quota-exhausted

/**
 * Sandbox hosts with broken IPv6 waste up to 15 s per uncached call on the
 * doomed global fetch before the IPv4 fallback succeeds. After the first
 * network failure we skip it entirely for the process lifetime.
 */
let prefer4 = false

/**
 * Circuit breaker for the Open-Meteo daily quota: once a 429 «Daily API
 * request limit exceeded» is seen, stop hitting upstream for a while so the
 * app degrades to stale cache / synthetic fallback instead of burning calls.
 */
let upstreamDeadUntil = 0

function markUpstreamDead(status: number, body: string): void {
  if (status === 429 && /daily/i.test(body)) {
    // retry quietly every 30 min — the quota resets at UTC midnight
    upstreamDeadUntil = Date.now() + 30 * 60_000
  }
}

async function rawFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new UpstreamError(res.status, '')
  }
  return (await res.json()) as T
}

/** one transport attempt with the IPv4-preference memory */
async function upstreamGet<T>(url: string): Promise<T> {
  if (prefer4) return https4Get<T>(url)
  try {
    return await rawFetch<T>(url)
  } catch (e1) {
    if (statusOf(e1) >= 400) throw e1 // HTTP error — transport retry won't help
    prefer4 = true // network-level failure → remember, go straight to IPv4
    return https4Get<T>(url)
  }
}

const TRANSIENT = new Set([0, 429, 500, 502, 503, 504])

/**
 * Fetch ladder: fresh cache → real upstream → mock fallback → stale cache.
 * The quota breaker skips the real upstream entirely while open so a dead
 * daily quota costs ~2 detection calls per 30 min instead of every request.
 */
export async function cachedFetch<T>(key: string, url: string, ttlMs: number): Promise<T> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.ts < ttlMs) return hit.data as T

  const breakerOpen = now < upstreamDeadUntil
  if (!breakerOpen) {
    try {
      const data = await upstreamGet<T>(url)
      cache.set(key, { data, ts: now })
      pruneCache()
      return data
    } catch (e) {
      const st = statusOf(e)
      markUpstreamDead(st, e instanceof UpstreamError ? e.body : '')
      if (!TRANSIENT.has(st)) {
        // permanent client error (400/404…) — fallback won't behave differently
        if (hit && now - hit.ts < STALE_MS) return hit.data as T
        throw e
      }
    }
  }

  // quota-dead / network-dead → 24 h-old REAL data beats freshly faked demo
  // data: a weather map showing yesterday's systems is far less wrong than one
  // showing invented ones, so the stale cache is always tried before the mock.
  if (hit && now - hit.ts < STALE_MS) return hit.data as T

  // last resort: deterministic mock upstream (UI demo mode)
  // NOT cached — poisoned stale windows and delayed quota recovery are worse
  // than re-hitting the loopback mock (it memoizes its series internally)
  const fb = fallbackUrl(url)
  if (fb) {
    try {
      // mock is plain http on loopback — global fetch handles it instantly
      return await rawFetch<T>(fb).catch(() => https4Get<T>(fb))
    } catch {
      /* nothing left to try */
    }
  }
  throw new UpstreamError(breakerOpen ? 429 : 502, 'upstream unavailable and no cached data')
}

function pruneCache(): void {
  if (cache.size <= 500) return
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now - v.ts > STALE_MS) cache.delete(k)
  }
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
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,snowfall_sum',
    timezone: 'auto',
    forecast_days: '16',
    wind_speed_unit: 'kmh',
  })
  const url = `${OM_BASE}/v1/forecast?${params}`
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

  // Slice hourly: from current hour → full 16-day horizon (~384 entries)
  const nowIso = (current.time as string).slice(0, 13)
  let startIdx = hourlyRaw.time.findIndex((t) => t.slice(0, 13) === nowIso)
  if (startIdx < 0) startIdx = 0
  const endIdx = hourlyRaw.time.length
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
    // demo upstream marker → UI can badge the card as simulated data
    demo: (raw as { mock_source?: boolean }).mock_source === true,
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
    forecast_days: '16',
    wind_speed_unit: 'kmh',
  })
  const url = `${OM_BASE}/v1/forecast?${params}`
  const raw = await cachedFetch<Record<string, unknown>>(`atm:${round2(lat)},${round2(lon)}`, url, 30 * 60_000)

  const hourly = raw.hourly as Record<string, (number | null)[] | string[]>
  const time = hourly.time as string[]

  // Slice from current hour → 15-day horizon, subsampled every 3 hours (~120 steps).
  // NOTE: toLocaleString('sv-SE') yields "YYYY-MM-DD HH" (space) while Open-Meteo
  // uses "YYYY-MM-DDTHH" — normalize before comparing, else startIdx = 0 (bug).
  const nowKey = new Date()
    .toLocaleString('sv-SE', { timeZone: raw.timezone as string })
    .slice(0, 13)
    .replace(' ', 'T')
  let startIdx = time.findIndex((t) => t.slice(0, 13) === nowKey)
  if (startIdx < 0) startIdx = 0
  const STEP = 3 // hours between profile steps
  const sel: number[] = []
  for (let i = startIdx; i < time.length && sel.length < 120; i += STEP) sel.push(i)

  const sliceNum = (key: string): number[] => {
    const arr = (hourly[key] as (number | null)[] | undefined) ?? []
    const out: number[] = []
    for (const i of sel) out.push(arr[i] ?? NaN)
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
    time: sel.map((i) => time[i] ?? ''),
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
    const url = `${OM_BASE}/v1/forecast?${params}`
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
  }>(lats, lons, 'wind_speed_10m,wind_direction_10m,temperature_2m', 'wf', 30 * 60_000)

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

// ===== Dense temperature field (temp heatmap, lean ≤ 20×20 lattice) =====

export interface TempFieldResult {
  points: Array<{ lat: number; lon: number; temp: number }>
  n: number
}

export async function fetchTempField(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  n = 20
): Promise<TempFieldResult> {
  // weight = n² upstream calls → cap at 20 (400) to stay under the 600/min burst
  const nn = Math.min(Math.max(Math.round(n), 8), 20)
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < nn; i++) {
    for (let j = 0; j < nn; j++) {
      lats.push(round2(latMin + ((latMax - latMin) * i) / (nn - 1)))
      lons.push(round2(lonMin + ((lonMax - lonMin) * j) / (nn - 1)))
    }
  }

  const data = await multiPointCurrent<{ temperature_2m: number | null }>(
    lats,
    lons,
    'temperature_2m',
    'tf',
    30 * 60_000
  )

  return {
    points: data.map((d, i) => ({
      lat: lats[i],
      lon: lons[i],
      temp: d?.temperature_2m ?? NaN,
    })),
    n: nn,
  }
}

// ===== Animated forecast field (precip / temp / clouds grid × time steps) =====
// 15-day horizon, 3-hourly steps → ~120 frames, like the big weather maps.
//
// QUOTA DESIGN (Open-Meteo free tier = 10 000 calls/day, weight = #locations):
// each fetch covers a SUPER-REGION (view + 50 % margin) on a lean 20–24²
// lattice → ≤ 576 calls, cached 60 min; clients reuse it for any view inside.
// Chunked requests run 2-at-a-time with backoff; upstream failures degrade to
// stale cache and finally to an analytic synthetic field so the map keeps
// animating instead of showing holes.

export interface ForecastFieldResult {
  times: string[]
  points: Array<{
    lat: number
    lon: number
    precip: number[]
    temp: number[]
    clouds: number[]
    press: number[]
    cape: number[]
    snow: number[]
  }>
  n: number
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
  synthetic: boolean
}

/** Assembled-result cache (separate from raw URL cache) */
const ffCache = new Map<string, { data: ForecastFieldResult; ts: number }>()
const FF_TTL = 120 * 60_000 // 3-hourly steps + 6 h model runs → 2 h refresh is plenty
const FF_STALE = 8 * 60 * 60_000 // serve up to 8 h old real data when upstream is dead
const MAX_STEPS = 128
const FF_CACHE_CAP = 24

/** Snap a coordinate outward to the 0.5° lattice so nearby pans share one cache entry */
function snapOut(v: number, dir: 'floor' | 'ceil'): number {
  const f = Math.round(v * 2) / 2
  return dir === 'floor' ? (f > v ? f - 0.5 : f) : f < v ? f + 0.5 : f
}

// `temporal_resolution=hourly_3h` cuts payload 3× and matches the 3 h step;
// unknown for self-hosted proxies → remembered fallback flag.
let threeHourOK: boolean | null = null

export async function fetchForecastField(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  n = 20,
  stepHours = 3
): Promise<ForecastFieldResult> {
  // super-region: view grown by 70 % of its span on every side, snapped to 0.5°
  // (was 95 % — the giant margin diluted the grid to ~430 km/cell over Iran,
  // which visually erased rain masses; 70 % keeps pan-reuse while ~27 % finer)
  const cLat = (latMin + latMax) / 2
  const cLon = (lonMin + lonMax) / 2
  const spanLat = Math.max(Math.abs(latMax - latMin), 12)
  const spanLon = Math.max(Math.abs(lonMax - lonMin), 15)
  const bLatMin = snapOut(Math.max(-84, cLat - spanLat * 0.7), 'floor')
  const bLatMax = snapOut(Math.min(84, cLat + spanLat * 0.7), 'ceil')
  const bLonMin = snapOut(Math.max(-179, cLon - spanLon * 0.7), 'floor')
  const bLonMax = snapOut(Math.min(179, cLon + spanLon * 0.7), 'ceil')

  const ST = Math.min(Math.max(Math.round(stepHours), 1), 6)
  // weight ≤ 576 calls per fetch, always below the 600/min burst ceiling;
  // always 24² — finer cells make compact rain systems actually visible
  const nn = 24

  // key bump v2 → includes press/cape/snow series (stale v1 caches are dropped)
  const key = `ff2:${bLatMin}:${bLatMax}:${bLonMin}:${bLonMax}:${nn}:${ST}`
  const now0 = Date.now()
  const hit = ffCache.get(key)
  if (hit && now0 - hit.ts < FF_TTL) return hit.data

  const region = { latMin: bLatMin, latMax: bLatMax, lonMin: bLonMin, lonMax: bLonMax }

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
  let gotReal = false

  // first frame = current UTC hour (hourly_3h snaps forward to the next step)
  const cutoff = Math.floor(now0 / 3600_000) * 3600_000

  const fetchChunk = async (idx: number[], use3h: boolean): Promise<void> => {
    const params = new URLSearchParams({
      latitude: idx.map((i) => lats[i]).join(','),
      longitude: idx.map((i) => lons[i]).join(','),
      // pressure_msl → isobars · cape → thunderstorm energy · snowfall → snow
      hourly: 'precipitation,temperature_2m,cloud_cover,pressure_msl,cape,snowfall',
      forecast_days: '16',
      timezone: 'UTC',
    })
    if (use3h) params.set('temporal_resolution', 'hourly_3h')
    const url = `${OM_BASE}/v1/forecast?${params}`
    const raw = await cachedFetch<unknown>(
      `ffr:${use3h ? '3h' : '1h'}:${idx.map((i) => `${lats[i]},${lons[i]}`).join(';')}`,
      url,
      45 * 60_000
    )
    const arr = (Array.isArray(raw) ? raw : [raw]) as Array<{
      mock_source?: boolean
      hourly?: {
        time?: string[]
        precipitation?: (number | null)[]
        temperature_2m?: (number | null)[]
        cloud_cover?: (number | null)[]
        pressure_msl?: (number | null)[]
        cape?: (number | null)[]
        snowfall?: (number | null)[]
      }
    }>
    for (let k = 0; k < idx.length; k++) {
      // demo upstream (quota-dead, no cache): count as missing so the field
      // honestly degrades to synthetic mode instead of faking "real" weather
      if (arr[k]?.mock_source) continue
      const h = arr[k]?.hourly
      if (!h?.time || h.time.length === 0) continue
      const t = h.time
      const val = (a: (number | null)[] | undefined, i: number) => (a && a[i] != null ? a[i] : NaN) as number

      // slice from the current hour (or next available step), every ST-th hour
      let start = t.findIndex((x) => Date.parse(`${x}Z`) >= cutoff)
      if (start < 0) start = 0
      const sel: number[] = []
      for (let i = start; i < t.length && sel.length < MAX_STEPS; i += ST) sel.push(i)
      if (sel.length === 0) continue

      const sub = (a: (number | null)[] | undefined, round: (v: number) => number) =>
        sel.map((i) => round(val(a, i)))

      const pArr = sub(h.precipitation, (v) => Math.round(v * 100) / 100)
      const tArr = sub(h.temperature_2m, (v) => Math.round(v * 10) / 10)
      const sArr = sub(h.snowfall, (v) => Math.round(v * 100) / 100)
      // physical guard: snow requires precipitation AND sub-freezing air;
      // some upstream runs emit absurd cm/h spikes with no precipitation
      for (let i = 0; i < sArr.length; i++) {
        const tt = tArr[i]
        const pp = pArr[i]
        if (!Number.isFinite(tt) || tt > 2.5 || !Number.isFinite(pp) || pp <= 0.02) sArr[i] = 0
        else if (sArr[i] > 3) sArr[i] = 3
      }

      points[idx[k]] = {
        lat: lats[idx[k]],
        lon: lons[idx[k]],
        precip: pArr,
        temp: tArr,
        clouds: sub(h.cloud_cover, (v) => Math.round(v)),
        press: sub(h.pressure_msl, (v) => Math.round(v)),
        cape: sub(h.cape, (v) => Math.round(v)),
        snow: sArr,
      }
      if (!times.length) times = sel.map((i) => t[i])
    }
  }

  // chunk runner: 2 concurrent workers, ≤3 attempts each (400 on the 3 h param
  // is retried once without it; 429/network back off 1.4 s, 4.2 s)
  const chunkSize = 100
  const chunks: number[][] = []
  for (let i = 0; i < N; i += chunkSize) {
    chunks.push(Array.from({ length: Math.min(chunkSize, N - i) }, (_, k) => i + k))
  }
  const runChunk = async (idx: number[]): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fetchChunk(idx, threeHourOK !== false)
        return
      } catch (e) {
        const st = statusOf(e)
        if (st === 400 && threeHourOK !== false) {
          threeHourOK = false // upstream rejected the 3 h resolution — plain hourly then
          continue
        }
        if (attempt === 2) return
        await new Promise((r) => setTimeout(r, 1400 * (attempt + 1)))
      }
    }
  }
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(2, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const c = chunks[cursor++]
        await runChunk(c)
      }
    })
  )

  for (let i = 0; i < N; i++) if (points[i]) gotReal = true

  // fill any missing points with NaN series so grid stays aligned
  const nan = times.map(() => NaN)
  for (let i = 0; i < N; i++) {
    if (!points[i]) {
      points[i] = {
        lat: lats[i],
        lon: lons[i],
        precip: [...nan],
        temp: [...nan],
        clouds: [...nan],
        press: [...nan],
        cape: [...nan],
        snow: [...nan],
      }
    }
  }

  // degrade gracefully: stale real data → analytic synthetic field
  let data: ForecastFieldResult
  if (gotReal && times.length > 0) {
    data = { times, points, n: nn, bounds: region, synthetic: false }
  } else if (hit && now0 - hit.ts < FF_STALE) {
    return hit.data
  } else {
    data = buildSyntheticField(lats, lons, ST, nn, region)
  }

  // synthetic entries expire after ~5 min instead of the full FF_TTL —
  // back-dating the timestamp makes the plain FF_TTL read check evict them
  // early, so real data takes over within minutes of the quota resetting
  ffCache.set(key, { data, ts: Date.now() - (data.synthetic ? FF_TTL - 5 * 60_000 : 0) })
  if (ffCache.size > FF_CACHE_CAP) {
    const now = Date.now()
    for (const [k, v] of ffCache) if (now - v.ts > FF_TTL) ffCache.delete(k)
  }
  return data
}

// ===== Synthetic fallback field (quota-dead / upstream-dead demo mode) =====
// Analytic, deterministic moving systems — Mediterranean cyclone drifting east
// over Anatolia → Iran, an Arabian Sea system pushing north-east, plus diurnal
// convective showers over the plateau. A function of (lat, lon, t) so every
// region/pan shows a consistent, physically plausible animation.

function buildSyntheticField(
  lats: number[],
  lons: number[],
  ST: number,
  nn: number,
  region: ForecastFieldResult['bounds']
): ForecastFieldResult {
  const startMs = Math.floor(Date.now() / (ST * 3600_000)) * ST * 3600_000
  const steps = Math.min(MAX_STEPS, 121)
  const times: string[] = []
  for (let s = 0; s < steps; s++) {
    times.push(new Date(startMs + s * ST * 3600_000).toISOString().slice(0, 13) + ':00')
  }

  const points = lats.map((lat, idx) => {
    const lon = lons[idx]
    const precip: number[] = []
    const temp: number[] = []
    const clouds: number[] = []
    const press: number[] = []
    const cape: number[] = []
    const snow: number[] = []
    for (let s = 0; s < steps; s++) {
      const hUTC = (s * ST) / 24 // days since start
      const hrs = s * ST
      // System A — Mediterranean low sweeping east onto Iran (compact core)
      const aLat = 33.5 + 0.55 * hUTC
      const aLon = 26 + 2.35 * hUTC
      const gA = Math.exp(-(((lat - aLat) / 2.3) ** 2 + ((lon - aLon) / 3.4) ** 2))
      const pA = 9 * Math.max(0, Math.sin((Math.PI * hUTC) / 13)) * (0.55 + 0.45 * Math.sin((2 * Math.PI * hrs) / 30 + 1.1))
      // System B — Arabian Sea system pushing north-east (compact core)
      const bLat = 12 + 0.75 * hUTC
      const bLon = 57 + 0.5 * hUTC
      const gB = Math.exp(-(((lat - bLat) / 2.2) ** 2 + ((lon - bLon) / 2.8) ** 2))
      const pB = 13 * Math.max(0, Math.sin((Math.PI * hUTC) / 9 + 0.5)) * (0.6 + 0.4 * Math.sin((2 * Math.PI * hrs) / 26))
      // Diurnal convection — sparse isolated afternoon cells, NOT a blanket.
      // A fixed pseudo-random hotspot gate (~6 % of the domain) decides WHERE
      // showers can ever form; a slow wobble then pulses their intensity, so at
      // any step only a handful of compact cells are wet while the plateau
      // stays clean. (The old always-on term painted 70 % of Iran light blue.)
      const convAmp = 1.1 * Math.exp(-(((lat - 30) / 8) ** 2))
      const hLocal = (13 + (hrs % 24) + 24) % 24
      const hot = Math.sin(lon * 12.9898 + lat * 78.233 + 41.7)
      const wobble = 0.55 + 0.45 * Math.sin(lon * 12.9898 + lat * 78.233 + s * 6.13)
      const conv =
        hot > 0.995
          ? convAmp * Math.max(0, Math.sin((Math.PI * hLocal) / 12 - Math.PI / 6)) ** 2 * 2.2 * wobble
          : 0

      let p = gA * pA + gB * pB + conv
      p = Math.max(0, Math.round(Math.min(p, 80) * 100) / 100)

      const cl = Math.min(
        100,
        Math.round(92 * Math.min(1, (gA * pA) / 6) + 92 * Math.min(1, (gB * pB) / 6) + 34 * (conv / 1.1) + 10 * (0.5 + 0.5 * Math.sin(lon / 9 + lat / 7 + hUTC)))
      )
      const hDay = (hrs + 3.5) % 24 // Iran-ish local hour
      const t =
        33.5 -
        0.62 * lat +
        5.5 * Math.sin((2 * Math.PI * (hDay - 14.5)) / 24) * (1 - 0.55 * (cl / 100)) -
        2.2 * Math.min(p, 5) / 5

      precip.push(p)
      clouds.push(cl)
      temp.push(Math.round(t * 10) / 10)
      // MSL pressure: wandering highs/lows tied to the two synthetic systems
      const pr =
        1014 -
        10 * Math.min(1, (gA * pA) / 7) -
        8 * Math.min(1, (gB * pB) / 9) +
        5 * Math.sin(lon / 11 + lat / 8 + hUTC * 1.7)
      press.push(Math.round(pr))
      // CAPE: convection-driven thunderstorm energy
      cape.push(Math.round(1500 * Math.min(1, conv / 1.1) + 350 * Math.min(1, (gA * pA) / 8)))
      // snowfall: precip falling in sub-freezing air
      snow.push(t <= 1.5 ? Math.round(p * 0.85 * 100) / 100 : 0)
    }
    return { lat, lon, precip, temp, clouds, press, cape, snow }
  })

  return { times, points, n: nn, bounds: region, synthetic: true }
}
