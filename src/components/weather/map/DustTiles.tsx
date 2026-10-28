'use client'

import { TileLayer } from 'react-leaflet'
import { useWeatherStore } from '@/store/weather-store'

/**
 * NASA GIBS OMPS Aerosol Index — daily dust/aerosol detection from the
 * Suomi-NPP satellite. Red/orange plumes = dust storms (UVAI > 2).
 * Best served at zoom ≤ 6 (native resolution ~0.1°).
 */
export default function DustTiles() {
  const dustOn = useWeatherStore((s) => s.overlays.dust)

  if (!dustOn) return null

  // GIBS publishes the daily mosaic with ~1 day latency → yesterday UTC
  const d = new Date(Date.now() - 24 * 3600_000)
  const date = d.toISOString().slice(0, 10)

  return (
    <TileLayer
      key={`dust-omps-${date}`}
      url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMPS_Aerosol_Index/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`}
      attribution="Aerosol Index &copy; NASA GIBS (OMPS/Suomi-NPP)"
      opacity={0.68}
      zIndex={330}
      maxNativeZoom={6}
      maxZoom={12}
    />
  )
}
