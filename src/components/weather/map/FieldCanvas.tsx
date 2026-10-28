'use client'

// Windy-quality animated field renderer.
// Per-pixel bilinear interpolation over the 15-day model grid, with correct
// Web-Mercator row mapping, edge fading and LUT colours → crisp, vivid,
// continuous colour fields for temperature / precipitation / cloud cover.

import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { useWeatherStore } from '@/store/weather-store'
import {
  getForecastState,
  requestForecast,
  subscribeForecast,
} from './forecastCache'
import { tempColor } from '@/lib/weather-codes'
import { faNum } from '@/lib/format'

/* ================= colour LUTs ================= */

function buildTempLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const v = -25 + (i / 255) * 70 // −25…45 °C
    const [r, g, b] = tempColor(v)
    lut[i * 4] = r
    lut[i * 4 + 1] = g
    lut[i * 4 + 2] = b
    lut[i * 4 + 3] = 150 // base alpha (× edge fade)
  }
  return lut
}

/**
 * Classic radar spectrum (Windy/rainviewer-style), calibrated to mm/h so the
 * eye reads intensity directly: light rain = blue → shower = cyan/green →
 * moderate = green→yellow → heavy = orange → intense = red → extreme =
 * crimson → magenta → pale pink cores. sqrt scale over 0…45 mm/h.
 */
export const PRECIP_MM_STOPS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // mm/h, r, g, b, a
  [0.08, 168, 210, 245, 0.42],
  [0.25, 118, 180, 242, 0.5],
  [0.6, 55, 130, 235, 0.56],
  [1.2, 40, 205, 230, 0.6],
  [2, 60, 205, 120, 0.64],
  [3.5, 155, 220, 75, 0.68],
  [5, 250, 228, 80, 0.72],
  [7, 250, 180, 50, 0.75],
  [10, 245, 125, 40, 0.78],
  [15, 232, 60, 40, 0.81],
  [24, 190, 30, 65, 0.84],
  [33, 220, 70, 175, 0.87],
  [45, 245, 150, 220, 0.9],
]
export const PRECIP_MM_MAX = 45

export function precipLutIndex(mm: number): number {
  return Math.min(255, (Math.sqrt(Math.min(Math.max(mm, 0), PRECIP_MM_MAX) / PRECIP_MM_MAX) * 255) | 0)
}

function buildPrecipLut(): Uint8Array {
  const stops = PRECIP_MM_STOPS
  const lut = new Uint8Array(256 * 4)
  const idxOf = (mm: number) => precipLutIndex(mm)
  for (let s = 0; s < stops.length - 1; s++) {
    const [m0, r0, g0, b0, a0] = stops[s]
    const [m1, r1, g1, b1, a1] = stops[s + 1]
    const i0 = idxOf(m0)
    const i1 = idxOf(m1)
    for (let i = i0; i <= i1; i++) {
      const t = (i - i0) / Math.max(i1 - i0, 1)
      lut[i * 4] = r0 + (r1 - r0) * t
      lut[i * 4 + 1] = g0 + (g1 - g0) * t
      lut[i * 4 + 2] = b0 + (b1 - b0) * t
      lut[i * 4 + 3] = Math.round((a0 + (a1 - a0) * t) * 255)
    }
  }
  // below first stop → fully transparent
  for (let i = 0; i < idxOf(stops[0][0]); i++) lut[i * 4 + 3] = 0
  return lut
}

function buildCloudsLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255 // 0…1 cloud cover
    // white → cool grey, denser clouds slightly darker + more opaque
    lut[i * 4] = 252 - t * 55
    lut[i * 4 + 1] = 253 - t * 50
    lut[i * 4 + 2] = 255 - t * 38
    lut[i * 4 + 3] = Math.round((0.12 + 0.55 * Math.pow(t, 1.25)) * 255)
  }
  return lut
}

/** CAPE (J/kg) thunderstorm-energy ramp — green → yellow → orange → red → purple */
function buildCapeLut(): Uint8Array {
  const stops: Array<[number, number, number, number, number]> = [
    // J/kg, r, g, b, a
    [30, 120, 200, 130, 0.34],
    [150, 80, 195, 110, 0.44],
    [400, 230, 225, 95, 0.52],
    [900, 248, 165, 55, 0.6],
    [1800, 240, 85, 45, 0.66],
    [3000, 190, 40, 85, 0.72],
    [5000, 135, 45, 150, 0.78],
  ]
  const lut = new Uint8Array(256 * 4)
  const idxOf = (j: number) => Math.round(Math.sqrt(Math.min(j, 5000) / 5000) * 255)
  for (let s = 0; s < stops.length - 1; s++) {
    const [m0, r0, g0, b0, a0] = stops[s]
    const [m1, r1, g1, b1, a1] = stops[s + 1]
    const i0 = idxOf(m0)
    const i1 = idxOf(m1)
    for (let i = i0; i <= i1; i++) {
      const t = (i - i0) / Math.max(i1 - i0, 1)
      lut[i * 4] = r0 + (r1 - r0) * t
      lut[i * 4 + 1] = g0 + (g1 - g0) * t
      lut[i * 4 + 2] = b0 + (b1 - b0) * t
      lut[i * 4 + 3] = Math.round((a0 + (a1 - a0) * t) * 255)
    }
  }
  for (let i = 0; i < idxOf(stops[0][0]); i++) lut[i * 4 + 3] = 0
  return lut
}

/** snowfall (cm/h) — icy white → deep blue */
function buildSnowLut(): Uint8Array {
  const stops: Array<[number, number, number, number, number]> = [
    [0.02, 238, 245, 252, 0.38],
    [0.08, 214, 230, 248, 0.5],
    [0.2, 185, 208, 242, 0.6],
    [0.5, 152, 182, 226, 0.68],
    [1, 122, 156, 212, 0.74],
    [2, 92, 130, 196, 0.8],
  ]
  const lut = new Uint8Array(256 * 4)
  const idxOf = (cm: number) => Math.round(Math.sqrt(Math.min(cm, 2) / 2) * 255)
  for (let s = 0; s < stops.length - 1; s++) {
    const [m0, r0, g0, b0, a0] = stops[s]
    const [m1, r1, g1, b1, a1] = stops[s + 1]
    const i0 = idxOf(m0)
    const i1 = idxOf(m1)
    for (let i = i0; i <= i1; i++) {
      const t = (i - i0) / Math.max(i1 - i0, 1)
      lut[i * 4] = r0 + (r1 - r0) * t
      lut[i * 4 + 1] = g0 + (g1 - g0) * t
      lut[i * 4 + 2] = b0 + (b1 - b0) * t
      lut[i * 4 + 3] = Math.round((a0 + (a1 - a0) * t) * 255)
    }
  }
  for (let i = 0; i < idxOf(stops[0][0]); i++) lut[i * 4 + 3] = 0
  return lut
}

let LUT_TEMP: Uint8Array | null = null
let LUT_PRECIP: Uint8Array | null = null
let LUT_CLOUDS: Uint8Array | null = null
let LUT_CAPE: Uint8Array | null = null
let LUT_SNOW: Uint8Array | null = null

function mercY(lat: number): number {
  const l = Math.max(-85, Math.min(85, lat))
  return Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360))
}

/** rounded capsule path for map pills */
function capsulePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// city dot list for on-map mm labels (fetched once per session)
let CITY_LIST: Array<{ lat: number; lon: number; name: string; isCapital: boolean }> | null = null
let citiesRequested = false
function ensureCities(redraw: () => void): void {
  if (CITY_LIST || citiesRequested) return
  citiesRequested = true
  fetch('/api/cities?all=1')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cities fetch failed'))))
    .then((d: { cities?: Array<{ lat: number; lon: number; name: string; isCapital?: boolean }> }) => {
      CITY_LIST = (d.cities ?? []).map((c) => ({
        lat: c.lat,
        lon: c.lon,
        name: c.name,
        isCapital: !!c.isCapital,
      }))
      redraw()
    })
    .catch(() => {})
}

/* ================= component ================= */

export default function FieldCanvas() {
  const map = useMap()
  const forecastOn = useWeatherStore((s) => s.overlays.forecast)
  const tempOn = useWeatherStore((s) => s.overlays.temp)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const radarFuture = useWeatherStore((s) => s.radarFuture)
  const field = useWeatherStore((s) => s.forecastField)
  const hour = useWeatherStore((s) => s.forecastHour)
  const showIsobars = useWeatherStore((s) => s.showIsobars)
  const [, setGridTick] = useState(0)

  // radar mode scrubbing past «اکنون» → the 15-day model field replaces the radar tiles
  const inModelZone = timelineMode === 'radar' && radarFuture
  const forecastActive = (forecastOn && timelineMode === 'forecast') || inModelZone
  const tempActive = tempOn && timelineMode !== 'forecast' && !inModelZone
  const active = forecastActive || tempActive
  const activeField = forecastActive ? field : 'temp'
  // radar mode prefetches the grid (without rendering) so the unified timeline
  // can offer the full 15-day range as soon as the user drags beyond «اکنون»
  const shouldLoad = active || timelineMode === 'radar'

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef<() => void>(() => {})

  useEffect(() => subscribeForecast(() => setGridTick((t) => t + 1)), [])

  // ---- data fetching (padded + snapped bounds → cache friendly) ----
  useEffect(() => {
    if (!shouldLoad) return
    const fetchBounds = () => {
      const b = map.getBounds()
      const latSpan = b.getNorth() - b.getSouth()
      const lonSpan = b.getEast() - b.getWest()
      const pad = 0.18
      // unified with ForecastField → one shared cache entry, Windy-grade 28×28 grid
      requestForecast(
        {
          latMin: Math.floor((b.getSouth() - latSpan * pad) * 2) / 2,
          latMax: Math.ceil((b.getNorth() + latSpan * pad) * 2) / 2,
          lonMin: Math.floor((b.getWest() - lonSpan * pad) * 2) / 2,
          lonMax: Math.ceil((b.getEast() + lonSpan * pad) * 2) / 2,
        },
        28
      )
    }
    fetchBounds()
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMove = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(fetchBounds, 500)
    }
    map.on('moveend', onMove)
    return () => {
      map.off('moveend', onMove)
      if (timer) clearTimeout(timer)
    }
  }, [shouldLoad, map])

  // ---- canvas lifecycle ----
  useEffect(() => {
    if (!active) return
    const container = map.getContainer()
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '400'
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)
    canvasRef.current = canvas

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let rafPending = false
    const requestDraw = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        rafPending = false
        drawRef.current()
      })
    }

    const resize = () => {
      canvas.width = Math.max(2, container.clientWidth * dpr)
      canvas.height = Math.max(2, container.clientHeight * dpr)
      requestDraw()
    }
    resize()
    map.on('resize', resize)
    map.on('move', requestDraw)
    map.on('moveend', requestDraw)
    map.on('zoomend', requestDraw)

    return () => {
      map.off('resize', resize)
      map.off('move', requestDraw)
      map.off('moveend', requestDraw)
      map.off('zoomend', requestDraw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [active, map])

  // ---- the renderer (reads latest props/store values via closure) ----
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const st = getForecastState()
    const pts = st.points
    const n = st.n
    const bounds = st.bounds
    const w = canvas.clientWidth || map.getContainer().clientWidth
    const h = canvas.clientHeight || map.getContainer().clientHeight
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!pts || n < 2 || !bounds || w < 4 || h < 4) return

    const fld = activeField
    const H = st.times.length
    if (H === 0) return
    // fractional frame → smooth Windy-style morphing between 3-hourly steps
    const hf = forecastActive ? Math.max(0, Math.min(hour, H - 1)) : 0
    const hi = Math.floor(hf)
    const hi1 = Math.min(hi + 1, H - 1)
    const tf = hf - hi

    // grid values, row 0 = north (flipped from south-first storage)
    const vals = new Float32Array(n * n)
    for (let i = 0; i < n; i++) {
      const r = n - 1 - i
      for (let j = 0; j < n; j++) {
        const p = pts[i * n + j]
        const arr =
          fld === 'precip'
            ? p?.precip
            : fld === 'temp'
              ? p?.temp
              : fld === 'cape'
                ? p?.cape
                : fld === 'snow'
                  ? p?.snow
                  : p?.clouds
        const a0 = arr?.[hi] ?? NaN
        const a1 = arr?.[hi1] ?? NaN
        // NaN-aware lerp — partial series never poison a valid frame
        let v: number
        if (!Number.isFinite(a0)) v = a1
        else if (!Number.isFinite(a1)) v = a0
        else v = a0 + (a1 - a0) * tf
        vals[r * n + j] = Number.isFinite(v) ? v : NaN
      }
    }
    // inpaint isolated NaN cells from finite neighbours (keeps the field hole-free)
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (Number.isFinite(vals[r * n + c])) continue
          let sum = 0
          let cnt = 0
          if (r > 0 && Number.isFinite(vals[(r - 1) * n + c])) { sum += vals[(r - 1) * n + c]; cnt++ }
          if (r < n - 1 && Number.isFinite(vals[(r + 1) * n + c])) { sum += vals[(r + 1) * n + c]; cnt++ }
          if (c > 0 && Number.isFinite(vals[r * n + c - 1])) { sum += vals[r * n + c - 1]; cnt++ }
          if (c < n - 1 && Number.isFinite(vals[r * n + c + 1])) { sum += vals[r * n + c + 1]; cnt++ }
          if (cnt > 0) vals[r * n + c] = sum / cnt
        }
      }
    }
    if (!Number.isFinite(vals[0]) && !Number.isFinite(vals[n * n - 1])) return

    // colour LUT
    if (!LUT_TEMP) LUT_TEMP = buildTempLut()
    if (!LUT_PRECIP) LUT_PRECIP = buildPrecipLut()
    if (!LUT_CLOUDS) LUT_CLOUDS = buildCloudsLut()
    if (!LUT_CAPE) LUT_CAPE = buildCapeLut()
    if (!LUT_SNOW) LUT_SNOW = buildSnowLut()
    const lut =
      fld === 'precip'
        ? LUT_PRECIP
        : fld === 'clouds'
          ? LUT_CLOUDS
          : fld === 'cape'
            ? LUT_CAPE
            : fld === 'snow'
              ? LUT_SNOW
              : LUT_TEMP

    // view corners (Web-Mercator rows are linear in screen pixels)
    const size = map.getSize()
    const nw = map.containerPointToLatLng([0, 0])
    const se = map.containerPointToLatLng([size.x, size.y])
    const mN = mercY(nw.lat)
    const mS = mercY(se.lat)

    // grid rows sit at LINEAR latitudes (server lattice) → map each row to its
    // true Web-Mercator y so features land pixel-perfect on the basemap
    const latSpan = bounds.latMax - bounds.latMin
    const mers = new Float64Array(n)
    for (let r = 0; r < n; r++) {
      mers[r] = mercY(bounds.latMax - (latSpan * r) / (n - 1)) // row 0 = north
    }
    const lonMin = bounds.lonMin
    const lonSpan = Math.max(bounds.lonMax - lonMin, 1e-6)

    // render resolution (cap ~1.3 Mpx, then smooth-upscale)
    const MAXPX = 1_300_000
    const scale = w * h > MAXPX ? Math.sqrt(MAXPX / (w * h)) : 1
    const rw = Math.max(2, Math.round(w * scale))
    const rh = Math.max(2, Math.round(h * scale))

    const off = document.createElement('canvas')
    off.width = rw
    off.height = rh
    const octx = off.getContext('2d')
    if (!octx) return
    const img = octx.createImageData(rw, rh)
    const data = img.data
    const fadeW = 3 // soft edge fade — boundary-cut systems dissolve naturally

    for (let y = 0; y < rh; y++) {
      const m = mN + (mS - mN) * (y / Math.max(rh - 1, 1))
      // mercator → grid row fraction (binary search over descending table)
      let fy: number
      if (m >= mers[0]) fy = 0
      else if (m <= mers[n - 1]) fy = n - 1
      else {
        let lo = 0
        let hiI = n - 1
        while (hiI - lo > 1) {
          const mid = (lo + hiI) >> 1
          if (m <= mers[mid]) lo = mid
          else hiI = mid
        }
        fy = lo + (mers[lo] - m) / (mers[lo] - mers[hiI])
      }
      const iy = fy | 0
      const ty = Math.min(fy - iy, 1)
      const row0 = iy * n
      const row1 = Math.min(iy + 1, n - 1) * n
      const rowFade = Math.min(Math.min(fy, n - 1 - fy) / fadeW, 1)

      const rowOff = y * rw
      for (let x = 0; x < rw; x++) {
        const o = (rowOff + x) * 4
        const fx =
          ((((nw.lng + (se.lng - nw.lng) * (x / Math.max(rw - 1, 1)) + 540) % 360) - 180 - lonMin) /
            lonSpan) *
          (n - 1)
        if (fx < -0.3 || fx > n - 0.7 || rowFade <= 0) {
          data[o + 3] = 0
          continue
        }
        const ix = fx | 0
        const tx = Math.min(fx - ix, 1)
        const x1 = Math.min(ix + 1, n - 1)

        const v00 = vals[row0 + ix]
        const v10 = vals[row0 + x1]
        const v01 = vals[row1 + ix]
        const v11 = vals[row1 + x1]
        const top = v00 + (v10 - v00) * tx
        const bot = v01 + (v11 - v01) * tx
        const v = top + (bot - top) * ty
        if (!Number.isFinite(v)) {
          data[o + 3] = 0
          continue
        }

        // value → LUT index
        let li: number
        if (fld === 'precip') {
          if (v < 0.08) {
            data[o + 3] = 0
            continue
          }
          li = precipLutIndex(v)
        } else if (fld === 'cape') {
          if (v < 30) {
            data[o + 3] = 0
            continue
          }
          li = Math.min(255, (Math.sqrt(Math.min(v, 5000) / 5000) * 255) | 0)
        } else if (fld === 'snow') {
          if (v < 0.02) {
            data[o + 3] = 0
            continue
          }
          li = Math.min(255, (Math.sqrt(Math.min(v, 2) / 2) * 255) | 0)
        } else if (fld === 'clouds') {
          if (v < 3) {
            data[o + 3] = 0
            continue
          }
          li = Math.min(255, (v * 2.55) | 0)
        } else {
          li = Math.max(0, Math.min(255, (((v + 25) / 70) * 255) | 0))
        }

        const fade = Math.min(Math.min(fx, n - 1 - fx) / fadeW, 1) * rowFade
        const lix = li * 4
        data[o] = lut[lix]
        data[o + 1] = lut[lix + 1]
        data[o + 2] = lut[lix + 2]
        data[o + 3] = (lut[lix + 3] * fade) | 0
      }
    }
    octx.putImageData(img, 0, 0)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(off, 0, 0, w, h)

    // ---- value labels ----
    // temperature keeps dense grid numbers; precip / cape / snow get Windy-style
    // system annotation instead of scattered numbers: a pill on every system's
    // core (with its spectrum colour as a dot — the legend lives on the map), a
    // lighter periphery pill on the big systems, and mm pills over cities that
    // sit under the precip field.
    const zoom = map.getZoom()
    if (fld === 'clouds') return
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (fld === 'temp') {
      const step = zoom < 5 ? 5 : zoom < 6 ? 4 : zoom < 7 ? 3 : zoom < 9 ? 2 : 1
      ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 4
      const liT = Math.min(Math.round(hf), H - 1)
      let labels = 0
      for (let i = 0; i < n && labels < 80; i += step) {
        for (let j = 0; j < n && labels < 80; j += step) {
          const p = pts[i * n + j]
          if (!p) continue
          const v = p.temp?.[liT] ?? NaN
          if (!Number.isFinite(v)) continue
          const pt = map.latLngToContainerPoint([p.lat, p.lon])
          if (pt.x < 14 || pt.x > w - 14 || pt.y < 14 || pt.y > h - 14) continue
          ctx.fillStyle = 'rgba(255,255,255,0.94)'
          ctx.fillText(`${faNum(Math.round(v))}°`, pt.x, pt.y)
          labels++
        }
      }
      ctx.shadowBlur = 0
    } else {
      const minV = fld === 'precip' ? 1 : fld === 'cape' ? 350 : 0.08 // core threshold
      const visV = fld === 'precip' ? 0.6 : fld === 'cape' ? 150 : 0.02 // visible extent

      const latOf = (r: number) => bounds.latMax - (latSpan * r) / (n - 1)
      const lonOf = (c: number) => lonMin + (lonSpan * c) / (n - 1)
      const sxy = (r: number, c: number): [number, number] => {
        const pt = map.latLngToContainerPoint([latOf(r), lonOf(c)])
        return [pt.x, pt.y]
      }
      const lutIdx = (v: number): number =>
        fld === 'precip'
          ? precipLutIndex(v)
          : fld === 'cape'
            ? Math.min(255, (Math.sqrt(Math.min(v, 5000) / 5000) * 255) | 0)
            : Math.min(255, (Math.sqrt(Math.min(v, 2) / 2) * 255) | 0)
      const dotColor = (v: number): string => {
        const li = lutIdx(v) * 4
        return `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`
      }
      const fmtVal = (v: number): string =>
        fld === 'precip'
          ? `${faNum(v, v < 10 ? 1 : 0)}mm`
          : fld === 'cape'
            ? `${faNum(Math.round(v))}J`
            : `${faNum(v, v < 0.1 ? 2 : 1)}cm`

      const pill = (x: number, y: number, text: string, dot: string | null, big: boolean) => {
        ctx.font = big
          ? '700 12px Vazirmatn, Tahoma, sans-serif'
          : '600 10.5px Vazirmatn, Tahoma, sans-serif'
        const tw = ctx.measureText(text).width
        const padX = big ? 8 : 6
        const bh = big ? 20 : 17
        const bw = tw + padX * 2 + (dot ? 13 : 0)
        const bx = x - bw / 2
        const by = y - bh / 2
        ctx.shadowColor = 'rgba(0,0,0,0.55)'
        ctx.shadowBlur = 5
        ctx.fillStyle = 'rgba(9,14,24,0.78)'
        capsulePath(ctx, bx, by, bw, bh)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 1
        capsulePath(ctx, bx, by, bw, bh)
        ctx.stroke()
        let tx = x
        if (dot) {
          const dx = bx + padX + 3.2
          ctx.fillStyle = dot
          ctx.beginPath()
          ctx.arc(dx, y, 3.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'
          ctx.stroke()
          tx += 6.5
        }
        ctx.fillStyle = 'rgba(255,255,255,0.97)'
        ctx.fillText(text, tx, y + 0.5)
      }

      // local maxima = system cores (8-neighbour plateau-aware)
      const peaks: Array<{ r: number; c: number; v: number }> = []
      for (let r = 1; r < n - 1; r++) {
        for (let c = 1; c < n - 1; c++) {
          const v = vals[r * n + c]
          if (!Number.isFinite(v) || v < minV) continue
          if (
            v >= vals[(r - 1) * n + c - 1] &&
            v >= vals[(r - 1) * n + c] &&
            v >= vals[(r - 1) * n + c + 1] &&
            v >= vals[r * n + c - 1] &&
            v >= vals[r * n + c + 1] &&
            v >= vals[(r + 1) * n + c - 1] &&
            v >= vals[(r + 1) * n + c] &&
            v >= vals[(r + 1) * n + c + 1]
          ) {
            peaks.push({ r, c, v })
          }
        }
      }
      peaks.sort((a, b) => b.v - a.v)

      const coreDist = zoom < 5 ? 92 : zoom < 7 ? 115 : 140
      const cores: Array<{ x: number; y: number; v: number; r: number; c: number }> = []
      for (const pk of peaks) {
        if (cores.length >= 7) break
        const [x, y] = sxy(pk.r, pk.c)
        if (x < 36 || x > w - 36 || y < 28 || y > h - 36) continue
        if (cores.some((q) => Math.hypot(q.x - x, q.y - y) < coreDist)) continue
        cores.push({ x, y, v: pk.v, r: pk.r, c: pk.c })
      }
      const placed: Array<{ x: number; y: number }> = cores.map((q) => ({ x: q.x, y: q.y }))
      for (const q of cores) pill(q.x, q.y, fmtVal(q.v), dotColor(q.v), true)

      // periphery pill on the 3 strongest systems — teaches «yellow = X mm, blue = Y mm»
      for (let k = 0; k < Math.min(3, cores.length); k++) {
        const q = cores[k]
        const seen = new Uint8Array(n * n)
        const stack: number[] = [q.r * n + q.c]
        seen[stack[0]] = 1
        const target = q.v * 0.45
        let best = -1
        let bestScore = Infinity
        while (stack.length) {
          const idx = stack.pop() as number
          const v = vals[idx]
          if (!Number.isFinite(v) || v < visV) continue
          const r = (idx / n) | 0
          const c = idx % n
          if (v >= target * 0.65 && v <= target * 1.5) {
            const [x, y] = sxy(r, c)
            const dCore = Math.hypot(q.x - x, q.y - y)
            if (dCore > 58) {
              const score = Math.abs(v - target) + Math.abs(dCore - 115) * 0.004
              if (score < bestScore) {
                bestScore = score
                best = idx
              }
            }
          }
          const nb = [idx - 1, idx + 1, idx - n, idx + n]
          for (const ni of nb) {
            if (ni < 0 || ni >= n * n || seen[ni]) continue
            if (c === 0 && ni % n === n - 1) continue
            if (c === n - 1 && ni % n === 0) continue
            seen[ni] = 1
            stack.push(ni)
          }
        }
        if (best >= 0) {
          const r = (best / n) | 0
          const c = best % n
          const [x, y] = sxy(r, c)
          if (
            x > 30 &&
            x < w - 30 &&
            y > 24 &&
            y < h - 30 &&
            !placed.some((p2) => Math.hypot(p2.x - x, p2.y - y) < 74)
          ) {
            placed.push({ x, y })
            pill(x, y, fmtVal(vals[best]), dotColor(vals[best]), false)
          }
        }
      }

      // city pills — mm value sampled from the grid over each rainy city
      if (fld === 'precip') {
        if (!CITY_LIST) ensureCities(() => drawRef.current())
        else {
          const sampled = (lat: number, lon: number): number => {
            const fx = ((((lon + 540) % 360) - 180 - lonMin) / lonSpan) * (n - 1)
            if (fx < 0 || fx > n - 1) return NaN
            const m = mercY(lat)
            if (m > mers[0] || m < mers[n - 1]) return NaN
            let lo = 0
            let hiI = n - 1
            while (hiI - lo > 1) {
              const mid = (lo + hiI) >> 1
              if (m <= mers[mid]) lo = mid
              else hiI = mid
            }
            const fy = lo + (mers[lo] - m) / (mers[lo] - mers[hiI])
            const iy = Math.min(Math.floor(fy), n - 2)
            const ty = Math.max(0, Math.min(fy - iy, 1))
            const ix = Math.min(Math.floor(fx), n - 2)
            const tx = Math.max(0, Math.min(fx - ix, 1))
            const v00 = vals[iy * n + ix]
            const v10 = vals[iy * n + ix + 1]
            const v01 = vals[(iy + 1) * n + ix]
            const v11 = vals[(iy + 1) * n + ix + 1]
            if (![v00, v10, v01, v11].every(Number.isFinite)) return NaN
            const top = v00 + (v10 - v00) * tx
            const bot = v01 + (v11 - v01) * tx
            return top + (bot - top) * ty
          }
          const cands: Array<{ x: number; y: number; v: number; name: string; isCapital: boolean }> = []
          for (const ct of CITY_LIST) {
            const v = sampled(ct.lat, ct.lon)
            if (!Number.isFinite(v) || v < 1) continue
            const pt = map.latLngToContainerPoint([ct.lat, ct.lon])
            if (pt.x < 20 || pt.x > w - 20 || pt.y < 26 || pt.y > h - 30) continue
            cands.push({ x: pt.x, y: pt.y, v, name: ct.name, isCapital: ct.isCapital })
          }
          cands.sort((a, b) => b.v - a.v)
          let cityLabels = 0
          for (const cd of cands) {
            if (cityLabels >= 12) break
            if (placed.some((p2) => Math.hypot(p2.x - cd.x, p2.y - cd.y) < 60)) continue
            placed.push({ x: cd.x, y: cd.y + 13 })
            pill(cd.x, cd.y + 13, fmtVal(cd.v), null, false)
            // city name above the dot — replaces the tooltip that sits under
            // the field canvas (capitals from zoom 5, all cities from zoom 8)
            if (zoom >= (cd.isCapital ? 5 : 8)) {
              ctx.font = '600 9.5px Vazirmatn, Tahoma, sans-serif'
              ctx.shadowColor = 'rgba(0,0,0,0.9)'
              ctx.shadowBlur = 3
              ctx.fillStyle = 'rgba(255,255,255,0.88)'
              ctx.fillText(cd.name, cd.x, cd.y - 9)
              ctx.shadowBlur = 0
            }
            cityLabels++
          }
        }
      }
    }

    // ---- isobars (MSL pressure contours, Windy-style) ----
    if (showIsobars && pts[0]?.press) {
      // interpolated pressure grid, row 0 = north (same flip as vals)
      const pr = new Float32Array(n * n)
      let finite = 0
      for (let i = 0; i < n; i++) {
        const r = n - 1 - i
        for (let j = 0; j < n; j++) {
          const p = pts[i * n + j]
          const a0 = p?.press?.[hi] ?? NaN
          const a1 = p?.press?.[hi1] ?? NaN
          let v: number
          if (!Number.isFinite(a0)) v = a1
          else if (!Number.isFinite(a1)) v = a0
          else v = a0 + (a1 - a0) * tf
          pr[r * n + j] = Number.isFinite(v) ? v : NaN
          if (Number.isFinite(v)) finite++
        }
      }
      if (finite > (n * n) / 3) {
        // screen position of every grid node (row-major, row 0 = north)
        const sx = new Float64Array(n * n)
        const sy = new Float64Array(n * n)
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const p = pts[(n - 1 - r) * n + c]
            const pt = map.latLngToContainerPoint([p?.lat ?? bounds.latMax, p?.lon ?? bounds.lonMin])
            sx[r * n + c] = pt.x
            sy[r * n + c] = pt.y
          }
        }
        // contour interval: 5 hPa zoomed out, 2 hPa zoomed in
        const gap = zoom < 4 ? 5 : 2
        let minP = Infinity
        let maxP = -Infinity
        for (let k = 0; k < n * n; k++) {
          if (Number.isFinite(pr[k])) {
            if (pr[k] < minP) minP = pr[k]
            if (pr[k] > maxP) maxP = pr[k]
          }
        }
        const startL = Math.ceil(minP / gap) * gap
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1
        ctx.font = '600 10px Vazirmatn, Tahoma, sans-serif'
        ctx.shadowColor = 'rgba(0,0,0,0.85)'
        ctx.shadowBlur = 3
        let drawn = 0
        const placed: Array<{ x: number; y: number }> = []
        for (let level = startL; level <= maxP && drawn < 60; level += gap) {
          const segs: Array<[number, number, number, number]> = []
          for (let r = 0; r < n - 1; r++) {
            for (let c = 0; c < n - 1; c++) {
              const a = pr[r * n + c] // TL
              const b = pr[r * n + c + 1] // TR
              const cc = pr[(r + 1) * n + c + 1] // BR
              const dd = pr[(r + 1) * n + c] // BL
              if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(cc) || !Number.isFinite(dd)) continue
              let code = 0
              if (a > level) code |= 8
              if (b > level) code |= 4
              if (cc > level) code |= 2
              if (dd > level) code |= 1
              if (code === 0 || code === 15) continue
              // edge crossings (screen px): T (top) · R (right) · B (bottom) · L (left)
              const iT = (level - a) / (b - a)
              const iR = (level - b) / (cc - b)
              const iB = (level - dd) / (cc - dd)
              const iL = (level - a) / (dd - a)
              const xT = sx[r * n + c] + (sx[r * n + c + 1] - sx[r * n + c]) * iT
              const yT = sy[r * n + c]
              const xR = sx[r * n + c + 1]
              const yR = sy[r * n + c + 1] + (sy[(r + 1) * n + c + 1] - sy[r * n + c + 1]) * iR
              const xB = sx[(r + 1) * n + c] + (sx[(r + 1) * n + c + 1] - sx[(r + 1) * n + c]) * iB
              const yB = sy[(r + 1) * n + c]
              const xL = sx[r * n + c]
              const yL = sy[r * n + c] + (sy[(r + 1) * n + c] - sy[r * n + c]) * iL
              const push = (x1: number, y1: number, x2: number, y2: number) =>
                segs.push([x1, y1, x2, y2])
              switch (code) {
                case 1: case 14: push(xL, yL, xB, yB); break
                case 2: case 13: push(xR, yR, xB, yB); break
                case 3: case 12: push(xL, yL, xR, yR); break
                case 4: case 11: push(xT, yT, xR, yR); break
                case 6: case 9: push(xT, yT, xB, yB); break
                case 7: case 8: push(xL, yL, xT, yT); break
                case 5: push(xT, yT, xL, yL); push(xR, yR, xB, yB); break
                case 10: push(xT, yT, xR, yR); push(xL, yL, xB, yB); break
              }
            }
          }
          if (segs.length === 0) continue
          ctx.beginPath()
          for (const [x1, y1, x2, y2] of segs) {
            if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > w || Math.max(y1, y2) < 0 || Math.min(y1, y2) > h) continue
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
          }
          ctx.stroke()
          // labels on a sparse subset of segments
          const stride = Math.max(2, Math.round(segs.length / 6))
          for (let s = 0; s < segs.length && drawn < 60; s += stride) {
            const [x1, y1, x2, y2] = segs[s]
            const lx = (x1 + x2) / 2
            const ly = (y1 + y2) / 2
            if (lx < 24 || lx > w - 24 || ly < 18 || ly > h - 18) continue
            if (placed.some((q) => Math.abs(q.x - lx) < 70 && Math.abs(q.y - ly) < 26)) continue
            placed.push({ x: lx, y: ly })
            ctx.fillStyle = 'rgba(255,255,255,0.92)'
            ctx.fillText(faNum(level), lx, ly)
            drawn++
          }
        }
        ctx.shadowBlur = 0
      }
    }
  }

  // after every render: publish the latest draw + trigger a repaint
  useEffect(() => {
    drawRef.current = draw
    draw()
  })

  return null
}
