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
 * - radar mode: past + nowcast, selectable color palette (radarColor)
 * - satellite mode: RainViewer IR frames; falls back to NASA GIBS MODIS true-color
 *   when no satellite frames are available.
 * Tropical overlay shares the radar product with the user-chosen palette.
 */
export default function AnimatedTiles() {
  const frames = useWeatherStore((s) => s.frames)
  const satFrames = useWeatherStore((s) => s.satFrames)
  const host = useWeatherStore((s) => s.host)
  const frameIndex = useWeatherStore((s) => s.frameIndex)
  const satIndex = useWeatherStore((s) => s.satIndex)
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const radarFuture = useWeatherStore((s) => s.radarFuture)
  const radarOn = useWeatherStore((s) => s.overlays.radar)
  const satelliteOn = useWeatherStore((s) => s.overlays.satellite)
  const tropicalOn = useWeatherStore((s) => s.overlays.tropical)
  const radarColor = useWeatherStore((s) => s.radarColor)

  const isRadarMode = timelineMode === 'radar'
  // tropical supersedes plain radar (same product, different palette/settings)
  // forecast mode renders its own model field on canvas — hide tile overlays.
  // radar mode in the model zone (beyond the last radar frame) also hides tiles.
  const visible =
    timelineMode === 'forecast'
      ? false
      : isRadarMode
        ? !radarFuture && (radarOn || tropicalOn)
        : satelliteOn

  const modeList = isRadarMode ? frames : satFrames
  const activeIndex = isRadarMode ? frameIndex : satIndex

  const { windowed, activeTime } = useMemo(() => {
    const active = modeList[activeIndex]
    const activeTime = active?.time ?? 0
    const activeIdx = active ? modeList.findIndex((f) => f.time === active.time) : -1
    const windowed =
      activeIdx >= 0
        ? modeList.filter((_, i) => Math.abs(i - activeIdx) <= WINDOW)
        : modeList.slice(-5)
    return { windowed, activeTime }
  }, [modeList, activeIndex])

  const layers = useMemo(
    () =>
      windowed.map((f, i) => {
        // radar: opts '1_1' (smooth + snow), satellite IR: '0_0'
        const opts = isRadarMode ? '1_1' : '0_0'
        // radar/tropical use the user palette; IR satellite classic look = 0
        const color = isRadarMode ? radarColor : 0
        const url = `${host}${f.path}/256/{z}/{x}/{y}/${color}/${opts}.png`
        const opacity = f.time === activeTime ? (isRadarMode ? (tropicalOn ? 0.9 : 0.85) : 0.8) : 0
        return (
          <TileLayer
            key={`${timelineMode}-${f.time}-${f.path}-${color}`}
            url={url}
            opacity={opacity}
            zIndex={340 + i}
            maxNativeZoom={7}
            maxZoom={14}
          />
        )
      }),
    [windowed, host, activeTime, isRadarMode, radarColor, tropicalOn, timelineMode]
  )

  return (
    <>
      {visible && layers}
      {visible && !isRadarMode && windowed.length === 0 && (
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
