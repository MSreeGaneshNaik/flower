import { FlowerRenderer } from '../lib/engine/renderer';
import type { FlowerConfig } from '../lib/engine/types';

const cv = document.getElementById('c') as HTMLCanvasElement;
const r = new FlowerRenderer(cv);
(window as unknown as { __r: unknown }).__r = {
  setup(w: number, h: number, cfg: Partial<FlowerConfig>) { r.setConfig(cfg); r.resize(w, h, 1); },
  render(t: number) { r.render(t); return r.lastCost; },
  perf() { return r.perf; },
  debug(d: string) { (r as unknown as { debug: string }).debug = d; },
  angle(yaw: number, pitch: number) { r.offset.yaw = yaw; r.offset.pitch = pitch; },
  count() { return (r as unknown as { s: { n: number } }).s.n; },
};
