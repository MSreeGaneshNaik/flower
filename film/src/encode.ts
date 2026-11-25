// Hardware video encoding (WebCodecs → VideoToolbox on a Mac) and MP4 muxing, streamed to a Blob
// so a 4K minute never has to sit in one giant buffer.
import { Muxer, StreamTarget } from 'mp4-muxer';
import { Film, W, H, FPS, DUR, POSTER_T } from './film';
import { RATE } from './audio';

export type Codec = 'hevc' | 'avc';
export const CODECS: Record<Codec, { str: string; label: string; bitrate: number }> = {
  hevc: { str: 'hvc1.1.6.L156.B0', label: 'HEVC', bitrate: 60_000_000 },
  avc: { str: 'avc1.640034', label: 'H.264', bitrate: 72_000_000 },
};

export async function probe(codec: Codec) {
  const c = videoConfig(codec);
  const hw = await VideoEncoder.isConfigSupported({ ...c, hardwareAcceleration: 'prefer-hardware' }).catch(() => ({ supported: false }));
  const any = hw.supported ? hw : await VideoEncoder.isConfigSupported(c).catch(() => ({ supported: false }));
  const aac = await AudioEncoder.isConfigSupported(audioConfig()).catch(() => ({ supported: false }));
  return { video: !!any.supported, hardware: !!hw.supported, aac: !!aac.supported };
}

function videoConfig(codec: Codec, w = W, h = H): VideoEncoderConfig {
  const c: VideoEncoderConfig = {
    codec: CODECS[codec].str, width: w, height: h, framerate: FPS,
    bitrate: CODECS[codec].bitrate * (w * h) / (W * H), bitrateMode: 'variable', latencyMode: 'quality',
  };
  if (codec === 'avc') (c as VideoEncoderConfig & { avc: object }).avc = { format: 'avc' };
  else (c as VideoEncoderConfig & { hevc: object }).hevc = { format: 'hevc' };
  return c;
}
const audioConfig = (): AudioEncoderConfig => ({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 320_000 });

/** collects muxer writes: the head (where the reserved moov is written last) stays patchable, the rest goes to Blobs */
class BlobSink {
  private head = new Uint8Array(8 << 20);
  private headLen = 0;
  private parts: Blob[] = [];
  private pos = this.head.length;
  write(data: Uint8Array, position: number) {
    if (position < this.head.length) {
      const n = Math.min(data.length, this.head.length - position);
      this.head.set(data.subarray(0, n), position);
      this.headLen = Math.max(this.headLen, position + n);
      if (n < data.length) this.write(data.subarray(n), position + n);
      return;
    }
    if (position !== this.pos) throw new Error(`unexpected write at ${position}, expected ${this.pos}`);
    this.parts.push(new Blob([data.slice()]));
    this.pos += data.length;
  }
  blob() {
    const tail = this.parts.length ? this.parts : [];
    const head = this.head.slice(0, this.parts.length ? this.head.length : this.headLen);
    return new Blob([head, ...tail], { type: 'video/mp4' });
  }
}

export interface Progress { frame: number; frames: number; fps: number; eta: number; stage: string }

/** render, encode and mux the whole film. `scale` < 1 makes a quick low-res proof. */
export async function renderFilm(opts: {
  codec: Codec; audio: Float32Array[]; scale?: number; seconds?: number;
  onProgress: (p: Progress) => void; signal: { cancelled: boolean };
}): Promise<{ blob: Blob; ms: number; frameMs: number; videoChunks: number; audioChunks: number }> {
  const scale = opts.scale ?? 1, seconds = opts.seconds ?? DUR;
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const frames = Math.round(seconds * FPS);
  const sink = new BlobSink();
  const muxer = new Muxer({
    target: new StreamTarget({ onData: (d, p) => sink.write(d, p), chunked: true, chunkSize: 8 << 20 }),
    video: { codec: opts.codec, width: w, height: h, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
    fastStart: { expectedVideoChunks: frames + 8, expectedAudioChunks: Math.ceil(seconds * RATE / 1024) + 16 },
    firstTimestampBehavior: 'offset',
  });
  let failure: Error | null = null;
  let videoChunks = 0, audioChunks = 0;
  const venc = new VideoEncoder({ output: (c, m) => { videoChunks++; muxer.addVideoChunk(c, m); }, error: (e) => { failure = e as Error; } });
  const cfg = videoConfig(opts.codec, w, h);
  const hw = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration: 'prefer-hardware' });
  venc.configure(hw.supported ? { ...cfg, hardwareAcceleration: 'prefer-hardware' } : cfg);

  const film = new Film(scale);
  const t0 = performance.now();
  let drawMs = 0;
  // yield without timers, which a hidden page throttles to once a second
  const ch = new MessageChannel(); let wake: (() => void) | null = null;
  ch.port1.onmessage = () => { const f = wake; wake = null; f?.(); };
  const yieldNow = () => new Promise<void>((r) => { wake = r; ch.port2.postMessage(0); });
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.signal.cancelled) throw new Error('cancelled');
      if (failure) throw failure;
      const t = i === 0 && seconds >= DUR ? POSTER_T : i / FPS;
      const a = performance.now();
      film.draw(t);
      drawMs += performance.now() - a;
      const vf = new VideoFrame(film.canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 4) await yieldNow();
      if (i % 6 === 0) {
        const el = (performance.now() - t0) / 1000;
        opts.onProgress({ frame: i + 1, frames, fps: (i + 1) / el, eta: (frames - i - 1) / ((i + 1) / el), stage: 'Drawing and encoding frames' });
        await yieldNow();
      }
    }
    opts.onProgress({ frame: frames, frames, fps: 0, eta: 0, stage: 'Finishing the video' });
    await venc.flush();
    if (failure) throw failure;

    // audio: AAC 320 kb/s
    opts.onProgress({ frame: frames, frames, fps: 0, eta: 0, stage: 'Encoding the sound' });
    const aenc = new AudioEncoder({ output: (c, m) => { audioChunks++; muxer.addAudioChunk(c, m); }, error: (e) => { failure = e as Error; } });
    aenc.configure(audioConfig());
    // the AAC encoder primes with 2112 samples (44 ms) and the MP4 carries no edit list, so feed the
    // sound that much early: decoded, it then lines up with the picture to the sample
    const PRIME = 2112;
    const n = Math.round(seconds * RATE), step = RATE / 10;
    for (let s = 0; s < n; s += step) {
      const len = Math.min(step, n - s);
      const buf = new Float32Array(len * 2);
      const a0 = Math.min(opts.audio[0].length, s + PRIME), a1 = Math.min(opts.audio[0].length, s + PRIME + len);
      if (a1 > a0) { buf.set(opts.audio[0].subarray(a0, a1), 0); buf.set(opts.audio[1].subarray(a0, a1), len); }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / RATE), data: buf });
      aenc.encode(ad); ad.close();
      // never flush mid-stream: an AAC flush pads and restarts the stream, which clicks
      while (aenc.encodeQueueSize > 16) await yieldNow();
    }
    await aenc.flush();
    if (failure) throw failure;
    muxer.finalize();
    return { blob: sink.blob(), ms: performance.now() - t0, frameMs: drawMs / frames, videoChunks, audioChunks };
  } finally {
    if (venc.state !== 'closed') venc.close();
    film.dispose();
  }
}
