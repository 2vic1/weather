// Shared legend data for map overlays — used by the LayerSwitcher panel
// and the on-map MapLegend chip. Single source of truth for color scales.

/** RainViewer color palettes — REAL palette ids 0..8 used in the tile URL.
 *  https://www.rainviewer.com/api/color-schemes.html */
export const RADAR_PALETTES: Array<{ id: number; label: string; swatch: string }> = [
  { id: 0, label: 'سیاه‌وسفید dBZ', swatch: 'linear-gradient(90deg,#0b0f14,#5c6672,#b9c2cc,#ffffff)' },
  { id: 1, label: 'اصلی (NWS)', swatch: 'linear-gradient(90deg,#04e9e7,#019ff4,#0300f4,#02fd02,#01c501,#008e00,#fdf802,#fd9500,#fd0000,#f800fd)' },
  { id: 2, label: 'آبی جهانی', swatch: 'linear-gradient(90deg,#8ecaff,#2f9bd8,#42d6c8,#a8e05f,#f9d64a,#f95d4a,#d371dd)' },
  { id: 3, label: 'تایتان', swatch: 'linear-gradient(90deg,#21a358,#64b332,#ffd700,#ff8c00,#ff0000,#c0c0c0)' },
  { id: 4, label: 'کانال آب‌وهوا', swatch: 'linear-gradient(90deg,#04e9e7,#00b300,#fdf802,#fd9500,#fd0000,#f800fd)' },
  { id: 5, label: 'مت استونی', swatch: 'linear-gradient(90deg,#a1d0ff,#4a92ff,#32c800,#f4c800,#ff8000,#ff0000,#b40000)' },
  { id: 6, label: 'متئورد', swatch: 'linear-gradient(90deg,#cfe8ff,#7fc8f8,#3f8fe0,#26c281,#f7e347,#f5a623,#e04b3a,#9c27b0)' },
  { id: 7, label: 'نکس‌رَد', swatch: 'linear-gradient(90deg,#00c853,#ffeb3b,#ff9800,#f44336,#9c27b0)' },
  { id: 8, label: 'رنگین‌کمان', swatch: 'linear-gradient(90deg,#2962ff,#00bcd4,#4caf50,#ffeb3b,#ff5722,#d500f9)' },
]

/** Model precipitation ramp (mm/h) — mirrors PRECIP_STOPS in ForecastField.tsx */
export const PRECIP_LEGEND_CSS =
  'linear-gradient(90deg, rgba(170,215,150,.55) 0%, rgba(110,195,105,.6) 12%, rgba(45,160,95,.65) 25%, rgba(35,125,200,.68) 38%, rgba(45,185,215,.7) 50%, rgba(250,220,80,.75) 63%, rgba(245,150,45,.78) 76%, rgba(230,65,55,.82) 88%, rgba(200,55,165,.85) 100%)'

export const NASA_DUST_LEGEND_CSS =
  'linear-gradient(90deg,#2c7bb6,#abd9e9,#ffffbf,#fdae61,#d7191c,#7f0000)'
