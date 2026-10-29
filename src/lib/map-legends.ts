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

/**
 * Model precipitation ramp (mm/h) — mirrors PRECIP_MM_STOPS in FieldCanvas.tsx
 * (classic radar spectrum: light blue → blue → cyan → green → yellow → orange →
 *  red → crimson → magenta → pale pink; sqrt scale over 0…45 mm/h)
 */
export const PRECIP_LEGEND_CSS =
  'linear-gradient(90deg, rgba(168,210,245,.42) 4.7%, rgba(118,180,242,.5) 8.2%, rgba(55,130,235,.56) 12.5%, rgba(40,205,230,.6) 16.3%, rgba(60,205,120,.64) 21.1%, rgba(155,220,75,.68) 27.9%, rgba(250,228,80,.72) 33.3%, rgba(250,180,50,.75) 39.4%, rgba(245,125,40,.78) 47.1%, rgba(232,60,40,.81) 57.7%, rgba(190,30,65,.84) 73%, rgba(220,70,175,.87) 85.6%, rgba(245,150,220,.9) 100%)'

export const NASA_DUST_LEGEND_CSS =
  'linear-gradient(90deg,#2c7bb6,#abd9e9,#ffffbf,#fdae61,#d7191c,#7f0000)'

/** CAPE (J/kg) — mirrors buildCapeLut in FieldCanvas.tsx (sqrt scale 0…5000) */
export const CAPE_LEGEND_CSS =
  'linear-gradient(90deg, rgba(120,200,130,.34) 8%, rgba(80,195,110,.44) 18%, rgba(230,225,95,.52) 28%, rgba(248,165,55,.6) 42%, rgba(240,85,45,.66) 60%, rgba(190,40,85,.72) 77%, rgba(135,45,150,.78) 100%)'

/** snowfall (cm/h) — mirrors buildSnowLut in FieldCanvas.tsx (sqrt scale 0…2) */
export const SNOW_LEGEND_CSS =
  'linear-gradient(90deg, rgba(238,245,252,.38) 10%, rgba(214,230,248,.5) 20%, rgba(185,208,242,.6) 32%, rgba(152,182,226,.68) 50%, rgba(122,156,212,.74) 71%, rgba(92,130,196,.8) 100%)'
