'use client'

import { useMemo } from 'react'
import { TileLayer } from 'react-leaflet'
import { useWeatherStore } from '@/store/weather-store'

const GIBS_MAX = 9
const WINDOW = 4 // mounted layers around the active frame (rate-limit friendly)

/** Yesterday's UTC date for NASA GIBS daily imagery */
function gibsDate(): string {
  const d = new Date(Date.now() - 24 * 3600_000)
  return d.toISOString().slice(0, 10)
}

/**
 * RainViewer frames as stacked tile layers (only active frame visible),
 * mounted in a sliding window around the current frame.
 * Falls back to NASA GIBS MODIS true-color when satellite frames are unavailable.
 */
export default function AnimatedTiles() {
  const frames = useWeatherStore((s) => s.frames)
  const host = useWeatherStore((s) => s.host)
  const frameIndex = useWeatherStore((s) => s.frameIndex)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const radarOn = useWeatherStore((s) => s.overlays.radar)
  const satelliteOn = useWeatherStore((s) => s.overlays.satellite)

  const visible = timelineMode === 'radar' ? radarOn : satelliteOn

  const { windowed, activeTime } = useMemo(() => {
    const modeList =
      timelineMode === 'radar'
        ? frames // past + nowcast
        : frames.filter((f) => !f.nowcast) // satellite: past only
    const active = frames[frameIndex]
    const activeIdx = active ? modeList.findIndex((f) => f.time === active.time) : -1
    const activeTime = active?.time ?? 0
    const windowed =
      activeIdx >= 0
        ? modeList.filter((_, i) => Math.abs(i - activeIdx) <= WINDOW)
        : modeList.slice(-5)
    return { windowed, activeTime }
  }, [frames, frameIndex, timelineMode])

  const layers = useMemo(
    () =>
      windowed.map((f, i) => {
        const isRadar = timelineMode === 'radar'
        const color = isRadar ? 4 : 0
        const opts = isRadar ? '1_1' : '0_0'
        const url = `${host}${f.path}/256/{z}/{x}/{y}/${color}/${opts}.png`
        const opacity = f.time === activeTime ? (isRadar ? 0.85 : 0.75) : 0
        return (
          <TileLayer
            key={`${timelineMode}-${f.time}-${f.path}`}
            url={url}
            opacity={opacity}
            zIndex={340 + i}
            maxNativeZoom={7}
            maxZoom={14}
          />
        )
      }),
    [windowed, host, activeTime, timelineMode]
  )

  return (
    <>
      {visible && layers}
      {visible && timelineMode === 'satellite' && windowed.length === 0 && (
        <TileLayer
          key={`gibs-${gibsDate()}`}
          url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
          opacity={0.9}
          zIndex={345}
          maxNativeZoom={GIBS_MAX}
          maxZoom={14}
        />
      )}
    </>
  )
}
