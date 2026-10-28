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

/** vivid Windy-like precipitation ramp over 0…50 mm/h (sqrt scale) */
function buildPrecipLut(): Uint8Array {
  const stops: Array<[number, number, number, number, number]> = [
    // mm, r, g, b, a
    [0.05, 155, 205, 245, 0.3],
    [0.2, 105, 185, 240, 0.45],
    [0.5, 75, 175, 130, 0.55],
    [1.5, 35, 145, 85, 0.6],
    [3, 40, 120, 205, 0.65],
    [7, 55, 190, 220, 0.7],
    [12, 250, 225, 90, 0.76],
    [20, 250, 160, 60, 0.8],
    [35, 235, 65, 55, 0.85],
    [65, 175, 60, 185, 0.9],
  ]
  const lut = new Uint8Array(256 * 4)
  const idxOf = (mm: number) => Math.round(Math.sqrt(Math.min(mm, 50) / 50) * 255)
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

let LUT_TEMP: Uint8Array | null = null
let LUT_PRECIP: Uint8Array | null = null
let LUT_CLOUDS: Uint8Array | null = null

function mercY(lat: number): number {
  const l = Math.max(-85, Math.min(85, lat))
  return Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360))
}

/* ================= component ================= */

export default function FieldCanvas() {
  const map = useMap()
  const forecastOn = useWeatherStore((s) => s.overlays.forecast)
  const tempOn = useWeatherStore((s) => s.overlays.temp)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const field = useWeatherStore((s) => s.forecastField)
  const hour = useWeatherStore((s) => s.forecastHour)
  const [, setGridTick] = useState(0)

  const forecastActive = forecastOn && timelineMode === 'forecast'
  const tempActive = tempOn && timelineMode !== 'forecast'
  const active = forecastActive || tempActive
  const activeField = forecastActive ? field : 'temp'

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef<() => void>(() => {})

  useEffect(() => subscribeForecast(() => setGridTick((t) => t + 1)), [])

  // ---- data fetching (padded + snapped bounds → cache friendly) ----
  useEffect(() => {
    if (!active) return
    const fetchBounds = () => {
      const b = map.getBounds()
      const latSpan = b.getNorth() - b.getSouth()
      const lonSpan = b.getEast() - b.getWest()
      const pad = 0.18
      const res = window.innerWidth < 700 ? 14 : 22
      requestForecast(
        {
          latMin: Math.floor((b.getSouth() - latSpan * pad) * 2) / 2,
          latMax: Math.ceil((b.getNorth() + latSpan * pad) * 2) / 2,
          lonMin: Math.floor((b.getWest() - lonSpan * pad) * 2) / 2,
          lonMax: Math.ceil((b.getEast() + lonSpan * pad) * 2) / 2,
        },
        res
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
  }, [active, map])

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
    const hi = forecastActive ? Math.min(hour, H - 1) : 0

    // grid values, row 0 = north (flipped from south-first storage)
    const vals = new Float32Array(n * n)
    for (let i = 0; i < n; i++) {
      const r = n - 1 - i
      for (let j = 0; j < n; j++) {
        const p = pts[i * n + j]
        const arr = fld === 'precip' ? p?.precip : fld === 'temp' ? p?.temp : p?.clouds
        const v = arr?.[hi] ?? NaN
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
    const lut = fld === 'precip' ? LUT_PRECIP : fld === 'clouds' ? LUT_CLOUDS : LUT_TEMP

    // view corners (Web-Mercator rows are linear in screen pixels)
    const size = map.getSize()
    const nw = map.containerPointToLatLng([0, 0])
    const se = map.containerPointToLatLng([size.x, size.y])
    const mN = mercY(nw.lat)
    const mS = mercY(se.lat)

    // data bounds in mercator + grid row table (descending, row 0 = north)
    const mdt = mercY(bounds.latMax)
    const mdb = mercY(bounds.latMin)
    const mers = new Float64Array(n)
    for (let r = 0; r < n; r++) mers[r] = mdt - ((mdt - mdb) * r) / (n - 1)
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
    const fadeW = 1.6 // edge fade width in grid cells

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
          if (v < 0.05) {
            data[o + 3] = 0
            continue
          }
          li = Math.min(255, (Math.sqrt(Math.min(v, 50) / 50) * 255) | 0)
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
    const zoom = map.getZoom()
    if (fld === 'clouds') return
    const step = zoom < 5 ? 5 : zoom < 6 ? 4 : zoom < 7 ? 3 : zoom < 9 ? 2 : 1
    ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 4
    let labels = 0
    for (let i = 0; i < n && labels < 80; i += step) {
      for (let j = 0; j < n && labels < 80; j += step) {
        const p = pts[i * n + j]
        if (!p) continue
        const arr = fld === 'precip' ? p.precip : p.temp
        const v = arr?.[hi] ?? NaN
        if (!Number.isFinite(v)) continue
        if (fld === 'precip' && v < 0.3) continue
        const pt = map.latLngToContainerPoint([p.lat, p.lon])
        if (pt.x < 14 || pt.x > w - 14 || pt.y < 14 || pt.y > h - 14) continue
        const label = fld === 'precip' ? faNum(v, 1) : `${faNum(Math.round(v))}°`
        ctx.fillStyle = fld === 'precip' && v >= 4 ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.94)'
        ctx.fillText(label, pt.x, pt.y)
        if (fld === 'precip' && v >= 0.3) {
          ctx.fillStyle = 'rgba(255,255,255,0.65)'
          ctx.font = '500 8px Vazirmatn, Tahoma, sans-serif'
          ctx.fillText('mm', pt.x, pt.y + 9)
          ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
        }
        labels++
      }
    }
    ctx.shadowBlur = 0
  }

  // after every render: publish the latest draw + trigger a repaint
  useEffect(() => {
    drawRef.current = draw
    draw()
  })

  return null
}
