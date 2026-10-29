'use client'

import { TileLayer } from 'react-leaflet'
import { useWeatherStore } from '@/store/weather-store'

/**
 * Zoom.Earth-style NASA GIBS daily layers:
 * - truecolor: VIIRS Suomi-NPP corrected-reflectance natural-colour mosaic
 *   (the iconic "real Earth from space" look, refreshed daily)
 * - fires: VIIRS NOAA-20 375 m thermal anomalies — live hotspots / wildfire
 *   detections (red-yellow dots), same detection feed Zoom.Earth uses.
 * GIBS publishes with ~1 day latency → yesterday UTC, like DustTiles.
 */
export default function NasaTiles() {
  const truecolorOn = useWeatherStore((s) => s.overlays.truecolor)
  const firesOn = useWeatherStore((s) => s.overlays.fires)

  const date = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)

  return (
    <>
      {truecolorOn && (
        <TileLayer
          key={`gibs-truecolor-${date}`}
          url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
          attribution="True-colour imagery &copy; NASA GIBS (VIIRS/Suomi-NPP)"
          opacity={0.92}
          zIndex={310}
          maxNativeZoom={9}
          maxZoom={12}
        />
      )}
      {firesOn && (
        <TileLayer
          key={`gibs-fires-${date}`}
          url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_Thermal_Anomalies_375m_All/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`}
          attribution="Thermal anomalies (fires) &copy; NASA GIBS (VIIRS/NOAA-20)"
          opacity={0.9}
          zIndex={335}
          maxNativeZoom={9}
          maxZoom={14}
        />
      )}
    </>
  )
}
