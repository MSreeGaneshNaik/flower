import type { FlowerCells } from './renderer';

const esc = (c: string) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);
const hex2 = (v: number) => v.toString(16).padStart(2, '0');
// 5 bits a channel: groups near-identical colours into one <text>, invisible at any zoom
const q5 = (v: number) => (v & 0xf8) | (v >> 5);
const n = (v: number) => String(Math.round(v * 10) / 10);

/**
 * The frame as a real vector file: every character is live text, positioned exactly where
 * the canvas drew it, one <text> per colour. The glow is a small blurred colour layer underneath.
 */
export function cellsToSvg(c: FlowerCells, opts: { transparent: boolean; title: string }): string {
  const { cols, rows, cw, ch, chars, glyph, rgb } = c;
  const groups = new Map<string, { x: string[]; y: string[]; t: string[] }>();
  const singles: string[] = [];
  for (let y = 0; y < rows; y++) {
    // the canvas centres each glyph at 0.56 of its cell; the alphabetic baseline sits about 0.32 em below that centre.
    // An explicit baseline works in every viewer, where dominant-baseline is ignored by some editors and not inherited by others.
    const py = n(y * ch + ch * 0.56 + ch * 0.32);
    for (let x = 0; x < cols; x++) {
      const j = y * cols + x, k = glyph[j];
      if (k < 0) continue;
      const chr = chars[k];
      if (!chr || chr === ' ') continue;
      const o = j * 4;
      const fill = '#' + hex2(q5(rgb[o])) + hex2(q5(rgb[o + 1])) + hex2(q5(rgb[o + 2]));
      const px = n((x + 0.5) * cw);
      // characters outside the basic plane take two UTF-16 units; give them their own element
      if (chr.length > 1) { singles.push(`<text fill="${fill}" x="${px}" y="${py}">${esc(chr)}</text>`); continue; }
      let g = groups.get(fill);
      if (!g) { g = { x: [], y: [], t: [] }; groups.set(fill, g); }
      g.x.push(px); g.y.push(py); g.t.push(esc(chr));
    }
  }
  const W = c.width, H = c.height;
  const gc = c.ground.map((v) => Math.round(v * 255));
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  const bg = `rgb(${gc.join(',')})`;
  // no fixed width or height: opened in a browser it fits the window (a 2160x3840 page showed only empty corner);
  // editors take the size from the viewBox. The root background fills the letterbox around it.
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"${opts.transparent ? '' : ` style="background:${bg}"`}>`);
  out.push(`<title>${opts.title.replace(/[<>&]/g, esc)}</title>`);
  const glowOn = c.glow > 0.02;
  // the canvas adds glyphs on top of their glow ('lighter'); plus-lighter is the same operation in SVG.
  // Viewers that do not know plus-lighter keep the screen line before it, which looks nearly the same.
  const mix = 'mix-blend-mode:screen;mix-blend-mode:plus-lighter';
  if (glowOn) {
    out.push(`<defs><filter id="near" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(ch * 0.55)}"/></filter>` +
      `<filter id="far" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(ch * 1.8)}"/></filter></defs>`);
  }
  if (!opts.transparent) out.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  if (glowOn) {
    const layer = (f: string, a: number) => `<image href="${c.glowPng}" xlink:href="${c.glowPng}" x="0" y="0" width="${cols * cw}" height="${rows * ch}" preserveAspectRatio="none" opacity="${Math.round(Math.min(1, a * c.glow) * 1000) / 1000}" filter="url(#${f})" style="${mix}"/>`;
    out.push(layer('near', 0.34), layer('far', 0.3));
  }
  out.push(`<g font-family="ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace" font-size="${ch}" text-anchor="middle" style="${mix}">`);
  for (const [fill, g] of groups) out.push(`<text fill="${fill}" x="${g.x.join(' ')}" y="${g.y.join(' ')}">${g.t.join('')}</text>`);
  for (const s of singles) out.push(s);
  out.push('</g></svg>');
  return out.join('\n');
}
