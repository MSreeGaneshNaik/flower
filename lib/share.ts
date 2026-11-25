import { FLOWER_ORDER } from './engine/flowers';
import { ENDING_ORDER, GLYPH_ORDER, GROUND_ORDER, PALETTE_ORDER } from './engine/looks';
import { DEFAULT_CONFIG, type FlowerConfig } from './engine/types';

export interface StudioState extends FlowerConfig {
  to: string;
  from: string;
}

export const DEFAULT_STATE: StudioState = { ...DEFAULT_CONFIG, to: '', from: '' };

const pick = <T extends string>(v: string | null, list: readonly T[], fallback: T): T =>
  v && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const num = (v: string | null, fallback: number, lo: number, hi: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
// cut on whole characters, so an emoji at the limit is never split in half
const text = (v: string | null, fallback: string, max: number) => (v === null ? fallback : Array.from(v).slice(0, max).join(''));

/** Read a state from a query string; unknown or missing values fall back to defaults. */
export function decodeState(search: string): { state: StudioState; viewer: boolean } {
  const q = new URLSearchParams(search);
  const d = DEFAULT_STATE;
  const state: StudioState = {
    flower: pick(q.get('f'), FLOWER_ORDER, d.flower),
    palette: pick(q.get('p'), PALETTE_ORDER, d.palette),
    glyphs: pick(q.get('g'), GLYPH_ORDER, d.glyphs),
    ground: pick(q.get('b'), GROUND_ORDER, d.ground),
    ending: pick(q.get('e'), ENDING_ORDER, d.ending),
    phrase: text(q.get('m'), d.phrase, 40),
    to: text(q.get('to'), d.to, 32),
    from: text(q.get('fr'), d.from, 32),
    stem: q.get('st') === null ? d.stem : q.get('st') !== '0',
    spin: num(q.get('sp'), d.spin, 0, 2),
    brightness: num(q.get('br'), d.brightness, 0.5, 2),
    glow: num(q.get('gl'), d.glow, 0, 1.5),
    detail: num(q.get('dt'), d.detail, 0.7, 1.8),
    words: num(q.get('wd'), d.words, 0, 1),
  };
  return { state, viewer: q.get('v') === '1' };
}

/** Only values that differ from the defaults go in the link, so links stay short. */
export function encodeState(s: StudioState, viewer: boolean): string {
  const d = DEFAULT_STATE;
  const q = new URLSearchParams();
  if (s.flower !== d.flower) q.set('f', s.flower);
  if (s.palette !== d.palette) q.set('p', s.palette);
  if (s.glyphs !== d.glyphs) q.set('g', s.glyphs);
  if (s.ground !== d.ground) q.set('b', s.ground);
  if (s.ending !== d.ending) q.set('e', s.ending);
  if (s.phrase !== d.phrase) q.set('m', s.phrase);
  if (s.to) q.set('to', s.to);
  if (s.from) q.set('fr', s.from);
  if (s.stem !== d.stem) q.set('st', s.stem ? '1' : '0');
  if (s.spin !== d.spin) q.set('sp', String(s.spin));
  if (s.brightness !== d.brightness) q.set('br', String(s.brightness));
  if (s.glow !== d.glow) q.set('gl', String(s.glow));
  if (s.detail !== d.detail) q.set('dt', String(s.detail));
  if (s.words !== d.words) q.set('wd', String(s.words));
  if (viewer) q.set('v', '1');
  const str = q.toString();
  return str ? `?${str}` : '';
}

/** A short accession number for the herbarium label, stable for a given state. */
export function accession(s: StudioState): string {
  const key = encodeState(s, false);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `FLW-${String((h >>> 0) % 100000).padStart(5, '0')}`;
}
