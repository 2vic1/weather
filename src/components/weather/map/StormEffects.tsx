'use client'

/**
 * StormEffects — cinematic, data-driven storm visuals:
 *  1. Cyclone swirls: detects real cyclonic circulation centers (relative vorticity
 *     computed from the live wind field) and renders rotating spiral arms,
 *     pulsing rings and a storm eye — the classic satellite-reel look.
 *  2. Lightning: when thunderstorm conditions exist at the selected city
 *     (weather code 95+ or active precipitation), random flashes strike nearby.
 */

import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useWeatherStore } from '@/store/weather-store'
import { getGridState, requestGrid, subscribeGrid, type GridData } from './gridCache'

interface Vortex {
  lat: number
  lon: number
  strength: number // 0..1
  zeta: number
}

interface Bolt {
  x: number
  y: number
  born: number
  pts: Array<{ x: number; y: number }>
}

/** Detect cyclonic vorticity centers from the wind grid (Northern Hemisphere) */
function detectVortices(grid: GridData, tropical: boolean): Vortex[] {
  const { points, n, latMin, latMax, lonMin, lonMax } = grid
  const dLat = (latMax - latMin) / (n - 1)
  const dLon = (lonMax - lonMin) / (n - 1)

  const uAt = (i: number, j: number): number => {
    const s = points[i * n + j]
    if (!s || Number.isNaN(s.speed) || Number.isNaN(s.dir)) return NaN
    const rad = (s.dir * Math.PI) / 180
    return -s.speed * Math.sin(rad)
  }
  const vAt = (i: number, j: number): number => {
    const s = points[i * n + j]
    if (!s || Number.isNaN(s.speed) || Number.isNaN(s.dir)) return NaN
    const rad = (s.dir * Math.PI) / 180
    return -s.speed * Math.cos(rad)
  }

  const threshold = tropical ? 4.5 : 6
  const candidates: Vortex[] = []

  for (let i = 1; i < n - 1; i++) {
    for (let j = 1; j < n - 1; j++) {
      const dvdx = (vAt(i, j + 1) - vAt(i, j - 1)) / (2 * dLon)
      const dudy = (uAt(i + 1, j) - uAt(i - 1, j)) / (2 * dLat)
      const zeta = dvdx - dudy
      if (!Number.isFinite(zeta)) continue

      // mean wind speed in the 3×3 neighbourhood — needs a real circulation
      let sSum = 0
      let cnt = 0
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const p = points[(i + di) * n + (j + dj)]
          if (p && Number.isFinite(p.speed)) {
            sSum += p.speed
            cnt++
          }
        }
      }
      const meanSpeed = cnt ? sSum / cnt : 0
      if (zeta > threshold && meanSpeed > 10) {
        candidates.push({
          lat: points[i * n + j].lat,
          lon: points[i * n + j].lon,
          strength: Math.min(1, ((zeta - threshold) / 16) * (tropical ? 1.15 : 1)),
          zeta,
        })
      }
    }
  }

  // local maxima only, deduped by ~2.5°, strongest first, max 3
  candidates.sort((a, b) => b.zeta - a.zeta)
  const picked: Vortex[] = []
  for (const c of candidates) {
    const sep = picked.every(
      (p) => Math.hypot(p.lat - c.lat, (p.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)) > 2.5
    )
    if (sep) picked.push(c)
    if (picked.length >= 3) break
  }
  return picked
}

function makeBolt(x: number, y: number, now: number): Bolt {
  const pts: Array<{ x: number; y: number }> = [{ x, y: y - 90 }]
  let cx = x
  const segments = 5 + Math.floor(Math.random() * 3)
  for (let k = 1; k <= segments; k++) {
    cx += (Math.random() - 0.5) * 34
    pts.push({ x: cx, y: y - 90 + (90 * k) / segments })
  }
  pts[pts.length - 1] = { x, y }
  return { x, y, born: now, pts }
}

export default function StormEffects() {
  const map = useMap()
  const fxOn = useWeatherStore((s) => s.overlays.fx)
  const tropicalOn = useWeatherStore((s) => s.overlays.tropical)
  const city = useWeatherStore((s) => s.city)
  const currentWeather = useWeatherStore((s) => s.currentWeather)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vorticesRef = useRef<Vortex[]>([])
  const boltsRef = useRef<Bolt[]>([])
  const [gridTick, setGridTick] = useState(0)

  useEffect(() => {
    return subscribeGrid(() => setGridTick((t) => t + 1))
  }, [])

  // fetch wind grid for vorticity (shared cache with wind particles)
  useEffect(() => {
    if (!fxOn) return
    const load = () => {
      const b = map.getBounds()
      requestGrid('wind', b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), 9, 0.3)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [fxOn, map])

  // recompute vortices when grid updates
  useEffect(() => {
    if (!fxOn) return
    const g = getGridState('wind').grid
    vorticesRef.current = g ? detectVortices(g, tropicalOn) : []
  }, [fxOn, tropicalOn, gridTick])

  useEffect(() => {
    if (!fxOn) return
    const container = map.getContainer()
    const canvas = L.DomUtil.create('canvas', 'storm-fx-canvas') as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '403'
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)
    canvasRef.current = canvas

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = container.clientWidth * dpr
      canvas.height = container.clientHeight * dpr
    }
    resize()
    map.on('resize', resize)

    const start = performance.now()
    let raf = 0
    let lastBoltAttempt = 0

    const drawVortex = (
      ctx: CanvasRenderingContext2D,
      v: Vortex,
      t: number,
      w: number,
      h: number
    ) => {
      const pt = map.latLngToContainerPoint([v.lat, v.lon])
      if (pt.x < -160 || pt.x > w + 160 || pt.y < -160 || pt.y > h + 160) return

      const r0 = Math.max(46, Math.min(120, (w / 12) * (0.55 + v.strength * 0.75)))
      const rotSpeed = 0.55 + v.strength * 1.15
      const rot = t * rotSpeed
      const alpha = 0.28 + v.strength * 0.5

      ctx.save()
      ctx.translate(pt.x, pt.y)

      // expanding pulse rings
      for (let k = 0; k < 3; k++) {
        const phase = (t * 0.45 + k / 3) % 1
        const rr = r0 * (0.25 + 1.05 * phase)
        ctx.beginPath()
        ctx.arc(0, 0, rr, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(150, 235, 255, ${(1 - phase) * 0.32 * (0.5 + v.strength)})`
        ctx.lineWidth = 1.6
        ctx.stroke()
      }

      // spiral arms (counter-clockwise, trailing inward)
      ctx.lineCap = 'round'
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath()
        const steps = 26
        for (let s = 0; s <= steps; s++) {
          const f = s / steps
          const rr = r0 * (0.14 + 0.86 * f)
          const ang = rot + (arm * Math.PI * 2) / 3 - f * Math.PI * 2.35
          const x = Math.cos(ang) * rr
          const y = Math.sin(ang) * rr
          if (s === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(140, 225, 255, ${alpha})`
        ctx.lineWidth = 2.2
        ctx.shadowColor = 'rgba(90, 200, 255, 0.9)'
        ctx.shadowBlur = 10
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // eye
      const eyeR = r0 * 0.13
      const eyeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, eyeR * 2.4)
      eyeGrad.addColorStop(0, 'rgba(10, 20, 35, 0.85)')
      eyeGrad.addColorStop(0.6, 'rgba(60, 180, 255, 0.35)')
      eyeGrad.addColorStop(1, 'rgba(60, 180, 255, 0)')
      ctx.fillStyle = eyeGrad
      ctx.beginPath()
      ctx.arc(0, 0, eyeR * 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, eyeR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(190, 245, 255, ${0.55 + v.strength * 0.4})`
      ctx.lineWidth = 1.6
      ctx.stroke()

      // label
      ctx.font = '600 10px Vazirmatn, Tahoma, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(190, 245, 255, 0.9)'
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 4
      ctx.fillText(v.strength > 0.45 ? 'چرخند قوی' : 'سامانه چرخشی', 0, -r0 - 8)
      ctx.shadowBlur = 0

      ctx.restore()
    }

    const drawBolt = (ctx: CanvasRenderingContext2D, b: Bolt, now: number) => {
      const age = now - b.born
      if (age > 260) return
      const fade = 1 - age / 260
      ctx.save()
      // flash
      const flash = ctx.createRadialGradient(b.x, b.y - 30, 0, b.x, b.y - 30, 130)
      flash.addColorStop(0, `rgba(255, 255, 230, ${0.4 * fade})`)
      flash.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = flash
      ctx.fillRect(b.x - 130, b.y - 160, 260, 260)
      // bolt
      ctx.beginPath()
      ctx.moveTo(b.pts[0].x, b.pts[0].y)
      for (const p of b.pts.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = `rgba(255, 255, 240, ${0.95 * fade})`
      ctx.lineWidth = 2.4
      ctx.shadowColor = 'rgba(180, 220, 255, 1)'
      ctx.shadowBlur = 14
      ctx.stroke()
      ctx.restore()
    }

    const step = (nowMs: number) => {
      raf = requestAnimationFrame(step)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const t = (nowMs - start) / 1000

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const w = container.clientWidth
      const h = container.clientHeight
      const zoom = map.getZoom()
      if (zoom < 3.5) return

      for (const v of vorticesRef.current) drawVortex(ctx, v, t, w, h)

      // lightning near the selected city under storm conditions
      if (currentWeather) {
        const stormy =
          currentWeather.weather_code >= 95 ||
          currentWeather.precipitation >= 0.5 ||
          (currentWeather.cloud_cover > 85 && currentWeather.precipitation > 0.2)
        if (stormy && nowMs - lastBoltAttempt > 400 && Math.random() < 0.09) {
          lastBoltAttempt = nowMs
          const c = map.latLngToContainerPoint([city.lat, city.lon])
          boltsRef.current.push(
            makeBolt(c.x + (Math.random() - 0.5) * 90, c.y + (Math.random() - 0.5) * 70, nowMs)
          )
          if (boltsRef.current.length > 6) boltsRef.current.shift()
        }
      }
      boltsRef.current = boltsRef.current.filter((b) => nowMs - b.born <= 260)
      for (const b of boltsRef.current) drawBolt(ctx, b, nowMs)
    }

    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      map.off('resize', resize)
      canvas.remove()
      canvasRef.current = null
      boltsRef.current = []
    }
  }, [fxOn, map, city, currentWeather, gridTick])

  return null
}
