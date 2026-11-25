// 4K plates for the README: the real engine draws every flower at native size, type is vector.
import { FlowerRenderer } from '../../lib/engine/renderer';
import { FLOWERS } from '../../lib/engine/flowers';
import { PALETTES, GLYPH_SETS, GROUNDS, ENDINGS } from '../../lib/engine/looks';
import type { EndingId, FlowerConfig, FlowerId, GlyphSetId, GroundId, PaletteId } from '../../lib/engine/types';

const W = 3840, H = 2160;
const INK = '#eeeeec', SOFT = '#a4a9b5', PINK = '#e2669a', NIGHT = '#03050b';
const UI = 'Archivo, system-ui, sans-serif', DATA = '"Courier Prime", ui-monospace, monospace';
const BASE: FlowerConfig = {
  flower: 'rose', palette: 'natural', glyphs: 'classic', ground: 'night', ending: 'stay',
  phrase: 'let it bloom', stem: true, spin: 0, brightness: 1.1, glow: 1.1, detail: 0.85, words: 0.6,
};
const rgb = (c: number[]) => `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;

interface Cell { cfg: Partial<FlowerConfig>; te: number; yaw: number; pitch?: number; zoom: number; dx: number; dy: number; dpr?: number }

export class Plates {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private pool = new Map<string, { r: FlowerRenderer; cv: HTMLCanvasElement }>();
  constructor() {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }
  private eng(key: string, dpr: number, detail: number, alpha: boolean) {
    const k = `${key}|${dpr}|${detail}|${alpha}`;
    let e = this.pool.get(k);
    if (!e) {
      const cv = document.createElement('canvas');
      const r = new FlowerRenderer(cv, { alpha });
      r.setConfig({ ...BASE, detail });
      r.resize(W, H, dpr);
      r.transparent = alpha;
      e = { r, cv };
      this.pool.set(k, e);
    }
    return e;
  }
  dispose() { for (const { r } of this.pool.values()) r.dispose(); this.pool.clear(); }

  private ground(c: string) { const x = this.ctx; x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = c; x.fillRect(0, 0, W, H); }
  /** one flower drawn over what is already there; several per plate use their own layer each */
  private flower(slot: string, c: Cell, alpha = true) {
    const detail = c.cfg.detail ?? BASE.detail;
    const e = this.eng(slot, c.dpr ?? 2, detail, alpha);
    e.r.setConfig({ ...BASE, ...c.cfg });
    e.r.zoom = c.zoom; e.r.offset.yaw = c.yaw; e.r.offset.pitch = c.pitch ?? 0;
    e.r.render(c.te);
    this.ctx.drawImage(e.cv, Math.round(c.dx), Math.round(c.dy));
  }
  private text(s: string, x: number, y: number, size: number, o: { w?: number; color?: string; align?: CanvasTextAlign; track?: number; font?: string; a?: number } = {}) {
    const x0 = this.ctx;
    x0.save();
    x0.globalAlpha = o.a ?? 1;
    x0.fillStyle = o.color ?? INK; x0.font = `${o.w ?? 600} ${size}px ${o.font ?? UI}`;
    (x0 as unknown as { letterSpacing: string }).letterSpacing = `${(o.track ?? -0.02) * size}px`;
    x0.textAlign = o.align ?? 'left'; x0.textBaseline = 'alphabetic';
    x0.fillText(s, x, y);
    x0.restore();
  }
  private mark(cx: number, cy: number, size: number) {
    const c = this.ctx, u = size / 24;
    c.save(); c.translate(cx, cy); c.scale(u, u); c.fillStyle = PINK;
    for (let i = 0; i < 5; i++) { c.save(); c.rotate((i * 72 * Math.PI) / 180); c.globalAlpha = 0.9; c.beginPath(); c.ellipse(0, -5.4, 3.1, 4.6, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.fillStyle = NIGHT; c.beginPath(); c.arc(0, 0, 2.4, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  private rrect(x: number, y: number, w: number, h: number, r: number) { this.ctx.beginPath(); this.ctx.roundRect(x, y, w, h, r); }

  /* ------------------------------------------------------------------ the plates */
  readonly list: [string, () => void][] = [
    ['hero', () => {
      this.ground(NIGHT);
      this.flower('a', { cfg: { brightness: 1.15, glow: 1.15 }, te: 6.4, yaw: 2.3, zoom: 1.05, dx: W * 0.16, dy: 0 }, false);
      const x = 288, base = 1130;
      this.mark(x + 125, base - 120, 250);
      this.text('Flower', x + 306, base, 340, { track: -0.035 });
      this.text('A 3D flower drawn in letters.', x, base + 190, 104, { w: 500 });
      this.text('Write on its petals. Send it. Let it bloom.', x, base + 320, 72, { w: 500, color: SOFT, track: -0.01 });
    }],
    ['letters', () => {
      this.ground(NIGHT);
      this.flower('a', { cfg: { stem: false, words: 1, detail: 1 }, te: 6.3, yaw: 3.1, zoom: 2.45, pitch: 0.05, dx: 0, dy: 0, dpr: 3.4 }, false);
    }],
    ['seven-flowers', () => {
      this.ground(NIGHT);
      const ids: FlowerId[] = ['rose', 'tulip', 'lotus', 'lily', 'sakura', 'daisy', 'sunflower'];
      const yaw: Record<FlowerId, number> = { rose: 2.3, tulip: 1.2, lotus: 4.0, lily: 0.4, sakura: 0.9, daisy: 0.3, sunflower: 0.5 };
      // each flower scaled to fill its column the same way; heads and stems share one band
      const zoom: Record<FlowerId, number> = { rose: 0.42, tulip: 0.48, lotus: 0.44, lily: 0.5, sakura: 0.46, daisy: 0.4, sunflower: 0.42 };
      const cw = W / 7;
      ids.forEach((f, i) => {
        this.flower(`c${i}`, { cfg: { flower: f, detail: 1.79 }, te: 6.4, yaw: yaw[f], zoom: zoom[f], dx: (i + 0.5) * cw - W / 2, dy: 60 });
        this.text(FLOWERS[f].name, (i + 0.5) * cw, 1880, 64, { w: 600, align: 'center' });
        this.text(FLOWERS[f].latin, (i + 0.5) * cw, 1960, 48, { w: 500, align: 'center', color: SOFT, track: -0.01 });
      });
    }],
    ['palettes', () => {
      this.ground(NIGHT);
      const ids: PaletteId[] = ['natural', 'blush', 'crimson', 'ivory', 'lavender', 'coral', 'gold', 'ice', 'phosphor', 'amber'];
      const cw = W / 5;
      ids.forEach((p, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        const cx = (col + 0.5) * cw, cy = row === 0 ? 560 : 1500;
        this.flower(`c${i}`, { cfg: { palette: p, stem: false, detail: 1.79 }, te: 6.4, yaw: 2.3 + col * 0.5, zoom: 0.5, dx: cx - W / 2, dy: cy - H / 2 - 40 });
        this.text(PALETTES[p].name, cx, cy + 400, 60, { w: 600, align: 'center' });
      });
    }],
    ['character-sets', () => {
      this.ground(NIGHT);
      const ids: GlyphSetId[] = ['classic', 'blocks', 'dots', 'binary', 'kana', 'words'];
      const cw = W / 3;
      ids.forEach((g, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const cx = (col + 0.5) * cw, cy = row === 0 ? 560 : 1520;
        this.flower(`c${i}`, { cfg: { glyphs: g, stem: false, detail: 1.25, words: 0.8 }, te: 6.4, yaw: 2.0 + i * 0.6, zoom: 0.62, dx: cx - W / 2, dy: cy - H / 2 - 30 });
        this.text(GLYPH_SETS[g].name, cx, cy + 420, 64, { w: 600, align: 'center' });
      });
    }],
    ['dots', () => {
      this.ground(NIGHT);
      const set: [FlowerId, PaletteId, number, number, number][] = [['sunflower', 'gold', 0.4, -1220, 0.78], ['rose', 'natural', 2.3, 0, 1.25], ['lotus', 'ice', 2.5, 1250, 1.15]];
      set.forEach(([f, p, y, dx, z], i) => {
        this.flower(`c${i}`, { cfg: { flower: f, palette: p, glyphs: 'dots', detail: 1.25, glow: 1.25, stem: false }, te: 6.4, yaw: y, zoom: z, dx, dy: -60, dpr: 2.4 });
      });
      this.text('Dots, on any flower, in any palette', W / 2, 1980, 64, { w: 500, align: 'center', color: SOFT, track: -0.01 });
    }],
    ['note', () => {
      this.ground(NIGHT);
      this.flower('a', { cfg: { phrase: 'happy birthday, mira', words: 1 }, te: 6.5, yaw: 1.6, zoom: 1, dx: -W * 0.17, dy: 0 }, false);
      this.slip();
    }],
    ['grounds', () => {
      const ids: GroundId[] = ['black', 'night', 'plum'];
      const cw = W / 3;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      ids.forEach((g, i) => { this.ctx.fillStyle = rgb(GROUNDS[g].color); this.ctx.fillRect(Math.round(i * cw), 0, Math.ceil(cw), H); });
      ids.forEach((g, i) => {
        this.ctx.save(); this.ctx.beginPath(); this.ctx.rect(i * cw, 0, cw, H); this.ctx.clip();
        this.flower(`c${i}`, { cfg: { stem: true, detail: 1.25 }, te: 6.4, yaw: 1.8 + i * 0.7, zoom: 0.62, dx: (i + 0.5) * cw - W / 2, dy: -40 });
        this.ctx.restore();
        this.text(GROUNDS[g].name, (i + 0.5) * cw, 1960, 64, { w: 600, align: 'center' });
      });
    }],
    ['sizes', () => {
      this.ground(NIGHT);
      const sizes: [number, string][] = [[0.8, 'Large'], [1, 'Medium'], [1.25, 'Small'], [1.79, 'Very small']];
      const cw = W / 4;
      sizes.forEach(([d, name], i) => {
        // the same flower at the same size on screen; only the characters shrink
        this.flower(`c${i}`, { cfg: { detail: d, stem: false }, te: 6.4, yaw: 2.4, zoom: 0.66, dx: (i + 0.5) * cw - W / 2, dy: -40 });
        this.text(name, (i + 0.5) * cw, 1900, 64, { w: 600, align: 'center' });
      });
    }],
    ['endings', () => {
      this.ground(NIGHT);
      // wind last, so its trail leaves the frame instead of crossing a neighbour
      const set: [EndingId, number][] = [['stay', 6.6], ['wilt', 10.9], ['fall', 9.4], ['burst', 7.95], ['wind', 8.3]];
      const cw = W / 5;
      set.forEach(([e, te], i) => {
        this.flower(`c${i}`, { cfg: { ending: e, detail: 1.79 }, te, yaw: 0.5 + i * 0.9, zoom: 0.4, dx: (i + 0.5) * cw - W / 2, dy: 40 });
        this.text(ENDINGS[e].name, (i + 0.5) * cw, 1900, 64, { w: 600, align: 'center' });
        this.text(ENDINGS[e].line, (i + 0.5) * cw, 1980, 44, { w: 500, align: 'center', color: SOFT, track: -0.01 });
      });
    }],
  ];

  /** the label slip, as the app draws it, scaled for the plate */
  private slip() {
    const c = this.ctx, k = 2.7, w = 380 * k, ph = 446 * k;
    const x = W - 288 - w, y = Math.round((H - ph) / 2);
    c.fillStyle = '#e4e2dd'; this.rrect(x, y, w, ph, 22 * k); c.fill();
    const px = x + 24 * k; let py = y + 24 * k; const iw = w - 48 * k;
    const rows: [string, string][] = [['Specimen', 'Rosa (rose)'], ['Accession', 'FLW-04172'], ['For', 'Mira']];
    const rh = 36 * k;
    c.fillStyle = '#f1f0ec'; this.rrect(px, py, iw, rh * 3 + 8 * k, 12 * k); c.fill();
    c.strokeStyle = '#1b1a17'; c.lineWidth = k; this.rrect(px + k / 2, py + k / 2, iw - k, rh * 3 + 8 * k - k, 12 * k); c.stroke();
    rows.forEach(([kk, v], i) => {
      const ry = py + 4 * k + i * rh;
      if (i) { c.fillStyle = '#d0ccc3'; c.fillRect(px + 14 * k, Math.round(ry), iw - 28 * k, Math.round(k)); }
      this.text(kk, px + 14 * k, Math.round(ry + 23 * k), 13 * k, { w: 400, color: '#55524b', track: 0 });
      this.text(v, px + 114 * k, Math.round(ry + 23 * k), 14 * k, { w: 400, color: '#1b1a17', track: 0, font: DATA });
    });
    py += rh * 3 + 8 * k + 26 * k;
    this.text('Label', px, Math.round(py + 14 * k), 16 * k, { w: 600, color: '#1b1a17', track: 0 });
    py += 34 * k;
    const field = (label: string, value: string, active: boolean) => {
      this.text(label, px, Math.round(py + 11 * k), 13 * k, { w: 400, color: '#55524b', track: 0 });
      py += 21 * k;
      c.fillStyle = '#f1f0ec'; this.rrect(px, py, iw, 40 * k, 9 * k); c.fill();
      c.strokeStyle = active ? '#1b1a17' : '#bab6ac'; c.lineWidth = k; this.rrect(px + k / 2, py + k / 2, iw - k, 40 * k - k, 9 * k); c.stroke();
      this.text(value, px + 12 * k, Math.round(py + 26 * k), 16 * k, { w: 400, color: '#1b1a17', track: 0, font: DATA });
      py += 58 * k;
    };
    field('Collected for', 'Mira', false);
    field('Collected by', 'Sam', false);
    field('Note, written on the petals', 'happy birthday, mira', true);
  }
}
