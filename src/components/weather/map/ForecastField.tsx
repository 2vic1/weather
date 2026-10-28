'use client'

// Windy-style animated model field rendered on canvas.
// Precipitation / temperature / cloud-cover grid fetched once per view,
// animated hour-by-hour through the 48h forecast via the shared timeline.

import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useWeatherStore } from '@/store/weather-store'
import {
  getForecastState,
  requestForecast,
  sampleForecast,
  subscribeForecast,
} from './forecastCache'
import { tempColor } from '@/lib/weather-codes'
import { faNum } from '@/lib/format'

/**
 * Windy-style precipitation ramp (mm/h) → [r, g, b, alpha].
 * Mirrors the «Rain accumulation» look: pale white → green → blue →
 * yellow → orange → red → maroon → deep purple cores.
 */
const PRECIP_STOPS: Array<[number, number, number, number, number]> = [
  [0.08, 228, 246, 255, 0.3],
  [0.2, 178, 228, 250, 0.4],
  [0.5, 130, 224, 148, 0.52],
  [1, 52, 198, 108, 0.6],
  [2, 45, 140, 235, 0.62],
  [4, 30, 100, 215, 0.66],
  [6, 250, 226, 78, 0.7],
  [10, 250, 156, 45, 0.74],
  [16, 240, 60, 45, 0.78],
  [26, 186, 34, 56, 0.82],
  [45, 134, 26, 88, 0.86],
  [75, 94, 16, 108, 0.9],
]

function precipColor(mm: number): [number, number, number, number] {
  if (!Number.isFinite(mm) || mm < 0.05) return [0, 0, 0, 0]
  const stops = PRECIP_STOPS
  if (mm <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3], stops[0][4]]
  for (let i = 0; i < stops.length - 1; i++) {
    const [m0, r0, g0, b0, a0] = stops[i]
    const [m1, r1, g1, b1, a1] = stops[i + 1]
    if (mm <= m1) {
      const t = (mm - m0) / (m1 - m0)
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t]
    }
  }
  const last = stops[stops.length - 1]
  return [last[1], last[2], last[3], last[4]]
}

function cloudsColor(cc: number): [number, number, number, number] {
  if (!Number.isFinite(cc) || cc < 5) return [0, 0, 0, 0]
  const t = Math.min(cc, 100) / 100
  return [235 - t * 110, 240 - t * 112, 245 - t * 105, 0.08 + t * 0.42]
}

/** NaN-aware 3×3 box blur — one pass; makes model blobs organic like Windy */
function blurField(src: Float64Array, n: number): Float64Array {
  const out = new Float64Array(src.length)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      let cnt = 0
      for (let di = -1; di <= 1; di++) {
        const ii = i + di
        if (ii < 0 || ii >= n) continue
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj
          if (jj < 0 || jj >= n) continue
          const v = src[ii * n + jj]
          if (Number.isFinite(v)) {
            sum += v
            cnt++
          }
        }
      }
      out[i * n + j] = cnt > 0 ? sum / cnt : NaN
    }
  }
  return out
}

export default function ForecastField() {
  const map = useMap()
  // active in forecast mode (overlay on) — or in radar mode once the slider
  // crosses beyond the last radar frame into the 15-day model zone
  const active = useWeatherStore((s) =>
    s.timelineMode === 'forecast'
      ? s.overlays.forecast
      : s.timelineMode === 'radar'
        ? s.radarFuture
        : false
  )
  // radar mode prefetches the field (without rendering) so the unified radar
  // timeline can offer the full 15-day range as soon as the user drags past «اکنون»
  const shouldLoad = useWeatherStore(
    (s) => active || s.timelineMode === 'radar'
  )
  const field = useWeatherStore((s) => s.forecastField)
  const hour = useWeatherStore((s) => s.forecastHour)
  const [gridTick, setGridTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => subscribeForecast(() => setGridTick((t) => t + 1)), [])

  // fetch field when activated (or prefetching for radar mode) & when the view moves
  useEffect(() => {
    if (!shouldLoad) return
    const fetchBounds = () => {
      const b = map.getBounds()
      requestForecast(
        {
          latMin: b.getSouth(),
          latMax: b.getNorth(),
          lonMin: b.getWest(),
          lonMax: b.getEast(),
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

  // canvas lifecycle + drawing
  useEffect(() => {
    if (!active) return
    const container = map.getContainer()
    const canvas = L.DomUtil.create('canvas', 'forecast-field-canvas') as HTMLCanvasElement
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
    const resize = () => {
      canvas.width = container.clientWidth * dpr
      canvas.height = container.clientHeight * dpr
      draw()
    }

    let rafPending = false
    const requestDraw = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        rafPending = false
        draw()
      })
    }

    resize()
    map.on('resize', resize)
    map.on('move', requestDraw)
    map.on('moveend', requestDraw)
    map.on('zoomend', requestDraw)

    function draw() {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const st = getForecastState()
      const grid = st.points
      const n = st.n
      const H = Math.max(st.times.length, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!grid || n < 2 || H === 0) return
      const hi = Math.min(hour, H - 1)
      const { bounds } = st
      if (!bounds) return

      const w = container.clientWidth
      const h = container.clientHeight
      const zoom = map.getZoom()

      // project grid corners → screen rect
      const tl = map.latLngToContainerPoint([bounds.latMax, bounds.lonMin])
      const br = map.latLngToContainerPoint([bounds.latMin, bounds.lonMax])
      const rx = tl.x
      const ry = tl.y
      const rw = br.x - tl.x
      const rh = br.y - tl.y
      if (rw < 4 || rh < 4 || rx > w || ry > h || rx + rw < 0 || ry + rh < 0) return

      // paint grid values into a tiny offscreen canvas (n × n) → smooth → upscale.
      // blur pass makes model blobs organic (Windy-style); double upscale
      // (n → 4n → screen) yields continuous gradients instead of blocky cells.
      let vals = new Float64Array(n * n)
      for (let k = 0; k < n * n; k++) {
        const p = grid[k]
        const arr = field === 'precip' ? p?.precip : field === 'temp' ? p?.temp : p?.clouds
        vals[k] = arr?.[hi] ?? NaN
      }
      if (field === 'precip') {
        vals = blurField(vals, n)
        vals = blurField(vals, n)
      } else if (field === 'clouds') {
        vals = blurField(vals, n)
      }

      const off = document.createElement('canvas')
      off.width = n
      off.height = n
      const octx = off.getContext('2d')
      if (!octx) return
      const img = octx.createImageData(n, n)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const v = vals[i * n + j]
          let c: [number, number, number, number] = [0, 0, 0, 0]
          if (field === 'precip') c = precipColor(v)
          else if (field === 'clouds') c = cloudsColor(v)
          else if (Number.isFinite(v)) {
            const [r, g, b] = tempColor(v)
            c = [r, g, b, 0.4]
          }
          // imageData row 0 = top = latMax → grid row n-1
          const px = ((n - 1 - i) * n + j) * 4
          img.data[px] = c[0]
          img.data[px + 1] = c[1]
          img.data[px + 2] = c[2]
          img.data[px + 3] = Math.round(c[3] * 255)
        }
      }
      octx.putImageData(img, 0, 0)

      // double upscale: n → mid (4n) → screen for continuous gradients
      const mid = Math.min(n * 4, 160)
      const midCanvas = document.createElement('canvas')
      midCanvas.width = mid
      midCanvas.height = mid
      const mctx = midCanvas.getContext('2d')
      if (!mctx) return
      mctx.imageSmoothingEnabled = true
      mctx.imageSmoothingQuality = 'high'
      mctx.drawImage(off, 0, 0, mid, mid)

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(midCanvas, rx, ry, rw, rh)

      // value labels (zoom-aware density)
      if (field === 'clouds' || zoom < 4) return
      const step = zoom < 5 ? 5 : zoom < 6 ? 4 : zoom < 7 ? 3 : zoom < 9 ? 2 : 1
      ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 4
      let li = 0
      for (let i = 0; i < n && li < 90; i += step) {
        for (let j = 0; j < n && li < 90; j += step) {
          const p = grid[i * n + j]
          const arr = field === 'precip' ? p?.precip : p?.temp
          const v = arr?.[hi] ?? NaN
          if (!Number.isFinite(v)) continue
          if (field === 'precip' && v < 0.4) continue
          const pt = map.latLngToContainerPoint([p.lat, p.lon])
          if (pt.x < 10 || pt.x > w - 10 || pt.y < 10 || pt.y > h - 10) continue
          const label =
            field === 'precip' ? `${faNum(v, 1)}` : `${faNum(Math.round(v))}°`
          ctx.fillStyle =
            field === 'precip'
              ? v >= 6
                ? 'rgba(255,255,255,0.98)'
                : 'rgba(240,255,245,0.9)'
              : 'rgba(255,255,255,0.95)'
          ctx.fillText(label, pt.x, pt.y)
          if (field === 'precip' && v >= 0.4) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)'
            ctx.font = '500 8px Vazirmatn, Tahoma, sans-serif'
            ctx.fillText('mm', pt.x, pt.y + 9)
            ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
          }
          li++
        }
      }
      ctx.shadowBlur = 0
    }

    return () => {
      map.off('resize', resize)
      map.off('move', requestDraw)
      map.off('moveend', requestDraw)
      map.off('zoomend', requestDraw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [active, map, field, hour, gridTick])

  return null
}
