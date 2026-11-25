// The Flower launch trailer: every frame is a pure function of time, drawn at the output size.
// Flowers come from the real engine at native resolution; type and UI are vector, drawn per frame.
import { FlowerRenderer } from '../../lib/engine/renderer';
import { FLOWERS } from '../../lib/engine/flowers';
import { PALETTES, GLYPH_SETS, GROUNDS, ENDINGS } from '../../lib/engine/looks';
import type { EndingId, FlowerConfig, FlowerId, GlyphSetId, GroundId, PaletteId } from '../../lib/engine/types';

export const W = 3840, H = 2160, FPS = 60, DUR = 60;
/** 105 BPM; the edit puts a downbeat 40 ms into the film and keeps one grid to the end */
export const BEAT = 60 / 105, B0 = 0.04;
export const T = (n: number) => B0 + BEAT * n;
/** the settled title card, baked into frame 0 as the thumbnail */
export const POSTER_T = T(11.3);

const M = 288;                                   // outer margin, both sides
const INK = '#eeeeec', SOFT = '#a4a9b5', PINK = '#e2669a';
const UI = 'Archivo, system-ui, sans-serif', DATA = '"Courier Prime", ui-monospace, monospace';
const HS = 150;                                  // headline size (75px at 1080p)

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const outQuint = (x: number) => 1 - Math.pow(1 - x, 5);
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inCubic = (x: number) => x * x * x;
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** critically damped spring step response, settles in about `dur` seconds */
const spring = (t: number, t0: number, dur = 0.7) => {
  if (t <= t0) return 0;
  const x = (t - t0) * (7 / dur);
  return 1 - (1 + x) * Math.exp(-x);
};
const rgb = (c: number[]) => `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
/** seconds since the last beat */
const since = (t: number) => t - T(Math.floor((t - B0) / BEAT));
/** a punch-in on every beat */
const punch = (t: number, amt = 0.05) => 1 + amt * Math.exp(-since(t) * 8);
/** which item of a beat-timed list is current: [[beat, value], ...] */
function at<V>(t: number, list: [number, V][]): [V, number] {
  let v = list[0][1], n = list[0][0];
  for (const [b, x] of list) if (t >= T(b)) { v = x; n = b; }
  return [v, n];
}

type EngKey = 'wide' | 'macro' | 'alpha' | 'dots' | 'size' | 'end0' | 'end1' | 'end2' | 'end3' | 'end4';
interface Shot {
  eng: EngKey;
  cfg: Partial<FlowerConfig>;
  te: number; yaw: number; pitch: number; zoom: number;
  dx: number; dy: number;
}

const BASE: FlowerConfig = {
  flower: 'rose', palette: 'natural', glyphs: 'classic', ground: 'night', ending: 'stay',
  phrase: 'let it bloom', stem: true, spin: 0, brightness: 1, glow: 1, detail: 0.85, words: 0.6,
};

/* ------------------------------------------------------------------ the script, in beats (n) */
// COLD OPEN  n0–4 a dot, word by word · n4–6 a bud of dots · n6–8 strobes on sixteenths
// THE DROP   n8–12 the rose detonates, FLOWER · n12–16 macro, the phrase on the petals
// ARSENAL    n16–24 seven flowers · n24–32 ten palettes · n32–40 six character sets, whip
// CHORUS     n40–48 your note · n48–56 dots · n56–60 grounds · n60–64 sizes · n64–68 light
//            n68–72 any angle · n72–80 up to 4K · n80–84 gift link · n84–88 it blooms for them
// OUTRO      n88–96 five endings · n96– end card, last hit n104
type Strobe = [EngKey, FlowerId, PaletteId, GlyphSetId, number, number];
const STROBE: Strobe[] = [
  ['macro', 'rose', 'natural', 'classic', 2.3, 0.4], ['dots', 'sunflower', 'gold', 'dots', 1.3, 0.5],
  ['alpha', 'lotus', 'natural', 'kana', 1.2, 2.3], ['wide', 'rose', 'phosphor', 'binary', 1.3, 1.6],
  ['macro', 'rose', 'crimson', 'classic', 2.6, 2.1], ['dots', 'lily', 'ice', 'dots', 1.4, 0.3],
  ['alpha', 'tulip', 'blush', 'blocks', 1.4, 1.1], ['wide', 'rose', 'amber', 'words', 1.5, 0.9],
];
const SEVEN: [number, FlowerId][] = [[16, 'rose'], [17, 'tulip'], [18, 'lotus'], [19, 'lily'], [20, 'sakura'], [21, 'daisy'], [22, 'sunflower']];
const SEVEN_YAW: Record<FlowerId, number> = { rose: 0.4, tulip: 1.1, lotus: 2.4, lily: 0.2, sakura: 0.9, daisy: 0.3, sunflower: 0.5 };
const TEN: [number, PaletteId][] = [
  [24, 'natural'], [25, 'blush'], [26, 'crimson'], [27, 'ivory'], [28, 'lavender'], [29, 'coral'],
  [30, 'gold'], [30.5, 'ice'], [31, 'phosphor'], [31.5, 'amber'],
];
const SIX: [number, GlyphSetId][] = [[32, 'classic'], [33, 'blocks'], [34, 'dots'], [35, 'binary'], [36, 'kana'], [37, 'words']];
/** flower, palette, zoom, yaw, stem */
const DOTS: [number, [FlowerId, PaletteId, number, number, boolean]][] = [
  [48, ['rose', 'natural', 1.55, 0.3, false]], [49, ['tulip', 'blush', 1.25, 1.2, true]], [50, ['lotus', 'ice', 1.2, 2.5, true]],
  [51, ['sunflower', 'gold', 1.2, 0.4, true]], [52, ['lily', 'phosphor', 1.25, 0.3, true]], [53, ['sakura', 'lavender', 1.15, 0.9, true]],
  [54, ['daisy', 'coral', 1.2, 0.3, true]], [55, ['rose', 'crimson', 1.6, 2.0, false]],
];
const GROUND3: [number, GroundId][] = [[56, 'black'], [57, 'night'], [58, 'plum']];
const SIZE4: [number, [number, string]][] = [[60, [0.8, 'Large']], [61, [1, 'Medium']], [62, [1.25, 'Small']], [63, [1.79, 'Very small']]];
const ANGLES: [number, [string, number, number]][] = [
  [68, ['Front', 0, 0]], [69, ['Angled', 0.75, 0.3]], [70, ['Side', Math.PI / 2, 0]], [71, ['Above', 0.35, 1.15 - FLOWERS.rose.view.pitch]],
];
const FRAMES: [string, string, number][] = [['Reel', '9:16', 9 / 16], ['Square', '1:1', 1], ['Portrait', '4:5', 4 / 5], ['Wide', '16:9', 16 / 9]];
const FIVE: EndingId[] = ['wind', 'fall', 'burst', 'wilt', 'stay'];
const PACE: Record<EndingId, number> = { wind: 1.1, fall: 1.25, burst: 0.9, wilt: 1.45, stay: 0.3 };
const NAME = 'Mira', NOTE = 'happy birthday, mira';

/** how much of a string is typed by time t, one character per sixteenth note */
const typed = (s: string, t: number, t0: number) => (t < t0 ? '' : s.slice(0, clamp(Math.floor((t - t0) / (BEAT / 4)) + 1, 0, s.length)));

export class Film {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private eng = new Map<EngKey, { r: FlowerRenderer; cv: HTMLCanvasElement }>();
  /** output pixels per design pixel (1 for the 4K render, less for the live preview) */
  constructor(readonly scale = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(W * scale); this.canvas.height = Math.round(H * scale);
    this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  private engine(k: EngKey) {
    let e = this.eng.get(k);
    if (!e) {
      const cv = document.createElement('canvas');
      const end = k.startsWith('end');
      // the five-endings row is drawn as five transparent layers over one ground
      const r = new FlowerRenderer(cv, { alpha: end });
      const [dpr, detail] = k === 'macro' ? [3.4, 1] : k === 'alpha' ? [2.6, 1] : k === 'dots' ? [3, 1] : end ? [2, 1.79] : [2, 0.85];
      r.setConfig({ ...BASE, detail });
      r.resize(W * this.scale, H * this.scale, dpr * this.scale);
      r.transparent = end;
      e = { r, cv };
      this.eng.set(k, e);
    }
    return e;
  }

  dispose() {
    for (const { r } of this.eng.values()) r.dispose();
    this.eng.clear();
    this.canvas.width = this.canvas.height = 0;
  }

  /* ------------------------------------------------------------------ the camera script */
  shots(t: number): Shot[] {
    const s: Shot = { eng: 'wide', cfg: { ...BASE }, te: 6, yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0 };
    const one = (o: Partial<Shot>) => [{ ...s, ...o, cfg: { ...BASE, ...(o.cfg ?? {}) } }];

    // COLD OPEN
    if (t < T(4)) return one({ eng: 'dots', cfg: { glyphs: 'dots', detail: 1, stem: false, glow: 1.3 + 1.2 * Math.exp(-since(t) * 6) }, te: 0.3 + 0.08 * t, yaw: 0.3 + 0.1 * t, zoom: 1.7 * punch(t, 0.25), dy: -60 });
    if (t < T(6)) {
      const k = seg(t, T(4), T(6));
      return one({ eng: 'dots', cfg: { glyphs: 'dots', detail: 1, stem: false, glow: 1.3 }, te: 0.8 + 1.4 * k, yaw: 0.6 + 0.6 * k, zoom: lerp(1.7, 2.1, inCubic(k)) * punch(t, 0.08), dy: -60 });
    }
    if (t < T(8)) {
      const i = Math.min(7, Math.floor((t - T(6)) / (BEAT / 4)));
      const [eng, flower, palette, glyphs, zoom, yaw] = STROBE[i];
      const k = seg(t, T(6), T(8));
      return one({ eng, cfg: { flower, palette, glyphs, detail: eng === 'wide' ? 0.85 : 1, stem: false, words: 1, brightness: 1 + 0.8 * k, glow: 1.1 + 0.4 * k }, te: 6.2, yaw: yaw + 2 * k, zoom });
    }
    // THE DROP: the rose detonates open
    if (t < T(12)) {
      const l = t - T(8);
      return one({
        cfg: { brightness: 1.15, glow: 1.1 + 0.35 * Math.exp(-l * 3) },
        te: 3 + 2.9 * outCubic(seg(t, T(8), T(10))) + Math.max(0, t - T(10)) * 0.2,
        yaw: 1.0 + 2.2 * (1 - Math.exp(-l * 2.5)), dx: W * 0.15,
        zoom: (1 + 0.12 * Math.exp(-l * 5)) * punch(t, 0.03),
      });
    }
    if (t < T(16)) {
      const k = seg(t, T(12), T(16));
      return one({ eng: 'macro', cfg: { detail: 1, stem: false, words: 1, brightness: 1.1 }, te: 6 + 0.3 * k, yaw: 2.0 + 2.4 * k, zoom: 2.0 + 0.8 * inOut(k), pitch: 0.05 });
    }
    // ARSENAL
    if (t < T(24)) {
      const [f, n] = at(t, SEVEN), l = t - T(n);
      return one({ cfg: { flower: f, brightness: 1.12, glow: 1.1 }, te: 6.4 + l * 0.2, yaw: SEVEN_YAW[f] + 1.0 * l, dx: W * 0.14, zoom: punch(t, 0.07) });
    }
    if (t < T(32)) {
      const [p] = at(t, TEN);
      return one({ cfg: { palette: p, stem: false, brightness: 1.1, glow: 1.1 }, te: 6.4 + (t - T(24)) * 0.2, yaw: 1.0 + 0.7 * (t - T(24)), dx: W * 0.14, zoom: 1.32 * punch(t, 0.05) });
    }
    if (t < T(40)) {
      const [g] = at(t, SIX);
      const whip = inCubic(seg(t, T(38), T(40)));
      return one({
        eng: 'alpha', cfg: { flower: 'lotus', glyphs: g, detail: 1, words: 0.8, brightness: 1.1 + 0.4 * whip },
        te: 6.4 + (t - T(32)) * 0.2, yaw: 2.1 + 0.5 * (t - T(32)) + 3 * whip, dx: W * 0.14 * (1 - whip), zoom: (1 + 0.7 * whip) * punch(t, 0.05),
      });
    }
    // CHORUS
    if (t < T(48)) {
      const push = inCubic(seg(t, T(46.5), T(48)));
      return one({
        cfg: { words: 1, phrase: typed(NOTE, t, T(42)) || ' ', brightness: 1.05 + 0.3 * push },
        te: 6.2 + (t - T(40)) * 0.25, yaw: 0.7 + 0.3 * (t - T(40)) + 1.4 * push,
        dx: -W * 0.17 * (1 - push), zoom: (1 + 0.45 * push) * punch(t, 0.02),
      });
    }
    if (t < T(56)) {
      const [[f, p, z, y0, stem], n] = at(t, DOTS), l = t - T(n);
      return one({ eng: 'dots', cfg: { flower: f, palette: p, glyphs: 'dots', detail: 1, stem, brightness: 1.15, glow: 1.25 }, te: 6.4 + l * 0.2, yaw: y0 + 0.9 * l, dx: stem ? W * 0.14 : W * 0.19, zoom: z * punch(t, 0.05) });
    }
    if (t < T(60)) {
      const [g] = at(t, GROUND3);
      return one({ cfg: { ground: g, brightness: 1.1 }, te: 6.4 + (t - T(56)) * 0.2, yaw: 0.8 + 0.8 * (t - T(56)), dx: W * 0.14, zoom: punch(t, 0.06) });
    }
    if (t < T(64)) {
      const [[d]] = at(t, SIZE4);
      return one({ eng: 'size', cfg: { detail: d, stem: false, brightness: 1.1 }, te: 6.4 + (t - T(60)) * 0.2, yaw: 2.4 + 0.6 * (t - T(60)), dx: W * 0.14, zoom: 1.3 * punch(t, 0.05) });
    }
    if (t < T(68)) {
      const b = t < T(66) ? lerp(0.5, 2, inOut(seg(t, T(64), T(66) - 0.05))) : 1.25;
      const g = t < T(66) ? 1 : lerp(0, 1.5, inOut(seg(t, T(66), T(68) - 0.05)));
      return one({ cfg: { flower: 'lily', stem: false, brightness: b, glow: g }, te: 6.4 + (t - T(64)) * 0.2, yaw: 0.3 + 0.5 * (t - T(64)), dx: W * 0.14, zoom: 1.25 });
    }
    if (t < T(72)) {
      // the export dialog's four presets, snapping on the beat
      let yaw = 0, pitch = 0;
      for (const [n, [, y, p]] of ANGLES) { const k = n === 68 ? 1 : spring(t, T(n), 0.32); yaw = lerp(yaw, y, k); pitch = lerp(pitch, p, k); }
      return one({ te: 6.4 + (t - T(68)) * 0.2, yaw: 0.9 + yaw, pitch, dx: W * 0.14, zoom: punch(t, 0.04) });
    }
    if (t < T(80)) {
      const l = t - T(72);
      return one({ te: 6.4 + l * 0.2, yaw: 0.6 + 0.9 * l, pitch: 0.4 * Math.sin(Math.PI * seg(t, T(72), T(80))), dx: W * 0.14, zoom: 0.86 * punch(t, 0.03) });
    }
    if (t < T(84)) return one({ cfg: { phrase: NOTE, words: 1 }, te: 6.6 + (t - T(80)) * 0.2, yaw: 0.9 + 0.25 * (t - T(80)), dx: W * 0.14, zoom: punch(t, 0.02) });
    if (t < T(88)) {
      // the recipient's view: it blooms again for them
      return one({ cfg: { phrase: NOTE, words: 1 }, te: 2.2 + 3.7 * outCubic(seg(t, T(84), T(87))), yaw: 0.4 + 0.3 * (t - T(84)), dx: W * 0.12, zoom: punch(t, 0.02) });
    }
    // OUTRO: five endings, each starting on its own beat
    if (t < T(96)) {
      const l = t - T(88);
      return FIVE.map((e, i) => {
        const tl = ENDINGS[e].timeline;
        const start = isFinite(tl.end0) ? tl.end0 - 0.25 : 6.9;
        return {
          eng: `end${i}` as EngKey, cfg: { ...BASE, detail: 1.79, ending: e, brightness: 1.1 },
          te: start + Math.max(0, t - T(88 + i)) * PACE[e], yaw: 0.5 + i * 0.9 + 0.25 * l, pitch: 0, zoom: 0.4, dx: (i - 2) * 744, dy: 40,
        };
      });
    }
    return [];
  }

  /* ------------------------------------------------------------------ drawing */
  draw(t: number) {
    const { ctx, scale } = this;
    const list = this.shots(t);
    const ground = (list[0]?.cfg.ground ?? 'night') as GroundId;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgb(GROUNDS[ground].color); ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const sh of list) {
      const e = this.engine(sh.eng);
      e.r.setConfig(sh.cfg);
      e.r.zoom = sh.zoom; e.r.offset.yaw = sh.yaw; e.r.offset.pitch = sh.pitch;
      e.r.render(sh.te);
      // whole-pixel offsets only: the flower is never resampled
      ctx.drawImage(e.cv, Math.round(sh.dx * scale), Math.round(sh.dy * scale));
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.overlay(t);
    const out = seg(t, 59.6, 60);
    if (out > 0) { ctx.globalAlpha = out; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  /** text with tracking, in design pixels; returns its advance */
  private text(s: string, x: number, y: number, size: number, o: { w?: number; color?: string; a?: number; track?: number; align?: CanvasTextAlign; font?: string } = {}) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = o.a ?? 1;
    ctx.fillStyle = o.color ?? INK;
    ctx.font = `${o.w ?? 600} ${size}px ${o.font ?? UI}`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.track ?? -0.03) * size}px`;
    ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
    const adv = ctx.measureText(s).width;
    ctx.restore();
    return adv;
  }

  /** a headline that slams in (a quick settle from 106%) and cuts out with its shot */
  private slam(lines: string[], x: number, y: number, size: number, tIn: number, tOut: number, t: number, o: { w?: number; color?: string } = {}) {
    if (t < tIn || t >= tOut) return;
    const { ctx } = this;
    lines.forEach((ln, i) => {
      const t0 = tIn + i * 0.05;
      if (t < t0) return;
      const k = outCubic(seg(t, t0, t0 + 0.14)), sc = 1.06 - 0.06 * k;
      const ly = Math.round(y + i * size * 1.04);
      ctx.save(); ctx.translate(x, ly); ctx.scale(sc, sc);
      this.text(ln, 0, 0, size, { a: Math.min(1, k * 2), w: o.w, color: o.color });
      ctx.restore();
    });
  }

  /** the name under a headline, swapping on its beat */
  private label(s: string, tChange: number, t: number, x = M, y = 1170, sub?: string) {
    const k = outCubic(seg(t, tChange, tChange + 0.1));
    this.text(s, x, Math.round(y - (1 - k) * 14), 96, { w: 500, a: k });
    if (sub) this.text(sub, x, y + 110, 64, { w: 500, a: k, color: SOFT, track: -0.01 });
  }

  private mark(cx: number, cy: number, size: number, a = 1, bloom = 1) {
    const { ctx } = this;
    const u = size / 24;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(u, u);
    ctx.fillStyle = PINK;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate((i * 72 * Math.PI) / 180);
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath(); ctx.ellipse(0, -5.4 * bloom, 3.1, 4.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#03050b'; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private rrect(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath(); c.roundRect(x, y, w, h, r);
  }

  private overlay(t: number) {
    const ctx = this.ctx;
    // COLD OPEN: one word per beat, centred under the dot
    if (t < T(6)) {
      const words = ['Every', 'flower', 'starts', 'as a dot.'], size = 150, y = 1640;
      ctx.save(); ctx.font = `600 ${size}px ${UI}`; (ctx as unknown as { letterSpacing: string }).letterSpacing = `${-0.03 * size}px`;
      const sp = size * 0.26, ws = words.map((w) => ctx.measureText(w).width);
      ctx.restore();
      let x = Math.round((W - (ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1))) / 2);
      words.forEach((w, i) => {
        if (t >= T(i)) {
          const k = outCubic(seg(t, T(i), T(i) + 0.12)), sc = 1.08 - 0.08 * k;
          ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
          this.text(w, 0, 0, size, { a: Math.min(1, k * 2) * (1 - seg(t, T(6) - 0.12, T(6))) });
          ctx.restore();
        }
        x += ws[i] + sp;
      });
    }
    // THE DROP: title
    if (t >= T(8) && t < T(12)) {
      const ms = 250, x0 = M, base = 1130;
      const mk = spring(t, T(8), 0.45);
      this.mark(x0 + ms / 2, base - 120, ms * (1.25 - 0.25 * mk), Math.min(1, mk * 1.5), 0.6 + 0.4 * mk);
      const word = 'Flower', size = 340;
      let x = x0 + ms + 56;
      for (let i = 0; i < word.length; i++) {
        const k = outCubic(seg(t, T(8) + i * 0.02, T(8) + 0.16 + i * 0.02));
        x += this.text(word[i], x, Math.round(base + (1 - k) * 60), size, { a: k, track: -0.035 });
      }
      this.slam(['Made of letters.'], x0, base + 190, 110, T(9), T(12), t, { w: 500 });
    }
    // ARSENAL
    if (t >= T(16) && t < T(24)) {
      const [f, n] = at(t, SEVEN);
      this.slam(['Seven flowers.'], M, 1000, HS, T(16), T(24), t);
      this.label(FLOWERS[f].name, T(n), t, M, 1170, FLOWERS[f].latin);
    }
    if (t >= T(24) && t < T(32)) {
      const [p, n] = at(t, TEN);
      this.slam(['Ten palettes.'], M, 1000, HS, T(24), T(32), t);
      const k = outCubic(seg(t, T(n), T(n) + 0.1));
      ctx.fillStyle = rgb(PALETTES[p].swatch); ctx.globalAlpha = k;
      ctx.beginPath(); ctx.arc(M + 34, 1138, 34, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      this.label(PALETTES[p].name, T(n), t, M + 100);
    }
    if (t >= T(32) && t < T(38.5)) {
      const [g, n] = at(t, SIX);
      this.slam(['Six character sets.'], M, 1000, HS, T(32), T(38.5), t);
      this.label(GLYPH_SETS[g].name, T(n), t);
    }
    // CHORUS
    if (t >= T(40) && t < T(47.6)) this.slip(t);
    if (t >= T(48) && t < T(56)) {
      const [[f, p], n] = at(t, DOTS);
      this.slam(['Or made of dots.'], M, 1000, HS, T(48), T(56), t);
      this.label(FLOWERS[f].name, T(n), t, M, 1170, PALETTES[p].name);
    }
    if (t >= T(56) && t < T(60)) {
      const [g, n] = at(t, GROUND3);
      this.slam(['Three grounds.'], M, 1000, HS, T(56), T(60), t);
      this.label(GROUNDS[g].name, T(n), t);
    }
    if (t >= T(60) && t < T(64)) {
      const [[, name], n] = at(t, SIZE4);
      this.slam(['Four sizes.'], M, 1000, HS, T(60), T(64), t);
      this.label(name, T(n), t);
    }
    if (t >= T(64) && t < T(68)) {
      this.slam(['Brightness', 'and glow.'], M, 880, HS, T(64), T(68), t);
      const bright = t < T(66);
      const v = bright ? Math.round(lerp(50, 200, inOut(seg(t, T(64), T(66) - 0.05)))) : Math.round(lerp(0, 150, inOut(seg(t, T(66), T(68) - 0.05))));
      this.label(`${bright ? 'Brightness' : 'Glow'} ${v}%`, bright ? T(64) : T(66), t, M, 1200);
      // the app's range control: a 2px track and a 14px thumb, scaled
      const k = 2.6, tw = 380 * k, x0 = M, y0 = 1290;
      const f = bright ? (v - 50) / 150 : v / 150;
      ctx.fillStyle = 'rgba(238,238,236,0.28)'; ctx.fillRect(x0, y0, tw, Math.round(2 * k));
      ctx.fillStyle = INK; ctx.fillRect(x0, y0, Math.round(tw * f), Math.round(2 * k));
      ctx.beginPath(); ctx.arc(x0 + tw * f, y0 + k, 7 * k, 0, Math.PI * 2); ctx.fill();
    }
    if (t >= T(68) && t < T(72)) {
      const [, n] = at(t, ANGLES);
      this.slam(['Any angle.'], M, 1000, HS, T(68), T(72), t);
      this.segments(ANGLES.map(([, [nm]]) => nm), ANGLES.findIndex(([b]) => b === n), M, 1090);
    }
    if (t >= T(72) && t < T(80)) this.exportScene(t);
    if (t >= T(80) && t < T(84)) this.giftScene(t);
    if (t >= T(84) && t < T(88)) this.giftView(t);
    if (t >= T(88) && t < T(96)) {
      this.slam(['Five endings.'], M, 330, 128, T(88), T(96), t);
      FIVE.forEach((e, i) => {
        const k = outCubic(seg(t, T(88) + i * 0.04, T(88) + 0.3 + i * 0.04));
        const on = 0.45 + 0.55 * outCubic(seg(t, T(88 + i), T(88 + i) + 0.12));
        this.text(ENDINGS[e].name, W / 2 + (i - 2) * 744, 1960, 72, { w: 500, a: k * on, align: 'center', track: -0.01 });
      });
    }
    // end card, centred
    if (t >= T(96)) {
      const k = spring(t, T(96), 0.6);
      const hit = t >= T(104) ? Math.exp(-(t - T(104)) * 6) : 0;
      this.mark(W / 2, 760, 230 * (1 + 0.08 * hit), k, 0.7 + 0.3 * k);
      const a = outCubic(seg(t, T(96) + 0.05, T(96) + 0.3));
      this.text('Flower', W / 2, Math.round(1180 + (1 - a) * 40), 300, { a, align: 'center', track: -0.035 });
      const b = outCubic(seg(t, T(98), T(98) + 0.3));
      this.text('Let it bloom.', W / 2, Math.round(1340 + (1 - b) * 24), 96, { a: b, w: 500, align: 'center', color: SOFT, track: -0.01 });
    }
  }

  /** the export dialog's segmented control, on the bone panel colours */
  private segments(items: string[], on: number, x: number, y: number) {
    const ctx = this.ctx, k = 2.8, h = 36 * k, pad = 3 * k, w = 420 * k, sw = (w - pad * 2) / items.length;
    ctx.fillStyle = '#d8d5ce'; this.rrect(x, y, w, h, 9 * k); ctx.fill();
    items.forEach((s, i) => {
      const sx = x + pad + i * sw;
      if (i === on) { ctx.fillStyle = '#1b1a17'; this.rrect(sx, y + pad, sw, h - pad * 2, 6 * k); ctx.fill(); }
      this.text(s, sx + sw / 2, Math.round(y + h / 2 + 5 * k), 14 * k, { w: 500, align: 'center', track: 0, color: i === on ? '#f1f0ec' : '#55524b' });
    });
  }

  /** the real label slip and fields, typing on sixteenth notes */
  private slip(t: number) {
    const ctx = this.ctx;
    const k = 2.7;                                    // design px per CSS px of the app
    const w = 380 * k, ph = 446 * k, hs = 128, gap = 96;
    const top = Math.round((H - (hs * 2.04 + gap + ph)) / 2);
    const x0 = W - M - w;
    const x = Math.round(x0 + (1 - spring(t, T(40), 0.35)) * 900 + inCubic(seg(t, T(46.6), T(47.5))) * 1600);
    const y = Math.round(top + hs * 2.04 + gap);
    this.slam(['Your words,', 'on its petals.'], x0, top + hs, hs, T(40) + 0.05, T(46.7), t);
    ctx.save();
    ctx.fillStyle = '#e4e2dd'; this.rrect(x, y, w, ph, 22 * k); ctx.fill();
    const px = x + 24 * k; let py = y + 24 * k; const iw = w - 48 * k;
    const name = typed(NAME, t, T(40.5));
    const rows: [string, string][] = [['Specimen', 'Rosa (rose)'], ['Accession', 'FLW-04172'], ['For', name || '—']];
    const rh = 36 * k;
    ctx.fillStyle = '#f1f0ec'; this.rrect(px, py, iw, rh * 3 + 8 * k, 12 * k); ctx.fill();
    ctx.strokeStyle = '#1b1a17'; ctx.lineWidth = k; this.rrect(px + k / 2, py + k / 2, iw - k, rh * 3 + 8 * k - k, 12 * k); ctx.stroke();
    rows.forEach(([kk, v], i) => {
      const ry = py + 4 * k + i * rh;
      if (i) { ctx.fillStyle = '#d0ccc3'; ctx.fillRect(px + 14 * k, Math.round(ry), iw - 28 * k, Math.round(k)); }
      this.text(kk, px + 14 * k, Math.round(ry + 23 * k), 13 * k, { w: 400, color: '#55524b', track: 0 });
      this.text(v, px + (14 + 100) * k, Math.round(ry + 23 * k), 14 * k, { w: 400, color: '#1b1a17', track: 0, font: DATA });
    });
    py += rh * 3 + 8 * k + 26 * k;
    this.text('Label', px, Math.round(py + 14 * k), 16 * k, { w: 600, color: '#1b1a17', track: 0 });
    py += 34 * k;
    const field = (label: string, value: string, active: boolean) => {
      this.text(label, px, Math.round(py + 11 * k), 13 * k, { w: 400, color: '#55524b', track: 0 });
      py += 21 * k;
      ctx.fillStyle = '#f1f0ec'; this.rrect(px, py, iw, 40 * k, 9 * k); ctx.fill();
      ctx.strokeStyle = active ? '#1b1a17' : '#bab6ac'; ctx.lineWidth = k; this.rrect(px + k / 2, py + k / 2, iw - k, 40 * k - k, 9 * k); ctx.stroke();
      const adv = this.text(value, px + 12 * k, Math.round(py + 26 * k), 16 * k, { w: 400, color: '#1b1a17', track: 0, font: DATA });
      if (active && ((t - T(40)) / (BEAT / 2)) % 2 < 1.2) { ctx.fillStyle = '#9b2219'; ctx.fillRect(Math.round(px + 12 * k + adv + 2 * k), Math.round(py + 10 * k), Math.round(2 * k), Math.round(20 * k)); }
      py += 40 * k + 18 * k;
    };
    field('Collected for', name, t < T(41.8));
    field('Collected by', 'Sam', false);
    field('Note, written on the petals', typed(NOTE, t, T(42)), t >= T(41.8));
    ctx.restore();
  }

  /** the clip frame snapping through aspects, then the formats */
  private exportScene(t: number) {
    const ctx = this.ctx;
    this.slam(['Up to 4K.'], M, 1000, HS, T(72), T(80), t);
    const cx = W / 2 + Math.round(W * 0.14), cy = H / 2;
    const box = (ar: number) => { let h = 1480, w = h * ar; if (w > 1900) { w = 1900; h = w / ar; } return [w, h]; };
    let fw = 0, fh = 0, idx = 0;
    for (let i = 0; i < FRAMES.length; i++) {
      const [w1, h1] = box(FRAMES[i][2]);
      if (i === 0) { fw = w1; fh = h1; continue; }
      const k = spring(t, T(72 + i), 0.3);
      if (k > 0) { fw = lerp(fw, w1, k); fh = lerp(fh, h1, k); }
      if (t >= T(72 + i)) idx = i;
    }
    const fa = Math.min(1, spring(t, T(72), 0.25) * 1.3);
    ctx.save(); ctx.globalAlpha = fa * 0.9;
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    this.rrect(Math.round(cx - fw / 2), Math.round(cy - fh / 2), Math.round(fw), Math.round(fh), 24); ctx.stroke();
    ctx.restore();
    const [nm, ar] = FRAMES[idx];
    this.text(`${nm}  ${ar}`, Math.round(cx - fw / 2 + 40), Math.round(cy - fh / 2 + 84), 52, { w: 500, a: fa, track: -0.01 });
    let x = M;
    ['PNG', 'JPG', 'SVG', 'GIF'].forEach((f, i) => {
      const k = spring(t, T(76 + i), 0.3);
      if (k <= 0.001) return;
      ctx.save(); ctx.font = `600 60px ${UI}`;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
      const tw = ctx.measureText(f).width, cw = tw + 96, ch = 120, cy0 = 1100;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      const sc = 1.12 - 0.12 * k;
      ctx.translate(x + cw / 2, cy0 + ch / 2); ctx.scale(sc, sc);
      ctx.fillStyle = '#e4e2dd'; this.rrect(-cw / 2, -ch / 2, cw, ch, ch / 2); ctx.fill();
      ctx.fillStyle = '#1b1a17'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(f, 0, 21);
      ctx.restore();
      x += cw + 28;
    });
  }

  /** the real primary button, pressed */
  private giftScene(t: number) {
    const ctx = this.ctx;
    this.slam(['Send it as', 'a gift link.'], M, 760, HS, T(80), T(84), t);
    const k = 3.2, w = 360 * k, h = 88 * k, x = M, y = 1060;
    const a = Math.min(1, spring(t, T(80), 0.3) * 1.3);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#e4e2dd'; this.rrect(x, y, w, h, 22 * k); ctx.fill();
    const bx = x + 24 * k, by = y + 24 * k, bw = w - 48 * k, bh = 40 * k;
    const press = t >= T(82) && t < T(82) + 0.3 ? 1 - 0.03 * Math.exp(-(t - T(82)) * 12) : 1;
    ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(press, press);
    ctx.fillStyle = '#1b1a17'; this.rrect(-bw / 2, -bh / 2, bw, bh, 9 * k); ctx.fill();
    const label = t >= T(82) + 0.06 ? 'Accessioned, link copied' : 'Copy gift link';
    this.text(label, 0, Math.round(6 * k), 15 * k, { w: 500, color: '#f1f0ec', align: 'center', track: 0 });
    ctx.restore();
    const arrive = inOut(seg(t, T(80.25), T(81.6)));
    const leave = inCubic(seg(t, T(82.6), T(83.6)));
    const px = lerp(x + w + 520, bx + bw * 0.62, arrive) + leave * 300, py = lerp(y + h + 380, by + bh * 0.55, arrive) + leave * 220;
    const pa = seg(t, T(80.1), T(80.4)) * (1 - leave);
    if (pa > 0) this.pointer(px, py, t >= T(82) && t < T(82) + 0.12 ? 0.92 : 1, pa);
  }

  /** the recipient's gift view: the message bottom-left, as the app draws it */
  private giftView(t: number) {
    const k = 2.6;
    this.slam(['It blooms for them.'], M, 330, 128, T(84), T(88), t);
    const a = outCubic(seg(t, T(85), T(85) + 0.3));
    const y = H - M - 150;
    this.text('For Mira', M, Math.round(y - (1 - a) * 20), 40 * k, { a, track: -0.02 });
    this.text('Love, said plainly. From Sam.', M, Math.round(y + 64), 17 * k, { a, w: 400, color: SOFT, track: 0 });
  }

  /** a macOS-style arrow pointer, vector */
  private pointer(x: number, y: number, s: number, a: number) {
    const ctx = this.ctx, u = 5.2 * s;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(u, u);
    const p = new Path2D('M0 0 L0 17 L4.2 13 L7 19.3 L9.6 18.2 L6.9 12 L12.6 12 Z');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.6; ctx.stroke(p);
    ctx.fillStyle = '#fff'; ctx.fill(p);
    ctx.restore();
  }

  /** times that touch every engine and look, for warming them up before playback */
  static readonly WARM = [0.5, T(5), T(6.1), T(6.4), T(6.6), T(6.9), T(7.1), T(7.4), T(7.6), T(7.9), T(9), T(13), T(16.2), T(17.2), T(18.2), T(19.2), T(20.2), T(21.2), T(22.2),
    T(24.2), T(26.2), T(32.2), T(33.2), T(34.2), T(35.2), T(36.2), T(37.2), T(41), T(48.2), T(49.2), T(50.2), T(51.2), T(52.2), T(53.2), T(54.2), T(55.2),
    T(56.2), T(57.2), T(58.2), T(60.2), T(61.2), T(62.2), T(63.2), T(65), T(70), T(75), T(82), T(85), T(90), T(93), T(98)];
}
