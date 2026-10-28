'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Tooltip,
  ZoomControl,
  ScaleControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useWeatherStore } from '@/store/weather-store'
import type { CityPoint } from '@/lib/weather-types'
import { faNum } from '@/lib/format'
import AnimatedTiles from './AnimatedTiles'
import WindParticles from './WindParticles'
import FieldCanvas from './FieldCanvas'
import StormEffects from './StormEffects'

const BASE_LAYERS: Record<
  string,
  { url: string; attribution: string; subdomains?: string; labels?: string; maxNative?: number }
> = {
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ | بارش/ماهواره: RainViewer | داده: Open-Meteo',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    maxNative: 16,
  },
  light: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    maxNative: 16,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maxNative: 17,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Style: &copy; OpenTopoMap',
    subdomains: 'abc',
    maxNative: 15,
  },
}

function BaseLayers() {
  const baseLayer = useWeatherStore((s) => s.baseLayer)
  const cfg = BASE_LAYERS[baseLayer] ?? BASE_LAYERS.dark

  return (
    <>
      <TileLayer
        key={baseLayer}
        url={cfg.url}
        attribution={cfg.attribution}
        subdomains={cfg.subdomains ?? 'abc'}
        maxZoom={18}
        maxNativeZoom={cfg.maxNative ?? 16}
      />
      {cfg.labels && (
        <TileLayer
          key={`${baseLayer}-labels`}
          url={cfg.labels}
          subdomains={cfg.subdomains ?? 'abc'}
          zIndex={320}
          maxZoom={18}
          maxNativeZoom={cfg.maxNative ?? 16}
          opacity={0.95}
        />
      )}
    </>
  )
}

function CityMarkers() {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const [cities, setCities] = useState<CityPoint[]>([])
  const setCity = useWeatherStore((s) => s.setCity)
  const setMobilePanelOpen = useWeatherStore((s) => s.setMobilePanelOpen)
  const selected = useWeatherStore((s) => s.city)

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  useEffect(() => {
    fetch('/api/cities?all=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cities fetch failed'))))
      .then((d) => setCities(d.cities ?? []))
      .catch(() => {})
  }, [])

  const showAllLabels = zoom >= 8
  const showCapitals = zoom >= 5

  const markers = useMemo(
    () =>
      cities.map((c) => {
        const isSelected =
          Math.abs(c.lat - selected.lat) < 0.01 && Math.abs(c.lon - selected.lon) < 0.01
        const labelVisible = c.isCapital ? showCapitals : showAllLabels
        return (
          <CircleMarker
            key={`${c.name}-${c.province}`}
            center={[c.lat, c.lon]}
            radius={c.isCapital ? 4.5 : 2.8}
            pathOptions={{
              color: c.isCapital ? '#67e8f9' : 'rgba(190, 215, 245, 0.75)',
              weight: c.isCapital ? 2 : 1.2,
              fillColor: c.isCapital ? '#0e7490' : 'rgba(120, 160, 210, 0.5)',
              fillOpacity: c.isCapital ? 1 : 0.75,
            }}
            eventHandlers={{
              click: () => {
                setCity({ ...c, source: 'iran' })
                setMobilePanelOpen(true)
              },
            }}
          >
            {labelVisible && (
              <Tooltip
                className="city-label"
                direction="top"
                offset={[0, -6]}
                opacity={1}
                permanent
              >
                {c.name}
              </Tooltip>
            )}
          </CircleMarker>
        )
      }),
    [cities, zoom, showAllLabels, showCapitals, selected, setCity, setMobilePanelOpen]
  )

  return <>{markers}</>
}

function SelectedMarker() {
  const city = useWeatherStore((s) => s.city)
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div style="position:relative;width:26px;height:26px">
          <div style="position:absolute;inset:6px;border-radius:9999px;background:#22d3ee;border:2.5px solid #fff;box-shadow:0 0 10px rgba(34,211,238,.9),0 0 22px rgba(34,211,238,.5)"></div>
          <div class="city-pulse" style="position:absolute;inset:0"></div>
        </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    []
  )
  if (city.source === 'custom') return null
  return <Marker position={[city.lat, city.lon]} icon={icon} zIndexOffset={1000} title={city.name} />
}

/** Reports the live map view (zoom + center) to the store on every move/zoom end */
function ViewTracker() {
  const setMapView = useWeatherStore((s) => s.setMapView)
  useMapEvents({
    moveend: (e) => {
      const m = e.target as L.Map
      const c = m.getCenter()
      setMapView({ zoom: m.getZoom(), lat: c.lat, lon: c.lng })
    },
    zoomend: (e) => {
      const m = e.target as L.Map
      const c = m.getCenter()
      setMapView({ zoom: m.getZoom(), lat: c.lat, lon: c.lng })
    },
  })
  return null
}

function MapController() {
  const map = useMap()
  const city = useWeatherStore((s) => s.city)
  const flyTarget = useWeatherStore((s) => s.flyTarget)
  const pickMode = useWeatherStore((s) => s.pickMode)
  const setCity = useWeatherStore((s) => s.setCity)
  const flyTsRef = useRef(0)

  // fly to external targets (search, region buttons)
  useEffect(() => {
    if (flyTarget && flyTarget.ts !== flyTsRef.current) {
      flyTsRef.current = flyTarget.ts
      map.flyTo([flyTarget.lat, flyTarget.lon], flyTarget.zoom, { duration: 1.4 })
    }
  }, [flyTarget, map])

  // gentle fly when a city is selected (not on first render)
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    const z = map.getZoom()
    if (z < 7) map.flyTo([city.lat, city.lon], 8, { duration: 1.2 })
    else map.panTo([city.lat, city.lon])
  }, [city.lat, city.lon])

  // click-to-pick mode
  useMapEvents({
    click(e) {
      if (!pickMode) return
      setCity({
        name: 'موقعیت انتخابی',
        province: `${faNum(e.latlng.lat, 2)}° شمالی، ${faNum(e.latlng.lng, 2)}° شرقی`,
        lat: e.latlng.lat,
        lon: e.latlng.lng,
        source: 'custom',
      })
    },
  })

  // cursor for pick mode
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode, map])

  return null
}

export default function MapPanel() {
  return (
    <MapContainer
      center={[32.6, 52.5]}
      zoom={5}
      minZoom={3}
      maxZoom={14}
      zoomControl={false}
      worldCopyJump
      className="h-full w-full"
      preferCanvas
    >
      <BaseLayers />
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" metric imperial={false} />
      <CityMarkers />
      <SelectedMarker />
      <AnimatedTiles />
      <WindParticles />
      <FieldCanvas />
      <StormEffects />
      <MapController />
      <ViewTracker />
    </MapContainer>
  )
}
