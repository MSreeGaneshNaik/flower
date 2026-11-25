import type { FlowerId, Material, RGB } from './types';

/** A value that varies from the innermost (k = 0) to the outermost (k = 1) petal of a whorl; optional third entry curves the blend. */
export type Range = number | [number, number] | [number, number, number];

export type PetalShape = 'round' | 'oval' | 'pointed' | 'strap' | 'leaf';

export interface Whorl {
  count: number;
  layout: 'spiral' | 'ring';
  /** ring: angular offset in radians */
  phase?: number;
  /** position of this whorl from inside (0) to outside (1): drives opening order and shading */
  k: [number, number];
  len: Range; wid: Range; r0: Range; y0: Range;
  /** closed profile: angle of the base from vertical, and how much it turns by the tip */
  bud: [number, number];
  /** open profile */
  base: Range; bend: Range; curl: Range;
  cup: number; fold: number; reflex: number;
  ruffle: number; ruffleFreq: number;
  shape: PetalShape;
  notch?: number;
  /** smallest radius used when wrapping the petal's width around the stem axis */
  wrap: number;
  jitter?: number;
  mat: string;
}

export type CenterSpec =
  | { kind: 'dome'; r: number; y: number; bumps: number; mat: string }
  | { kind: 'blob'; c: [number, number, number]; r: [number, number, number]; mat: string }
  | { kind: 'disc'; r: number; y: number; height: number; florets: number; baseMat: string; floretMat: string; ringMat?: string }
  | { kind: 'pod'; r0: number; r1: number; y: number; h: number; holes: number; mat: string; holeColor: RGB }
  | {
      kind: 'stamens'; count: number; r0: number; y0: number; len: number; spread: number; height: number;
      droop: number; radius: number; anther: [number, number, number]; mat: string; antherMat: string;
    }
  | { kind: 'pistil'; len: number; radius: number; lean: number; stigma: number; mat: string; stigmaMat: string };

export interface LeafSpec {
  /** fraction along the stem from the head */
  at: number; phi: number;
  len: number; wid: number; base: number; bend: number; curl: number;
  fold: number; cup: number; ruffle: number; ruffleFreq: number;
  shape: PetalShape;
  /** compound leaf: a stalk carrying this many leaflets */
  leaflets?: number;
}

export interface StemSpec {
  len: number; r: number; bend: [number, number]; mat: string; leafMat: string;
  leaves: LeafSpec[];
  /** a lotus leaf centred at `pos`, held up on its own stalk from the foot of the stem */
  pad?: { pos: [number, number, number]; r: number; stalkR: number; mat: string };
  /** a branch instead of a single stem (cherry blossom) */
  twig?: { points: [number, number, number][]; r: number };
}

export interface HeadSpec {
  pos: [number, number, number];
  /** tilt of the head's axis about x and z */
  tilt: [number, number];
  scale: number;
  /** delay in bloom (0..1 of the bloom span) */
  lag: number;
  /** how far this head can open: 1 = full flower, 0.1 = stays a bud */
  maxBloom: number;
}

export interface FlowerSpec {
  id: FlowerId;
  name: string;
  latin: string;
  /** language of flowers: what giving it says */
  meaning: string;
  materials: Record<string, Material>;
  whorls: Whorl[];
  centers: CenterSpec[];
  heads?: HeadSpec[];
  stem: StemSpec;
  /** model point placed at the middle of the frame, with and without the stem */
  view: { cy: number; cyStem: number; zoom: number; pitch: number; yaw: number; sway?: boolean };
}

/* ---------- shared materials ---------- */
const lift = (c: RGB, k = 1.22): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const green = (b0: RGB, m0: RGB, t0: RGB, extra: Partial<Material> = {}, base = lift(b0), mid = lift(m0), tip = lift(t0)): Material => ({
  role: 'leaf', base, mid, tip, back: [0.42, 0.6, 0.36], backMix: 0.45,
  edge: [Math.min(1, tip[0] * 1.6 + 0.08), Math.min(1, tip[1] * 1.35 + 0.06), Math.min(1, tip[2] * 1.3)], edgeAmt: 0.3,
  vein: 0.22, veinCount: 7, veinKind: 'pinnate', sheen: 0.06, trans: 0.2, spec: 0.25, ...extra,
});
const stemMat = (c: RGB): Material => ({
  role: 'stem', base: [Math.min(1, c[0] * 1.15), Math.min(1, c[1] * 1.15), Math.min(1, c[2] * 1.1)], mid: c, tip: [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], back: c, backMix: 0,
  sheen: 0.08, trans: 0, spec: 0.2,
});
const solid = (role: Material['role'], c: RGB, d = 0.75, l = 1.12, extra: Partial<Material> = {}): Material => ({
  role, base: [c[0] * d, c[1] * d, c[2] * d], mid: c,
  tip: [Math.min(1, c[0] * l), Math.min(1, c[1] * l), Math.min(1, c[2] * l)],
  back: c, backMix: 0, sheen: 0.06, trans: 0, spec: 0.2, ...extra,
});

export const FLOWERS: Record<FlowerId, FlowerSpec> = {
  rose: {
    id: 'rose', name: 'Rose', latin: 'Rosa',
    meaning: 'Love, said plainly',
    materials: {
      petal: {
        role: 'petal', base: [0.42, 0.02, 0.14], mid: [0.86, 0.19, 0.45], tip: [0.98, 0.5, 0.7],
        edge: [1, 0.72, 0.84], edgeAmt: 0.2, back: [0.95, 0.6, 0.76], backMix: 0.2,
        vein: 0.07, veinCount: 9, veinKind: 'fan', sheen: 0.22, trans: 0.25, spec: 0.05, text: true,
      },
      center: solid('center', [1, 0.74, 0.16], 0.62, 1.2, { spec: 0.3 }),
      sepal: green([0.1, 0.26, 0.07], [0.18, 0.42, 0.11], [0.26, 0.52, 0.14], { vein: 0.1, role: 'leaf' }),
      stem: stemMat([0.2, 0.42, 0.13]),
      leaf: green([0.08, 0.26, 0.07], [0.14, 0.4, 0.1], [0.22, 0.5, 0.14]),
    },
    whorls: [{
      count: 22, layout: 'spiral', k: [0, 1],
      len: [0.34, 1.08, 0.75], wid: [0.62, 0.47], r0: [0.03, 0.13], y0: [0.06, 0],
      bud: [1.45, -2.4], base: [0.5, 1.02], bend: [-1.05, 0.38, 1.15], curl: [0, 0.62, 2],
      cup: 0.34, fold: 0, reflex: 0.75, ruffle: 0.05, ruffleFreq: 3, shape: 'round', wrap: 0.12, jitter: 0.12, mat: 'petal',
    }, {
      count: 5, layout: 'ring', phase: 0.3, k: [1, 1],
      len: 0.55, wid: 0.15, r0: 0.1, y0: -0.03,
      bud: [0.5, -0.45], base: 2.0, bend: 0.35, curl: 0.25,
      cup: 0.1, fold: 0.25, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'pointed', wrap: 0.2, mat: 'sepal',
    }],
    centers: [
      { kind: 'dome', r: 0.2, y: 0.06, bumps: 0.16, mat: 'center' },
      { kind: 'blob', c: [0, -0.09, 0], r: [0.13, 0.12, 0.13], mat: 'sepal' },
    ],
    stem: {
      len: 2.7, r: 0.035, bend: [0.25, 0.1], mat: 'stem', leafMat: 'leaf',
      leaves: [
        { at: 0.3, phi: 0.6, len: 0.42, wid: 0.46, base: 1.1, bend: 0.5, curl: 0.2, fold: 0.25, cup: 0.1, ruffle: 0.045, ruffleFreq: 22, shape: 'leaf', leaflets: 3 },
        { at: 0.52, phi: 3.7, len: 0.38, wid: 0.46, base: 1.2, bend: 0.55, curl: 0.2, fold: 0.25, cup: 0.1, ruffle: 0.045, ruffleFreq: 22, shape: 'leaf', leaflets: 3 },
      ],
    },
    view: { cy: 0.28, cyStem: -0.3, zoom: 1, pitch: 0.55, yaw: 0.9 },
  },

  tulip: {
    id: 'tulip', name: 'Tulip', latin: 'Tulipa',
    meaning: 'A declaration',
    materials: {
      petal: {
        role: 'petal', base: [1, 0.8, 0.18], mid: [0.93, 0.14, 0.12], tip: [0.82, 0.05, 0.09],
        edge: [1, 0.35, 0.3], edgeAmt: 0.15, back: [0.85, 0.12, 0.15], backMix: 0.3,
        vein: 0.1, veinCount: 13, veinKind: 'parallel', sheen: 0.1, trans: 0.3, spec: 0.35, text: true,
      },
      filament: solid('center', [0.92, 0.88, 0.7]),
      anther: solid('center', [0.16, 0.08, 0.2], 0.7, 1.4),
      pistil: solid('center', [0.86, 0.86, 0.55]),
      stem: stemMat([0.28, 0.5, 0.27]),
      leaf: green([0.18, 0.36, 0.24], [0.27, 0.48, 0.33], [0.33, 0.55, 0.38], { veinKind: 'parallel', veinCount: 11, vein: 0.12, back: [0.5, 0.62, 0.5] }),
    },
    whorls: [{
      count: 3, layout: 'ring', phase: 0, k: [1, 1], len: 1.0, wid: 0.52, r0: 0.07, y0: 0,
      bud: [0.5, -0.85], base: 0.52, bend: -0.18, curl: 0.3,
      cup: 0.38, fold: 0.04, reflex: 0.15, ruffle: 0, ruffleFreq: 0, shape: 'oval', wrap: 0.2, jitter: 0.05, mat: 'petal',
    }, {
      count: 3, layout: 'ring', phase: Math.PI / 3, k: [0.7, 0.7], len: 0.95, wid: 0.5, r0: 0.05, y0: 0.01,
      bud: [0.45, -0.8], base: 0.4, bend: -0.22, curl: 0.2,
      cup: 0.42, fold: 0.04, reflex: 0.1, ruffle: 0, ruffleFreq: 0, shape: 'oval', wrap: 0.2, jitter: 0.05, mat: 'petal',
    }],
    centers: [
      { kind: 'pistil', len: 0.32, radius: 0.035, lean: 0, stigma: 0.045, mat: 'pistil', stigmaMat: 'pistil' },
      { kind: 'stamens', count: 6, r0: 0.05, y0: 0.02, len: 0.3, spread: 0.1, height: 0.26, droop: 0, radius: 0.012, anther: [0.022, 0.06, 0.022], mat: 'filament', antherMat: 'anther' },
    ],
    stem: {
      len: 2.9, r: 0.04, bend: [0.15, -0.05], mat: 'stem', leafMat: 'leaf',
      leaves: [
        { at: 0.62, phi: 0.3, len: 1.55, wid: 0.14, base: 0.35, bend: 0.5, curl: 0.35, fold: 0.35, cup: 0.15, ruffle: 0, ruffleFreq: 0, shape: 'leaf' },
        { at: 0.8, phi: 3.4, len: 1.35, wid: 0.16, base: 0.5, bend: 0.65, curl: 0.3, fold: 0.35, cup: 0.15, ruffle: 0, ruffleFreq: 0, shape: 'leaf' },
      ],
    },
    view: { cy: 0.45, cyStem: -0.15, zoom: 1.05, pitch: 0.3, yaw: 0.9 },
  },

  lotus: {
    id: 'lotus', name: 'Lotus', latin: 'Nelumbo',
    meaning: 'Rising, clean, from deep water',
    materials: {
      petal: {
        role: 'petal', base: [0.98, 0.95, 0.88], mid: [0.98, 0.78, 0.86], tip: [0.93, 0.35, 0.58],
        edge: [0.95, 0.55, 0.7], edgeAmt: 0.2, back: [0.97, 0.75, 0.85], backMix: 0.2,
        vein: 0.14, veinCount: 15, veinKind: 'parallel', sheen: 0.1, trans: 0.35, spec: 0.1, text: true,
      },
      pod: solid('center', [0.86, 0.86, 0.38], 0.78, 1.1),
      filament: solid('center', [0.98, 0.92, 0.6]),
      anther: solid('center', [1, 0.78, 0.18]),
      stem: stemMat([0.3, 0.5, 0.25]),
      // glaucous blue-green, pale where the stalk joins. Pale veins (a negative vein lightens):
      // 24 fan over |v| 0.1..0.5 is ~10 around; more break up into dots at text size
      pad: green([0.24, 0.4, 0.22], [0.08, 0.28, 0.17], [0.12, 0.35, 0.2], { veinKind: 'fan', veinCount: 24, vein: -1, spec: 0.4, back: [0.42, 0.52, 0.38] }),
    },
    whorls: [{
      count: 8, layout: 'ring', phase: 0, k: [1, 1], len: 1.0, wid: 0.4, r0: 0.1, y0: 0,
      bud: [0.45, -0.75], base: 0.88, bend: 0.05, curl: 0.12,
      cup: 0.55, fold: 0, reflex: 0.05, ruffle: 0, ruffleFreq: 0, shape: 'pointed', wrap: 0.3, jitter: 0.06, mat: 'petal',
    }, {
      count: 8, layout: 'ring', phase: Math.PI / 8, k: [0.6, 0.6], len: 0.92, wid: 0.42, r0: 0.09, y0: 0.02,
      bud: [0.4, -0.72], base: 0.55, bend: -0.1, curl: 0.04,
      cup: 0.6, fold: 0, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'pointed', wrap: 0.3, jitter: 0.06, mat: 'petal',
    }, {
      count: 7, layout: 'ring', phase: 0.2, k: [0.3, 0.3], len: 0.78, wid: 0.44, r0: 0.08, y0: 0.03,
      bud: [0.35, -0.7], base: 0.3, bend: -0.3, curl: 0,
      cup: 0.65, fold: 0, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'pointed', wrap: 0.3, jitter: 0.06, mat: 'petal',
    }],
    centers: [
      { kind: 'pod', r0: 0.13, r1: 0.25, y: 0.04, h: 0.26, holes: 13, mat: 'pod', holeColor: [0.28, 0.3, 0.07] },
      { kind: 'stamens', count: 44, r0: 0.2, y0: 0.05, len: 0.17, spread: 0.11, height: 0.1, droop: 0.05, radius: 0.006, anther: [0.012, 0.03, 0.012], mat: 'filament', antherMat: 'anther' },
    ],
    stem: {
      len: 2.4, r: 0.05, bend: [-0.1, 0.12], mat: 'stem', leafMat: 'pad', leaves: [],
      pad: { pos: [-0.66, -1.15, -0.5], r: 0.72, stalkR: 0.04, mat: 'pad' },
    },
    view: { cy: 0.3, cyStem: -0.1, zoom: 1.05, pitch: 0.55, yaw: 0.9 },
  },

  lily: {
    id: 'lily', name: 'Lily', latin: 'Lilium',
    meaning: 'Devotion, and a fresh start',
    materials: {
      petal: {
        role: 'petal', base: [0.82, 0.12, 0.32], mid: [0.95, 0.38, 0.58], tip: [1, 0.88, 0.92],
        edge: [1, 0.96, 0.97], edgeAmt: 0.55, back: [0.95, 0.72, 0.84], backMix: 0.35,
        vein: 0.12, veinCount: 11, veinKind: 'fan',
        spots: { color: [0.4, 0.02, 0.12], amount: 0.34, uMin: 0.1, uMax: 0.62 },
        sheen: 0.1, trans: 0.3, spec: 0.15, text: true,
      },
      filament: solid('center', [0.78, 0.86, 0.56]),
      anther: solid('center', [0.5, 0.17, 0.05], 0.7, 1.3),
      pistil: solid('center', [0.62, 0.8, 0.42]),
      stem: stemMat([0.22, 0.45, 0.16]),
      leaf: green([0.1, 0.3, 0.08], [0.17, 0.44, 0.12], [0.25, 0.52, 0.16], { veinKind: 'parallel', veinCount: 5 }),
    },
    whorls: [{
      count: 3, layout: 'ring', phase: 0, k: [1, 1], len: 1.2, wid: 0.3, r0: 0.06, y0: 0,
      bud: [0.18, -0.25], base: 0.55, bend: 1.25, curl: 1.0,
      cup: 0.18, fold: 0.3, reflex: 0.2, ruffle: 0.07, ruffleFreq: 6, shape: 'pointed', wrap: 0.25, jitter: 0.05, mat: 'petal',
    }, {
      count: 3, layout: 'ring', phase: Math.PI / 3, k: [0.8, 0.8], len: 1.12, wid: 0.35, r0: 0.05, y0: 0.01,
      bud: [0.15, -0.22], base: 0.5, bend: 1.15, curl: 0.9,
      cup: 0.2, fold: 0.3, reflex: 0.2, ruffle: 0.08, ruffleFreq: 6, shape: 'pointed', wrap: 0.25, jitter: 0.05, mat: 'petal',
    }],
    centers: [
      { kind: 'pistil', len: 0.85, radius: 0.02, lean: 0.25, stigma: 0.04, mat: 'pistil', stigmaMat: 'pistil' },
      { kind: 'stamens', count: 6, r0: 0.03, y0: 0.02, len: 0.78, spread: 0.45, height: 0.55, droop: 0.15, radius: 0.012, anther: [0.026, 0.03, 0.09], mat: 'filament', antherMat: 'anther' },
    ],
    stem: {
      len: 2.7, r: 0.035, bend: [-0.2, 0.05], mat: 'stem', leafMat: 'leaf',
      leaves: [0.22, 0.36, 0.5, 0.62, 0.74].map((at, i) => ({
        at, phi: i * 2.3, len: 0.55 - i * 0.03, wid: 0.13, base: 1.0, bend: 0.35, curl: 0.2,
        fold: 0.2, cup: 0.05, ruffle: 0, ruffleFreq: 0, shape: 'leaf' as const,
      })),
    },
    view: { cy: 0.35, cyStem: -0.2, zoom: 0.95, pitch: 0.45, yaw: 0.9 },
  },

  sakura: {
    id: 'sakura', name: 'Cherry blossom', latin: 'Prunus serrulata',
    meaning: 'Beauty that does not last, so look now',
    materials: {
      petal: {
        role: 'petal', base: [0.92, 0.36, 0.55], mid: [1, 0.76, 0.86], tip: [1, 0.93, 0.96],
        edge: [1, 0.97, 0.98], edgeAmt: 0.2, back: [1, 0.85, 0.9], backMix: 0.3,
        vein: 0.1, veinCount: 9, veinKind: 'fan', sheen: 0.05, trans: 0.45, spec: 0.05, text: true,
      },
      cup: solid('center', [0.78, 0.12, 0.28]),
      filament: solid('center', [1, 0.9, 0.92]),
      anther: solid('center', [1, 0.84, 0.25]),
      twig: stemMat([0.36, 0.22, 0.16]),
      leaf: green([0.28, 0.3, 0.1], [0.42, 0.45, 0.16], [0.5, 0.5, 0.2], { back: [0.55, 0.55, 0.3] }),
    },
    whorls: [{
      count: 5, layout: 'ring', phase: 0, k: [1, 1], len: 0.62, wid: 0.62, r0: 0.05, y0: 0.02,
      bud: [0.9, -2.2], base: 1.3, bend: 0.15, curl: 0.2,
      cup: 0.22, fold: 0.05, reflex: 0.1, ruffle: 0.03, ruffleFreq: 4, shape: 'round', notch: 0.12, wrap: 0.15, jitter: 0.06, mat: 'petal',
    }],
    centers: [
      { kind: 'blob', c: [0, 0.02, 0], r: [0.09, 0.06, 0.09], mat: 'cup' },
      { kind: 'stamens', count: 28, r0: 0.06, y0: 0.03, len: 0.32, spread: 0.2, height: 0.22, droop: 0.03, radius: 0.004, anther: [0.018, 0.018, 0.018], mat: 'filament', antherMat: 'anther' },
    ],
    heads: [
      { pos: [0, 0, 0], tilt: [0.55, 0.05], scale: 1, lag: 0, maxBloom: 1 },
      { pos: [0.95, -0.5, 0.25], tilt: [0.5, -0.55], scale: 0.8, lag: 0.08, maxBloom: 1 },
      { pos: [-0.9, -0.65, -0.15], tilt: [0.45, 0.6], scale: 0.74, lag: 0.12, maxBloom: 1 },
      { pos: [0.38, -1.12, -0.3], tilt: [0, -0.3], scale: 0.55, lag: 1, maxBloom: 0.12 },
    ],
    stem: {
      len: 0, r: 0.045, bend: [0, 0], mat: 'twig', leafMat: 'leaf',
      leaves: [],
      twig: { points: [[-1.9, -1.45, -0.25], [-0.85, -0.82, -0.15], [0, -0.22, 0], [0.7, -0.62, 0.2], [1.75, -1.1, 0.32]], r: 0.036 },
    },
    view: { cy: 0.14, cyStem: -0.6, zoom: 0.92, pitch: 0.3, yaw: 0, sway: true },
  },

  daisy: {
    id: 'daisy', name: 'Daisy', latin: 'Bellis perennis',
    meaning: 'Loyal, honest, simple',
    materials: {
      petal: {
        role: 'petal', base: [0.9, 0.88, 0.62], mid: [0.97, 0.97, 0.93], tip: [1, 1, 0.98],
        back: [0.92, 0.88, 0.95], backMix: 0.3, vein: 0.08, veinCount: 3, veinKind: 'parallel',
        sheen: 0.05, trans: 0.35, spec: 0.05, text: true,
      },
      discbase: solid('center', [0.55, 0.38, 0.03]),
      floret: solid('center', [1, 0.8, 0.1], 0.85, 1.15, { spec: 0.25 }),
      stem: stemMat([0.25, 0.48, 0.16]),
      leaf: green([0.12, 0.32, 0.09], [0.2, 0.46, 0.13], [0.27, 0.54, 0.17]),
    },
    whorls: [{
      count: 21, layout: 'ring', phase: 0, k: [1, 1], len: 0.85, wid: 0.1, r0: 0.26, y0: 0.02,
      bud: [0.12, -0.35], base: 1.42, bend: 0.15, curl: 0.25,
      cup: 0.15, fold: 0.12, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'strap', wrap: 0.5, jitter: 0.15, mat: 'petal',
    }, {
      count: 13, layout: 'ring', phase: 0.15, k: [0.85, 0.85], len: 0.78, wid: 0.1, r0: 0.24, y0: 0.035,
      bud: [0.1, -0.3], base: 1.3, bend: 0.1, curl: 0.2,
      cup: 0.15, fold: 0.12, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'strap', wrap: 0.5, jitter: 0.15, mat: 'petal',
    }],
    centers: [{ kind: 'disc', r: 0.27, y: 0.02, height: 0.13, florets: 170, baseMat: 'discbase', floretMat: 'floret' }],
    stem: {
      len: 2.3, r: 0.025, bend: [0.2, -0.1], mat: 'stem', leafMat: 'leaf',
      leaves: [
        { at: 0.72, phi: 0.4, len: 0.45, wid: 0.3, base: 1.2, bend: 0.4, curl: 0.15, fold: 0.15, cup: 0.1, ruffle: 0.02, ruffleFreq: 8, shape: 'round' },
        { at: 0.84, phi: 3.3, len: 0.4, wid: 0.3, base: 1.3, bend: 0.4, curl: 0.15, fold: 0.15, cup: 0.1, ruffle: 0.02, ruffleFreq: 8, shape: 'round' },
      ],
    },
    view: { cy: 0.12, cyStem: -0.38, zoom: 1.08, pitch: 0.85, yaw: 0.9 },
  },

  sunflower: {
    id: 'sunflower', name: 'Sunflower', latin: 'Helianthus annuus',
    meaning: 'I turn toward you',
    materials: {
      petal: {
        role: 'petal', base: [0.92, 0.5, 0.02], mid: [1, 0.74, 0.06], tip: [1, 0.85, 0.2],
        back: [0.95, 0.7, 0.15], backMix: 0.3, vein: 0.12, veinCount: 5, veinKind: 'parallel',
        sheen: 0.05, trans: 0.25, spec: 0.05, text: true,
      },
      discbase: solid('center', [0.14, 0.07, 0.02]),
      floret: solid('center', [0.36, 0.19, 0.06], 0.8, 1.3, { spec: 0.15 }),
      ring: solid('center', [0.78, 0.5, 0.08]),
      bract: green([0.12, 0.3, 0.07], [0.2, 0.42, 0.1], [0.28, 0.5, 0.14], { vein: 0.1 }),
      stem: stemMat([0.24, 0.44, 0.14]),
      leaf: green([0.1, 0.3, 0.07], [0.18, 0.44, 0.11], [0.25, 0.52, 0.15]),
    },
    whorls: [{
      count: 21, layout: 'ring', phase: 0, k: [1, 1], len: 0.72, wid: 0.17, r0: 0.5, y0: 0,
      bud: [0.05, -0.4], base: 1.5, bend: 0.12, curl: 0.15,
      cup: 0.12, fold: 0.15, reflex: 0, ruffle: 0.04, ruffleFreq: 3, shape: 'pointed', wrap: 0.6, jitter: 0.12, mat: 'petal',
    }, {
      count: 13, layout: 'ring', phase: 0.15, k: [0.85, 0.85], len: 0.68, wid: 0.17, r0: 0.48, y0: 0.02,
      bud: [0.04, -0.35], base: 1.4, bend: 0.1, curl: 0.1,
      cup: 0.12, fold: 0.15, reflex: 0, ruffle: 0.04, ruffleFreq: 3, shape: 'pointed', wrap: 0.6, jitter: 0.12, mat: 'petal',
    }, {
      count: 13, layout: 'ring', phase: 0.05, k: [1, 1], len: 0.36, wid: 0.15, r0: 0.45, y0: -0.05,
      bud: [0.2, -0.3], base: 1.8, bend: 0.4, curl: 0.2,
      cup: 0.1, fold: 0.15, reflex: 0, ruffle: 0, ruffleFreq: 0, shape: 'pointed', wrap: 0.6, mat: 'bract',
    }],
    centers: [{ kind: 'disc', r: 0.52, y: 0, height: 0.07, florets: 560, baseMat: 'discbase', floretMat: 'floret', ringMat: 'ring' }],
    heads: [{ pos: [0, 0, 0], tilt: [1.05, 0], scale: 1, lag: 0, maxBloom: 1 }],
    stem: {
      len: 2.8, r: 0.05, bend: [0.1, -0.2], mat: 'stem', leafMat: 'leaf',
      leaves: [
        { at: 0.38, phi: 0.5, len: 0.75, wid: 0.6, base: 1.15, bend: 0.5, curl: 0.2, fold: 0.15, cup: 0.12, ruffle: 0.03, ruffleFreq: 14, shape: 'round' },
        { at: 0.6, phi: 3.5, len: 0.7, wid: 0.6, base: 1.2, bend: 0.55, curl: 0.2, fold: 0.15, cup: 0.12, ruffle: 0.03, ruffleFreq: 14, shape: 'round' },
      ],
    },
    view: { cy: 0.15, cyStem: -0.35, zoom: 0.95, pitch: 0.22, yaw: 0, sway: true },
  },
};

export const FLOWER_ORDER: FlowerId[] = ['rose', 'tulip', 'lotus', 'lily', 'sakura', 'daisy', 'sunflower'];
