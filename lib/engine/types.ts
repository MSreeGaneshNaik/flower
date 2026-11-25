export type RGB = [number, number, number];

export type FlowerId = 'rose' | 'tulip' | 'lotus' | 'lily' | 'sakura' | 'daisy' | 'sunflower';
export type PaletteId =
  | 'natural' | 'blush' | 'crimson' | 'ivory' | 'lavender' | 'coral' | 'gold' | 'ice' | 'phosphor' | 'amber';
export type GlyphSetId = 'classic' | 'blocks' | 'dots' | 'binary' | 'kana' | 'words';
export type GroundId = 'black' | 'night' | 'plum';
export type EndingId = 'wind' | 'fall' | 'burst' | 'wilt' | 'stay';

export interface FlowerConfig {
  flower: FlowerId;
  palette: PaletteId;
  glyphs: GlyphSetId;
  ground: GroundId;
  ending: EndingId;
  /** words written across the petals */
  phrase: string;
  /** show stem, leaves and any pad or branch */
  stem: boolean;
  /** turntable speed, 0 = still */
  spin: number;
  /** 0.5..2, exposure: brighter light on the flower and denser characters */
  brightness: number;
  /** 0..1.5, strength of the glow around the characters */
  glow: number;
  /** 0.7..1.4, more means smaller characters */
  detail: number;
  /** 0..1, how much of the phrase shows on the petals */
  words: number;
}

export const DEFAULT_CONFIG: FlowerConfig = {
  flower: 'rose',
  palette: 'natural',
  glyphs: 'classic',
  ground: 'black',
  ending: 'wind',
  phrase: 'let it bloom',
  stem: true,
  spin: 1,
  brightness: 1,
  glow: 1,
  detail: 1,
  words: 0.6,
};

/** How a surface reflects light and what colour it is along its length. */
export interface Material {
  role: 'petal' | 'center' | 'stem' | 'leaf';
  /** colour at the base, middle and tip of the surface (along u) */
  base: RGB; mid: RGB; tip: RGB;
  /** colour toward the side edges (|v| → 1) */
  edge?: RGB; edgeAmt?: number;
  /** outer face tint and how much of it shows */
  back: RGB; backMix: number;
  /** darkening along veins (negative: veins paler than the blade), how many, and their layout */
  vein?: number; veinCount?: number; veinKind?: 'fan' | 'parallel' | 'pinnate';
  /** freckles in a band of u */
  spots?: { color: RGB; amount: number; uMin: number; uMax: number };
  /** velvet sheen at grazing angles, light passing through, glossy highlight */
  sheen: number; trans: number; spec: number;
  /** the phrase may be written on this surface */
  text?: boolean;
}
