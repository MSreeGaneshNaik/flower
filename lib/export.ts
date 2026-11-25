import { FLOWERS } from './engine/flowers';
import { ENDINGS } from './engine/looks';
import { FlowerRenderer } from './engine/renderer';
import { cellsToSvg } from './engine/svg';
import type { FlowerConfig } from './engine/types';
import { ASPECTS, type AspectId } from './copy';

export type Angle = { yaw: number; pitch: number };
export interface ExportJob {
  cfg: FlowerConfig;
  aspect: AspectId;
  /** the frame's time, seconds */
  t: number;
  /** turn and tilt added to the turntable at t */
  offset: Angle;
}

/** pixel size for a long side; the layout is always the 1080-based frame, only sharper */
export const sizeFor = (aspect: AspectId, longSide: number) => {
  const { w, h } = ASPECTS[aspect];
  const k = longSide / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k), dpr: k };
};

const tick = () => new Promise<void>((r) => window.setTimeout(r, 0));

function renderer(job: ExportJob, longSide: number, opts: { alpha?: boolean; readback?: boolean } = {}) {
  const cv = document.createElement('canvas');
  const r = new FlowerRenderer(cv, opts);
  r.setConfig(job.cfg);
  r.offset = { ...job.offset };
  const { w, h, dpr } = sizeFor(job.aspect, longSide);
  r.resize(w, h, dpr);
  return { r, cv };
}

/** PNG or JPG at any long side up to 4K */
export async function exportStill(job: ExportJob & { longSide: number; format: 'png' | 'jpg'; transparent: boolean }): Promise<Blob> {
  const alpha = job.format === 'png' && job.transparent;
  const { r, cv } = renderer(job, job.longSide, { alpha });
  try {
    r.transparent = alpha;
    r.render(job.t);
    return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not encode the image'))),
      job.format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95));
  } finally { r.dispose(); }
}

/** a true vector file: live text characters, scales to any size */
export function exportSvg(job: ExportJob & { transparent: boolean; title: string }): Blob {
  // the character grid is the same at any pixel size, so read it from the 1x frame; vector needs no pixel size
  const { w, h } = ASPECTS[job.aspect];
  const { r } = renderer(job, Math.max(w, h), { alpha: job.transparent });
  try {
    r.transparent = job.transparent;
    r.render(job.t);
    const svg = cellsToSvg(r.cells(), { transparent: job.transparent, title: job.title });
    return new Blob([svg], { type: 'image/svg+xml' });
  } finally { r.dispose(); }
}

export type GifMotion = 'turn' | 'bloom';
/** how many frames a GIF holds and how long it runs */
export function gifInfo(cfg: FlowerConfig, motion: GifMotion) {
  if (motion === 'turn') return { frames: 48, seconds: 48 * 0.08 };
  const tl = ENDINGS[cfg.ending].timeline;
  const dur = isFinite(tl.loop) ? tl.loop : tl.bloom1 + 3;
  return { frames: Math.round(dur * 10), seconds: Math.round(dur * 10) / 10 };
}

/**
 * One animated .gif, built in the browser: render each frame, map it to one shared
 * 256-colour palette, LZW-encode it, then hand back a single file.
 */
export async function exportGif(job: ExportJob & {
  longSide: number; motion: GifMotion;
  onProgress: (done: number, total: number) => void; signal: { aborted: boolean };
}): Promise<Blob> {
  // loaded on first use: most visits never make a GIF
  const { GIFEncoder, applyPalette, quantize } = await import('gifenc');
  const { r, cv } = renderer(job, job.longSide, { readback: true });
  try {
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const tl = r.timeline();
    const sway = !!FLOWERS[job.cfg.flower].view.sway;
    const frames: { t: number; yaw: number; pitch: number }[] = [];
    let delay = 80;
    if (job.motion === 'turn') {
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        frames.push({ t: job.t, yaw: job.offset.yaw + (sway ? 0.5 * Math.sin(a) : a), pitch: job.offset.pitch });
      }
    } else {
      // the whole life: seed, bloom, ending, at 10 frames a second
      delay = 100;
      const dur = isFinite(tl.loop) ? tl.loop : tl.bloom1 + 3;
      const N = Math.round(dur * 10);
      for (let i = 0; i < N; i++) frames.push({ t: 0.1 + i / 10, yaw: job.offset.yaw, pitch: job.offset.pitch });
    }
    const total = frames.length;
    const draw = (f: { t: number; yaw: number; pitch: number }) => {
      r.offset.yaw = f.yaw; r.offset.pitch = f.pitch;
      r.render(f.t);
      return ctx.getImageData(0, 0, W, H).data;
    };

    // one palette for every frame, learned from a few spread across the loop, so colours never flicker
    const picks = job.motion === 'turn' ? [0, 0.25, 0.5, 0.75] : [0.28, 0.5, 0.62, 0.8];
    const stride = 3;
    const per = Math.ceil((W * H) / stride);
    const sample = new Uint8ClampedArray(per * 4 * picks.length);
    picks.forEach((p, k) => {
      const d = draw(frames[Math.min(total - 1, Math.floor(p * total))]);
      for (let i = 0, o = k * per * 4; i < W * H; i += stride, o += 4) {
        const q = i * 4; sample[o] = d[q]; sample[o + 1] = d[q + 1]; sample[o + 2] = d[q + 2]; sample[o + 3] = 255;
      }
    });
    const palette = quantize(sample, 256);
    await tick();
    if (job.signal.aborted) throw new DOMException('Cancelled', 'AbortError');

    const gif = GIFEncoder();
    for (let i = 0; i < total; i++) {
      const index = applyPalette(draw(frames[i]), palette);
      gif.writeFrame(index, W, H, i === 0 ? { palette, delay, repeat: 0 } : { delay });
      job.onProgress(i + 1, total);
      if (i % 2 === 1) await tick();
      if (job.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    }
    gif.finish();
    return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
  } finally { r.dispose(); }
}
