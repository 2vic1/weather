import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { fetchWeather, fetchAtmosphere, round2 } from '@/lib/weather-server'
import type { AIAnalysis } from '@/lib/weather-types'

export const maxDuration = 120

const cache = new Map<string, { data: AIAnalysis; ts: number }>()

function buildAnalysisPrompt(
  name: string,
  province: string,
  weather: Awaited<ReturnType<typeof fetchWeather>>,
  atm: Awaited<ReturnType<typeof fetchAtmosphere>>
): string {
  const c = weather.current
  const d = weather.daily
  const h = weather.hourly

  // Compact hourly next 12h
  const hourly12 = h.time.slice(0, 12).map((t, i) => ({
    ساعت: t.slice(11, 16),
    دما: Math.round(h.temperature_2m[i]),
    احتمال_بارش: h.precipitation_probability[i],
    بارش_میلیمتر: h.precipitation[i],
    باد_kmh: Math.round(h.wind_speed_10m[i]),
  }))

  // Next 24h precip & wind maxima
  const maxPrecip24 = Math.max(...h.precipitation.slice(0, 24))
  const maxWind24 = Math.max(...h.wind_speed_10m.slice(0, 24))
  const maxProb24 = Math.max(...h.precipitation_probability.slice(0, 24))

  // Atmosphere: current hour profile
  const atm0 = atm.levels.map((l) => ({
    سطح_hPa: l.level,
    ارتفاع_ژئوپتانسیل_m: Math.round(l.geopotentialHeight[0]),
    دما_C: Math.round(l.temperature[0] * 10) / 10,
    رطوبت: Math.round(l.relativeHumidity[0]),
    باد_kmh: Math.round(l.windSpeed[0]),
    جهت_باد: Math.round(l.windDirection[0]),
  }))

  const daily7 = d.time.map((t, i) => ({
    تاریخ: t,
    کد_وضعیت: d.weather_code[i],
    بیشینه: Math.round(d.temperature_2m_max[i]),
    کمینه: Math.round(d.temperature_2m_min[i]),
    بارش_mm: d.precipitation_sum[i],
    احتمال_بارش: d.precipitation_probability_max[i],
    باد_بیشینه: Math.round(d.wind_speed_10m_max[i]),
  }))

  return JSON.stringify({
    مکان: { شهر: name, استان: province || '—', عرض: round2(weather.latitude), طول: round2(weather.longitude), ارتفاع_m: Math.round(weather.elevation) },
    منطقه_زمانی: weather.timezone,
    اکنون: {
      زمان_محلی: c.time,
      دما: c.temperature_2m,
      احساس_شده: c.apparent_temperature,
      رطوبت: c.relative_humidity_2m,
      ابر: c.cloud_cover,
      فشار_دریا: Math.round(c.pressure_msl),
      باد_سرعت: c.wind_speed_10m,
      باد_جهت: c.wind_direction_10m,
      تندباد: c.wind_gusts_10m,
      بارش_ساعته: c.precipitation,
      کد: c.weather_code,
    },
    پیش‌بینی_ساعتی_۱۲ساعت: hourly12,
    بیشینه‌های_۲۴ساعت: { بارش_mm: maxPrecip24, باد: maxWind24, احتمال_بارش: maxProb24 },
    پروفایل_جوی_اکنون: atm0,
    ناپایداری: {
      CAPE: Math.round(atm.cape[0]),
      شاخص_برخاستگی_LI: atm.liftedIndex[0],
    },
    پیش‌بینی_روزانه_۷روز: daily7,
  })
}

const SYSTEM_PROMPT = `تو «آسمان‌نگار» هستی؛ هواشناس ارشد و متخصص سینوپتیک و کلیماتولوژی ایران با ۲۰ سال سابقه تحلیل نقشه‌های سطح و ترازهای بالا (ECMWF/GFS).

وظیفه تو: با بررسی دقیق داده‌های خام هواشناسیِ داده‌شده، یک تحلیل حرفه‌ای و کاملاً فارسی تولید کن.

اصول:
- تحلیل باید از داده‌ها استخراج شود، نه حدس عمومی. به اعداد دقیق ارجاع بده.
- برای توده‌های هوا: جهت باد در سطوح ۸۵۰ و ۵۰۰ هکتوپاسکال، رطوبت نسبی سطوح، ارتفاع ژئوپتانسیل ۵۰۰ (کم‌ارتفاع = فرورفتگی/ناپایداری) و CAPE را تحلیل کن و منشأ توده (مدیترانه‌ای، سیریلی، خزری، حاره‌ای/صحرایی، قطبی) را حدس بزن.
- برای لایه‌های جو: پایداری/ناپایداری، وارونگی، برش باد (wind shear) بین سطوح، رطوبت در ترازهای مختلف را توضیح بده.
- هشدارها را واقع‌بینانه و فقط در صورت وجود شرایط خطرناک (بارش شدید، باد > ۵۰، برف، تگرگ، گرد و خاک، سرمای شدید) بنویس.
- زبان: فارسی روان، حرفه‌ای، قابل فهم برای عموم ولی با اصطلاحات علمی درست.
- خروجی را فقط به صورت JSON معتبر و بدون هیچ متن اضافه بده.

ساختار JSON خروجی:
{
  "summary": "خلاصه ۲ تا ۳ جمله‌ای وضعیت هوا",
  "currentAnalysis": "تحلیل دقیق وضعیت فعلی (۳ تا ۵ جمله)",
  "airMasses": "تحلیل توده‌های هوا، منشأ آن‌ها و مسیر حرکت سامانه‌ها (۳ تا ۵ جمله، ذکر جهت‌های جغرافیایی)",
  "atmosphereLayers": "تحلیل لایه‌های جو از سطح تا تراز ۲۰۰ هکتوپاسکال (۳ تا ۵ جمله)",
  "hourlyOutlook": "پیش‌بینی رویدادمحور ۴۸ ساعت آینده (۲ تا ۴ جمله)",
  "weeklyOutlook": "پیش‌بینی روند ۷ روز آینده (۲ تا ۴ جمله)",
  "warnings": ["هشدار ۱", "هشدار ۲"],
  "tips": "توصیه کاربردی کوتاه",
  "confidence": عدد بین ۰.۵ تا ۰.۹۵ بر اساس غلظت داده‌ها و مدل
}
اگر هشداری نیست، آرایه خالی بده.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lat = Number(body?.lat)
    const lon = Number(body?.lon)
    const name = String(body?.name ?? 'نامشخص')
    const province = String(body?.province ?? '')

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: 'مختصات نامعتبر است' }, { status: 400 })
    }

    const cacheKey = `${round2(lat)},${round2(lon)}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < 45 * 60_000) {
      return NextResponse.json({ analysis: hit.data, cached: true })
    }

    const [weather, atm] = await Promise.all([
      fetchWeather(lat, lon),
      fetchAtmosphere(lat, lon),
    ])

    const userData = buildAnalysisPrompt(name, province, weather, atm)

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `داده‌های هواشناسی «${name}» (${province || '—'}):\n${userData}\n\nبر اساس این داده‌ها تحلیل هواشناسی کامل تولید کن. فقط JSON بده.`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    let content = completion.choices[0]?.message?.content ?? ''
    // strip markdown fences if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let analysis: AIAnalysis
    try {
      const parsed = JSON.parse(content)
      analysis = {
        summary: String(parsed.summary ?? ''),
        currentAnalysis: String(parsed.currentAnalysis ?? ''),
        airMasses: String(parsed.airMasses ?? ''),
        atmosphereLayers: String(parsed.atmosphereLayers ?? ''),
        hourlyOutlook: String(parsed.hourlyOutlook ?? ''),
        weeklyOutlook: String(parsed.weeklyOutlook ?? ''),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
        tips: String(parsed.tips ?? ''),
        confidence: Number(parsed.confidence) || 0.75,
      }
    } catch {
      // fallback: treat whole content as summary
      analysis = {
        summary: content.slice(0, 500),
        currentAnalysis: '',
        airMasses: '',
        atmosphereLayers: '',
        hourlyOutlook: '',
        weeklyOutlook: '',
        warnings: [],
        tips: '',
        confidence: 0.6,
      }
    }

    cache.set(cacheKey, { data: analysis, ts: Date.now() })
    return NextResponse.json({ analysis })
  } catch (e) {
    console.error('ai-forecast error', e)
    return NextResponse.json(
      { error: 'خطا در تولید تحلیل هوش مصنوعی. لطفاً دوباره تلاش کنید.' },
      { status: 500 }
    )
  }
}
