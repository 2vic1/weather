'use client'

// Shared in-memory grid cache for wind/temp map overlays.
// Two named fields: 'wind' (coarse, for particles) and 'temp' (dense, for heatmap).
// Both subscribe to the same global listener set.

import type { WindGridPoint } from '@/lib/weather-types'

export type FieldName = 'wind' | 'temp'

export interface GridData {
  points: WindGridPoint[]
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
  n: number
}

type GridState = {
  grid: GridData | null
  loading: boolean
  error: boolean
}

const emptyState = (): GridState => ({ grid: null, loading: false, error: false })

const states: Record<FieldName, GridState> = {
  wind: emptyState(),
  temp: emptyState(),
}
const inflights: Partial<Record<FieldName, Promise<void> | null>> = {}
const listeners = new Set<() => void>()

const ENDPOINTS: Record<FieldName, string> = {
  wind: '/api/windfield',
  temp: '/api/tempfield',
}

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeGrid(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getGridState(name: FieldName = 'wind'): GridState {
  return states[name]
}

/** Should we refetch? Compare center distance + zoom delta with last fetch */
function shouldRefetch(g: GridData | null, latMin: number, latMax: number, lonMin: number, lonMax: number): boolean {
  if (!g) return true
  const dcLat = Math.abs((latMin + latMax) / 2 - (g.latMin + g.latMax) / 2)
  const dcLon = Math.abs((lonMin + lonMax) / 2 - (g.lonMin + g.lonMax) / 2)
  const spanLat = Math.abs(latMax - latMin)
  const spanLon = Math.abs(lonMax - lonMin)
  const gSpanLat = Math.abs(g.latMax - g.latMin)
  const gSpanLon = Math.abs(g.lonMax - g.lonMin)
  // refetch if center moved by > 35% of viewport span or zoom (span) changed by > 50%
  if (dcLat > spanLat * 0.35 || dcLon > spanLon * 0.35) return true
  if (Math.abs(spanLat - gSpanLat) > gSpanLat * 0.5) return true
  if (Math.abs(spanLon - gSpanLon) > gSpanLon * 0.5) return true
  return false
}

export function requestGrid(
  name: FieldName,
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  res = 9,
  padRatio = 0.35
): void {
  const state = states[name]
  if (!shouldRefetch(state.grid, latMin, latMax, lonMin, lonMax)) return
  if (inflights[name]) return

  // pad bounds so particles cover panning margin
  const padLat = (latMax - latMin) * padRatio + 0.8
  const padLon = (lonMax - lonMin) * padRatio + 0.8
  const pLatMin = Math.max(-85, latMin - padLat)
  const pLatMax = Math.min(85, latMax + padLat)
  const pLonMin = Math.max(-179, lonMin - padLon)
  const pLonMax = Math.min(179, lonMax + padLon)

  const params = new URLSearchParams({
    latMin: pLatMin.toFixed(2),
    latMax: pLatMax.toFixed(2),
    lonMin: pLonMin.toFixed(2),
    lonMax: pLonMax.toFixed(2),
    res: String(res),
  })

  states[name] = { ...state, loading: true, error: false }
  emit()

  inflights[name] = fetch(`${ENDPOINTS[name]}?${params}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { points: WindGridPoint[] }) => {
      states[name] = {
        grid: {
          points: data.points,
          latMin: pLatMin,
          latMax: pLatMax,
          lonMin: pLonMin,
          lonMax: pLonMax,
          n: res,
        },
        loading: false,
        error: false,
      }
      emit()
    })
    .catch(() => {
      states[name] = { ...states[name], loading: false, error: true }
      emit()
    })
    .finally(() => {
      inflights[name] = null
    })
}

/** Bilinear sample of wind (u,v in km/h) and temp at a lat/lon */
export function sampleGrid(grid: GridData, lat: number, lon: number) {
  const { latMin, latMax, lonMin, lonMax, n, points } = grid
  const fx = ((lon - lonMin) / (lonMax - lonMin)) * (n - 1)
  const fy = ((lat - latMin) / (latMax - latMin)) * (n - 1)
  const x0 = Math.max(0, Math.min(n - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(n - 1, Math.floor(fy)))
  const x1 = Math.min(n - 1, x0 + 1)
  const y1 = Math.min(n - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))

  const idx = (xi: number, yi: number) => points[yi * n + xi]

  const p00 = idx(x0, y0)
  const p10 = idx(x1, y0)
  const p01 = idx(x0, y1)
  const p11 = idx(x1, y1)

  const mix = (a: number, b: number) => a * (1 - tx) + b * tx
  const mixY = (a: number, b: number) => a * (1 - ty) + b * ty

  const speed = mixY(mix(p00.speed, p10.speed), mix(p01.speed, p11.speed))
  const dir = mixY(mix(p00.dir, p10.dir), mix(p01.dir, p11.dir))
  const temp = mixY(mix(p00.temp, p10.temp), mix(p01.temp, p11.temp))

  if (Number.isNaN(speed) || Number.isNaN(dir)) return null

  // Meteorological dir (from) → u (east), v (north)
  const rad = (dir * Math.PI) / 180
  const u = -speed * Math.sin(rad)
  const v = -speed * Math.cos(rad)
  return { speed, dir, temp, u, v }
}
