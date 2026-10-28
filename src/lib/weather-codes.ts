import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  Cloudy,
  type LucideIcon,
} from 'lucide-react'

export interface WeatherCodeInfo {
  fa: string
  icon: LucideIcon
  tone: string // tailwind text color class
}

const D: Record<number, WeatherCodeInfo> = {
  0: { fa: 'صاف', icon: Sun, tone: 'text-amber-300' },
  1: { fa: 'عمدتاً صاف', icon: CloudSun, tone: 'text-amber-300' },
  2: { fa: 'نیمه‌ابری', icon: CloudSun, tone: 'text-yellow-200' },
  3: { fa: 'ابری', icon: Cloudy, tone: 'text-slate-300' },
  45: { fa: 'مه', icon: CloudFog, tone: 'text-slate-400' },
  48: { fa: 'مه یخ‌زده', icon: CloudFog, tone: 'text-slate-400' },
  51: { fa: 'نم‌نم باران خفیف', icon: CloudDrizzle, tone: 'text-cyan-300' },
  53: { fa: 'نم‌نم باران', icon: CloudDrizzle, tone: 'text-cyan-300' },
  55: { fa: 'نم‌نم باران شدید', icon: CloudDrizzle, tone: 'text-cyan-300' },
  56: { fa: 'نم‌نم یخ‌زده', icon: CloudDrizzle, tone: 'text-cyan-200' },
  57: { fa: 'نم‌نم یخ‌زده شدید', icon: CloudDrizzle, tone: 'text-cyan-200' },
  61: { fa: 'باران خفیف', icon: CloudRain, tone: 'text-sky-300' },
  63: { fa: 'باران', icon: CloudRain, tone: 'text-sky-300' },
  65: { fa: 'باران شدید', icon: CloudRainWind, tone: 'text-sky-400' },
  66: { fa: 'باران یخ‌زده', icon: CloudRain, tone: 'text-cyan-200' },
  67: { fa: 'باران یخ‌زده شدید', icon: CloudRainWind, tone: 'text-cyan-200' },
  71: { fa: 'بارش برف خفیف', icon: CloudSnow, tone: 'text-blue-100' },
  73: { fa: 'بارش برف', icon: Snowflake, tone: 'text-blue-100' },
  75: { fa: 'بارش برف سنگین', icon: Snowflake, tone: 'text-blue-100' },
  77: { fa: 'دانه‌های برف', icon: Snowflake, tone: 'text-blue-100' },
  80: { fa: 'رگبار باران خفیف', icon: CloudRain, tone: 'text-sky-300' },
  81: { fa: 'رگبار باران', icon: CloudRainWind, tone: 'text-sky-300' },
  82: { fa: 'رگبار باران شدید', icon: CloudRainWind, tone: 'text-sky-400' },
  85: { fa: 'رگبار برف خفیف', icon: CloudSnow, tone: 'text-blue-100' },
  86: { fa: 'رگبار برف سنگین', icon: CloudSnow, tone: 'text-blue-100' },
  95: { fa: 'رعد و برق', icon: CloudLightning, tone: 'text-yellow-300' },
  96: { fa: 'رعد و برق با تگرگ', icon: CloudHail, tone: 'text-yellow-300' },
  99: { fa: 'تندر شدید با تگرگ', icon: CloudHail, tone: 'text-yellow-300' },
}

export function weatherCodeInfo(code: number, isDay = 1): WeatherCodeInfo {
  const info = D[code]
  if (!info) return { fa: 'نامشخص', icon: Cloud, tone: 'text-slate-400' }
  if (isDay === 0 && (code === 0 || code === 1)) {
    return { fa: info.fa, icon: Moon, tone: 'text-slate-200' }
  }
  if (isDay === 0 && code === 2) {
    return { fa: info.fa, icon: CloudSun, tone: 'text-slate-300' }
  }
  return info
}

// Beaufort-ish wind description (km/h)
export function windSpeedFa(kmh: number): string {
  if (kmh < 2) return 'آرام'
  if (kmh < 12) return 'نسیم ملایم'
  if (kmh < 29) return 'باد متوسط'
  if (kmh < 50) return 'باد شدید'
  if (kmh < 75) return 'باد بسیار شدید'
  return 'توفانی'
}

export function windDirectionFa(deg: number): string {
  const dirs = [
    'شمالی',
    'شمال‌شرقی',
    'شرقی',
    'جنوب‌شرقی',
    'جنوبی',
    'جنوب‌غربی',
    'غربی',
    'شمال‌غربی',
  ]
  return dirs[Math.round(deg / 45) % 8]
}

// UV index description
export function uvFa(uv: number): string {
  if (uv < 3) return 'کم'
  if (uv < 6) return 'متوسط'
  if (uv < 8) return 'زیاد'
  if (uv < 11) return 'بسیار زیاد'
  return 'خطرناک'
}

// Temperature color scale (map overlay + charts)
export function tempColor(t: number): [number, number, number] {
  const stops: Array<{ t: number; c: [number, number, number] }> = [
    { t: -20, c: [120, 40, 190] },
    { t: -10, c: [70, 90, 230] },
    { t: 0, c: [60, 170, 235] },
    { t: 10, c: [70, 210, 170] },
    { t: 20, c: [240, 220, 90] },
    { t: 30, c: [245, 150, 60] },
    { t: 40, c: [235, 70, 50] },
    { t: 50, c: [190, 30, 40] },
  ]
  if (t <= stops[0].t) return stops[0].c
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t)
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * f),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * f),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * f),
      ]
    }
  }
  return stops[stops.length - 1].c
}
