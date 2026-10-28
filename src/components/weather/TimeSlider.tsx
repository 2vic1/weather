'use client'

// Shared draggable time bar (mouse / touch / keyboard).
// Used by the map TimelineControl, the hourly chart and the atmosphere profile
// panel — Windy-style scrubbing with optional day ticks.

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface Tick {
  pct: number
  label: string
}

export default function TimeBar({
  value,
  max,
  onChange,
  disabled,
  ticks,
  ariaLabel,
  ariaValueText,
  className,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
  ticks?: Tick[]
  ariaLabel: string
  ariaValueText: string
  /** extra classes for the wrapper (e.g. lighter styling inside panels) */
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [barW, setBarW] = useState(0)
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  // measure bar width → how many day labels actually fit (no overlap)
  useEffect(() => {
    const el = ref.current
    if (!el || !ticks?.length) return
    const measure = () => setBarW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ticks?.length])
  const labelStep =
    ticks && ticks.length > 0 && barW > 40
      ? Math.max(1, Math.ceil((ticks.length * 40) / barW))
      : 1

  const valueFromX = (clientX: number): number => {
    const el = ref.current
    if (!el || max <= 0) return 0
    const r = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round(t * max)
  }

  return (
    <div
      ref={ref}
      dir="ltr"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={ariaValueText}
      aria-disabled={disabled}
      className={cn(
        'group relative flex-1 cursor-pointer touch-none select-none py-2.5',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      onPointerDown={(e) => {
        if (max <= 0) return
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange(valueFromX(e.clientX))
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return
        onChange(valueFromX(e.clientX))
      }}
      onPointerUp={(e) => {
        draggingRef.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
      onKeyDown={(e) => {
        if (max <= 0) return
        let v = value
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - 1
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + 1
        else if (e.key === 'Home') v = 0
        else if (e.key === 'End') v = max
        else return
        e.preventDefault()
        onChange(Math.min(max, Math.max(0, v)))
      }}
    >
      {/* track */}
      <div className="relative h-2 rounded-full border border-white/10 bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400/80 via-teal-300/90 to-amber-400"
          style={{ width: `${pct * 100}%` }}
        />
        {/* day ticks */}
        {ticks?.map((t, i) => (
          <div
            key={i}
            className="absolute -top-0.5 h-3 w-px bg-white/35"
            style={{ left: `${t.pct * 100}%` }}
          />
        ))}
      </div>
      {/* day labels — thinned to fit the bar width */}
      {ticks && ticks.length > 0 && (
        <div className="relative mt-1 hidden h-3 sm:block">
          {ticks.map((t, i) => {
            const show = i % labelStep === 0 || i === 0
            if (!show) return null
            return (
              <span
                key={i}
                className={cn(
                  'absolute whitespace-nowrap text-[8px] leading-3 text-white/60',
                  i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                )}
                style={{ left: `${t.pct * 100}%` }}
              >
                {t.label}
              </span>
            )
          })}
        </div>
      )}
      {/* thumb */}
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(34,211,238,0.8)] ring-2 ring-primary transition-transform',
          'group-hover:scale-125'
        )}
        style={{ left: `${pct * 100}%` }}
      />
    </div>
  )
}

/** Build one tick per local day boundary from a local-ISO time series (first tick = امروز) */
export function dayTicksFromTimes(times: string[], maxIndex: number): Tick[] {
  if (times.length < 4) return []
  const WD_FA: Record<string, string> = {
    Sat: 'شنبه',
    Sun: 'یکشنبه',
    Mon: 'دوشنبه',
    Tue: 'سه‌شنبه',
    Wed: 'چهارشنبه',
    Thu: 'پنجشنبه',
    Fri: 'جمعه',
  }
  // local ISO times already carry the city-local calendar date in "YYYY-MM-DD"
  const wdFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
  const ticks: Tick[] = []
  let lastKey = ''
  for (let i = 0; i < times.length; i++) {
    const dateKey = times[i].slice(0, 10)
    if (!dateKey || dateKey === lastKey) continue
    lastKey = dateKey
    const wd = wdFmt.format(new Date(`${dateKey}T00:00:00Z`))
    ticks.push({
      pct: maxIndex > 0 ? i / maxIndex : 0,
      label: i === 0 ? 'امروز' : WD_FA[wd] ?? wd,
    })
  }
  return ticks
}

/** Persian relative label for an hour offset (0 → اکنون, …) */
export function relHoursFa(h: number): string {
  if (h <= 0) return 'اکنون'
  if (h < 24) return `+${faNumDigits(h)} ساعت`
  if (h % 24 === 0) return `+${faNumDigits(h / 24)} روز`
  return `+${faNumDigits(Math.floor(h / 24))} روز و ${faNumDigits(h % 24)} ساعت`
}

function faNumDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}
