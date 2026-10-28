// Persian formatting helpers (client-safe)

export function faNum(n: number | string | undefined | null, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n as number)) return '—'
  const formatted =
    typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : n
  return formatted.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]).replace('-', '−')
}

export function faRound(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return faNum(Math.round(n))
}

const FA_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
const FA_WEEKDAYS = [
  'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه',
]

/** Format ISO local time string (from Open-Meteo, no tz suffix) safely */
function parseLocal(iso: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (m) {
    return { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mm: +m[5] }
  }
  const d = new Date(iso)
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(), mm: d.getMinutes() }
}

/** Persian weekday name for an Open-Meteo local date (yyyy-mm-dd) */
export function faWeekday(dateIso: string): string {
  const { y, m, d } = parseLocal(dateIso)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  // 0=Sunday...6=Saturday → FA_WEEKDAYS indexed by getUTCDay
  return FA_WEEKDAYS[dt.getUTCDay()]
}

/** Gregorian date in Persian digits: ۲۸ اکتبر */
export function faDate(dateIso: string): string {
  const { y, m, d } = parseLocal(dateIso)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  const month = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${faNum(d)} ${monthFa(month)}`
}

const MONTH_MAP: Record<string, string> = {
  Jan: 'ژانویه', Feb: 'فوریه', Mar: 'مارس', Apr: 'آوریل', May: 'مه', Jun: 'ژوئن',
  Jul: 'ژوئیه', Aug: 'اوت', Sep: 'سپتامبر', Oct: 'اکتبر', Nov: 'نوامبر', Dec: 'دسامبر',
}
function monthFa(short: string): string {
  return MONTH_MAP[short] ?? short
}

/** hh:mm in Persian digits from "2024-01-01T13:45" */
export function faTime(iso: string): string {
  const { hh, mm } = parseLocal(iso)
  return `${faNum(String(hh).padStart(2, '0'))}:${faNum(String(mm).padStart(2, '0'))}`
}

/** Full local date-time, e.g. "دوشنبه ۲۸ اکتبر، ۱۶:۳۰" */
export function faDateTime(iso: string): string {
  return `${faWeekday(iso)} ${faDate(iso)}، ${faTime(iso)}`
}

/** Unix timestamp (sec) → Tehran time hh:mm */
export function unixToFaTime(unix: number): string {
  const d = new Date(unix * 1000)
  const hh = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' })
  return faNum(hh)
}

const WD_MAP: Record<string, string> = {
  Sun: 'یکشنبه', Mon: 'دوشنبه', Tue: 'سه‌شنبه', Wed: 'چهارشنبه',
  Thu: 'پنجشنبه', Fri: 'جمعه', Sat: 'شنبه',
}

/** UTC ISO hour string (e.g. "2025-11-02T14:00") → Tehran weekday + hh:mm in Persian */
export function faTehranHour(isoUtc: string): string {
  const d = new Date(`${isoUtc.endsWith('Z') ? isoUtc : `${isoUtc}Z`}`)
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const wd = WD_MAP[get('weekday')] ?? ''
  const hh = get('hour') === '24' ? '00' : get('hour')
  return `${wd} ${faNum(hh)}:${faNum(get('minute'))}`
}

export function windDirArrow(deg: number): string {
  // Meteorological direction = where wind comes FROM. Arrow shows where it goes.
  const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘']
  return arrows[Math.round(deg / 45) % 8]
}
