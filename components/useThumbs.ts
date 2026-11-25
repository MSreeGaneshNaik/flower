'use client';
import { useEffect, useState } from 'react';
import { FLOWER_ORDER } from '@/lib/engine/flowers';
import { FlowerRenderer } from '@/lib/engine/renderer';
import type { FlowerConfig, FlowerId } from '@/lib/engine/types';

type Look = Pick<FlowerConfig, 'palette' | 'glyphs' | 'ground' | 'phrase'>;
type Thumbs = Partial<Record<FlowerId, string>>;

// recent looks, so going back to a colour is instant; capped, since every pause while typing the phrase is a new look
const cache = new Map<string, Thumbs>();
const CACHE_MAX = 12;
const remember = (key: string, t: Thumbs) => {
  cache.delete(key); cache.set(key, t);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
};
let shared: { r: FlowerRenderer; cv: HTMLCanvasElement; px: number } | null = null;
let lastPhrase = '';

/** Renders each flower once, in full bloom and without its stem, as a small image for the picker. */
export function useThumbs(look: Look, enabled = true, size = 112): Thumbs {
  const [thumbs, setThumbs] = useState<Thumbs>({});
  const key = `${look.palette}|${look.glyphs}|${look.ground}|${look.phrase}|${size}`;
  useEffect(() => {
    if (!enabled) return;
    const hit = cache.get(key);
    if (hit && FLOWER_ORDER.every((id) => hit[id])) { remember(key, hit); setThumbs(hit); return; }
    let cancelled = false, timer = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    if (!shared || shared.px !== px) {
      const cv = document.createElement('canvas');
      shared = { r: new FlowerRenderer(cv), cv, px };
      shared.r.zoom = 1.45;
      shared.r.resize(px, px, dpr);
    }
    const { r, cv } = shared;
    const done: Thumbs = { ...(hit || {}) };
    const todo = FLOWER_ORDER.filter((id) => !done[id]);
    // draw straight away in short bursts between frames, never waiting for the page to go idle;
    // the old pictures stay up until their replacements are ready, so nothing flashes blank
    const burst = () => {
      if (cancelled) return;
      r.setConfig({ ...look, stem: false, spin: 1, glow: 0.9, words: 0.5, detail: 1, ending: 'stay' });
      const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 20) {
        const id = todo.shift()!;
        r.setConfig({ flower: id });
        r.render(6.4);
        done[id] = cv.toDataURL('image/png');
      }
      remember(key, { ...done });
      setThumbs((prev) => ({ ...prev, ...done }));
      if (todo.length) timer = window.setTimeout(burst, 0);
    };
    // a short pause lets typing in the phrase settle before redrawing
    timer = window.setTimeout(burst, look.phrase === lastPhrase ? 0 : 120);
    lastPhrase = look.phrase;
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size, enabled]);
  return thumbs;
}
