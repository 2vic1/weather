'use client'

import { create } from 'zustand'
import type { CityPoint, RainViewerData } from '@/lib/weather-types'

export type BaseLayerId = 'dark' | 'light' | 'satellite' | 'terrain'
export type OverlayId = 'radar' | 'satellite' | 'wind' | 'temp'
export type TimelineMode = 'radar' | 'satellite'
export type SidebarTab = 'current' | 'hourly' | 'daily' | 'atmosphere' | 'ai'

interface WeatherStore {
  // selection
  city: CityPoint
  setCity: (c: CityPoint) => void
  pickMode: boolean
  setPickMode: (v: boolean) => void

  // map fly-to queue
  flyTarget: { lat: number; lon: number; zoom: number; ts: number } | null
  flyTo: (lat: number, lon: number, zoom: number) => void

  // map layers
  baseLayer: BaseLayerId
  setBaseLayer: (b: BaseLayerId) => void
  overlays: Record<OverlayId, boolean>
  toggleOverlay: (id: OverlayId) => void

  // timeline (radar/satellite animation)
  timelineMode: TimelineMode
  setTimelineMode: (m: TimelineMode) => void
  frames: { time: number; path: string; nowcast: boolean }[]
  host: string
  frameIndex: number
  setFrameIndex: (i: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  setRainViewer: (d: RainViewerData) => void

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

  baseLayer: 'dark',
  setBaseLayer: (b) => set({ baseLayer: b }),
  overlays: { radar: true, satellite: false, wind: true, temp: false },
  toggleOverlay: (id) =>
    set((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })),

  timelineMode: 'radar',
  setTimelineMode: (m) => set({ timelineMode: m }),
  frames: [],
  host: 'https://tilecache.rainviewer.com',
  frameIndex: 0,
  setFrameIndex: (i) => set({ frameIndex: i }),
  playing: true,
  setPlaying: (p) => set({ playing: p }),
  setRainViewer: (d) => {
    const frames = [
      ...d.radar.past.map((f) => ({ ...f, nowcast: false })),
      ...d.radar.nowcast.map((f) => ({ ...f, nowcast: true })),
    ]
    set({ frames, host: d.host, frameIndex: Math.max(frames.length - 4, 0) })
  },

  tab: 'current',
  setTab: (t) => set({ tab: t }),
  mobilePanelOpen: false,
  setMobilePanelOpen: (v) => set({ mobilePanelOpen: v }),
}))
