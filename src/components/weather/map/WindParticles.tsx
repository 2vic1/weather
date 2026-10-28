'use client'

import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useWeatherStore } from '@/store/weather-store'
import {
  getGridState,
  requestGrid,
  sampleGrid,
  subscribeGrid,
} from './gridCache'

interface Particle {
  lat: number
  lon: number
  px: number
  py: number
  age: number
  maxAge: number
}

function speedColor(speed: number): string {
  if (speed < 5) return 'rgba(150, 180, 235, 0.55)'
  if (speed < 12) return 'rgba(130, 210, 230, 0.65)'
  if (speed < 22) return 'rgba(120, 235, 205, 0.75)'
  if (speed < 35) return 'rgba(160, 245, 160, 0.85)'
  if (speed < 50) return 'rgba(250, 230, 120, 0.9)'
  return 'rgba(255, 160, 110, 0.95)'
}

export default function WindParticles() {
  const map = useMap()
  const active = useWeatherStore((s) => s.overlays.wind)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const [gridTick, setGridTick] = useState(0)

  // subscribe to grid changes
  useEffect(() => {
    return subscribeGrid(() => setGridTick((t) => t + 1))
  }, [])

  // request grid on mount / move
  useEffect(() => {
    if (!active) return
    const b = map.getBounds()
    requestGrid('wind', b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), 9)
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMove = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const bb = map.getBounds()
        requestGrid('wind', bb.getSouth(), bb.getNorth(), bb.getWest(), bb.getEast(), 9)
      }, 700)
    }
    map.on('moveend', onMove)
    return () => {
      map.off('moveend', onMove)
      if (timer) clearTimeout(timer)
    }
  }, [active, map])

  useEffect(() => {
    if (!active) return
    const container = map.getContainer()
    const canvas = L.DomUtil.create('canvas', 'wind-particle-canvas') as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '402'
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

    const ctx = canvas.getContext('2d')

    const randomInBounds = (): { lat: number; lon: number } | null => {
      const b = map.getBounds().pad(-0.05)
      const lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth())
      const lon = b.getWest() + Math.random() * (b.getEast() - b.getWest())
      return { lat, lon }
    }

    const ensureParticles = () => {
      const target = Math.min(
        700,
        Math.max(350, Math.round((container.clientWidth * container.clientHeight) / 2600))
      )
      const arr = particlesRef.current
      while (arr.length < target) {
        const p = randomInBounds()
        if (!p) break
        arr.push({
          ...p,
          px: NaN,
          py: NaN,
          age: Math.random() * 120,
          maxAge: 60 + Math.random() * 110,
        })
      }
      if (arr.length > target) arr.length = target
    }

    const clearTrails = () => {
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onZoomStart = () => clearTrails()
    map.on('zoomstart', onZoomStart)

    let lastTime = performance.now()
    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step)
      if (!ctx) return
      const dt = Math.min(48, now - lastTime) / 16.67 // in 16ms frames
      lastTime = now

      const g = getGridState('wind').grid
      // fade previous trails (keep transparency over map)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.075)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = 1.25
      ctx.lineCap = 'round'

      if (!g) return
      ensureParticles()
      const b = map.getBounds()
      const zoom = map.getZoom()
      // geographic step scaling: faster at low zoom
      const stepK = 0.5 / Math.pow(2, Math.max(0, zoom - 4))

      for (const p of particlesRef.current) {
        const sample = sampleGrid(g, p.lat, p.lon)
        if (!sample) {
          p.age = p.maxAge
          continue
        }
        const prevX = p.px
        const prevY = p.py

        // move geographically (km/h → deg/frame)
        const dLat = (sample.v * stepK * dt) / 111
        const dLon =
          (sample.u * stepK * dt) / (111 * Math.cos((p.lat * Math.PI) / 180) || 1)
        p.lat += dLat
        p.lon += dLon
        p.age += dt

        const pt = map.latLngToContainerPoint([p.lat, p.lon])
        p.px = pt.x
        p.py = pt.y

        const out =
          p.lat < b.getSouth() - 1 ||
          p.lat > b.getNorth() + 1 ||
          p.lon < b.getWest() - 1 ||
          p.lon > b.getEast() + 1 ||
          p.age > p.maxAge

        if (out) {
          const np = randomInBounds()
          if (np) {
            p.lat = np.lat
            p.lon = np.lon
            p.px = NaN
            p.py = NaN
            p.age = 0
            p.maxAge = 60 + Math.random() * 110
          }
          continue
        }

        if (!Number.isNaN(prevX) && !Number.isNaN(prevY)) {
          ctx.strokeStyle = speedColor(sample.speed)
          ctx.beginPath()
          ctx.moveTo(prevX, prevY)
          ctx.lineTo(p.px, p.py)
          ctx.stroke()
        }
      }
    }

    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      map.off('resize', resize)
      map.off('zoomstart', onZoomStart)
      canvas.remove()
      canvasRef.current = null
      particlesRef.current = []
    }
  }, [active, map, gridTick])

  return null
}
