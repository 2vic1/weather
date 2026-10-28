'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Radar, Satellite, CloudRainWind } from 'lucide-react'
import { useWeatherStore } from '@/store/weather-store'
import type { RainViewerData } from '@/lib/weather-types'
import { unixToFaTime, faTehranHour, faNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getForecastState, useForecastState } from './map/forecastCache'

const FIELD_LABEL: Record<string, string> = {
  precip: 'بارش',
  temp: 'دما',
  clouds: 'ابر',
}

export default function TimelineControl() {
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const frames = useWeatherStore((s) => s.frames)
  const satFrames = useWeatherStore((s) => s.satFrames)
  const frameIndex = useWeatherStore((s) => s.frameIndex)
  const satIndex = useWeatherStore((s) => s.satIndex)
  const setFrameIndex = useWeatherStore((s) => s.setFrameIndex)
  const setSatIndex = useWeatherStore((s) => s.setSatIndex)
  const playing = useWeatherStore((s) => s.playing)
  const setPlaying = useWeatherStore((s) => s.setPlaying)
  const setRainViewer = useWeatherStore((s) => s.setRainViewer)
  const overlays = useWeatherStore((s) => s.overlays)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)
  const forecastHour = useWeatherStore((s) => s.forecastHour)
  const setForecastHour = useWeatherStore((s) => s.setForecastHour)
  const forecastField = useWeatherStore((s) => s.forecastField)
  const fc = useForecastState()

  const [error, setError] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isRadarMode = timelineMode === 'radar'
  const isForecastMode = timelineMode === 'forecast'
  const modeFrames = isRadarMode ? frames : satFrames

  // fetch rainviewer frames
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/rainviewer')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: RainViewerData) => {
          if (!cancelled) setRainViewer(d)
        })
        .catch(() => {
          if (!cancelled) setError(true)
        })
    load()
    const iv = setInterval(load, 2 * 60_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [setRainViewer])

  // autoplay loop (radar/satellite frames or forecast hours)
  useEffect(() => {
    if (!playing) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    if (isForecastMode) {
      if (fc.times.length === 0) return
      tickRef.current = setInterval(() => {
        const s = useWeatherStore.getState()
        const len = getForecastState().times.length
        if (len > 0) s.setForecastHour((s.forecastHour + 1) % len)
      }, 700)
      return () => {
        if (tickRef.current) clearInterval(tickRef.current)
      }
    }
    if (modeFrames.length === 0) return
    tickRef.current = setInterval(() => {
      const s = useWeatherStore.getState()
      if (s.timelineMode === 'radar') {
        s.setFrameIndex((s.frameIndex + 1) % s.frames.length)
      } else if (s.satFrames.length > 0) {
        s.setSatIndex((s.satIndex + 1) % s.satFrames.length)
      }
    }, 750)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [playing, isForecastMode, modeFrames.length, fc.times.length])

  const selectMode = (m: 'radar' | 'satellite' | 'forecast') => {
    if (timelineMode === m) return
    setTimelineMode(m)
    if (m === 'radar' && !overlays.radar && !overlays.tropical) toggleOverlay('radar')
    if (m === 'satellite' && !overlays.satellite) toggleOverlay('satellite')
    if (m === 'forecast') {
      if (!overlays.forecast) toggleOverlay('forecast')
      useWeatherStore.getState().setForecastHour(0)
      setPlaying(true)
    }
  }

  const idx = isRadarMode ? frameIndex : satIndex
  const frame = modeFrames[idx]
  const lastPastIdx = (() => {
    for (let i = modeFrames.length - 1; i >= 0; i--) {
      if (!modeFrames[i]?.nowcast) return i
    }
    return -1
  })()
  const minutesAhead =
    frame?.nowcast && lastPastIdx >= 0
      ? Math.max(0, Math.round((frame.time - modeFrames[lastPastIdx].time) / 60))
      : 0

  const satelliteNoFrames = timelineMode === 'satellite' && satFrames.length === 0

  const fcLen = fc.times.length
  const fcMax = Math.max(fcLen - 1, 0)
  const fcHour = Math.min(forecastHour, fcMax)
  const fcReady = isForecastMode && fcLen > 0

  const timeLabel = isForecastMode
    ? fc.error
      ? 'خطا در دریافت پیش‌بینی'
      : fcLen === 0
        ? 'در حال دریافت میدان پیش‌بینی...'
        : fcHour === 0
          ? 'اکنون'
          : faTehranHour(fc.times[fcHour])
    : modeFrames.length === 0
      ? error
        ? 'عدم اتصال به رادار'
        : satelliteNoFrames
          ? 'تصویر روزانه GIBS'
          : 'در حال دریافت...'
      : frame
        ? unixToFaTime(frame.time)
        : '...'

  const hintStart = isForecastMode ? 'اکنون' : '۲ ساعت قبل'
  const hintEnd = isForecastMode
    ? `+${faNum(fcMax)} ساعت`
    : isRadarMode
      ? '۳۰ دقیقه بعد'
      : 'تصاویر روزانه'

  return (
    <div
      className="glass-strong pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4"
      dir="rtl"
    >
      {/* mode switch */}
      <div className="flex overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-xs">
        <button
          onClick={() => selectMode('radar')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'radar'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="رادار بارش لحظه‌ای و حاره‌ای"
        >
          <Radar className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">رادار</span>
        </button>
        <button
          onClick={() => selectMode('forecast')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'forecast'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="پیش‌بینی رنگی ۴۸ ساعت آینده — حرکت سامانه‌ها روی نقشه"
        >
          <CloudRainWind className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">پیش‌بینی</span>
        </button>
        <button
          onClick={() => selectMode('satellite')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors sm:px-3',
            timelineMode === 'satellite'
              ? 'bg-primary/25 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title="ماهواره مادون قرمز"
        >
          <Satellite className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ماهواره</span>
        </button>
      </div>

      {/* play / pause */}
      <button
        onClick={() => setPlaying(!playing)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary transition-all hover:bg-primary/35 hover:scale-105"
        title={playing ? 'توقف انیمیشن' : 'پخش حرکت سامانه‌ها'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 -translate-x-px" />}
      </button>

      {/* timeline */}
      <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 sm:min-w-[220px]">
        <input
          type="range"
          className="timeline-range w-full"
          min={0}
          max={isForecastMode ? fcMax : Math.max(modeFrames.length - 1, 0)}
          value={isForecastMode ? fcHour : Math.min(idx, Math.max(modeFrames.length - 1, 0))}
          onChange={(e) => {
            setPlaying(false)
            const v = Number(e.target.value)
            if (isForecastMode) setForecastHour(v)
            else if (isRadarMode) setFrameIndex(v)
            else setSatIndex(v)
          }}
          disabled={isForecastMode ? fcLen === 0 : modeFrames.length === 0}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{hintStart}</span>
          <span className="font-bold text-foreground" dir="ltr">
            {timeLabel}
            {isForecastMode && fcReady && (
              <span className="ms-1 rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-300">
                {FIELD_LABEL[forecastField] ?? ''} · مدل
              </span>
            )}
            {isForecastMode && fc.loading && fcLen > 0 && (
              <span className="ms-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                به‌روزرسانی...
              </span>
            )}
            {satelliteNoFrames && (
              <span className="ms-1 rounded bg-cyan-500/20 px-1 text-[9px] text-cyan-300">
                NASA GIBS
              </span>
            )}
            {!isForecastMode && frame?.nowcast && minutesAhead > 0 && (
              <span className="ms-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                کوتاه‌مدت
              </span>
            )}
          </span>
          <span>{hintEnd}</span>
        </div>
      </div>
    </div>
  )
}
