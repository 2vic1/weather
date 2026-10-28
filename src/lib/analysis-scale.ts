// Shared color scales for the AQ / CAPE analysis dots (used by map + legend)

export function aqColor(pm25: number): string {
  if (!Number.isFinite(pm25)) return '#64748b'
  if (pm25 <= 12) return '#22c55e'
  if (pm25 <= 35) return '#eab308'
  if (pm25 <= 55) return '#f97316'
  if (pm25 <= 150) return '#ef4444'
  if (pm25 <= 250) return '#a855f7'
  return '#7f1d1d'
}

export function aqLabel(pm25: number): string {
  if (!Number.isFinite(pm25)) return 'بدون داده'
  if (pm25 <= 12) return 'سالم'
  if (pm25 <= 35) return 'قابل قبول'
  if (pm25 <= 55) return 'ناسالم برای گروه‌های حساس'
  if (pm25 <= 150) return 'ناسالم'
  if (pm25 <= 250) return 'بسیار ناسالم'
  return 'خطرناک'
}

export function capeColor(cape: number): string {
  if (!Number.isFinite(cape)) return '#64748b'
  if (cape < 300) return '#38bdf8'
  if (cape < 800) return '#22c55e'
  if (cape < 1200) return '#eab308'
  if (cape < 2000) return '#f97316'
  if (cape < 3000) return '#ef4444'
  return '#d946ef'
}

export function capeLabel(cape: number): string {
  if (!Number.isFinite(cape)) return 'بدون داده'
  if (cape < 300) return 'جوّ آرام'
  if (cape < 800) return 'ناپایداری کم'
  if (cape < 1200) return 'ناپایداری متوسط'
  if (cape < 2000) return 'ناپایداری زیاد — رگبار محتمل'
  if (cape < 3000) return 'ناپایداری شدید — رعدوبرق'
  return 'ناپایداری فوق‌شدید'
}
