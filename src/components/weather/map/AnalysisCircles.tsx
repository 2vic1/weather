'use client'

import { useEffect, useState } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useWeatherStore } from '@/store/weather-store'
import type { AnalysisFieldData } from '@/lib/weather-types'
import { aqColor, aqLabel, capeColor, capeLabel } from '@/lib/analysis-scale'
import { faNum } from '@/lib/format'

/**
 * Live analysis dots for ~40 key Iranian cities:
 * - AQ layer: filled circles colored by PM2.5 (Iran AQ bands), PM10/dust in tooltip
 * - CAPE layer: rings colored by instability (thunderstorm potential)
 * Both drawn as one set — CAPE renders as a ring around the AQ dot when both on.
 */
export default function AnalysisCircles() {
  const aqOn = useWeatherStore((s) => s.overlays.aq)
  const capeOn = useWeatherStore((s) => s.overlays.cape)
  const setCity = useWeatherStore((s) => s.setCity)
  const setMobilePanelOpen = useWeatherStore((s) => s.setMobilePanelOpen)
  const [data, setData] = useState<AnalysisFieldData | null>(null)

  const visible = aqOn || capeOn

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const load = () =>
      fetch('/api/analysisfield')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: AnalysisFieldData) => {
          if (!cancelled) setData(d)
        })
        .catch(() => {})
    load()
    const iv = setInterval(load, 10 * 60_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [visible])

  if (!visible || !data) return null

  const bothOn = aqOn && capeOn

  return (
    <>
      {capeOn &&
        data.cape.points.map((p) =>
          Number.isFinite(p.cape) ? (
            <CircleMarker
              key={`cape-${p.name}`}
              center={[p.lat, p.lon]}
              radius={bothOn ? 12 : 14}
              pathOptions={{
                color: capeColor(p.cape),
                weight: 2.5,
                fillColor: capeColor(p.cape),
                fillOpacity: 0.12,
              }}
              eventHandlers={{
                click: () => {
                  setCity({ name: p.name, province: p.province, lat: p.lat, lon: p.lon, source: 'iran' })
                  setMobilePanelOpen(true)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1} className="analysis-tooltip">
                <div className="text-[11px] font-bold">{p.name}</div>
                <div>
                  CAPE: {faNum(Math.round(p.cape), 0)} J/kg — {capeLabel(p.cape)}
                </div>
              </Tooltip>
            </CircleMarker>
          ) : null
        )}

      {aqOn &&
        data.aq.points.map((p) =>
          Number.isFinite(p.pm25) ? (
            <CircleMarker
              key={`aq-${p.name}`}
              center={[p.lat, p.lon]}
              radius={p.hot ? 7.5 : 6}
              pathOptions={{
                color: 'rgba(255,255,255,.85)',
                weight: 1,
                fillColor: aqColor(p.pm25),
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => {
                  setCity({ name: p.name, province: p.province, lat: p.lat, lon: p.lon, source: 'iran' })
                  setMobilePanelOpen(true)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1} className="analysis-tooltip">
                <div className="text-[11px] font-bold">{p.name}</div>
                <div>
                  PM۲٫۵: {faNum(Math.round(p.pm25), 0)} — {aqLabel(p.pm25)}
                </div>
                {Number.isFinite(p.pm10) && <div>PM۱۰: {faNum(Math.round(p.pm10), 0)}</div>}
                {Number.isFinite(p.dust) && p.dust > 50 && (
                  <div className="text-amber-400">غبار: {faNum(Math.round(p.dust), 0)} µg/m³</div>
                )}
              </Tooltip>
            </CircleMarker>
          ) : null
        )}
    </>
  )
}
