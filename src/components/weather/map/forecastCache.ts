'use client'

// Client cache for the animated model forecast field (grid × hourly series).
// Shared by ForecastField (canvas renderer) and TimelineControl (labels/playback).

import { useSyncExternalStore } from 'react'
import type { ForecastFieldId, ForecastFieldPoint } from '@/lib/weather-types'

export interface ForecastBounds {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

export interface ForecastState {
  points: ForecastFieldPoint[] | null
  times: string[]
  n: number
  bounds: ForecastBounds | null
  loading: boolean
  error: boolean
  synthetic: boolean
  fetchedAt: number
  lastAttempt: number
}

let state: ForecastState = {
  points: null,
  times: [],
  n: 0,
  bounds: null,
  loading: false,
  error: false,
  synthetic: false,
  fetchedAt: 0,
  lastAttempt: 0,
}

let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeForecast(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getForecastState(): ForecastState {
  return state
}

/** React hook — re-renders whenever the forecast field cache changes */
export function useForecastState(): ForecastState {
  return useSyncExternalStore(subscribeForecast, getForecastState, getForecastState)
}

function shouldRefetch(b: ForecastBounds): boolean {
  const g = state.bounds
  if (!g) return true
  const age = Date.now() - state.fetchedAt
  // simulated fields are re-checked every 4 min so real data replaces them
  // within minutes of the upstream quota resetting (real data: 45 min)
  const freshMs = state.synthetic ? 4 * 60_000 : 45 * 60_000
  // the server returns a super-region (view + margin) — reuse it while the
  // requested view stays comfortably inside and data is fresh
  if (!state.error && age < freshMs) {
    const mLat = (g.latMax - g.latMin) * 0.12
    const mLon = (g.lonMax - g.lonMin) * 0.12
    if (
      b.latMin >= g.latMin - mLat &&
      b.latMax <= g.latMax + mLat &&
      b.lonMin >= g.lonMin - mLon &&
      b.lonMax <= g.lonMax + mLon
    )
      return false
  }
  // after an error, back off so quota-dead upstream isn’t hammered
  if (state.error) return Date.now() - state.lastAttempt > 45_000
  if (Date.now() - state.fetchedAt > 15 * 60_000) return true
  // view drifted far out of the cached region → need a new region
  const cLat = (b.latMin + b.latMax) / 2
  const cLon = (b.lonMin + b.lonMax) / 2
  const gLat = (g.latMin + g.latMax) / 2
  const gLon = (g.lonMin + g.lonMax) / 2
  const gSpanLat = Math.abs(g.latMax - g.latMin)
  const gSpanLon = Math.abs(g.lonMax - g.lonMin)
  if (Math.abs(cLat - gLat) > gSpanLat * 0.35 || Math.abs(cLon - gLon) > gSpanLon * 0.35) return true
  return false
}

export function requestForecast(b: ForecastBounds, res = 20): void {
  if (inflight) return
  if (!shouldRefetch(b)) return

  const params = new URLSearchParams({
    latMin: b.latMin.toFixed(2),
    latMax: b.latMax.toFixed(2),
    lonMin: b.lonMin.toFixed(2),
    lonMax: b.lonMax.toFixed(2),
    res: String(res),
  })

  state = { ...state, loading: true, error: false, lastAttempt: Date.now() }
  emit()

  inflight = fetch(`/api/forecastfield?${params}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(
      (d: {
        points: ForecastFieldPoint[]
        times: string[]
        n: number
        bounds: ForecastBounds
        synthetic?: boolean
      }) => {
        state = {
          points: d.points,
          times: d.times ?? [],
          n: d.n,
          bounds: d.bounds,
          loading: false,
          error: false,
          synthetic: Boolean(d.synthetic),
          fetchedAt: Date.now(),
          lastAttempt: Date.now(),
        }
        emit()
      }
    )
    .catch(() => {
      state = { ...state, loading: false, error: true, lastAttempt: Date.now() }
      emit()
    })
    .finally(() => {
      inflight = null
    })
}

/** Bilinear sample of one variable at (lat, lon) for hour index */
export function sampleForecast(
  lat: number,
  lon: number,
  hour: number,
  field: ForecastFieldId
): number {
  const { points, n, bounds } = state
  if (!points || !bounds || n < 2) return NaN
  const { latMin, latMax, lonMin, lonMax } = bounds
  const fx = ((lon - lonMin) / (lonMax - lonMin)) * (n - 1)
  const fy = ((lat - latMin) / (latMax - latMin)) * (n - 1)
  const x0 = Math.max(0, Math.min(n - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(n - 1, Math.floor(fy)))
  const x1 = Math.min(n - 1, x0 + 1)
  const y1 = Math.min(n - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))

  const val = (xi: number, yi: number): number => {
    const p = points[yi * n + xi]
    if (!p) return NaN
    const arr = field === 'precip' ? p.precip : field === 'temp' ? p.temp : p.clouds
    return arr[hour] ?? NaN
  }

  const p00 = val(x0, y0)
  const p10 = val(x1, y0)
  const p01 = val(x0, y1)
  const p11 = val(x1, y1)
  const mix = (a: number, b: number) => a * (1 - tx) + b * tx
  const mixY = (a: number, b: number) => a * (1 - ty) + b * ty
  return mixY(mix(p00, p10), mix(p01, p11))
}
