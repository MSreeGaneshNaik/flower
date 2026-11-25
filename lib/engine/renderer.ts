import { FLOWERS, type CenterSpec, type FlowerSpec, type HeadSpec, type LeafSpec, type PetalShape, type Range, type Whorl } from './flowers';
import { ENDINGS, GLYPH_SETS, GROUNDS, PALETTES, type Timeline } from './looks';
import { DEFAULT_CONFIG, type FlowerConfig, type Material, type RGB } from './types';

/* ------------------------------------------------------------------ helpers */
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const s01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const smooth = (e0: number, e1: number, x: number) => s01((x - e0) / (e1 - e0));
const frac = (x: number) => x - Math.floor(x);
function hash(a: number, b: number, c: number) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rng = (r: Range, k: number) => {
  if (typeof r === 'number') return r;
  return lerp(r[0], r[1], r.length === 3 ? Math.pow(k, r[2]) : k);
};
const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / l, y / l, z / l];
};
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* ------------------------------------------------------------------ transforms */
interface Xf { r: number[]; t: [number, number, number]; s: number }
const IDENT: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function tiltMatrix(ax: number, az: number): number[] {
  const cx = Math.cos(ax), sx = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
  // Rz * Rx
  return [cz, -sz * cx, sz * sx, sz, cz * cx, -cz * sx, 0, sx, cx];
}
function axisAngle(ax: number, ay: number, az: number, a: number): number[] {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}

/* ------------------------------------------------------------------ sample store */
// One sample = one point on a surface. Positions and normals are in model space.
const F_TEXT = 1, F_NOCAST = 2;
const DUST_WIND = 1, DUST_BURST = 2, DUST_DRIFT = 3;

class Samples {
  n = 0; cap = 0;
  x = new Float32Array(0); y = new Float32Array(0); z = new Float32Array(0);
  nx = new Float32Array(0); ny = new Float32Array(0); nz = new Float32Array(0);
  ar = new Float32Array(0); ag = new Float32Array(0); ab = new Float32Array(0);
  ao = new Float32Array(0); h = new Float32Array(0); rel = new Float32Array(0);
  vx = new Float32Array(0); vy = new Float32Array(0); vz = new Float32Array(0);
  mat = new Uint8Array(0); part = new Uint16Array(0); flags = new Uint8Array(0); dust = new Uint8Array(0);
  reserve(more: number) {
    if (this.n + more <= this.cap) return;
    const cap = Math.max(this.cap * 2, this.n + more, 16384);
    const f = (a: Float32Array) => { const b = new Float32Array(cap); b.set(a.subarray(0, this.n)); return b; };
    this.x = f(this.x); this.y = f(this.y); this.z = f(this.z);
    this.nx = f(this.nx); this.ny = f(this.ny); this.nz = f(this.nz);
    this.ar = f(this.ar); this.ag = f(this.ag); this.ab = f(this.ab);
    this.ao = f(this.ao); this.h = f(this.h); this.rel = f(this.rel);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    const m = new Uint8Array(cap); m.set(this.mat.subarray(0, this.n)); this.mat = m;
    const p = new Uint16Array(cap); p.set(this.part.subarray(0, this.n)); this.part = p;
    const g = new Uint8Array(cap); g.set(this.flags.subarray(0, this.n)); this.flags = g;
    const d = new Uint8Array(cap); d.set(this.dust.subarray(0, this.n)); this.dust = d;
    this.cap = cap;
  }
}

/* ------------------------------------------------------------------ width profiles */
function widthAt(shape: PetalShape, u: number): number {
  switch (shape) {
    case 'round': { const up = Math.pow(u, 1.4); return 2 * Math.sqrt(Math.max(0, up * (1 - up))); }
    case 'oval': { const up = Math.pow(u, 1.15); return Math.pow(2 * Math.sqrt(Math.max(0, up * (1 - up))), 0.75); }
    case 'pointed': return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.1);
    case 'strap': return Math.pow(Math.min(1, u * 7), 0.6) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 8)));
    case 'leaf': return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.9);
  }
}

/* ------------------------------------------------------------------ per-frame context */
interface Frame {
  t: number;
  S: number;            // overall growth scale
  pxu: number;          // device pixels per model unit (includes S and zoom)
  cellW: number;
  dens: number;
  white: number;        // white-bud tint
  bloom: number;        // 0..1
  textThr: number;      // patch threshold for the phrase
  wantText: boolean;
  mats: Material[];
  matIndex: Record<string, number>;
  tl: Timeline;
  ending: FlowerConfig['ending'];
  wilt: number;
  yaw0c: number; yaw0s: number;   // turntable angle when the ending starts (for a stable sweep)
  stemGrow: number;
  part: number;
}

/** the camera with no one touching it: a slow turn, or a gentle sway for flowers that face you */
export function turntable(cfg: Pick<FlowerConfig, 'flower' | 'spin'>, t: number) {
  const v = FLOWERS[cfg.flower].view, spin = cfg.spin;
  return {
    yaw: v.sway ? v.yaw + 0.55 * Math.sin(t * 0.33 * spin) : v.yaw + 0.42 * t * spin,
    pitch: v.pitch + 0.07 * Math.sin(t * 0.5),
  };
}

/* ------------------------------------------------------------------ the renderer */
export class FlowerRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cfg: FlowerConfig = { ...DEFAULT_CONFIG };
  private s = new Samples();

  // sizes (device pixels)
  private W = 1; private H = 1; private dpr = 1;
  private CWd = 6; private CHd = 10; private cols = 1; private rows = 1; private N = 1;
  // cell buffers
  private zb = new Float32Array(1); private cs = new Int32Array(1); private ca = new Float32Array(1);
  private cr = new Float32Array(1); private cg = new Float32Array(1); private cb = new Float32Array(1);
  private cv = new Float32Array(1); private gi = new Int16Array(1);
  private rowShift = new Uint16Array(1);
  private ssaoOff: number[] = [];
  // shadow map
  private SM = 192; private sm = new Float32Array(192 * 192);
  // compositing canvases
  private glyphCv: HTMLCanvasElement; private glyphCtx: CanvasRenderingContext2D;
  private colorCv: HTMLCanvasElement; private colorCtx: CanvasRenderingContext2D;
  private halfCv: HTMLCanvasElement; private halfCtx: CanvasRenderingContext2D;
  private quarCv: HTMLCanvasElement; private quarCtx: CanvasRenderingContext2D;
  private atlasCv: HTMLCanvasElement; private atlasCtx: CanvasRenderingContext2D;
  private colorImg: ImageData | null = null;
  private glyphAt = new Map<string, number>();
  private atlasKey = '';
  private matsKey = '';
  private mats: Material[] = [];
  private matIndex: Record<string, number> = {};
  /** last frame's cost in ms, for the quality governor */
  lastCost = 0;
  /** 0.7..1: sampling density, lowered by the studio on slow devices */
  quality = 1;
  /** extra framing zoom, used for tight thumbnails */
  zoom = 1;
  private exposure = 1;
  /** per-stage cost of the last frame, ms */
  perf = { geo: 0, cam: 0, shadow: 0, shade: 0, compose: 0 };
  /** 'shadow' shows only the shadow term, for checking */
  debug: '' | 'shadow' | 'ao' = '';
  /** turn and tilt added to the turntable, radians (the export dialog's drag) */
  offset = { yaw: 0, pitch: 0 };
  /** leave the ground out; needs a canvas made with alpha */
  transparent = false;
  private atlasChars: string[] = [];
  /** what the stored geometry was built for; empty while the flower is still changing */
  private geoKey = '';

  constructor(canvas: HTMLCanvasElement, opts: { alpha?: boolean; readback?: boolean } = {}) {
    this.canvas = canvas;
    const c = canvas.getContext('2d', { alpha: !!opts.alpha, willReadFrequently: !!opts.readback });
    if (!c) throw new Error('Canvas 2D is not available');
    this.ctx = c;
    const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const e = document.createElement('canvas');
      return [e, e.getContext('2d') as CanvasRenderingContext2D];
    };
    [this.glyphCv, this.glyphCtx] = mk();
    [this.colorCv, this.colorCtx] = mk();
    [this.halfCv, this.halfCtx] = mk();
    [this.quarCv, this.quarCtx] = mk();
    [this.atlasCv, this.atlasCtx] = mk();
  }

  get config(): FlowerConfig { return this.cfg; }
  setConfig(next: Partial<FlowerConfig>) {
    const before = this.cfg;
    this.cfg = { ...this.cfg, ...next };
    if (before.detail !== this.cfg.detail) this.resize(this.W, this.H, this.dpr);
  }
  timeline(): Timeline { return ENDINGS[this.cfg.ending].timeline; }

  turntable(t: number) { return turntable(this.cfg, t); }
  /** the camera angle a frame at time t is drawn from, offset included */
  angleAt(t: number) {
    const a = this.turntable(t);
    return { yaw: a.yaw + this.offset.yaw, pitch: clamp(a.pitch + this.offset.pitch, -1.45, 1.45) };
  }

  /** width and height in device pixels */
  resize(W: number, H: number, dpr: number) {
    this.W = Math.max(1, Math.round(W)); this.H = Math.max(1, Math.round(H)); this.dpr = dpr;
    this.canvas.width = this.W; this.canvas.height = this.H;
    const minCss = Math.min(this.W, this.H) / dpr;
    const chCss = clamp(minCss / 96, 4.5, 13) / clamp(this.cfg.detail, 0.6, 1.8);
    this.CHd = Math.max(5, Math.round(chCss * dpr));
    this.CWd = Math.max(3, Math.round(this.CHd * 0.6));
    this.cols = Math.ceil(this.W / this.CWd); this.rows = Math.ceil(this.H / this.CHd); this.N = this.cols * this.rows;
    const N = this.N;
    this.zb = new Float32Array(N); this.cs = new Int32Array(N); this.ca = new Float32Array(N);
    this.cr = new Float32Array(N); this.cg = new Float32Array(N); this.cb = new Float32Array(N);
    this.cv = new Float32Array(N); this.gi = new Int16Array(N);
    this.rowShift = new Uint16Array(this.rows);
    const c = this.cols;
    this.ssaoOff = [-2, 2, -c, c, -c - 1, -c + 1, c - 1, c + 1, -3, 3, -2 * c, 2 * c];
    for (let y = 0; y < this.rows; y++) this.rowShift[y] = (hash(y, 9, 9) * 97) | 0;
    this.glyphCv.width = this.cols * this.CWd; this.glyphCv.height = this.rows * this.CHd;
    this.colorCv.width = this.cols; this.colorCv.height = this.rows;
    this.halfCv.width = Math.max(1, this.cols >> 1); this.halfCv.height = Math.max(1, this.rows >> 1);
    this.quarCv.width = Math.max(1, this.cols >> 2); this.quarCv.height = Math.max(1, this.rows >> 2);
    this.colorImg = this.colorCtx.createImageData(this.cols, this.rows);
    this.atlasKey = '';
  }

  /* -------------------------------------------------------------- materials (with palette) */
  private buildMaterials(spec: FlowerSpec) {
    const key = spec.id + '|' + this.cfg.palette;
    if (key === this.matsKey) return;
    this.matsKey = key;
    const pal = PALETTES[this.cfg.palette];
    this.mats = []; this.matIndex = {};
    // a colour at a given lightness: scale the hue, then fold any excess into a pastel so highlights stay tinted
    const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const tone = (c: RGB, l: number): RGB => {
      const k = l / Math.max(0.02, lum(c));
      let r = c[0] * k, g = c[1] * k, b = c[2] * k;
      const mx = Math.max(r, g, b);
      if (mx > 1) { r /= mx; g /= mx; b /= mx; }
      const lc = lum([r, g, b]);
      if (l > lc) { const w = clamp((l - lc) / Math.max(0.01, 1 - lc), 0, 1); r += (1 - r) * w; g += (1 - g) * w; b += (1 - b) * w; }
      return [r, g, b];
    };
    const recolour = (m: Material, c: RGB, lk = 1) => {
      m.base = tone(c, lum(m.base) * lk); m.mid = tone(c, lum(m.mid) * lk); m.tip = tone(c, lum(m.tip) * lk);
      if (m.edge) m.edge = tone(c, Math.min(0.95, lum(m.edge) * lk));
      if (m.backMix) m.back = tone(c, lum(m.back) * lk);
    };
    for (const [name, m0] of Object.entries(spec.materials)) {
      const m: Material = { ...m0 };
      if (pal.petal && m.role === 'petal') {
        m.base = pal.petal[0]; m.mid = pal.petal[1]; m.tip = pal.petal[2];
        m.edge = undefined;
        m.back = [lerp(pal.petal[1][0], 1, 0.4), lerp(pal.petal[1][1], 1, 0.4), lerp(pal.petal[1][2], 1, 0.4)];
        if (m.spots) m.spots = { ...m.spots, color: tone(pal.petal[0], lum(m.spots.color)) };
      }
      if (pal.center && m.role === 'center') recolour(m, pal.center, pal.centerLum ?? 1);
      if (pal.stem && m.role === 'stem') recolour(m, pal.stem, pal.partLum ?? 1);
      if (pal.leaf && m.role === 'leaf') recolour(m, pal.leaf, pal.partLum ?? 1);
      this.matIndex[name] = this.mats.length;
      this.mats.push(m);
    }
  }

  /* -------------------------------------------------------------- albedo of a surface point */
  private lastU = -1; private lastM: Material | null = null; private rowC = [0, 0, 0]; private rowTip = 0;
  private albedo(m: Material, u: number, v: number, h: number, part: number, wilt: number, out: number[]) {
    if (u !== this.lastU || m !== this.lastM) {
      const t = Math.pow(clamp(u, 0, 1), 0.75), c = this.rowC;
      if (t < 0.5) { const k = t * 2; c[0] = lerp(m.base[0], m.mid[0], k); c[1] = lerp(m.base[1], m.mid[1], k); c[2] = lerp(m.base[2], m.mid[2], k); }
      else { const k = (t - 0.5) * 2; c[0] = lerp(m.mid[0], m.tip[0], k); c[1] = lerp(m.mid[1], m.tip[1], k); c[2] = lerp(m.mid[2], m.tip[2], k); }
      this.rowTip = smooth(0.86, 1, u) * 0.6;
      this.lastU = u; this.lastM = m;
    }
    let r = this.rowC[0], g = this.rowC[1], b = this.rowC[2];
    const av = Math.abs(v);
    if (m.edge && m.edgeAmt) {
      const e = Math.max(smooth(0.55, 1, av), this.rowTip) * m.edgeAmt;
      r = lerp(r, m.edge[0], e); g = lerp(g, m.edge[1], e); b = lerp(b, m.edge[2], e);
    }
    if (m.vein) {
      const n = m.veinCount || 7;
      const phase = m.veinKind === 'pinnate' ? (u * 0.9 - av * 0.55) * n : v * n * 0.5;
      const d = Math.abs(frac(phase) - 0.5) * 2;
      let vm = smooth(0.72, 1, d);
      vm = Math.max(vm, smooth(0.1, 0, av) * 1.2);
      const dk = 1 - m.vein * vm * (1 - 0.45 * u);
      r *= dk; g *= dk; b *= dk;
    }
    if (m.spots && u > m.spots.uMin && u < m.spots.uMax && av < 0.8) {
      const gu = Math.floor(u * 30), gv = Math.floor((v + 1) * 10);
      if (hash(part, gu, gv * 7 + 3) < m.spots.amount) {
        const cu = frac(u * 30) - 0.5, cvv = frac((v + 1) * 10) - 0.5;
        if (cu * cu + cvv * cvv < 0.14) { r = m.spots.color[0]; g = m.spots.color[1]; b = m.spots.color[2]; }
      }
    }
    const j = 0.96 + 0.08 * h;
    r *= j; g *= j; b *= j;
    if (wilt > 0) {
      const w = wilt * (0.35 + 0.45 * u), l = (r + g + b) / 3;
      r = lerp(r, 0.55 * l + 0.2, w); g = lerp(g, 0.38 * l + 0.12, w); b = lerp(b, 0.28 * l + 0.08, w);
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  /* -------------------------------------------------------------- push one sample */
  private ALB = [0, 0, 0];
  private push(fr: Frame, X: number, Y: number, Z: number, nx: number, ny: number, nz: number,
    mat: number, part: number, u: number, v: number, ao: number, flags: number, h: number, rel: number, dust: number) {
    const s = this.s, i = s.n++;
    s.x[i] = X; s.y[i] = Y; s.z[i] = Z; s.nx[i] = nx; s.ny[i] = ny; s.nz[i] = nz;
    this.albedo(fr.mats[mat], u, v, h, part, fr.mats[mat].role === 'petal' ? fr.wilt : fr.wilt * 0.4, this.ALB);
    s.ar[i] = this.ALB[0]; s.ag[i] = this.ALB[1]; s.ab[i] = this.ALB[2];
    s.ao[i] = ao; s.h[i] = h; s.rel[i] = rel; s.mat[i] = mat; s.part[i] = part; s.flags[i] = flags; s.dust[i] = dust;
  }

  /** when the wind/burst/drift takes a point, and how */
  private REL = 0; private DM = 0;
  private release(fr: Frame, X: number, Y: number, Z: number, h: number, k: number, role: Material['role']) {
    this.REL = 0; this.DM = 0;
    const r = this.rel0(fr, X, Y, Z, h, k, role);
    if (r) { this.REL = r[0]; this.DM = r[1]; }
  }
  private rel0(fr: Frame, X: number, Y: number, Z: number, h: number, k: number, role: Material['role']): [number, number] | null {
    const tl = fr.tl;
    if (!isFinite(tl.end0) || fr.t < tl.end0) return null;
    switch (fr.ending) {
      case 'wind': {
        const nxr = clamp((X * fr.yaw0c + Z * fr.yaw0s) / 2.6 + 0.5, 0, 1);
        if (role === 'center') return [tl.end0 + 2.05 + (1 - nxr) * 0.45 + h * 0.5, DUST_WIND];
        return [tl.end0 + (1 - nxr) * 1.3 + h * 0.22 + (1 - k) * 0.08 + (role === 'stem' ? 0.25 : 0), DUST_WIND];
      }
      case 'burst': {
        const d = Math.sqrt(X * X + (Y - 0.3) * (Y - 0.3) + Z * Z);
        return [tl.end0 + d * 0.22 + h * 0.15, DUST_BURST];
      }
      case 'fall':
        return role === 'petal' ? null : [tl.end0 + 3.4 + h * 0.8 + Math.max(0, -Y) * 0.15, DUST_DRIFT];
      case 'wilt':
        return role === 'petal' ? null : [tl.end0 + 5.2 + h * 0.8 + Math.max(0, -Y) * 0.15, DUST_DRIFT];
      default:
        return null;
    }
  }

  /* -------------------------------------------------------------- petal / leaf surface */
  private PX = new Float32Array(130 * 110); private PY = new Float32Array(130 * 110); private PZ = new Float32Array(130 * 110);
  private SR = new Float32Array(131); private SY = new Float32Array(131); private SA = new Float32Array(131);
  private SKIP = new Uint8Array(130 * 110);

  private petal(fr: Frame, xf: Xf, P: {
    len: number; wid: number; r0: number; y0: number; baseA: number; bendA: number; curlA: number;
    cup: number; fold: number; reflex: number; ruffle: number; ruffleFreq: number; shape: PetalShape;
    notch: number; wrap: number; phi: number; seed: number; k: number;
  }, mat: number, fall: { R: number[]; c: [number, number, number]; off: [number, number, number]; fade: number } | null,
  aoBase: number, text: boolean, roleOverride?: Material['role']) {
    const pxs = fr.pxu * xf.s;
    const hwMax = P.wid * P.len;
    const nu = clamp(Math.ceil(P.len * pxs / fr.cellW * fr.dens) + 2, 3, 128);
    const nv = clamp(Math.ceil(2 * hwMax * pxs / fr.cellW * fr.dens) + 2, 2, 108);
    const ds = P.len / nu, stride = nv + 1;
    const { PX, PY, PZ, SR, SY, SA, SKIP } = this;
    let r = P.r0, yy = P.y0;
    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu;
      if (iu > 0) {
        const um = (iu - 0.5) / nu;
        const am = P.baseA + P.bendA * um + P.curlA * um * um * um;
        r += Math.sin(am) * ds; yy += Math.cos(am) * ds;
      }
      SR[iu] = r; SY[iu] = yy; SA[iu] = P.baseA + P.bendA * u + P.curlA * u * u * u;
    }
    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu;
      const hw = hwMax * widthAt(P.shape, u) * (1 + 0.05 * Math.sin(P.seed + u * 11));
      const a = SA[iu], ca = Math.cos(a), sa = Math.sin(a), rr = SR[iu], yb = SY[iu];
      const liftK = P.cup * (1 - u * 0.6) - P.reflex * u * u;
      for (let iv = 0; iv <= nv; iv++) {
        const v = iv / nv * 2 - 1, av = Math.abs(v);
        let lift = hw * (v * v * liftK + P.fold * av);
        if (P.ruffle) lift += P.ruffle * hwMax * Math.sin(u * P.ruffleFreq * Math.PI + v * 2.5 + P.seed) * av * av * av;
        const rho = rr - ca * lift;
        const del = clamp(v * hw / (rho > P.wrap ? rho : P.wrap), -2.3, 2.3);
        const ang = P.phi + del;
        const g = iu * stride + iv;
        PX[g] = rho * Math.cos(ang); PY[g] = yb + sa * lift; PZ[g] = rho * Math.sin(ang);
        SKIP[g] = P.notch > 0 && av < 0.42 && u > 1 - P.notch * (1 - av / 0.42) ? 1 : 0;
      }
    }
    // orient normals toward the inner face once, in the middle of the petal
    let flip = 1;
    {
      const iu = nu >> 1, iv = nv >> 1, g = iu * stride + iv;
      const g1 = (iu + 1) * stride + iv, g0 = (iu - 1) * stride + iv, g3 = g + 1, g2 = g - 1;
      const dux = PX[g1] - PX[g0], duy = PY[g1] - PY[g0], duz = PZ[g1] - PZ[g0];
      const dvx = PX[g3] - PX[g2], dvy = PY[g3] - PY[g2], dvz = PZ[g3] - PZ[g2];
      const nx = duy * dvz - duz * dvy, ny = duz * dvx - dux * dvz, nz = dux * dvy - duy * dvx;
      const pr = Math.sqrt(PX[g] * PX[g] + PZ[g] * PZ[g]) || 1, c = Math.cos(SA[iu]);
      if (nx * (-c * PX[g] / pr) + ny * Math.sin(SA[iu]) + nz * (-c * PZ[g] / pr) < 0) flip = -1;
    }
    const part = fr.part++;
    const m = fr.mats[mat];
    const role = roleOverride || m.role;
    this.s.reserve(nu * stride);
    const R = xf.r, sc = xf.s, [tx, ty, tz] = xf.t;
    for (let iu = 1; iu <= nu; iu++) {
      const u = iu / nu;
      const ao = lerp(lerp(0.45, 1, smooth(0, 0.75, u)) * aoBase, 1, fr.white * 0.8);
      const ia = iu - 1, ib = iu < nu ? iu + 1 : nu;
      for (let iv = 0; iv <= nv; iv++) {
        const g = iu * stride + iv;
        if (SKIP[g]) continue;
        const va = iv > 0 ? iv - 1 : 0, vb = iv < nv ? iv + 1 : nv;
        const g1 = ib * stride + iv, g0 = ia * stride + iv, g3 = iu * stride + vb, g2 = iu * stride + va;
        const dux = PX[g1] - PX[g0], duy = PY[g1] - PY[g0], duz = PZ[g1] - PZ[g0];
        const dvx = PX[g3] - PX[g2], dvy = PY[g3] - PY[g2], dvz = PZ[g3] - PZ[g2];
        let nx = duy * dvz - duz * dvy, ny = duz * dvx - dux * dvz, nz = dux * dvy - duy * dvx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl < 1e-9) { nx = 0; ny = flip; nz = 0; } else { const q = flip / nl; nx *= q; ny *= q; nz *= q; }
        // head transform
        const lx = PX[g] * sc, ly = PY[g] * sc, lz = PZ[g] * sc;
        let X = R[0] * lx + R[1] * ly + R[2] * lz + tx;
        let Y = R[3] * lx + R[4] * ly + R[5] * lz + ty;
        let Z = R[6] * lx + R[7] * ly + R[8] * lz + tz;
        let NX = R[0] * nx + R[1] * ny + R[2] * nz, NY = R[3] * nx + R[4] * ny + R[5] * nz, NZ = R[6] * nx + R[7] * ny + R[8] * nz;
        const h = hash(part, iu * 131 + iv, 11);
        if (fall) {
          if (fall.fade > 0 && h < fall.fade) continue;
          const F = fall.R, cx = X - fall.c[0], cy = Y - fall.c[1], cz = Z - fall.c[2];
          X = F[0] * cx + F[1] * cy + F[2] * cz + fall.c[0] + fall.off[0];
          Y = F[3] * cx + F[4] * cy + F[5] * cz + fall.c[1] + fall.off[1];
          Z = F[6] * cx + F[7] * cy + F[8] * cz + fall.c[2] + fall.off[2];
          const n0 = NX, n1 = NY, n2 = NZ;
          NX = F[0] * n0 + F[1] * n1 + F[2] * n2; NY = F[3] * n0 + F[4] * n1 + F[5] * n2; NZ = F[6] * n0 + F[7] * n1 + F[8] * n2;
        }
        const v = iv / nv * 2 - 1;
        let flags = 0;
        if (text && fr.wantText && Math.sin(u * 7.0 + P.seed) + Math.sin(v * 3.1 + P.seed * 1.7 + u * 2.0) > fr.textThr) flags |= F_TEXT;
        let rel = 0, dm = 0;
        if (!fall) { this.release(fr, X, Y, Z, h, P.k, role); rel = this.REL; dm = this.DM; }
        this.push(fr, X, Y, Z, NX, NY, NZ, mat, part, u, v, ao, flags, h, rel, dm);
      }
    }
  }

  /* -------------------------------------------------------------- tubes: stems, twigs, filaments */
  private tube(fr: Frame, curve: (s: number, out: number[]) => void, radius: (s: number) => number,
    length: number, s0: number, s1: number, mat: number, k: number) {
    const pxs = fr.pxu;
    const rMax = radius(s0);
    const ns = clamp(Math.ceil(length * (s1 - s0) * pxs / fr.cellW * fr.dens) + 2, 2, 400);
    const nt = clamp(Math.ceil(2 * Math.PI * rMax * pxs / fr.cellW * fr.dens * 1.2) + 3, 3, 40);
    const part = fr.part++;
    const role = fr.mats[mat].role;
    this.s.reserve(ns * nt);
    const p = [0, 0, 0], q = [0, 0, 0];
    for (let is = 0; is <= ns; is++) {
      const sv = lerp(s0, s1, is / ns);
      curve(sv, p); curve(Math.min(1, sv + 0.01), q);
      let [tx, ty, tz] = norm(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (sv >= 0.99) { curve(sv - 0.01, q); [tx, ty, tz] = norm(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
      // a frame around the tangent
      let [ax, ay, az] = Math.abs(ty) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let [nx1, ny1, nz1] = norm(ay * tz - az * ty, az * tx - ax * tz, ax * ty - ay * tx);
      const bx = ty * nz1 - tz * ny1, by = tz * nx1 - tx * nz1, bz = tx * ny1 - ty * nx1;
      const rr = radius(sv);
      for (let it = 0; it < nt; it++) {
        const a = it / nt * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nx = c * nx1 + s * bx, ny = c * ny1 + s * by, nz = c * nz1 + s * bz;
        const X = p[0] + rr * nx, Y = p[1] + rr * ny, Z = p[2] + rr * nz;
        const h = hash(part, is * 61 + it, 5);
        this.release(fr, X, Y, Z, h, k, role); const rel = this.REL, dm = this.DM;
        // outward normal = outer face; pass inward so `back` reads as the visible outside
        this.push(fr, X, Y, Z, -nx, -ny, -nz, mat, part, sv, Math.cos(a) * 0.3, 1, 0, h, rel, dm);
      }
    }
  }

  /* -------------------------------------------------------------- ellipsoid blobs */
  private blob(fr: Frame, c: number[], ax: number[], ay: number[], az: number[], r: number[], mat: number,
    bumps: number, upper: boolean, flags: number, k: number) {
    const pxs = fr.pxu;
    const rm = Math.max(r[0], r[1], r[2]);
    const nT = clamp(Math.ceil(2 * Math.PI * rm * pxs / fr.cellW * fr.dens * 1.1) + 4, 6, 120);
    const nP = clamp(Math.ceil(Math.PI * rm * pxs / fr.cellW * fr.dens * 0.6) + 3, 3, 60);
    const part = fr.part++;
    const role = fr.mats[mat].role;
    this.s.reserve(nT * (nP + 1));
    const top = upper ? 1.5 : Math.PI;
    for (let ip = 0; ip <= nP; ip++) {
      const psi = ip / nP * top, sp = Math.sin(psi), cp = Math.cos(psi);
      for (let it = 0; it < nT; it++) {
        const th = it / nT * Math.PI * 2;
        const bump = 1 + bumps * Math.sin(th * 7 + ip) * Math.sin(psi * 6);
        const lx = sp * Math.cos(th), ly = cp, lz = sp * Math.sin(th);
        const ex = lx * r[0] * bump, ey = ly * r[1] * bump, ez = lz * r[2] * bump;
        const X = c[0] + ax[0] * ex + ay[0] * ey + az[0] * ez;
        const Y = c[1] + ax[1] * ex + ay[1] * ey + az[1] * ez;
        const Z = c[2] + ax[2] * ex + ay[2] * ey + az[2] * ez;
        const gx = lx / r[0], gy = ly / r[1], gz = lz / r[2];
        const [nx, ny, nz] = norm(ax[0] * gx + ay[0] * gy + az[0] * gz, ax[1] * gx + ay[1] * gy + az[1] * gz, ax[2] * gx + ay[2] * gy + az[2] * gz);
        const h = hash(part, ip * 977 + it, 13);
        this.release(fr, X, Y, Z, h, k, role); const rel = this.REL, dm = this.DM;
        this.push(fr, X, Y, Z, -nx, -ny, -nz, mat, part, ip / nP, Math.cos(th), 1,
          flags && (ip + it) % 3 === 0 ? flags : 0, h, rel, dm);
      }
    }
  }

  /* -------------------------------------------------------------- one flower head */
  private head(fr: Frame, spec: FlowerSpec, hs: HeadSpec, hi: number) {
    const xf: Xf = { r: hs.tilt[0] || hs.tilt[1] ? tiltMatrix(hs.tilt[0], hs.tilt[1]) : IDENT, t: hs.pos, s: hs.scale };
    const bh = hs.lag >= 1 ? fr.bloom * hs.maxBloom : s01((fr.bloom - hs.lag) / Math.max(0.01, 1 - hs.lag)) * hs.maxBloom;
    const tl = fr.tl;
    // petals and sepals
    let order = 0;
    const totalPetals = spec.whorls.reduce((a, w) => a + (this.mats[this.matIndex[w.mat]].role === 'petal' ? w.count : 0), 0);
    for (let wi = 0; wi < spec.whorls.length; wi++) {
      const w: Whorl = spec.whorls[wi];
      const mat = this.matIndex[w.mat];
      const m = fr.mats[mat];
      for (let i = 0; i < w.count; i++) {
        const kk = w.count > 1 ? lerp(w.k[0], w.k[1], i / (w.count - 1)) : w.k[1];
        const seed = hash(hi * 31 + wi, i, 7) * 10;
        const jit = (w.jitter || 0);
        const phi = w.layout === 'spiral'
          ? i * GOLDEN + (hash(i, 1, 7) - 0.5) * 0.35
          : (w.phase || 0) + i / w.count * Math.PI * 2 + (hash(hi, wi * 50 + i, 3) - 0.5) * jit;
        const delay = (1 - kk) * 0.42;
        const bi = s01((bh - delay) / (1 - delay));
        const lenJ = 1 + (hash(hi, wi * 50 + i, 2) - 0.5) * jit;
        let baseA = lerp(w.bud[0], rng(w.base, kk), bi) + (hash(hi, wi * 50 + i, 4) - 0.5) * jit * 0.6;
        let bendA = lerp(w.bud[1], rng(w.bend, kk), bi);
        let curlA = rng(w.curl, kk) * bi;
        const isPetal = m.role === 'petal';
        if (isPetal && fr.wilt > 0) {
          baseA += fr.wilt * 0.35; bendA += fr.wilt * 1.3 * (0.5 + kk); curlA += fr.wilt * 0.8;
        }
        // falling petals (petal fall and wilt endings)
        let fall: { R: number[]; c: [number, number, number]; off: [number, number, number]; fade: number } | null = null;
        if (isPetal && (fr.ending === 'fall' || fr.ending === 'wilt') && isFinite(tl.end0)) {
          const n = totalPetals;
          const ord = order / Math.max(1, n - 1);
          const start = fr.ending === 'fall' ? tl.end0 : tl.end0 + 2.2;
          const span = fr.ending === 'fall' ? 2.4 : 2.6;
          const tD = start + (1 - ord) * span * 0.85 + hash(hi, order, 21) * span * 0.25;
          const age = fr.t - tD;
          if (age > 0) {
            const life = 2.6;
            if (age > life) { order++; continue; }
            const h1 = hash(hi, order, 22), h2 = hash(hi, order, 23), h3 = hash(hi, order, 24);
            const [ax, ay, az] = norm(h1 - 0.5, 0.35, h3 - 0.5);
            const angle = age * (1.4 + h2 * 1.6);
            // pivot: about halfway along the petal
            const pr = rng(w.r0, kk) + rng(w.len, kk) * 0.45 * Math.sin(baseA);
            const py = rng(w.y0, kk) + rng(w.len, kk) * 0.45 * Math.cos(baseA);
            const lc: [number, number, number] = [pr * Math.cos(phi) * xf.s, py * xf.s, pr * Math.sin(phi) * xf.s];
            const c: [number, number, number] = [
              xf.r[0] * lc[0] + xf.r[1] * lc[1] + xf.r[2] * lc[2] + xf.t[0],
              xf.r[3] * lc[0] + xf.r[4] * lc[1] + xf.r[5] * lc[2] + xf.t[1],
              xf.r[6] * lc[0] + xf.r[7] * lc[1] + xf.r[8] * lc[2] + xf.t[2],
            ];
            fall = {
              R: axisAngle(ax, ay, az, angle), c,
              off: [age * (0.35 + h1 * 0.4) + Math.sin(age * 3 + h2 * 6) * 0.12 * age, -0.62 * age * age * (0.75 + h3 * 0.5), (h2 - 0.5) * age * 0.8],
              fade: smooth(life - 0.7, life, age),
            };
          }
          order++;
        }
        this.petal(fr, xf, {
          len: rng(w.len, kk) * lenJ * (isPetal ? 1 - fr.wilt * 0.06 : 1), wid: rng(w.wid, kk), r0: rng(w.r0, kk), y0: rng(w.y0, kk),
          baseA, bendA, curlA,
          cup: lerp(0.1, w.cup, bi), fold: w.fold, reflex: w.reflex * bi, ruffle: w.ruffle * (0.4 + 0.6 * bi), ruffleFreq: w.ruffleFreq,
          shape: w.shape, notch: w.notch || 0, wrap: w.wrap, phi, seed, k: kk,
        }, mat, fall, lerp(0.72, 1, kk), !!m.text);
      }
    }
    // the middle of the flower
    for (const c of spec.centers) this.center(fr, c, xf, bh, hi);
  }

  private center(fr: Frame, c: CenterSpec, xf: Xf, bh: number, hi: number) {
    const R = xf.r, sc = xf.s;
    const W = (x: number, y: number, z: number): number[] => [
      R[0] * x * sc + R[1] * y * sc + R[2] * z * sc + xf.t[0],
      R[3] * x * sc + R[4] * y * sc + R[5] * z * sc + xf.t[1],
      R[6] * x * sc + R[7] * y * sc + R[8] * z * sc + xf.t[2],
    ];
    const D = (x: number, y: number, z: number): number[] => [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];
    const textOn = fr.wantText ? F_TEXT : 0;
    switch (c.kind) {
      case 'dome':
        this.blob(fr, W(0, c.y, 0), D(1, 0, 0), D(0, 0.8, 0), D(0, 0, 1), [c.r * sc, c.r * sc, c.r * sc], this.matIndex[c.mat], c.bumps, true, textOn, 1);
        break;
      case 'blob':
        this.blob(fr, W(c.c[0], c.c[1], c.c[2]), D(1, 0, 0), D(0, 1, 0), D(0, 0, 1), [c.r[0] * sc, c.r[1] * sc, c.r[2] * sc], this.matIndex[c.mat], 0.04, false, 0, 1);
        break;
      case 'disc': this.disc(fr, c, W, D, sc, hi); break;
      case 'pod': this.pod(fr, c, W, D, sc); break;
      case 'stamens': {
        const open = 0.25 + 0.75 * bh;
        const mat = this.matIndex[c.mat], am = this.matIndex[c.antherMat];
        for (let i = 0; i < c.count; i++) {
          const a = i / c.count * Math.PI * 2 + hash(hi, i, 31) * 0.4;
          const ca = Math.cos(a), sa = Math.sin(a);
          const lenJ = 0.85 + hash(hi, i, 32) * 0.3;
          const sp = c.spread * open * lenJ, ht = c.height * lenJ * (0.4 + 0.6 * open);
          const curve = (s: number, out: number[]) => {
            const rr = c.r0 + sp * s, y = c.y0 + ht * s - c.droop * open * s * s;
            const p = W(rr * ca, y, rr * sa); out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
          };
          this.tube(fr, curve, () => c.radius * sc, Math.hypot(sp, ht) * sc, 0, 1, mat, 1);
          const tip = [0, 0, 0]; curve(1, tip);
          // anther: radial, up, tangential axes
          this.blob(fr, tip, D(ca, 0, sa), D(0, 1, 0), D(-sa, 0, ca), [c.anther[0] * sc, c.anther[1] * sc, c.anther[2] * sc], am, 0, false, 0, 1);
        }
        break;
      }
      case 'pistil': {
        const mat = this.matIndex[c.mat], sm = this.matIndex[c.stigmaMat];
        const curve = (s: number, out: number[]) => {
          const p = W(c.lean * s * s * 0.5, c.len * s, 0); out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
        };
        this.tube(fr, curve, (s) => c.radius * sc * (1 - 0.3 * s), c.len * sc, 0, 1, mat, 1);
        const tip = [0, 0, 0]; curve(1, tip);
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          const o = D(Math.cos(a) * c.stigma * 0.7 * sc, 0, Math.sin(a) * c.stigma * 0.7 * sc);
          this.blob(fr, [tip[0] + o[0], tip[1] + o[1], tip[2] + o[2]], D(1, 0, 0), D(0, 1, 0), D(0, 0, 1),
            [c.stigma * sc, c.stigma * 0.7 * sc, c.stigma * sc], sm, 0, false, 0, 1);
        }
        break;
      }
    }
  }

  private disc(fr: Frame, c: Extract<CenterSpec, { kind: 'disc' }>, W: (x: number, y: number, z: number) => number[], D: (x: number, y: number, z: number) => number[], sc: number, hi: number) {
    const base = this.matIndex[c.baseMat], flo = this.matIndex[c.floretMat], ring = c.ringMat ? this.matIndex[c.ringMat] : flo;
    const pxs = fr.pxu * sc;
    const nr = clamp(Math.ceil(c.r * pxs / fr.cellW * fr.dens * 1.1) + 2, 3, 80);
    const part = fr.part++;
    const textOn = fr.wantText ? F_TEXT : 0;
    const domeY = (rr: number) => c.y + c.height * (1 - (rr / c.r) * (rr / c.r));
    // the disc itself
    for (let ir = 0; ir <= nr; ir++) {
      const rr = ir / nr * c.r;
      const nt = Math.max(6, Math.ceil(2 * Math.PI * rr * pxs / fr.cellW * fr.dens * 1.1));
      this.s.reserve(nt);
      for (let it = 0; it < nt; it++) {
        const a = it / nt * Math.PI * 2;
        const p = W(rr * Math.cos(a), domeY(rr), rr * Math.sin(a));
        const slope = 2 * c.height * rr / (c.r * c.r);
        const n = D(...norm(slope * Math.cos(a), 1, slope * Math.sin(a)));
        const h = hash(part, ir * 997 + it, 3);
        this.release(fr, p[0], p[1], p[2], h, 1, 'center'); const rel = this.REL, dm = this.DM;
        this.push(fr, p[0], p[1], p[2], -n[0], -n[1], -n[2], base, part, rr / c.r, 0, 0.8, 0, h, rel, dm);
      }
    }
    // florets on a Fermat spiral, slightly raised so they sit over the disc
    this.s.reserve(c.florets);
    for (let i = 1; i <= c.florets; i++) {
      const rr = c.r * Math.sqrt(i / c.florets) * 0.97, a = i * GOLDEN;
      const lift = 0.016 + 0.01 * (1 - rr / c.r);
      const slope = 2 * c.height * rr / (c.r * c.r);
      const nn = norm(slope * Math.cos(a), 1, slope * Math.sin(a));
      const p = W(rr * Math.cos(a) + nn[0] * lift, domeY(rr) + nn[1] * lift, rr * Math.sin(a) + nn[2] * lift);
      const n = D(...nn);
      const h = hash(hi, i, 41);
      this.release(fr, p[0], p[1], p[2], h, 1, 'center'); const rel = this.REL, dm = this.DM;
      const m = rr > c.r * 0.8 ? ring : flo;
      this.push(fr, p[0], p[1], p[2], -n[0], -n[1], -n[2], m, part, rr / c.r, 0, 1, i % 4 === 0 ? textOn : 0, h, rel, dm);
    }
  }

  private pod(fr: Frame, c: Extract<CenterSpec, { kind: 'pod' }>, W: (x: number, y: number, z: number) => number[], D: (x: number, y: number, z: number) => number[], sc: number) {
    const mat = this.matIndex[c.mat];
    const pxs = fr.pxu * sc;
    const part = fr.part++;
    // side: a widening cup
    const nh = clamp(Math.ceil(c.h * pxs / fr.cellW * fr.dens) + 2, 2, 40);
    for (let ih = 0; ih <= nh; ih++) {
      const s = ih / nh, rr = lerp(c.r0, c.r1, s), y = c.y + c.h * s;
      const nt = Math.max(8, Math.ceil(2 * Math.PI * rr * pxs / fr.cellW * fr.dens * 1.1));
      this.s.reserve(nt);
      for (let it = 0; it < nt; it++) {
        const a = it / nt * Math.PI * 2;
        const p = W(rr * Math.cos(a), y, rr * Math.sin(a));
        const n = D(...norm(Math.cos(a), -(c.r1 - c.r0) / c.h, Math.sin(a)));
        const h = hash(part, ih * 997 + it, 3);
        this.release(fr, p[0], p[1], p[2], h, 1, 'center'); const rel = this.REL, dm = this.DM;
        this.push(fr, p[0], p[1], p[2], -n[0], -n[1], -n[2], mat, part, s * 0.5, 0, 0.9, 0, h, rel, dm);
      }
    }
    // top with seed holes
    const holes: [number, number][] = [[0, 0]];
    for (let i = 0; i < 6; i++) holes.push([Math.cos(i / 6 * Math.PI * 2) * c.r1 * 0.45, Math.sin(i / 6 * Math.PI * 2) * c.r1 * 0.45]);
    for (let i = 0; i < Math.max(0, c.holes - 7); i++) holes.push([Math.cos((i + 0.5) / (c.holes - 7) * Math.PI * 2) * c.r1 * 0.78, Math.sin((i + 0.5) / (c.holes - 7) * Math.PI * 2) * c.r1 * 0.78]);
    const hr = c.r1 * 0.13;
    const nr = clamp(Math.ceil(c.r1 * pxs / fr.cellW * fr.dens * 1.1) + 2, 3, 40);
    const y = c.y + c.h;
    const n = D(0, 1, 0);
    for (let ir = 0; ir <= nr; ir++) {
      const rr = ir / nr * c.r1;
      const nt = Math.max(6, Math.ceil(2 * Math.PI * rr * pxs / fr.cellW * fr.dens * 1.1));
      this.s.reserve(nt);
      for (let it = 0; it < nt; it++) {
        const a = it / nt * Math.PI * 2, lx = rr * Math.cos(a), lz = rr * Math.sin(a);
        let inHole = false;
        for (const [hx, hz] of holes) if ((lx - hx) * (lx - hx) + (lz - hz) * (lz - hz) < hr * hr) { inHole = true; break; }
        const p = W(lx, y - (inHole ? 0.012 : 0), lz);
        const h = hash(part, ir * 991 + it, 5);
        this.release(fr, p[0], p[1], p[2], h, 1, 'center'); const rel = this.REL, dm = this.DM;
        const i = this.s.n;
        this.push(fr, p[0], p[1], p[2], -n[0], -n[1], -n[2], mat, part, 1, 0, inHole ? 0.5 : 1, 0, h, rel, dm);
        if (inHole) { this.s.ar[i] = c.holeColor[0]; this.s.ag[i] = c.holeColor[1]; this.s.ab[i] = c.holeColor[2]; }
      }
    }
  }

  /* -------------------------------------------------------------- stem, leaves, pad, twig */
  private stem(fr: Frame, spec: FlowerSpec) {
    const st = spec.stem;
    const mat = this.matIndex[st.mat], lm = this.matIndex[st.leafMat];
    const g = fr.stemGrow;
    if (st.twig) { this.twig(fr, spec, mat, lm); return; }
    const head = (spec.heads && spec.heads[0]) || { pos: [0, 0, 0], tilt: [0, 0], scale: 1, lag: 0, maxBloom: 1 } as HeadSpec;
    const hr = head.tilt[0] || head.tilt[1] ? tiltMatrix(head.tilt[0], head.tilt[1]) : IDENT;
    // start just under the head, along the head's own down axis, then fall toward vertical
    const start = [head.pos[0] - hr[1] * 0.08, head.pos[1] - hr[4] * 0.08, head.pos[2] - hr[7] * 0.08];
    const dn = [-hr[1], -hr[4], -hr[7]];
    const curve = (s: number, out: number[]) => {
      const bendIn = Math.min(1, s * 4);
      out[0] = start[0] + dn[0] * 0.3 * s * (1 - bendIn * 0.5) + st.bend[0] * s * s + 0.04 * Math.sin(s * 5);
      out[1] = start[1] - st.len * s;
      out[2] = start[2] + dn[2] * 0.3 * s * (1 - bendIn * 0.5) + st.bend[1] * s * s;
    };
    if (g > 0.02) this.tube(fr, curve, (s) => st.r * (1 + 0.35 * s), st.len, 0, g, mat, 1);
    for (const L of st.leaves) {
      const open = smooth(L.at, L.at + 0.25, g);
      if (open <= 0.01) continue;
      const p = [0, 0, 0]; curve(L.at, p);
      this.leaf(fr, L, p, open, lm, st.r * (1 + 0.35 * L.at));
    }
    if (st.pad) {
      const foot = [0, 0, 0]; curve(1, foot);
      this.pad(fr, st.pad, foot, g, mat);
    }
  }

  private leaf(fr: Frame, L: LeafSpec, at: number[], open: number, mat: number, stemR: number) {
    const base = lerp(0.12, L.base, open), bend = L.bend * open, curl = L.curl * open;
    const mk = (pos: number[], phi: number, len: number, wid: number, b: number) => {
      this.petal(fr, { r: IDENT, t: [pos[0], pos[1], pos[2]], s: 1 }, {
        len: len * (0.35 + 0.65 * open), wid, r0: stemR, y0: 0, baseA: b, bendA: bend, curlA: curl,
        cup: L.cup, fold: L.fold, reflex: 0, ruffle: L.ruffle, ruffleFreq: L.ruffleFreq, shape: L.shape,
        notch: 0, wrap: 2.5, phi, seed: phi * 3, k: 1,
      }, mat, null, 0.85, false, 'leaf');
    };
    if (!L.leaflets) { mk(at, L.phi, L.len, L.wid, base); return; }
    // compound: a short stalk carrying leaflets
    const stalk = 0.32 * (0.4 + 0.6 * open);
    const dir = [Math.cos(L.phi) * Math.sin(base), Math.cos(base), Math.sin(L.phi) * Math.sin(base)];
    const curve = (s: number, out: number[]) => {
      out[0] = at[0] + dir[0] * stalk * s; out[1] = at[1] + dir[1] * stalk * s - 0.05 * s * s; out[2] = at[2] + dir[2] * stalk * s;
    };
    this.tube(fr, curve, () => stemR * 0.45, stalk, 0, 1, mat, 1);
    const end = [0, 0, 0]; curve(1, end);
    mk(end, L.phi, L.len, L.wid, base);
    const mid = [0, 0, 0]; curve(0.55, mid);
    mk(mid, L.phi + 1.0, L.len * 0.8, L.wid, base + 0.15);
    mk(mid, L.phi - 1.0, L.len * 0.8, L.wid, base + 0.15);
  }

  /** A lotus leaf: peltate (stalk joins the centre underneath), no notch, a shallow
   *  bowl with a wavy rim, held up on its own stalk. A young leaf is a tight funnel that opens. */
  private pad(fr: Frame, pad: NonNullable<FlowerSpec['stem']['pad']>, B: number[], g: number, stemMat: number) {
    const mat = this.matIndex[pad.mat];
    // like the flower, the leaf comes first and its stalk draws down to meet the stem's foot
    const open = smooth(0.2, 0.85, g), down = smooth(0.3, 1, g);
    const C = pad.pos;
    // stalk: straight up at the top so it meets the leaf dead centre
    const stalk = (s: number, out: number[]) => {
      const e = 1 - (1 - s) * (1 - s);
      out[0] = lerp(B[0], C[0], e); out[1] = lerp(B[1], C[1], s); out[2] = lerp(B[2], C[2], e);
    };
    const len = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
    if (down > 0.02) this.tube(fr, stalk, () => pad.stalkR, len, 1 - down, 1, stemMat, 1);
    if (open <= 0.01) return;
    const c = C;
    const R = pad.r * (0.3 + 0.7 * open);
    const H = R * lerp(0.95, 0.3, open);             // bowl depth: a funnel that flattens as it opens
    const W = R * 0.07 * open;                        // rim wave
    const slope = 1.5 * H / R;
    const nr = clamp(Math.ceil(R * fr.pxu / fr.cellW * fr.dens * Math.sqrt(1 + slope * slope)) + 2, 3, 120);
    const part = fr.part++;
    for (let ir = 1; ir <= nr; ir++) {
      const rr = ir / nr * R, q = rr / R;
      const nt = Math.max(8, Math.ceil(2 * Math.PI * rr * fr.pxu / fr.cellW * fr.dens * 1.05));
      this.s.reserve(nt);
      const sq = Math.sqrt(q), q2 = q * q, q3 = q2 * q;
      for (let it = 0; it < nt; it++) {
        const a = (it + 0.37 * ir) / nt * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const w1 = Math.sin(a * 5 + 1.3), w2 = Math.sin(a * 11 + 0.4);
        const X = c[0] + rr * ca, Z = c[2] + rr * sa;
        const Y = c[1] + H * q * sq + W * (w1 * q3 + 0.4 * w2 * q3 * q);
        // gradient of the surface, radial and around
        const dr = (1.5 * H * sq + W * (3 * w1 * q2 + 1.6 * w2 * q3)) / R;
        const da = W * (5 * Math.cos(a * 5 + 1.3) * q3 + 4.4 * Math.cos(a * 11 + 0.4) * q3 * q);
        const gx = dr * ca - da * sa / rr, gz = dr * sa + da * ca / rr;
        const [nx, ny, nz] = norm(-gx, 1, -gz);
        const h = hash(part, ir * 991 + it, 7);
        this.release(fr, X, Y, Z, h, 1, 'leaf'); const rel = this.REL, dm = this.DM;
        // veins radiate from the centre: v sweeps 0.1..0.5 and back once around, so the fan
        // veins fall evenly with no midrib and no edge tint by angle (both key off |v|)
        const v = 0.1 + 0.4 * Math.abs(a / Math.PI % 2 - 1);
        this.push(fr, X, Y, Z, nx, ny, nz, mat, part, q, v, 1, 0, h, rel, dm);
      }
    }
  }


  private twig(fr: Frame, spec: FlowerSpec, mat: number, lm: number) {
    const tw = spec.stem.twig!;
    const pts = tw.points;
    const g = fr.stemGrow;
    // Catmull-Rom through the points
    const curve = (s: number, out: number[]) => {
      const f = s * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 3; k++) {
        out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
      }
      out[1] += 0.03 * Math.sin(s * 23);
    };
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const mid = 0.5, half = 0.5 * g;
    this.tube(fr, curve, (s) => tw.r * (0.55 + 0.45 * Math.sin(Math.PI * s)), len, mid - half, mid + half, mat, 1);
    // short stalks to each head
    const heads = spec.heads || [];
    const probe = [0, 0, 0];
    for (const hs of heads) {
      let best = 0, bd = 1e9;
      for (let i = 0; i <= 60; i++) {
        curve(i / 60, probe);
        const d = Math.hypot(probe[0] - hs.pos[0], probe[1] - hs.pos[1], probe[2] - hs.pos[2]);
        if (d < bd) { bd = d; best = i / 60; }
      }
      if (Math.abs(best - mid) > half) continue;
      const a = [0, 0, 0]; curve(best, a);
      const hr = hs.tilt[0] || hs.tilt[1] ? tiltMatrix(hs.tilt[0], hs.tilt[1]) : IDENT;
      const b = [hs.pos[0] - hr[1] * 0.05 * hs.scale, hs.pos[1] - hr[4] * 0.05 * hs.scale, hs.pos[2] - hr[7] * 0.05 * hs.scale];
      const ped = (s: number, out: number[]) => {
        out[0] = lerp(a[0], b[0], s); out[1] = lerp(a[1], b[1], s) - 0.08 * Math.sin(Math.PI * s); out[2] = lerp(a[2], b[2], s);
      };
      this.tube(fr, ped, () => 0.016, bd, 0, 1, mat, 1);
    }
    // two young leaves near the tips
    for (const [at, phi] of [[0.12, 2.4], [0.9, 0.3]] as [number, number][]) {
      if (Math.abs(at - mid) > half) continue;
      const p = [0, 0, 0]; curve(at, p);
      this.leaf(fr, { at, phi, len: 0.5, wid: 0.34, base: 1.2, bend: 0.45, curl: 0.2, fold: 0.25, cup: 0.1, ruffle: 0.03, ruffleFreq: 18, shape: 'leaf' }, p, smooth(0.5, 1, g), lm, 0.02);
    }
  }

  /* -------------------------------------------------------------- glyph atlas */
  private buildAtlas() {
    const gs = GLYPH_SETS[this.cfg.glyphs];
    const key = `${this.CWd}x${this.CHd}|${this.cfg.glyphs}|${this.cfg.phrase}`;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    const roleChars = gs.roles ? [...(gs.roles.center || []), ...(gs.roles.stem || []), ...(gs.roles.leaf || [])] : [];
    const chars = [...new Set([...gs.ramp, ...gs.dust, ...roleChars, '-', '|', '/', '\\', '*', '·', ...Array.from(this.cfg.phrase.replace(/\s/g, ''))])];
    this.atlasCv.width = this.CWd * chars.length; this.atlasCv.height = this.CHd;
    const a = this.atlasCtx;
    a.clearRect(0, 0, this.atlasCv.width, this.atlasCv.height);
    a.font = `${this.CHd}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Hiragino Sans", "Noto Sans JP", "MS Gothic", monospace`;
    a.textAlign = 'center'; a.textBaseline = 'middle';
    a.fillStyle = '#fff';
    this.glyphAt.clear();
    this.atlasChars = chars;
    chars.forEach((c, i) => { this.glyphAt.set(c, i); a.fillText(c, (i + 0.5) * this.CWd, this.CHd * 0.56); });
  }

  /* -------------------------------------------------------------- one frame */
  render(tIn: number) {
    const t0 = performance.now();
    const cfg = this.cfg;
    const spec = FLOWERS[cfg.flower];
    this.buildMaterials(spec);
    this.buildAtlas();
    const tl = ENDINGS[cfg.ending].timeline;
    const t = tIn;
    const W = this.W, H = this.H;
    const minDim = Math.min(W, H);
    const zoom = spec.view.zoom * this.zoom;
    const D = 5.2;
    const f = minDim * 1.5 * zoom;
    const S = t < tl.dot ? 0 : t < tl.grow0 ? 0.012 : lerp(0.012, 1, 1 - Math.pow(1 - clamp((t - tl.grow0) / (tl.grow1 - tl.grow0), 0, 1), 1.6));
    const bloom = smooth(tl.bloom0, tl.bloom1, t);
    const white = 1 - smooth(tl.white0, tl.white1, t);
    const textGate = smooth(3.0, 5.2, t);
    const gs = GLYPH_SETS[cfg.glyphs];
    const wordsAmt = clamp(cfg.words, 0, 1);
    const { yaw, pitch } = this.angleAt(t);
    const yaw0 = this.turntable(isFinite(tl.end0) ? tl.end0 : 0).yaw + this.offset.yaw;
    const fr: Frame = {
      t, S, pxu: f * S / D, cellW: this.CWd, dens: 1.15 * this.quality, white, bloom,
      textThr: lerp(2.3, lerp(1.6, -0.2, wordsAmt), textGate), wantText: gs.words === 'patches' && wordsAmt > 0.02 && textGate > 0,
      mats: this.mats, matIndex: this.matIndex, tl, ending: cfg.ending,
      wilt: cfg.ending === 'wilt' && isFinite(tl.end0) ? smooth(tl.end0, tl.end0 + 2.6, t) : 0,
      yaw0c: Math.cos(yaw0), yaw0s: Math.sin(yaw0),
      stemGrow: cfg.stem ? smooth(tl.grow0 + 0.4, tl.grow1 - 0.6, t) : 0,
      part: 1,
    };

    // 1. geometry. Between full bloom and the ending (and for ever in Stay) the points do not
    // change, only the camera does, so the last build is reused while nothing it depends on moved.
    let tp = performance.now();
    const still = t >= Math.max(tl.bloom1, tl.grow1) && !(t >= tl.end0);
    const key = still ? `${cfg.flower}|${cfg.palette}|${cfg.stem}|${cfg.glyphs}|${cfg.words}|${cfg.ending}|${fr.pxu}|${fr.dens}|${fr.cellW}` : '';
    if (!key || key !== this.geoKey) {
      this.s.n = 0;
      if (S > 0) {
        const heads = spec.heads || [{ pos: [0, 0, 0], tilt: [0, 0], scale: 1, lag: 0, maxBloom: 1 } as HeadSpec];
        heads.forEach((hs, i) => { if (cfg.stem || i === 0) this.head(fr, spec, hs, i); });
        if (cfg.stem) this.stem(fr, spec);
      }
    }
    this.geoKey = key;

    this.perf.geo = performance.now() - tp; tp = performance.now();
    // 2. camera pass: project every sample into the character grid
    const { zb, cs, ca } = this;
    zb.fill(Infinity); cs.fill(-1);
    const s = this.s;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // tilted well away from the designed view, pivot on the head rather than the whole stem
    const cy = cfg.stem ? lerp(spec.view.cyStem, spec.view.cy, smooth(0.3, 1.1, Math.abs(pitch - spec.view.pitch))) : spec.view.cy;
    const W2 = W / 2, H2 = H / 2, windPx = minDim * 0.3;
    const CW = this.CWd, CH = this.CHd, cols = this.cols, rows = this.rows;
    for (let i = 0; i < s.n; i++) {
      let mx = s.x[i], my = s.y[i], mz = s.z[i];
      let alpha = 1, sdx = 0, sdy = 0, dust = false;
      const rel = s.rel[i];
      if (rel > 0 && t > rel) {
        const h = s.h[i];
        if ((h * 7.31) % 1 > 0.26) continue;          // most of it simply goes, unseen
        const age = t - rel, hi = (h * 1e6) | 0;
        const life = 0.9 + hash(s.part[i], hi, 3) * 0.9;
        const mode = s.dust[i];
        const L = mode === DUST_DRIFT ? life * 1.6 : life;
        if (age > L) continue;
        const h2 = hash(s.part[i], hi, 5), h3 = hash(s.part[i], hi, 6), ph = h * 40;
        if (mode === DUST_WIND) {
          sdx = windPx * (age * 1.1 + age * age * 0.7) * (0.6 + 0.8 * h2) + Math.sin(age * 2.3 + ph) * age * windPx * 0.08;
          sdy = windPx * age * ((h3 - 0.6) * 0.26 - 0.08 * age) + Math.cos(age * 3.1 + ph * 1.3) * age * windPx * 0.06;
        } else if (mode === DUST_BURST) {
          const [dx, dy, dz] = norm(mx + (h2 - 0.5) * 0.6, my - 0.25 + (h3 - 0.4) * 0.6, mz + (h - 0.5) * 0.6);
          const d = (age * 1.6 + age * age * 1.1) * (0.6 + 0.8 * h2);
          mx += dx * d; my += dy * d - age * age * 0.35; mz += dz * d;
        } else {
          sdx = windPx * age * 0.22 * (0.4 + h2) + Math.sin(age * 2 + ph) * windPx * 0.05;
          sdy = -windPx * age * 0.3 * (0.3 + h3);
        }
        const q = age / L;
        alpha = 1 - q * Math.sqrt(q);
        dust = true;
      }
      const x = mx * S, y = (my - cy) * S, z = mz * S;
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      s.vx[i] = x1; s.vy[i] = y2; s.vz[i] = z2;
      const depth = D - z2;
      if (depth < 0.3) continue;
      const sx = W2 + f * x1 / depth + sdx, sy = H2 - f * y2 / depth + sdy;
      if (sx < 0 || sy < 0) continue;
      const cx = (sx / CW) | 0, cyy = (sy / CH) | 0;
      if (cx >= cols || cyy >= rows) continue;
      const j = cyy * cols + cx;
      const zt = dust ? depth + 4 : depth;
      if (zt < zb[j]) { zb[j] = zt; cs[j] = dust ? -2 - i : i; ca[j] = alpha; }
    }

    this.perf.cam = performance.now() - tp; tp = performance.now();
    // 3. shadow map, seen from the light
    const L = norm(-0.45, 0.78, 0.45);
    let [t1x, t1y, t1z] = norm(L[2], 0, -L[0]);
    const t2x = L[1] * t1z - L[2] * t1y, t2y = L[2] * t1x - L[0] * t1z, t2z = L[0] * t1y - L[1] * t1x;
    const SM = this.SM, sm = this.sm;
    sm.fill(-Infinity);
    const ext = 2.2 * Math.max(S, 0.05);
    const toTex = (a: number) => (a / ext * 0.5 + 0.5) * SM;
    for (let i = 0; i < s.n; i++) {
      if (s.flags[i] & F_NOCAST) continue;
      if (s.rel[i] > 0 && t > s.rel[i]) continue;
      const vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
      const a = toTex(vx * t1x + vy * t1y + vz * t1z), b = toTex(vx * t2x + vy * t2y + vz * t2z);
      if (a < 0 || b < 0 || a >= SM - 1 || b >= SM - 1) continue;
      const d = vx * L[0] + vy * L[1] + vz * L[2];
      const k = (b | 0) * SM + (a | 0);
      if (d > sm[k]) sm[k] = d;
      if (d > sm[k + 1]) sm[k + 1] = d;
      if (d > sm[k + SM]) sm[k + SM] = d;
      if (d > sm[k + SM + 1]) sm[k + SM + 1] = d;
    }

    this.perf.shadow = performance.now() - tp; tp = performance.now();
    // 4. shade each occupied cell
    const ground = GROUNDS[cfg.ground];
    const Fl = norm(0.7, -0.05, 0.7);
    const Hh = norm(L[0], L[1], L[2] + 1);
    const { cr, cg, cb, cv } = this;
    const bias0 = 0.025 * S, ssaoK = 0.16 * S;
    const exposure = clamp(cfg.brightness ?? 1, 0.4, 2.2);
    this.exposure = exposure;
    for (let j = 0; j < this.N; j++) {
      const c = cs[j];
      if (c === -1) continue;
      const dust = c < -1;
      const i = dust ? -2 - c : c;
      const m = this.mats[s.mat[i]];
      let ar = s.ar[i], ag = s.ag[i], ab = s.ab[i];
      // view-space normal, turned to face us
      const NX = s.nx[i], NY = s.ny[i], NZ = s.nz[i];
      let nx = NX * cyw + NZ * syw; const nz1 = -NX * syw + NZ * cyw;
      let ny = NY * cp - nz1 * sp, nz = NY * sp + nz1 * cp;
      let back = false;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; back = true; }
      if (back && m.backMix) { ar = lerp(ar, m.back[0], m.backMix); ag = lerp(ag, m.back[1], m.backMix); ab = lerp(ab, m.back[2], m.backMix); }
      if (white > 0 && m.role === 'petal') { ar = lerp(ar, 1, white * 0.85); ag = lerp(ag, 0.95, white * 0.85); ab = lerp(ab, 0.97, white * 0.85); }
      let r: number, g: number, b: number;
      if (dust) {
        const k = 0.75 * ca[j];
        r = ar * k; g = ag * k; b = ab * k;
      } else {
        // shadow (3x3 percentage-closer filter)
        const vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
        const NdL = nx * L[0] + ny * L[1] + nz * L[2];
        let lit = 1;
        const a = toTex(vx * t1x + vy * t1y + vz * t1z), bb = toTex(vx * t2x + vy * t2y + vz * t2z);
        if (a >= 1 && bb >= 1 && a < SM - 2 && bb < SM - 2) {
          const d = vx * L[0] + vy * L[1] + vz * L[2] + bias0 * (1.2 + 2.2 * (1 - Math.abs(NdL)));
          let sum = 0;
          const k0 = (bb | 0) * SM + (a | 0);
          for (let oy = -SM; oy <= SM; oy += SM) for (let ox = -1; ox <= 1; ox++) sum += d >= sm[k0 + oy + ox] ? 1 : 0;
          lit = sum / 9;
        }
        // crevices: neighbours in front of us darken us
        const x = j % cols, y = (j / cols) | 0, z0 = zb[j];
        let occ = 0;
        if (x > 1 && x < cols - 2 && y > 1 && y < rows - 2) {
          const o = this.ssaoOff;
          for (let q = 0; q < o.length; q++) { const zn = zb[j + o[q]]; if (zn < z0) occ += clamp((z0 - zn - 0.015 * S) / ssaoK, 0, 1); }
          occ /= o.length;
        }
        const ao = s.ao[i] * (1 - 0.8 * occ);
        const diff = clamp((NdL + 0.3) / 1.3, 0, 1) * lit;
        const trans = m.trans * Math.max(0, -NdL) * 0.9;
        const fill = 0.2 * Math.max(0, nx * Fl[0] + ny * Fl[1] + nz * Fl[2]);
        const amb = 0.13 * ao;
        const light = amb + 0.95 * diff * (0.55 + 0.45 * ao) + trans + fill * ao;
        const sh = Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]);
        const s2 = sh * sh, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8;
        const spec2 = m.spec * s16 * s16 * lit;
        const rim = 1 - nz, sheen = m.sheen * rim * rim * (0.45 + 0.55 * lit);
        r = ar * light + spec2 + sheen * Math.min(1, ar + 0.3);
        g = ag * light + spec2 + sheen * Math.min(1, ag + 0.3);
        b = ab * light + spec2 + sheen * Math.min(1, ab + 0.3);
        if (white > 0 && m.role === 'petal') { const w = white * 0.35; r += w; g += w; b += w; }
        if (this.debug === 'shadow') { r = g = b = 0.15 + 0.85 * lit; }
        else if (this.debug === 'ao') { r = g = b = ao; }
      }
      // exposure first, then the hue-preserving roll-off keeps bright petals from clipping to white
      r *= exposure; g *= exposure; b *= exposure;
      {
        const mx = Math.max(r, g, b);
        if (mx > 0.78) { const tm = 0.78 + 0.27 * Math.tanh((mx - 0.78) / 0.27); const q = tm / mx; r *= q; g *= q; b *= q; }
      }
      cr[j] = r; cg[j] = g; cb[j] = b;
      cv[j] = Math.max(r, g, b);
    }

    this.perf.shade = performance.now() - tp; tp = performance.now();
    this.compose(t, S, D, f);
    this.perf.compose = performance.now() - tp;
    this.lastCost = performance.now() - t0;
  }

  /* -------------------------------------------------------------- characters, tint, glow */
  private compose(t: number, S: number, D: number, f: number) {
    const cfg = this.cfg;
    const gs = GLYPH_SETS[cfg.glyphs];
    const ground = GROUNDS[cfg.ground];
    const { zb, cs, ca, cr, cg, cb, cv, gi } = this;
    const cols = this.cols, rows = this.rows;
    const s = this.s;
    const cellWorld = this.CHd * D / f;
    const thrBig = Math.max(0.3 * S, 3.2 * cellWorld), thrSmall = Math.max(0.12 * S, 2 * cellWorld);
    const zEmpty = D + 6;
    const isSurf = (j: number) => cs[j] >= 0;
    const Fz = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return zEmpty;
      const j = y * cols + x; return cs[j] >= 0 ? zb[j] : zEmpty;
    };
    // whole characters, so an emoji is one cell and not two half-characters
    const phrase = Array.from((cfg.phrase.trim() || 'let it bloom') + ' ');
    const Lp = phrase.length;
    const G = this.glyphAt;
    const img = this.colorImg!;
    const d = img.data;
    d.fill(0);
    const ramp = gs.ramp, RL = ramp.length;
    const tick = Math.floor(t * 5);
    const lift = 0.9 / Math.pow(this.exposure, 0.45);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const j = y * cols + x;
        gi[j] = -1;
        const c = cs[j];
        if (c === -1) continue;
        let r = cr[j], g = cg[j], b = cb[j];
        const v = cv[j];
        let chr: string;
        if (c < -1) {
          const a = ca[j];
          if (a < 0.06) continue;
          const i = -2 - c;
          chr = (s.flags[i] & F_TEXT) && a > 0.5 && gs.words !== 'none' ? phrase[(x + this.rowShift[y]) % Lp] : gs.dust[clamp((v * a * gs.dust.length) | 0, 0, gs.dust.length - 1)];
        } else {
          const i = c, p0 = s.part[i], z0 = zb[j];
          let edge = false, nOcc = 0;
          if (gs.outline) {
            for (let q = 0; q < 4; q++) {
              const n = q === 0 ? (x > 0 ? j - 1 : -1) : q === 1 ? (x < cols - 1 ? j + 1 : -1) : q === 2 ? (y > 0 ? j - cols : -1) : (y < rows - 1 ? j + cols : -1);
              if (n < 0 || !isSurf(n)) { edge = true; continue; }
              nOcc++;
              const dz = zb[n] - z0;
              if (dz > thrBig || (s.part[cs[n]] !== p0 && dz > thrSmall)) edge = true;
            }
          }
          const lvl = v;
          if (edge) {
            if (nOcc === 0) chr = v > 0.5 ? '*' : '·';
            else {
              const gx = (Fz(x + 1, y - 1) + 2 * Fz(x + 1, y) + Fz(x + 1, y + 1)) - (Fz(x - 1, y - 1) + 2 * Fz(x - 1, y) + Fz(x - 1, y + 1));
              const gy = (Fz(x - 1, y + 1) + 2 * Fz(x, y + 1) + Fz(x + 1, y + 1)) - (Fz(x - 1, y - 1) + 2 * Fz(x, y - 1) + Fz(x + 1, y - 1));
              const gxs = Math.abs(gx / this.CWd), gys = Math.abs(gy / this.CHd);
              chr = gys > 2.414 * gxs ? '-' : gxs > 2.414 * gys ? '|' : (gx * gy > 0 ? '/' : '\\');
            }
            const e = 0.16;
            r = lerp(r, 1, e); g = lerp(g, 0.92, e); b = lerp(b, 0.95, e);
          } else if (gs.words === 'everywhere') {
            chr = phrase[(x + this.rowShift[y]) % Lp];
            if (chr === ' ') chr = '.';
          } else if (gs.words === 'patches' && (s.flags[i] & F_TEXT) && v > 0.3) {
            chr = phrase[(x + this.rowShift[y]) % Lp];
            r = lerp(r, 1, 0.3); g = lerp(g, 0.94, 0.3); b = lerp(b, 0.96, 0.3);
          } else if (gs.scatter) {
            if (v < 0.08) continue;
            chr = ramp[(hash(x, y, tick + ((hash(x, y, 1) * 7) | 0)) * RL) | 0];
          } else {
            const role = this.mats[s.mat[i]].role;
            const rr = gs.roles && role !== 'petal' ? gs.roles[role] : undefined;
            const R2 = rr || ramp;
            chr = R2[clamp((Math.pow(clamp(lvl, 0, 1), 0.85) * R2.length) | 0, 0, R2.length - 1)];
          }
        }
        // tone curve: brightness lifts the midtones as well as the highlights
        r = Math.pow(clamp(r, 0, 1.4), lift); g = Math.pow(clamp(g, 0, 1.4), lift); b = Math.pow(clamp(b, 0, 1.4), lift);
        const o = j * 4;
        d[o] = r > 1 ? 255 : r * 255; d[o + 1] = g > 1 ? 255 : g * 255; d[o + 2] = b > 1 ? 255 : b * 255;
        d[o + 3] = 255;
        if (chr !== ' ') { const k = G.get(chr); if (k !== undefined) gi[j] = k; }
      }
    }
    this.colorCtx.putImageData(img, 0, 0);

    // white glyphs from the atlas, then tint each cell in one composite
    const gctx = this.glyphCtx, CWd = this.CWd, CHd = this.CHd;
    gctx.globalCompositeOperation = 'source-over';
    gctx.clearRect(0, 0, this.glyphCv.width, this.glyphCv.height);
    for (let y = 0, py = 0; y < rows; y++, py += CHd) {
      const row = y * cols;
      for (let x = 0, px = 0; x < cols; x++, px += CWd) {
        const k = gi[row + x];
        if (k >= 0) gctx.drawImage(this.atlasCv, k * CWd, 0, CWd, CHd, px, py, CWd, CHd);
      }
    }
    gctx.globalCompositeOperation = 'source-in';
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(this.colorCv, 0, 0, this.glyphCv.width, this.glyphCv.height);

    // glow from the colour grid itself
    this.halfCtx.imageSmoothingEnabled = true; this.quarCtx.imageSmoothingEnabled = true;
    this.halfCtx.clearRect(0, 0, this.halfCv.width, this.halfCv.height);
    this.halfCtx.drawImage(this.colorCv, 0, 0, this.halfCv.width, this.halfCv.height);
    this.quarCtx.clearRect(0, 0, this.quarCv.width, this.quarCv.height);
    this.quarCtx.drawImage(this.halfCv, 0, 0, this.quarCv.width, this.quarCv.height);

    const ctx = this.ctx, gw = cols * CWd, gh = rows * CHd;
    const gc = ground.color;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.transparent) ctx.clearRect(0, 0, this.W, this.H);
    else {
      ctx.fillStyle = `rgb(${(gc[0] * 255) | 0},${(gc[1] * 255) | 0},${(gc[2] * 255) | 0})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    const glow = this.glowAmount();
    // the flower: glyphs added onto their own glow ('lighter'), exactly as on black
    const drawFlower = (c: CanvasRenderingContext2D) => {
      c.imageSmoothingEnabled = true;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.14 * glow; c.drawImage(this.colorCv, 0, 0, gw, gh);
      c.globalAlpha = 0.2 * glow; c.drawImage(this.halfCv, 0, 0, gw, gh);
      c.globalAlpha = 0.22 * glow; c.drawImage(this.quarCv, 0, 0, gw, gh);
      c.globalAlpha = 1; c.drawImage(this.glyphCv, 0, 0);
      c.globalCompositeOperation = 'source-over';
    };
    drawFlower(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  private glowAmount() {
    return clamp(this.cfg.glow, 0, 1.5) * Math.pow(this.exposure, 0.6);
  }

  /** frees the canvases now rather than at the next garbage collection (Safari caps total canvas memory) */
  dispose() {
    for (const c of [this.canvas, this.glyphCv, this.colorCv, this.halfCv, this.quarCv, this.atlasCv]) { c.width = 0; c.height = 0; }
    this.colorImg = null; this.atlasKey = ''; this.geoKey = '';
  }

  /** the last frame as characters: what each cell holds and its colour, for vector export */
  cells() {
    const ground = GROUNDS[this.cfg.ground];
    return {
      width: this.W, height: this.H, cols: this.cols, rows: this.rows, cw: this.CWd, ch: this.CHd,
      chars: this.atlasChars.slice(), glyph: this.gi.slice(), rgb: new Uint8ClampedArray(this.colorImg!.data),
      ground: ground.color, glow: this.glowAmount(),
      /** the half-resolution colour grid the glow is made from, as a PNG */
      glowPng: this.halfCv.toDataURL('image/png'),
    };
  }
}
export type FlowerCells = ReturnType<FlowerRenderer['cells']>;
