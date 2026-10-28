'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Radar, Satellite } from 'lucide-react'
import { useWeatherStore } from '@/store/weather-store'
import type { RainViewerData } from '@/lib/weather-types'
import { unixToFaTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function TimelineControl() {
  const timelineMode = useWeatherStore((s) => s.timelineMode)
  const setTimelineMode = useWeatherStore((s) => s.setTimelineMode)
  const frames = useWeatherStore((s) => s.frames)
  const frameIndex = useWeatherStore((s) => s.frameIndex)
  const setFrameIndex = useWeatherStore((s) => s.setFrameIndex)
  const playing = useWeatherStore((s) => s.playing)
  const setPlaying = useWeatherStore((s) => s.setPlaying)
  const setRainViewer = useWeatherStore((s) => s.setRainViewer)
  const overlays = useWeatherStore((s) => s.overlays)
  const toggleOverlay = useWeatherStore((s) => s.toggleOverlay)

  const [error, setError] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // autoplay loop
  useEffect(() => {
    if (!playing || frames.length === 0) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(() => {
      setFrameIndex((useWeatherStore.getState().frameIndex + 1) % frames.length)
    }, 750)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [playing, frames.length, setFrameIndex])

  const selectMode = (m: 'radar' | 'satellite') => {
    if (timelineMode !== m) {
      setTimelineMode(m)
      // ensure corresponding overlay on
      if (m === 'radar' && !overlays.radar) toggleOverlay('radar')
      if (m === 'satellite' && !overlays.satellite) toggleOverlay('satellite')
    }
  }

  const frame = frames[frameIndex]
  const lastPastIdx = (() => {
    for (let i = frames.length - 1; i >= 0; i--) {
      if (!frames[i]?.nowcast) return i
    }
    return -1
  })()
  const minutesAhead =
    frame?.nowcast && lastPastIdx >= 0
      ? Math.max(0, Math.round((frame.time - frames[lastPastIdx].time) / 60))
      : 0

  const satelliteNoFrames =
    timelineMode === 'satellite' && frames.filter((f) => !f.nowcast).length === 0
  const timeLabel =
    frames.length === 0
      ? error
        ? 'عدم اتصال به رادار'
        : 'در حال دریافت...'
      : frame
        ? unixToFaTime(frame.time)
        : '...'

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
          title="رادار بارش لحظه‌ای"
        >
          <Radar className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">رادار</span>
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
          max={Math.max(frames.length - 1, 0)}
          value={frameIndex}
          onChange={(e) => {
            setPlaying(false)
            setFrameIndex(Number(e.target.value))
          }}
          disabled={frames.length === 0}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>۲ ساعت قبل</span>
          <span className="font-bold text-foreground" dir="ltr">
            {timeLabel}
            {satelliteNoFrames && (
              <span className="ms-1 rounded bg-cyan-500/20 px-1 text-[9px] text-cyan-300">
                NASA GIBS
              </span>
            )}
            {frame?.nowcast && minutesAhead > 0 && (
              <span className="ms-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                پیش‌بینی
              </span>
            )}
          </span>
          <span>۳۰ دقیقه بعد</span>
        </div>
      </div>
    </div>
  )
}
