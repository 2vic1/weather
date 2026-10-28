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

export default function TempHeatmap() {
  const map = useMap()
  const active = useWeatherStore((s) => s.overlays.temp)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [gridTick, setGridTick] = useState(0)

  useEffect(() => {
    return subscribeGrid(() => setGridTick((t) => t + 1))
  }, [])

  useEffect(() => {
    if (!active) return
    const b = map.getBounds()
    requestGrid(b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), 9)
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMove = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const bb = map.getBounds()
        requestGrid(bb.getSouth(), bb.getNorth(), bb.getWest(), bb.getEast(), 9)
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

      const g = getGridState().grid
      if (!g) return

      const w = container.clientWidth
      const h = container.clientHeight
      const radius = Math.max(30, Math.min(70, w / 14))
      const zoom = map.getZoom()
      const showLabels = zoom >= 7

      // paint grid points
      ctx.globalCompositeOperation = 'source-over'
      for (const p of g.points) {
        if (p.lat < g.latMin || p.lat > g.latMax) continue
        const pt = map.latLngToContainerPoint([p.lat, p.lon])
        if (pt.x < -radius || pt.x > w + radius || pt.y < -radius || pt.y > h + radius) continue
        const sample = sampleGrid(g, p.lat, p.lon)
        if (!sample || Number.isNaN(sample.temp)) continue
        const [r, gg, b] = tempColor(sample.temp)
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius)
        grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 0.34)`)
        grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
        ctx.fill()

        if (showLabels) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(0,0,0,0.8)'
          ctx.shadowBlur = 4
          ctx.fillText(`${Math.round(sample.temp)}°`, pt.x, pt.y)
          ctx.shadowBlur = 0
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
