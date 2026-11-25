// The track edit, on one 105 BPM grid: the riser into the drop (song beats 192…232), the chorus
// (56…104), then the outro (296…312 and its tail). The film's beat 0 is 40 ms in.
// Cuts sit 40 ms before a downbeat with a 30 ms equal-power crossfade, so every kick stays whole.
export const RATE = 48000, LENGTH = 60;

/** [source start, source end, output start] in seconds */
export const PIECES: [number, number, number][] = [
  [114.334, 137.191, 0],
  [36.620, 64.049, 22.857],
  [173.763, 183.477, 50.286],
];
const XF = 0.03, TAIL = 0.45;

export async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ac = new OfflineAudioContext(2, RATE, RATE);
  return ac.decodeAudioData(bytes);
}

/** the edited 60.0 s stereo mix as planar Float32 channels */
export function edit(src: AudioBuffer): Float32Array[] {
  const n = Math.round(LENGTH * RATE);
  const out = [new Float32Array(n), new Float32Array(n)];
  const srcCh = [src.getChannelData(0), src.getChannelData(src.numberOfChannels > 1 ? 1 : 0)];
  const sr = src.sampleRate, h = XF / 2;
  PIECES.forEach(([s0, s1, o0], p) => {
    const o1 = o0 + (s1 - s0);
    const first = p === 0, last = p === PIECES.length - 1;
    const a = first ? 0 : o0 - h, b = last ? LENGTH : o1 + h;
    for (let i = Math.max(0, Math.floor(a * RATE)); i < Math.min(n, Math.ceil(b * RATE)); i++) {
      const tau = i / RATE;
      let g = 1;
      if (first && tau < 0.06) g *= tau / 0.06;
      if (!first && tau < o0 + h) g *= Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, (tau - (o0 - h)) / XF)));
      if (!last && tau > o1 - h) g *= Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, (tau - (o1 - h)) / XF)));
      if (last && tau > LENGTH - TAIL) g *= Math.cos((Math.PI / 2) * Math.min(1, (tau - (LENGTH - TAIL)) / TAIL));
      // source sample, linear interpolation (also resamples if the file is not 48 kHz)
      const st = (s0 + (tau - o0)) * sr, j = Math.floor(st), f = st - j;
      for (let c = 0; c < 2; c++) {
        const d = srcCh[c];
        if (j < 0 || j + 1 >= d.length) continue;
        out[c][i] += g * (d[j] + (d[j + 1] - d[j]) * f);
      }
    }
  });
  // headroom for the encoder: peak at -0.5 dBFS
  let peak = 0;
  for (const c of out) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
  const gain = peak > 0.944 ? 0.944 / peak : 1;
  if (gain !== 1) for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= gain;
  return out;
}

export function toBuffer(ch: Float32Array[]): AudioBuffer {
  const b = new AudioBuffer({ length: ch[0].length, numberOfChannels: 2, sampleRate: RATE });
  b.copyToChannel(ch[0] as Float32Array<ArrayBuffer>, 0); b.copyToChannel(ch[1] as Float32Array<ArrayBuffer>, 1);
  return b;
}

/** a quiet test bed on the beat grid, so the encode path can be tried without the track */
export function clicks(): Float32Array[] {
  const n = LENGTH * RATE, l = new Float32Array(n), r = new Float32Array(n);
  for (let b = 0; b <= 104; b++) {
    const t0 = 0.04 + b * (60 / 105);
    if (t0 < 0) continue;
    for (let i = 0; i < 2400; i++) {
      const k = Math.floor(t0 * RATE) + i; if (k >= n) break;
      const v = 0.25 * Math.sin(2 * Math.PI * (b % 4 === 0 ? 880 : 440) * i / RATE) * Math.exp(-i / 500);
      l[k] += v; r[k] += v;
    }
  }
  return [l, r];
}
