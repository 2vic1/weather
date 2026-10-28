// Cities used for the AQ / CAPE analysis dots on the map.
// Province centers + notable hotspots (dust / industry / population).
export interface AnalysisCity {
  name: string
  province: string
  lat: number
  lon: number
  /** dust or air-quality hotspot → gets a slightly bigger dot */
  hot?: boolean
}

export const ANALYSIS_CITIES: AnalysisCity[] = [
  // province centers
  { name: 'تهران', province: 'تهران', lat: 35.69, lon: 51.39, hot: true },
  { name: 'کرج', province: 'البرز', lat: 35.84, lon: 50.94 },
  { name: 'مشهد', province: 'خراسان رضوی', lat: 36.3, lon: 59.57, hot: true },
  { name: 'اصفهان', province: 'اصفهان', lat: 32.65, lon: 51.67 },
  { name: 'تبریز', province: 'آذربایجان شرقی', lat: 38.08, lon: 46.29 },
  { name: 'شیراز', province: 'فارس', lat: 29.59, lon: 52.58 },
  { name: 'اهواز', province: 'خوزستان', lat: 31.32, lon: 48.67, hot: true },
  { name: 'قم', province: 'قم', lat: 34.64, lon: 50.88 },
  { name: 'رشت', province: 'گیلان', lat: 37.28, lon: 49.58 },
  { name: 'ساری', province: 'مازندران', lat: 36.56, lon: 53.06 },
  { name: 'گرگان', province: 'گلستان', lat: 36.84, lon: 54.44 },
  { name: 'بجنورد', province: 'خراسان شمالی', lat: 37.47, lon: 57.32 },
  { name: 'بیرجند', province: 'خراسان جنوبی', lat: 32.87, lon: 59.22 },
  { name: 'زاهدان', province: 'سیستان و بلوچستان', lat: 29.5, lon: 60.86 },
  { name: 'زنجان', province: 'زنجان', lat: 36.67, lon: 48.48 },
  { name: 'سمنان', province: 'سمنان', lat: 35.58, lon: 53.4 },
  { name: 'شهرکرد', province: 'چهارمحال و بختیاری', lat: 32.33, lon: 50.86 },
  { name: 'قزوین', province: 'قزوین', lat: 36.27, lon: 50.0 },
  { name: 'سنندج', province: 'کردستان', lat: 35.32, lon: 46.99 },
  { name: 'کرمان', province: 'کرمان', lat: 30.29, lon: 57.08 },
  { name: 'کرمانشاه', province: 'کرمانشاه', lat: 34.31, lon: 47.07 },
  { name: 'یزد', province: 'یزد', lat: 31.9, lon: 54.37 },
  { name: 'اردبیل', province: 'اردبیل', lat: 38.25, lon: 48.29 },
  { name: 'همدان', province: 'همدان', lat: 34.8, lon: 48.51 },
  { name: 'بوشهر', province: 'بوشهر', lat: 28.92, lon: 50.84 },
  { name: 'بندرعباس', province: 'هرمزگان', lat: 27.19, lon: 56.28 },
  { name: 'ایلام', province: 'ایلام', lat: 33.64, lon: 46.41 },
  { name: 'یاسوج', province: 'کهگیلویه و بویراحمد', lat: 30.67, lon: 51.59 },
  { name: 'خرم‌آباد', province: 'لرستان', lat: 33.49, lon: 48.36 },
  { name: 'اراک', province: 'مرکزی', lat: 34.09, lon: 49.69 },
  { name: 'ارومیه', province: 'آذربایجان غربی', lat: 37.55, lon: 45.08 },
  // dust / industry / air hotspots
  { name: 'زابل', province: 'سیستان و بلوچستان', lat: 31.13, lon: 61.5, hot: true },
  { name: 'آبادان', province: 'خوزستان', lat: 30.34, lon: 48.3, hot: true },
  { name: 'ماهشهر', province: 'خوزستان', lat: 30.56, lon: 49.2, hot: true },
  { name: 'چابهار', province: 'سیستان و بلوچستان', lat: 25.29, lon: 60.64 },
  { name: 'کیش', province: 'هرمزگان', lat: 26.55, lon: 53.98 },
  { name: 'بندر لنگه', province: 'هرمزگان', lat: 26.56, lon: 54.88 },
  { name: 'شهر صنعتی عجب‌شیر', province: 'آذربایجان شرقی', lat: 37.48, lon: 46.11 },
  { name: 'نجف‌آباد', province: 'اصفهان', lat: 32.63, lon: 51.37 },
  { name: 'کاشان', province: 'اصفهان', lat: 33.98, lon: 51.43 },
]
