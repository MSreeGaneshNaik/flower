import type { EndingId, GlyphSetId, GroundId, PaletteId, RGB } from './types';

export interface Palette {
  name: string;
  /** recolours petals: base, middle, tip */
  petal?: [RGB, RGB, RGB];
  /** recolours the heart (stamens, discs, pods), keeping each part's own lightness */
  center?: RGB;
  /** scales the heart's lightness, so a dark eye can sit inside bright petals */
  centerLum?: number;
  /** recolours stems and twigs, and leaves, sepals and pads */
  stem?: RGB;
  leaf?: RGB;
  /** lifts stems and leaves so they read on a one-colour display */
  partLum?: number;
  /** swatch shown in the menu */
  swatch: RGB;
}

export const PALETTES: Record<PaletteId, Palette> = {
  natural: { name: 'Natural', swatch: [0.9, 0.3, 0.5] },
  blush: { name: 'Blush', petal: [[0.62, 0.1, 0.27], [0.96, 0.5, 0.68], [1, 0.84, 0.91]], swatch: [0.96, 0.6, 0.74] },
  crimson: { name: 'Crimson', petal: [[0.26, 0, 0.04], [0.74, 0.03, 0.1], [1, 0.36, 0.36]], swatch: [0.74, 0.04, 0.12] },
  ivory: { name: 'Ivory', petal: [[0.82, 0.74, 0.55], [0.97, 0.94, 0.86], [1, 0.99, 0.96]], swatch: [0.96, 0.93, 0.84] },
  lavender: { name: 'Lavender', petal: [[0.33, 0.19, 0.52], [0.68, 0.55, 0.9], [0.93, 0.89, 1]], center: [1, 0.82, 0.25], swatch: [0.68, 0.56, 0.9] },
  coral: { name: 'Coral', petal: [[0.72, 0.18, 0.1], [1, 0.5, 0.38], [1, 0.82, 0.68]], swatch: [1, 0.5, 0.4] },
  gold: { name: 'Gold', petal: [[0.6, 0.3, 0], [1, 0.7, 0.08], [1, 0.88, 0.36]], center: [0.42, 0.13, 0.04], centerLum: 0.42, swatch: [1, 0.76, 0.18] },
  ice: { name: 'Ice', petal: [[0.1, 0.28, 0.58], [0.46, 0.72, 0.96], [0.88, 0.96, 1]], center: [1, 0.86, 0.45], swatch: [0.5, 0.74, 0.96] },
  // one-colour display looks, but every part keeps its own tone in the family
  phosphor: {
    name: 'Phosphor', petal: [[0.02, 0.26, 0.08], [0.16, 0.84, 0.32], [0.5, 1, 0.56]],
    center: [0.86, 1, 0.22], centerLum: 1.5, stem: [0.04, 0.5, 0.46], leaf: [0.5, 0.86, 0.1], partLum: 1.6, swatch: [0.36, 1, 0.48],
  },
  amber: {
    name: 'Amber', petal: [[0.38, 0.12, 0], [0.98, 0.52, 0.06], [1, 0.78, 0.32]],
    center: [0.86, 0.2, 0.04], stem: [0.56, 0.27, 0.06], leaf: [0.7, 0.6, 0.14], partLum: 1.6, swatch: [1, 0.68, 0.18],
  },
};
export const PALETTE_ORDER: PaletteId[] = ['natural', 'blush', 'crimson', 'ivory', 'lavender', 'coral', 'gold', 'ice', 'phosphor', 'amber'];

export interface GlyphSet {
  name: string;
  /** dark to bright */
  ramp: string[];
  /** draw - | / \ along outlines */
  outline: boolean;
  /** how the phrase is used: on patches of petals, everywhere, or not at all */
  words: 'patches' | 'everywhere' | 'none';
  dust: string[];
  /** pick a random glyph from the ramp instead of by brightness (brightness then lives in colour only) */
  scatter?: boolean;
  /** different characters for the heart, stem and leaves, so parts read apart even in one colour */
  roles?: { center?: string[]; stem?: string[]; leaf?: string[] };
}

const KANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'.split('');

export const GLYPH_SETS: Record<GlyphSetId, GlyphSet> = {
  classic: {
    name: 'Classic', ramp: ['.', ':', ':', 'o', 'o', 'x', 'x', 'x', 'X', 'X'], outline: true, words: 'patches', dust: ['.', '.', ':', '·', '+', '*'],
    roles: {
      center: ['.', ':', '*', '*', '%', '%', '#', '#', '@'],
      stem: ['.', ':', '!', '!', '|', '|', 'l', 'I'],
      leaf: ['.', ',', ',', ';', ';', '+', '+', '=', '='],
    },
  },
  blocks: { name: 'Blocks', ramp: ['░', '░', '▒', '▒', '▓', '▓', '█'], outline: false, words: 'patches', dust: ['░', '▒'] },
  dots: { name: 'Dots', ramp: ['·', '·', '∙', '•', '•', '●'], outline: false, words: 'none', dust: ['·', '∙'] },
  binary: { name: 'Binary', ramp: ['0', '1'], outline: false, words: 'none', dust: ['0', '1'], scatter: true },
  kana: { name: 'Kana', ramp: KANA, outline: false, words: 'none', dust: KANA.slice(0, 8), scatter: true },
  words: { name: 'Words', ramp: ['.'], outline: false, words: 'everywhere', dust: ['.', ':'] },
};
export const GLYPH_ORDER: GlyphSetId[] = ['classic', 'blocks', 'dots', 'binary', 'kana', 'words'];

export interface Ground {
  name: string;
  color: RGB;
}
export const GROUNDS: Record<GroundId, Ground> = {
  black: { name: 'Black', color: [0, 0, 0] },
  night: { name: 'Night', color: [0.012, 0.02, 0.045] },
  plum: { name: 'Plum', color: [0.05, 0.012, 0.03] },
};
export const GROUND_ORDER: GroundId[] = ['black', 'night', 'plum'];

/** Shared opening, then each ending's own beats. Times in seconds. */
export interface Timeline {
  dot: number; grow0: number; grow1: number; white0: number; white1: number; bloom0: number; bloom1: number;
  /** when the ending begins */
  end0: number;
  /** when the last character has gone (Infinity: the flower stays) */
  end: number;
  /** a loop restarts after this (Infinity: never) */
  loop: number;
}

const OPENING = { dot: 0.25, grow0: 0.8, grow1: 5.4, white0: 1.6, white1: 3.6, bloom0: 2.2, bloom1: 5.6 };

export const ENDINGS: Record<EndingId, { name: string; line: string; timeline: Timeline }> = {
  wind: { name: 'Wind', line: 'Blown away, right to left', timeline: { ...OPENING, end0: 7.35, end: 11.2, loop: 11.8 } },
  fall: { name: 'Petal fall', line: 'Petals let go one by one', timeline: { ...OPENING, end0: 7.2, end: 12.6, loop: 13.2 } },
  burst: { name: 'Burst', line: 'Breaks into light', timeline: { ...OPENING, end0: 7.6, end: 10.4, loop: 11 } },
  wilt: { name: 'Wilt', line: 'Droops, fades, lets go', timeline: { ...OPENING, end0: 7.0, end: 13.6, loop: 14.2 } },
  stay: { name: 'Stay', line: 'Keeps blooming', timeline: { ...OPENING, end0: Infinity, end: Infinity, loop: Infinity } },
};
export const ENDING_ORDER: EndingId[] = ['wind', 'fall', 'burst', 'wilt', 'stay'];
