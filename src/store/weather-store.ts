'use client'

import { create } from 'zustand'
import type {
  CityPoint,
  CurrentWeather,
  ForecastFieldId,
  RainViewerData,
} from '@/lib/weather-types'

export type BaseLayerId = 'dark' | 'light' | 'satellite' | 'terrain'
export type OverlayId = 'radar' | 'satellite' | 'wind' | 'temp' | 'tropical' | 'fx' | 'forecast'
export type TimelineMode = 'radar' | 'satellite' | 'forecast'
export type SidebarTab = 'current' | 'hourly' | 'daily' | 'rain' | 'atmosphere' | 'ai'

export interface RainFrame {
  time: number
  path: string
  nowcast: boolean
}

interface WeatherStore {
  // selection
  city: CityPoint
  setCity: (c: CityPoint) => void
  pickMode: boolean
  setPickMode: (v: boolean) => void

  // map fly-to queue
  flyTarget: { lat: number; lon: number; zoom: number; ts: number } | null
  flyTo: (lat: number, lon: number, zoom: number) => void

  /** live map view (updated on moveend/zoomend) — used to show/hide the "back to overview" button */
  mapView: { zoom: number; lat: number; lon: number }
  setMapView: (v: { zoom: number; lat: number; lon: number }) => void

  // map layers
  baseLayer: BaseLayerId
  setBaseLayer: (b: BaseLayerId) => void
  overlays: Record<OverlayId, boolean>
  toggleOverlay: (id: OverlayId) => void

  /** RainViewer color palette (0..8) for radar / tropical layer */
  radarColor: number
  setRadarColor: (c: number) => void

  // animated model forecast (Windy-style)
  forecastField: ForecastFieldId
  setForecastField: (f: ForecastFieldId) => void
  forecastHour: number
  setForecastHour: (h: number) => void

  // timeline (radar/satellite animation)
  timelineMode: TimelineMode
  setTimelineMode: (m: TimelineMode) => void
  frames: RainFrame[]
  satFrames: RainFrame[]
  host: string
  frameIndex: number
  satIndex: number
  setFrameIndex: (i: number) => void
  setSatIndex: (i: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  setRainViewer: (d: RainViewerData) => void

  // live current weather of selected city (shared for storm effects / panels)
  currentWeather: CurrentWeather | null
  setCurrentWeather: (c: CurrentWeather | null) => void

  // sidebar
  tab: SidebarTab
  setTab: (t: SidebarTab) => void
  mobilePanelOpen: boolean
  setMobilePanelOpen: (v: boolean) => void
}

export const DEFAULT_CITY: CityPoint = {
  name: 'تهران',
  province: 'تهران',
  lat: 35.6892,
  lon: 51.389,
  isCapital: true,
  source: 'iran',
}

export const useWeatherStore = create<WeatherStore>((set) => ({
  city: DEFAULT_CITY,
  setCity: (c) => set({ city: c, mobilePanelOpen: false }),
  pickMode: false,
  setPickMode: (v) => set({ pickMode: v }),

  flyTarget: null,
  flyTo: (lat, lon, zoom) => set({ flyTarget: { lat, lon, zoom, ts: Date.now() } }),

  mapView: { zoom: 5, lat: 32.6, lon: 52.5 },
  setMapView: (v) => set({ mapView: v }),

  baseLayer: 'dark',
  setBaseLayer: (b) => set({ baseLayer: b }),
  overlays: {
    radar: true,
    satellite: false,
    wind: true,
    temp: false,
    tropical: false,
    fx: true,
    forecast: false,
  },
  toggleOverlay: (id) =>
    set((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })),

  radarColor: 4,
  setRadarColor: (c) => set({ radarColor: Math.min(Math.max(Math.round(c), 0), 8) }),

  forecastField: 'precip',
  setForecastField: (f) => set({ forecastField: f }),
  forecastHour: 0,
  setForecastHour: (h) => set({ forecastHour: Math.max(0, Math.round(h)) }),

  timelineMode: 'radar',
  setTimelineMode: (m) => set({ timelineMode: m }),
  frames: [],
  satFrames: [],
  host: 'https://tilecache.rainviewer.com',
  frameIndex: 0,
  satIndex: 0,
  setFrameIndex: (i) => set({ frameIndex: i }),
  setSatIndex: (i) => set({ satIndex: i }),
  playing: true,
  setPlaying: (p) => set({ playing: p }),
  setRainViewer: (d) => {
    const frames = [
      ...d.radar.past.map((f) => ({ ...f, nowcast: false })),
      ...d.radar.nowcast.map((f) => ({ ...f, nowcast: true })),
    ]
    const satFrames = (d.satellite ?? []).map((f) => ({ ...f, nowcast: false }))
    set((s) => ({
      frames,
      satFrames,
      host: d.host,
      frameIndex: Math.min(Math.max(frames.length - 4, 0), Math.max(frames.length - 1, 0)),
      satIndex: Math.min(s.satIndex, Math.max(satFrames.length - 1, 0)),
    }))
  },

  currentWeather: null,
  setCurrentWeather: (c) => set({ currentWeather: c }),

  tab: 'current',
  setTab: (t) => set({ tab: t }),
  mobilePanelOpen: false,
  setMobilePanelOpen: (v) => set({ mobilePanelOpen: v }),
}))
