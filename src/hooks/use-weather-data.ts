'use client'

import { useEffect, useRef, useState } from 'react'
import type { CityPoint, WeatherData, AtmosphereData } from '@/lib/weather-types'

function keyOf(city: CityPoint): string {
  return `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`
}

/** Fetch full weather for a city with abort + cache per key */
export function useWeather(city: CityPoint) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, WeatherData>())

  useEffect(() => {
    const key = keyOf(city)
    const cached = cacheRef.current.get(key)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 5 * 60_000) {
      setData(cached)
      setLoading(false)
      setError(null)
      return
    }

    const ctrl = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/weather?lat=${city.lat}&lon=${city.lon}`, {
          signal: ctrl.signal,
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
        }
        const d = (await r.json()) as WeatherData
        cacheRef.current.set(key, d)
        setData(d)
        setLoading(false)
      } catch (e) {
        const err = e as Error
        if (err.name === 'AbortError') return
        setError(err.message || 'خطا در دریافت داده')
        setLoading(false)
      }
    }
    void run()
    return () => ctrl.abort()
  }, [city])

  return { data, loading, error }
}

/** Fetch atmosphere pressure-level data */
export function useAtmosphere(city: CityPoint) {
  const [data, setData] = useState<AtmosphereData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/atmosphere?lat=${city.lat}&lon=${city.lon}`, {
          signal: ctrl.signal,
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
        }
        const d = (await r.json()) as AtmosphereData
        setData(d)
        setLoading(false)
      } catch (e) {
        const err = e as Error
        if (err.name === 'AbortError') return
        setError(err.message || 'خطا در داده‌های جو')
        setLoading(false)
      }
    }
    void run()
    return () => ctrl.abort()
  }, [city])

  return { data, loading, error }
}
