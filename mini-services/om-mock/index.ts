// Open-Meteo mock server — deterministic 16-day forecast data for UI testing
// without burning the real API quota. Enable by starting the app with:
//   OPEN_METEO_BASE=http://127.0.0.1:4444 bun run dev
// Port: 4444 (independent mini service)

const PORT = 4444
const DAYS = 16

/* ---------- helpers ---------- */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** local ISO stamp "YYYY-MM-DDTHH:00" for an epoch ms in the given tz */
function localStamp(ms: number, tz: string): string {
  const d = new Date(ms)
  const parts = d.toLocaleString('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  // "2026-10-28, 23" → normalize
  const m = parts.match(/^(\d{4}-\d{2}-\d{2}),?\s*(\d{2})$/)
  if (!m) return parts
  return `${m[1]}T${m[2]}:00`
}

/** deterministic pseudo-random in [0,1) from an integer seed */
function prand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function wsBase(i: number): number {
  return 9 + 7 * Math.abs(Math.sin(i / 17 + 0.4)) + 3 * prand(i * 3)
}
function cloudBase(i: number): number {
  return Math.min(100, Math.max(2, 34 + 30 * Math.sin(i / 29 + 1)))
}

const GH: Record<number, number> = {
  1000: 110,
  925: 760,
  850: 1500,
  700: 3130,
  500: 5810,
  300: 9180,
  200: 11840,
}
const LEVELS = [1000, 925, 850, 700, 500, 300, 200]

interface Series {
  time: string[]
  vals: Record<string, (number | null)[]>
}

/** build one 16-day hourly series (local stamps for the given tz) */
function buildSeries(startMs: number, tz: string, lat: number, lon: number): Series {
  const N = 24 * DAYS
  const time: string[] = []
  const vals: Record<string, (number | null)[]> = {}
  const push = (k: string) => {
    vals[k] = []
    return vals[k]
  }
  const temp = push('temperature_2m')
  const rh = push('relative_humidity_2m')
  const app = push('apparent_temperature')
  const precip = push('precipitation')
  const pop = push('precipitation_probability')
  const code = push('weather_code')
  const cloud = push('cloud_cover')
  const ws = push('wind_speed_10m')
  const wd = push('wind_direction_10m')
  const gust = push('wind_gusts_10m')
  const cape = push('cape')
  const li = push('lifted_index')
  const sp = push('surface_pressure')
  const pmsl = push('pressure_msl')
  const isDay = push('is_day')

  const lv: Record<number, Record<string, (number | null)[]>> = {}
  for (const L of LEVELS) {
    lv[L] = {
      temperature: push(`temperature_${L}hPa`),
      relative_humidity: push(`relative_humidity_${L}hPa`),
      wind_speed: push(`wind_speed_${L}hPa`),
      wind_direction: push(`wind_direction_${L}hPa`),
      geopotential_height: push(`geopotential_height_${L}hPa`),
    }
  }

  const latPhase = (lat - 35) * 0.6 + (lon - 51) * 0.15

  for (let i = 0; i < N; i++) {
    const ms = startMs + i * 3600_000
    time.push(localStamp(ms, tz))
    const hourLocal = Number(time[i].slice(11, 13))
    const day = Math.floor(i / 24)

    // two rain events: day 2–3 afternoon/evening, day 8–9 — plus scattered showers
    const event1 = day >= 2 && day <= 3 && hourLocal >= 13 && hourLocal <= 23
    const event2 = day >= 8 && day <= 9 && hourLocal >= 15 && hourLocal <= 23
    const scattered =
      prand(i * 3 + day * 97 + Math.round(latPhase * 10)) > 0.965 ? 0.4 + prand(i) * 1.2 : 0
    let mm = 0
    if (event1) mm = 0.8 + 3.5 * Math.sin(((hourLocal - 13) / 11) * Math.PI) + prand(i * 7) * 2
    if (event2) mm = 1.5 + 5 * Math.sin(((hourLocal - 15) / 9) * Math.PI) + prand(i * 5) * 3
    mm += scattered
    precip.push(Math.round(mm * 100) / 100)

    const diurnal = Math.sin(((hourLocal - 14) / 24) * 2 * Math.PI)
    const t = 16 + 8 * diurnal - (mm > 0.3 ? 3 : 0) - day * 0.15 + latPhase
    temp.push(Math.round(t * 10) / 10)
    app.push(Math.round((t - 1.5 - wsBase(i) * 0.12) * 10) / 10)

    const humidity = Math.min(98, Math.max(12, 52 - 26 * diurnal + mm * 4 + 8 * Math.sin(i / 37)))
    rh.push(Math.round(humidity))

    pop.push(Math.round(Math.min(96, mm > 0.05 ? 45 + mm * 11 : 4 + prand(i * 11) * 14)))
    cloud.push(Math.round(Math.min(100, Math.max(2, cloudBase(i) + mm * 9))))
    code.push(
      mm > 7 ? 65 : mm > 3 ? 63 : mm > 0.25 ? 61 : cloudBase(i) > 78 ? 3 : cloudBase(i) > 45 ? 2 : 0
    )

    ws.push(Math.round(wsBase(i)))
    wd.push(Math.round((232 + 42 * Math.sin(i / 23 + latPhase) + 360) % 360))
    gust.push(Math.round(wsBase(i) * 1.55 + 4))

    const capeV =
      Math.max(0, Math.sin((i - 52) / 17) ** 2) * (event1 || event2 ? 2600 : 900) +
      160 +
      prand(i * 13) * 220
    cape.push(Math.round(capeV))
    li.push(Math.round((-capeV / 850) * 10) / 10)

    sp.push(Math.round(878 + 6 * Math.sin(i / 19)))
    pmsl.push(Math.round(1016 + 9 * Math.sin(i / 15 + 2)))
    isDay.push(hourLocal >= 7 && hourLocal <= 17 ? 1 : 0)

    for (const L of LEVELS) {
      const lapseKm = (1000 - L) * 0.0068
      lv[L].temperature.push(Math.round((t - lapseKm - 1.2 * Math.sin(i / 21)) * 10) / 10)
      lv[L].relative_humidity.push(
        Math.round(Math.min(99, Math.max(4, humidity + (L <= 700 ? 14 : -8) + 6 * Math.sin(i / 33))))
      )
      lv[L].wind_speed.push(
        Math.round(Math.min(180, wsBase(i) + (1000 - L) * 0.11 + 5 * Math.sin(i / 13)))
      )
      lv[L].wind_direction.push(Math.round((250 + 30 * Math.sin(i / 17) + 360) % 360))
      lv[L].geopotential_height.push(GH[L] + Math.round(18 * Math.sin(i / 25 + L / 400)))
    }
  }

  return { time, vals }
}

/** daily aggregates derived from the hourly series */
function buildDaily(s: Series, startMs: number, tz: string) {
  const time: string[] = []
  const weather_code: number[] = []
  const tmax: number[] = []
  const tmin: number[] = []
  const sunrise: string[] = []
  const sunset: string[] = []
  const psum: number[] = []
  const pmax: number[] = []
  const wmax: number[] = []
  const uv: number[] = []
  for (let d = 0; d < DAYS; d++) {
    const ms = startMs + d * 86400_000
    const dateKey = localStamp(ms, tz).slice(0, 10)
    time.push(dateKey)
    const slice = s.vals.temperature_2m.slice(d * 24, d * 24 + 24).filter((v) => v != null) as number[]
    const mx = Math.max(...slice)
    const mn = Math.min(...slice)
    tmax.push(Math.round(mx * 10) / 10)
    tmin.push(Math.round(mn * 10) / 10)
    const mmSum = (s.vals.precipitation.slice(d * 24, d * 24 + 24) as (number | null)[]).reduce(
      (a, b) => a + (b ?? 0),
      0
    )
    psum.push(Math.round(mmSum * 100) / 100)
    pmax.push(Math.max(...(s.vals.precipitation_probability.slice(d * 24, d * 24 + 24) as number[])))
    wmax.push(Math.max(...(s.vals.wind_speed_10m.slice(d * 24, d * 24 + 24) as number[])))
    weather_code.push(mmSum > 8 ? 65 : mmSum > 3 ? 63 : mmSum > 0.4 ? 61 : 2)
    sunrise.push(`${dateKey}T06:${pad(38 + (d % 3))}`)
    sunset.push(`${dateKey}T17:${pad(12 + (d % 7))}`)
    uv.push(4 + Math.round(3 * Math.abs(Math.sin(d / 4))))
  }
  return {
    time,
    weather_code,
    temperature_2m_max: tmax,
    temperature_2m_min: tmin,
    sunrise,
    sunset,
    precipitation_sum: psum,
    precipitation_probability_max: pmax,
    wind_speed_10m_max: wmax,
    uv_index_max: uv,
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

/** millisecond offset of a tz vs UTC (e.g. Tehran → +12600000) */
function tzOffsetMs(tz: string): number {
  const now = new Date()
  const part =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const m = part.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 3600 + Number(m[3]) * 60) * 1000
}

/** epoch ms of today's 00:00 in the target tz */
function startOfDayLocal(tz: string): number {
  const now = new Date()
  const dateKey = now.toLocaleDateString('en-CA', { timeZone: tz }) // "YYYY-MM-DD"
  return Date.parse(`${dateKey}T00:00:00Z`) - tzOffsetMs(tz)
}

function handleForecast(url: URL): Response {
  const q = url.searchParams
  const lats = (q.get('latitude') ?? '35.7').split(',').map(Number)
  const lons = (q.get('longitude') ?? '51.4').split(',').map(Number)
  const multi = lats.length > 1
  const tzReq = q.get('timezone') ?? 'auto'
  const tz = tzReq === 'UTC' || tzReq === 'GMT' ? 'UTC' : 'Asia/Tehran'
  const hourlyVars = (q.get('hourly') ?? '').split(',').filter(Boolean)
  const dailyVars = (q.get('daily') ?? '').split(',').filter(Boolean)
  const currentVars = (q.get('current') ?? '').split(',').filter(Boolean)

  const out = lats.map((lat, j) => {
    const lon = lons[j] ?? lons[0] ?? 51.4
    const startMs = startOfDayLocal(tz)
    const s = buildSeries(startMs, tz, lat, lon)
    const nowHour = Math.floor((Date.now() - startMs) / 3600_000)
    const curIdx = Math.max(0, Math.min(nowHour, s.time.length - 1))

    const obj: Record<string, unknown> = {
      latitude: lat,
      longitude: lon,
      elevation: 1190,
      timezone: tz === 'UTC' ? 'GMT' : tz,
      timezone_abbreviation: tz === 'UTC' ? 'GMT' : 'IRST',
      utc_offset_seconds: tz === 'UTC' ? 0 : 12600,
    }

    if (currentVars.length > 0) {
      const cur: Record<string, number | string | null> = { time: s.time[curIdx] }
      for (const v of currentVars) {
        cur[v] = (s.vals[v]?.[curIdx] ?? 0) as number
      }
      obj.current = cur
      obj.current_units = {}
    }

    if (hourlyVars.length > 0) {
      const hourly: Record<string, unknown> = { time: s.time }
      for (const v of hourlyVars) {
        hourly[v] = s.vals[v] ?? s.time.map((_, i) => Math.round(prand(i + j * 31 + v.length) * 50))
      }
      obj.hourly = hourly
      obj.hourly_units = {}
    }

    if (dailyVars.length > 0) {
      const daily = buildDaily(s, startMs, tz)
      const d: Record<string, unknown> = { time: daily.time }
      for (const v of dailyVars) d[v] = (daily as Record<string, unknown>)[v] ?? []
      obj.daily = d
      obj.daily_units = {}
    }

    return obj
  })

  return jsonResponse(multi ? out : out[0])
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return jsonResponse({ ok: true })
    if (url.pathname.startsWith('/v1/forecast')) return handleForecast(url)
    return jsonResponse({ error: true, reason: `mock: unknown path ${url.pathname}` })
  },
})

console.log(`[om-mock] listening on http://127.0.0.1:${PORT}`)
