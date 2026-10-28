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
import { tempColor } from '@/lib/weather-codes'
import { faNum } from '@/lib/format'

export default function TempHeatmap() {
  const map = useMap()
  const tempOverlay = useWeatherStore((s) => s.overlays.temp)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  // forecast mode has its own animated temp field — avoid double rendering
  const active = tempOverlay && timelineMode !== 'forecast'
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [gridTick, setGridTick] = useState(0)

  useEffect(() => {
    return subscribeGrid(() => setGridTick((t) => t + 1))
  }, [])

  useEffect(() => {
    if (!active) return
    const b = map.getBounds()
    // dense grid (25×25) with small padding — covers Iran + surroundings
    requestGrid('temp', b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), 25, 0.12)
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMove = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const bb = map.getBounds()
        requestGrid('temp', bb.getSouth(), bb.getNorth(), bb.getWest(), bb.getEast(), 25, 0.12)
      }, 600)
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
    const canvas = L.DomUtil.create('canvas', 'temp-canvas') as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '401'
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)
    canvasRef.current = canvas

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = container.clientWidth * dpr
      canvas.height = container.clientHeight * dpr
      draw()
    }
    resize()
    map.on('resize', resize)
    map.on('moveend', onMoveEnd)
    map.on('zoomend', draw)

    function onMoveEnd() {
      // slight delay lets tile projection settle
      requestAnimationFrame(draw)
    }

    function draw() {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const g = getGridState('temp').grid
      if (!g) return

      const w = container.clientWidth
      const h = container.clientHeight
      const radius = Math.max(34, Math.min(64, w / 18))
      const zoom = map.getZoom()

      // label density by zoom (grid index step)
      const step = zoom < 6 ? 6 : zoom < 7 ? 4 : zoom < 8 ? 3 : zoom < 9 ? 2 : 1

      // paint grid points — smooth overlapping radial gradients
      ctx.globalCompositeOperation = 'source-over'
      let li = 0
      for (let i = 0; i < g.n; i++) {
        for (let j = 0; j < g.n; j++) {
          const p = g.points[i * g.n + j]
          if (!p || Number.isNaN(p.temp)) continue
          if (p.lat < g.latMin || p.lat > g.latMax) continue
          const pt = map.latLngToContainerPoint([p.lat, p.lon])
          if (pt.x < -radius || pt.x > w + radius || pt.y < -radius || pt.y > h + radius) continue
          const [r, gg, b] = tempColor(p.temp)
          const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius)
          grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 0.34)`)
          grad.addColorStop(0.7, `rgba(${r}, ${gg}, ${b}, 0.13)`)
          grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`)
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
          ctx.fill()

          // temperature labels on a zoom-aware sub-grid
          if (i % step === 0 && j % step === 0 && li < 90) {
            const label = `${faNum(Math.round(p.temp))}°`
            ctx.fillStyle = 'rgba(255,255,255,0.95)'
            ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.shadowColor = 'rgba(0,0,0,0.85)'
            ctx.shadowBlur = 4
            ctx.fillText(label, pt.x, pt.y)
            ctx.shadowBlur = 0
            li++
          }
        }
      }
    }

    draw()

    return () => {
      map.off('resize', resize)
      map.off('moveend', onMoveEnd)
      map.off('zoomend', draw)
      canvas.remove()
      canvasRef.current = null
    }
  }, [active, map, gridTick])

  return null
}
