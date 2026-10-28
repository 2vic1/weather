import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { fetchWeather, fetchAtmosphere, round2 } from '@/lib/weather-server'
import type { AIDayData, AIAnalysis } from '@/lib/weather-types'

export const maxDuration = 180

const cache = new Map<string, { data: AIAnalysis; dayData: AIDayData[]; ts: number }>()

function magnusDewpoint(tC: number, rh: number): number {
  const rhMin = Math.max(rh, 1)
  const a = 17.625
  const b = 243.04
  const alpha = Math.log(rhMin / 100) + (a * tC) / (b + tC)
  return (b * alpha) / (a - alpha)
}

/** Deep multi-section analysis prompt: surface + pressure levels + stability + trends */
function buildAnalysisPrompt(
  name: string,
  province: string,
  weather: Awaited<ReturnType<typeof fetchWeather>>,
  atm: Awaited<ReturnType<typeof fetchAtmosphere>>,
  dayData: AIDayData[]
): string {
  const c = weather.current
  const h = weather.hourly

  // Compact hourly next 12h
  const hourly12 = h.time.slice(0, 12).map((t, i) => ({
    ساعت: t.slice(11, 16),
    دما: Math.round(h.temperature_2m[i]),
    احتمال_بارش: h.precipitation_probability[i],
    بارش_میلیمتر: h.precipitation[i],
    باد_kmh: Math.round(h.wind_speed_10m[i]),
    رطوبت: h.relative_humidity_2m[i],
  }))

  // Next 24h maxima
  const maxPrecip24 = Math.max(...h.precipitation.slice(0, 24))
  const maxWind24 = Math.max(...h.wind_speed_10m.slice(0, 24))
  const maxProb24 = Math.max(...h.precipitation_probability.slice(0, 24))
  const minTemp24 = Math.min(...h.temperature_2m.slice(0, 24))
  const maxTemp24 = Math.max(...h.temperature_2m.slice(0, 24))

  // Atmosphere: current hour profile
  const atm0 = atm.levels.map((l) => ({
    سطح_hPa: l.level,
    ارتفاع_ژئوپتانسیل_m: Math.round(l.geopotentialHeight[0]),
    دما_C: Math.round(l.temperature[0] * 10) / 10,
    دمای_نقطه_شبنم: Math.round(l.dewpoint[0] * 10) / 10,
    رطوبت: Math.round(l.relativeHumidity[0]),
    باد_kmh: Math.round(l.windSpeed[0]),
    جهت_باد: Math.round(l.windDirection[0]),
  }))

  // instability trend (now → +24h, 3-hourly steps)
  const capeTrend = atm.cape.slice(0, 8).map((v) => Math.round(v)) // next 24h (3-hourly steps)
  const liTrend = atm.liftedIndex.slice(0, 8).map((v) => Math.round(v * 10) / 10)
  const maxCape24 = Math.max(...atm.cape.slice(0, 8))

  // vertical wind shear between surface and 500 hPa (speed + direction)
  const surf = atm.surface
  const l500 = atm.levels.find((l) => l.level === 500)
  const shear500 =
    l500 && Number.isFinite(l500.windSpeed[0]) && Number.isFinite(surf.windSpeed[0])
      ? {
          سرعت_سطح: Math.round(surf.windSpeed[0]),
          سرعت_۵۰۰: Math.round(l500.windSpeed[0]),
          برش_kmh: Math.round(Math.abs(l500.windSpeed[0] - surf.windSpeed[0])),
        }
      : null

  // surface pressure trend 3h (hPa)
  const pressureTrend =
    surf.pressure.length >= 4
      ? Math.round((surf.pressure[3] - surf.pressure[0]) * 100) / 100
      : null

  // surface dewpoint
  const surfaceDewpoint = Math.round(magnusDewpoint(c.temperature_2m, c.relative_humidity_2m) * 10) / 10

  // convective threat classification from data (helps the model anchor)
  const convectiveThreat =
    maxCape24 > 2500 ? 'بالا (رگبار/رعدوبرق محتمل)' : maxCape24 > 1000 ? 'متوسط' : 'کم'

  return JSON.stringify({
    مکان: {
      شهر: name,
      استان: province || '—',
      عرض: round2(weather.latitude),
      طول: round2(weather.longitude),
      ارتفاع_m: Math.round(weather.elevation),
    },
    منطقه_زمانی: weather.timezone,
    اکنون: {
      زمان_محلی: c.time,
      دما: c.temperature_2m,
      احساس_شده: c.apparent_temperature,
      نقطه_شبنم_سطح: surfaceDewpoint,
      رطوبت: c.relative_humidity_2m,
      ابر: c.cloud_cover,
      فشار_دریا: Math.round(c.pressure_msl),
      فشار_ایستگاه: Math.round(c.surface_pressure),
      روند_فشار_۳ساعت_hPa: pressureTrend,
      باد_سرعت: c.wind_speed_10m,
      باد_جهت: c.wind_direction_10m,
      تندباد: c.wind_gusts_10m,
      بارش_ساعته: c.precipitation,
      کد: c.weather_code,
    },
    بیشینه‌های_۲۴ساعت: {
      بارش_mm: maxPrecip24,
      باد: maxWind24,
      احتمال_بارش: maxProb24,
      دمای_بیشینه: Math.round(maxTemp24),
      دمای_کمینه: Math.round(minTemp24),
    },
    پیش‌بینی_ساعتی_۱۲ساعت: hourly12,
    پروفایل_جوی_اکنون: atm0,
    ناپایداری: {
      CAPE_اکنون: Math.round(atm.cape[0]),
      روند_CAPE_۶ساعت: capeTrend,
      بیشینه_CAPE_۲۴ساعت: Math.round(maxCape24),
      شاخص_برخاستگی_LI_اکنون: atm.liftedIndex[0],
      روند_LI_۶ساعت: liTrend,
      برش_باد_سطح_تا_۵۰۰: shear500,
      ارزیابی_تهدید_همرفتی: convectiveThreat,
    },
    داده_روزانه_برای_پیش‌بینی_روزبه‌روز: dayData.map((d) => ({
      تاریخ: d.date,
      کد_وضعیت: d.weatherCode,
      بیشینه_دما: d.tMax,
      کمینه_دما: d.tMin,
      بارش_mm: d.precipMm,
      احتمال_بارش_درصد: d.precipProb,
      ساعات_بارش: d.precipHours,
      برف_cm: d.snowCm,
      بیشینه_باد_kmh: d.windMax,
      تندباد_kmh: d.gustMax,
      جهت_باد_درجه: d.windDir,
      رطوبت_میانگین_درصد: d.humidityMean,
      UV_بیشینه: d.uvMax,
      طلوع: d.sunrise,
      غروب: d.sunset,
    })),
  })
}

const SYSTEM_PROMPT = `تو «آسمان‌نگار-پرو» هستی؛ هواشناس ارشد و متخصص سینوپتیک، ترمودینامیک اتمسفر و کلیماتولوژی ایران با ۲۵ سال سابقه تحلیل نقشه‌های سطح و ترازهای بالا (ECMWF/GFS/ICON).

وظیفه تو: با بررسی دقیق داده‌های خام هواشناسیِ داده‌شده، یک «تحلیل فوق‌قوی» حرفه‌ای، مکانیسم‌محور و کاملاً فارسی تولید کن. این تحلیل باید سطح یک گزارش هواشناسی رسمی و تخصصی را داشته باشد.

اصول الزامی:
- هر ادعا باید از داده‌ها استخراج شود و به عدد دقیق ارجاع بدهد. هیچ حدس عمومی بدون پشتوانه داده ننویس.
- تحلیل سینوپتیک: ارتفاع ژئوپتانسیل ۵۰۰ هکتوپاسکال (کم‌تر از ۵۵۰۰متر = ناوه/فرورفتگی)، جهت باد در ۵۰۰ و ۸۵۰ هکتوپاسکال (مسیر ورود توده)، رطوبت نسبی در ۸۵۰/۷۰۰/۵۰۰ (عمق رطوبت)، روند فشار (افت = نزدیک شدن سامانه)، و منشأ توده (مدیترانه‌ای، سیریلی، خزری، حاره‌ای/صحرایی، قطبی، موسمی) را مشخص کن.
- تحلیل ناپایداری: CAPE (زیر ۳۰۰ weak، ۳۰۰-۱۰۰۰ متوسط، ۱۰۰۰-۲۵۰۰ قوی، بالای ۲۵۰۰ بسیار قوی)، شاخص برخاستگی LI (منفی‌تر از صفر = ناپایدار)، برش باد سطح تا ۵۰۰ (بالای ۳۰ km/h = سازمان‌یافته شدن سلول‌های همرفتی)، عرض فاصله دما-نقطه شبنم سطح (کمتر از ۳ درجه = اشباع مرزی)، و فاصله دما-شبنم در تراز ۷۰۰ (بارش شناور/ابر میانی).
- هشدارها فقط با شرایط واقعی: بارش تجمعی، باد > ۵۰km/h، تندباد، برف/یخ‌زدگی (دمای کمینه زیر صفر با بارش)، تگرگ (CAPE بالا + برش قوی)، گرد و خاک (باد شدید + خشکی)، موج گرما (بیشینه > ۴۰) یا سرمای شدید.
- خط زمانی خطرات: برای ۴۸ ساعت آینده، هر خطر با بازه زمانی تقریبی (مثلاً «امروز عصر تا شب: رگبار رعدوبرقی ۶۰٪»). اگر خطری نیست آرایه خالی.
- زبان: فارسی روان، حرفه‌ای، قابل فهم برای عموم ولی با اصطلاحات علمی درست و نام واقعی دریاها/کوهستان‌های مرتبط (خزر، خلیج فارس، دریای عرب، زاگرس، البرز و...).
- خروجی فقط JSON معتبر بدون هیچ متن اضافه.

قواعد «پیش‌بینی روزبه‌روز» (آرایه dailyForecast — مهم‌ترین بخش خروجی):
- برای «هر» روزِ آرایه داده_روزانه، دقیقاً یک شیء با همان «تاریخ» بساز. هیچ روزی را جا نینداز و روزی اضافه نکن.
- headline: یک تیتر کوتاه و قوی (حداکثر ۱۲ کلمه) که کل آن روز را خلاصه می‌کند؛ مثل «عبور موج بارشی مدیترانه‌ای با تندباد ۶۵ کیلومتر» یا «آفتابی و رو به گرم شدن».
- details: تحلیل کارشناسی ۲ تا ۴ جمله‌ای برای همان روز که حتماً اعداد داده‌ها را به فارسی ذکر کند:
  * اگر بارش هست: نوع (باران/رگبار/نم‌نم/برف/بارش مخلوط باران و برف)، مقدار دقیق mm، ساعات بارش و احتمال درصدی. اگر برف_cm بالای صفر است یا کمینه دما نزدیک صفر با بارش است، شرایط برف‌نشین و ارتفاع تقریبی برف را بگو.
  * اگر باد است: جهت اصلی به فارسی (شمالی/جنوب‌غربی/...)، سرعت بیشینه km/h و اگر تندباد > ۴۰ است تندباد را هم ذکر کن.
  * رطوبت میانگین درصدی و تأثیرش (هوای شرجی/خشک)، دمای بیشینه و کمینه، و اگر UV ≥ ۷ است هشدار آفتاب.
  * مکانیزم هواشناسی کوتاه: منشأ توده (مدیترانه‌ای/خزری/صحرایی/...) یا پرشر/ناوه، فقط وقتی از داده‌های سینوپتیک نتیجه‌گیری می‌شود.
- سه روز اول را مفصل‌تر و روزهای دورتر را کوتاه‌تر بنویس. روزهای کاملاً بدون رویداد را صادقانه کوتاه بگو (مثلاً «آسمان صاف، افزایش ملایم دما»).
- هرگز عددی از خودت نساز که در داده‌ها نباشد.

ساختار JSON خروجی:
{
  "summary": "خلاصه ۲ تا ۳ جمله‌ای وضعیت هوا",
  "currentAnalysis": "تحلیل دقیق وضعیت فعلی با اعداد (۳ تا ۵ جمله)",
  "synoptic": "تحلیل سینوپتیک: ژئوپتانسیل ۵۰۰، ناوه‌ها/پرفشارها، منشأ و مسیر توده‌ها (۳ تا ۵ جمله، ذکر جهت‌های جغرافیایی و اعداد)",
  "airMasses": "توده‌های هوا و برهم‌کنششان با توپوگرافی منطقه (۲ تا ۴ جمله)",
  "instability": "تحلیل ناپایداری: CAPE و روندش، LI، برش باد، نقطه شبنم، ارزیابی رگبار/رعدوبرق/تگرگ (۳ تا ۵ جمله)",
  "atmosphereLayers": "تحلیل لایه‌های جو از سطح تا ۲۰۰ هکتوپاسکال: پایداری، وارونگی، رطوبت لایه‌ای (۳ تا ۵ جمله)",
  "hourlyOutlook": "پیش‌بینی رویدادمحور ۴۸ ساعت آینده با ساعات کلیدی (۲ تا ۴ جمله)",
  "weeklyOutlook": "روند کلی کل دوره انتخابی با ذکر روزهای بحرانی و انتقال سامانه‌ها (۲ تا ۴ جمله)",
  "dailyForecast": [
    { "date": "yyyy-mm-dd همان تاریخِ داده", "headline": "تیتر روز", "details": "تحلیل کارشناسی با اعداد" }
  ],
  "hazardsTimeline": ["بازه زمانی: خطر — احتمال/شدت", ...],
  "warnings": ["هشدار ۱", "هشدار ۲"],
  "tips": "توصیه کاربردی کوتاه",
  "confidence": عدد بین ۰.۵ تا ۰.۹۵
}
اگر هشداری نیست، آرایه‌ها را خالی بده.`

/** per-day numeric rows guaranteed to be accurate (never trust the LLM with numbers) */
function buildDayData(
  weather: Awaited<ReturnType<typeof fetchWeather>>,
  days: number
): AIDayData[] {
  const d = weather.daily
  const h = weather.hourly
  const out: AIDayData[] = []
  const n = Math.min(days, d.time.length)
  for (let i = 0; i < n; i++) {
    const date = d.time[i]
    // humidity mean for this local day from the hourly series
    let hSum = 0
    let hCnt = 0
    for (let k = 0; k < h.time.length; k++) {
      if (h.time[k].slice(0, 10) === date) {
        const rh = h.relative_humidity_2m[k]
        if (Number.isFinite(rh)) {
          hSum += rh
          hCnt++
        }
      }
    }
    out.push({
      date,
      weatherCode: d.weather_code[i] ?? 0,
      tMax: Math.round(d.temperature_2m_max[i] ?? 0),
      tMin: Math.round(d.temperature_2m_min[i] ?? 0),
      precipMm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
      precipProb: Math.round(d.precipitation_probability_max?.[i] ?? 0),
      precipHours: Math.round(d.precipitation_hours?.[i] ?? 0),
      snowCm: Math.round((d.snowfall_sum?.[i] ?? 0) * 10) / 10,
      windMax: Math.round(d.wind_speed_10m_max[i] ?? 0),
      gustMax: Math.round(d.wind_gusts_10m_max?.[i] ?? 0),
      windDir: Math.round(d.wind_direction_10m_dominant?.[i] ?? 0),
      humidityMean: hCnt ? Math.round(hSum / hCnt) : 0,
      uvMax: Math.round(d.uv_index_max[i] ?? 0),
      sunrise: d.sunrise[i] ?? '',
      sunset: d.sunset[i] ?? '',
    })
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lat = Number(body?.lat)
    const lon = Number(body?.lon)
    const name = String(body?.name ?? 'نامشخص')
    const province = String(body?.province ?? '')
    const daysRaw = Number(body?.days)
    const days = daysRaw === 3 || daysRaw === 14 ? daysRaw : 7 // 3 / 7 / 14

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: 'مختصات نامعتبر است' }, { status: 400 })
    }

    const cacheKey = `${round2(lat)},${round2(lon)}:${days}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < 45 * 60_000) {
      return NextResponse.json({ analysis: hit.data, dayData: hit.dayData, cached: true })
    }

    const [weather, atm] = await Promise.all([
      fetchWeather(lat, lon),
      fetchAtmosphere(lat, lon),
    ])

    const dayData = buildDayData(weather, days)
    const userData = buildAnalysisPrompt(name, province, weather, atm, dayData)

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `داده‌های هواشناسی «${name}» (${province || '—'}):\n${userData}\n\nبر اساس این داده‌ها «تحلیل فوق‌قوی» کامل برای افق ${days} روزه تولید کن؛ dailyForecast باید برای هر ${days} روزِ داده_روزانه یک ردیف با همان تاریخ داشته باشد. حتماً به اعداد ارجاع بده و مکانیسم هواشناسی را توضیح بده. فقط JSON بده.`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    let content = completion.choices[0]?.message?.content ?? ''
    // strip markdown fences if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let analysis: AIAnalysis
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      const dailyForecastRaw = Array.isArray(parsed.dailyForecast) ? parsed.dailyForecast : []
      const dailyForecast = dailyForecastRaw
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>
          return {
            date: String(o.date ?? ''),
            headline: String(o.headline ?? ''),
            details: String(o.details ?? ''),
          }
        })
        .filter((x) => x.date && (x.headline || x.details))
      analysis = {
        summary: String(parsed.summary ?? ''),
        currentAnalysis: String(parsed.currentAnalysis ?? ''),
        synoptic: String(parsed.synoptic ?? ''),
        airMasses: String(parsed.airMasses ?? ''),
        instability: String(parsed.instability ?? ''),
        atmosphereLayers: String(parsed.atmosphereLayers ?? ''),
        hourlyOutlook: String(parsed.hourlyOutlook ?? ''),
        weeklyOutlook: String(parsed.weeklyOutlook ?? ''),
        dailyForecast,
        hazardsTimeline: Array.isArray(parsed.hazardsTimeline)
          ? parsed.hazardsTimeline.map(String)
          : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
        tips: String(parsed.tips ?? ''),
        confidence: Number(parsed.confidence) || 0.75,
        horizon: days,
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
        horizon: days,
      }
    }

    cache.set(cacheKey, { data: analysis, dayData, ts: Date.now() })
    return NextResponse.json({ analysis, dayData })
  } catch (e) {
    console.error('ai-forecast error', e)
    return NextResponse.json(
      { error: 'خطا در تولید تحلیل هوش مصنوعی. لطفاً دوباره تلاش کنید.' },
      { status: 500 }
    )
  }
}
