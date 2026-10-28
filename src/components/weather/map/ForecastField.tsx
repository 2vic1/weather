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

/** Windy-like precipitation ramp: mm → [r, g, b, alpha] */
const PRECIP_STOPS: Array<[number, number, number, number, number]> = [
  [0.1, 170, 215, 150, 0.26],
  [0.3, 110, 195, 105, 0.4],
  [0.6, 45, 160, 95, 0.48],
  [1.2, 35, 125, 200, 0.54],
  [2.5, 45, 185, 215, 0.58],
  [5, 250, 220, 80, 0.62],
  [10, 245, 150, 45, 0.66],
  [20, 230, 65, 55, 0.7],
  [40, 200, 55, 165, 0.74],
  [80, 135, 60, 200, 0.78],
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

export default function ForecastField() {
  const map = useMap()
  const active = useWeatherStore((s) => s.overlays.forecast && s.timelineMode === 'forecast')
  const field = useWeatherStore((s) => s.forecastField)
  const hour = useWeatherStore((s) => s.forecastHour)
  const [gridTick, setGridTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => subscribeForecast(() => setGridTick((t) => t + 1)), [])

  // fetch field when activated & when the view moves
  useEffect(() => {
    if (!active) return
    const fetchBounds = () => {
      const b = map.getBounds()
      requestForecast(
        {
          latMin: b.getSouth(),
          latMax: b.getNorth(),
          lonMin: b.getWest(),
          lonMax: b.getEast(),
        },
        20
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

      // paint grid values into a tiny offscreen canvas (n × n), then upscale smoothly
      const off = document.createElement('canvas')
      off.width = n
      off.height = n
      const octx = off.getContext('2d')
      if (!octx) return
      const img = octx.createImageData(n, n)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = grid[i * n + j]
          const arr = field === 'precip' ? p?.precip : field === 'temp' ? p?.temp : p?.clouds
          const v = arr?.[hi] ?? NaN
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

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, rx, ry, rw, rh)

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
          if (field === 'precip' && v < 0.25) continue
          const pt = map.latLngToContainerPoint([p.lat, p.lon])
          if (pt.x < 10 || pt.x > w - 10 || pt.y < 10 || pt.y > h - 10) continue
          const label =
            field === 'precip' ? `${faNum(v, 1)}` : `${faNum(Math.round(v))}°`
          ctx.fillStyle =
            field === 'precip'
              ? v >= 4
                ? 'rgba(255,255,255,0.98)'
                : 'rgba(240,255,245,0.92)'
              : 'rgba(255,255,255,0.95)'
          ctx.fillText(label, pt.x, pt.y)
          if (field === 'precip' && v >= 0.25) {
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
