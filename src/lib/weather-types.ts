// ===== Shared TypeScript contracts between API routes and frontend =====

export interface CityPoint {
  id?: number
  name: string
  province?: string
  lat: number
  lon: number
  isCapital?: boolean
  country?: string
  source?: 'iran' | 'world' | 'custom'
}

export interface CurrentWeather {
  time: string
  temperature_2m: number
  relative_humidity_2m: number
  apparent_temperature: number
  is_day: number
  precipitation: number
  weather_code: number
  cloud_cover: number
  pressure_msl: number
  surface_pressure: number
  wind_speed_10m: number
  wind_direction_10m: number
  wind_gusts_10m: number
}

export interface HourlySlice {
  time: string[]
  temperature_2m: number[]
  precipitation_probability: number[]
  precipitation: number[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_direction_10m: number[]
  relative_humidity_2m: number[]
}

export interface DailySlice {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  sunrise: string[]
  sunset: string[]
  precipitation_sum: number[]
  precipitation_probability_max: number[]
  wind_speed_10m_max: number[]
  uv_index_max: number[]
}

export interface WeatherData {
  latitude: number
  longitude: number
  elevation: number
  timezone: string
  current: CurrentWeather
  hourly: HourlySlice
  daily: DailySlice
  fetchedAt: string
  sources: string[]
}

// ===== Atmosphere (pressure levels) =====

export interface PressureLevelData {
  level: number
  temperature: number[]
  relativeHumidity: number[]
  windSpeed: number[]
  windDirection: number[]
  geopotentialHeight: number[]
  dewpoint: number[]
}

export interface AtmosphereData {
  time: string[]
  levels: PressureLevelData[]
  cape: number[]
  liftedIndex: number[]
  surface: {
    temperature: number[]
    relativeHumidity: number[]
    windSpeed: number[]
    windDirection: number[]
    pressure: number[]
  }
}

// ===== Wind/temperature field for map overlays =====

export interface WindGridPoint {
  lat: number
  lon: number
  speed: number
  dir: number
  temp: number
}

export interface WindFieldData {
  points: WindGridPoint[]
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
  fetchedAt: string
}

// ===== RainViewer frames =====

export interface RvFrame {
  time: number
  path: string
}

export interface RainViewerData {
  host: string
  radar: { past: RvFrame[]; nowcast: RvFrame[] }
  satellite: RvFrame[]
}

// ===== Forecast field (animated model layers: precip / temp / clouds) =====

export type ForecastFieldId = 'precip' | 'temp' | 'clouds'

export interface ForecastFieldPoint {
  lat: number
  lon: number
  /** mm/h precipitation per hour */
  precip: number[]
  /** °C temperature per hour */
  temp: number[]
  /** % cloud cover per hour */
  clouds: number[]
}

export interface ForecastFieldData {
  /** UTC ISO time strings, shared by all points */
  times: string[]
  points: ForecastFieldPoint[]
  n: number
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
  fetchedAt: string
}

// ===== AQ / CAPE analysis dots (province centers + hotspots) =====

export interface AQPoint {
  name: string
  province: string
  lat: number
  lon: number
  /** PM2.5 µg/m³ (current hour) */
  pm25: number
  /** PM10 µg/m³ */
  pm10: number
  /** CAMS dust µg/m³ */
  dust: number
  hot: boolean
}

export interface CapePoint {
  name: string
  province: string
  lat: number
  lon: number
  /** CAPE J/kg (current) */
  cape: number
  hot: boolean
}

export interface AnalysisFieldData {
  aq: {
    time: string
    points: AQPoint[]
  }
  cape: {
    time: string
    points: CapePoint[]
  }
  fetchedAt: string
}

// ===== AI analysis =====

export interface AIAnalysis {
  summary: string
  currentAnalysis: string
  airMasses: string
  atmosphereLayers: string
  hourlyOutlook: string
  weeklyOutlook: string
  warnings: string[]
  tips: string
  confidence: number
  /** تحلیل سینوپتیک نقشه‌های هم‌اکنون (ژئوپتانسیل ۵۰۰، ناوه‌ها، سامانه‌ها) */
  synoptic?: string
  /** تحلیل ناپایداری: CAPE، شاخص برخاستگی، برش باد، احتمال رگبار/رعدوبرق */
  instability?: string
  /** خط زمانی خطرات ۴۸ ساعت آینده */
  hazardsTimeline?: string[]
}
