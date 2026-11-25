import '@fontsource/archivo/latin-500.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/courier-prime/latin-400.css';
import './style.css';
import { Film, W, H, DUR, FPS, POSTER_T } from './film';
import { decode, edit, toBuffer, clicks, RATE } from './audio';
import { renderFilm, probe, CODECS, type Codec } from './encode';
import { Plates } from './plates';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const mins = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

type Saver = { save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null;
let saver: Saver = null;
const claude = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
const saverReady = (async () => {
  // inside a Claude artifact the save prompt arrives a moment after load; on a plain page there is none, so don't wait
  const framed = window.parent !== window;
  for (let i = 0; framed && i < 100 && !(window as unknown as { claude?: unknown }).claude; i++) await new Promise((r) => setTimeout(r, 100));
  const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude ?? claude;
  saver = c ? ((await c.use('downloads').catch(() => null)) as Saver) : null;
})();

async function saveBlob(blob: Blob, filename: string): Promise<string> {
  await saverReady;
  if (saver) {
    try { await saver.save({ filename, data: blob }); return 'Saved.'; }
    catch (e) { const code = (e as { code?: string }).code; return code === 'declined' ? 'Not saved. Press Save again when you are ready.' : `Could not save (${code ?? 'error'}).`; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return 'Downloaded.';
}

/* ---------------------------------------------------------------- preview */
const preview = new Film(0.25);
const stage = $<HTMLDivElement>('stage');
stage.prepend(preview.canvas);
const scrub = $<HTMLInputElement>('scrub');
const clock = $<HTMLSpanElement>('clock');
const playBtn = $<HTMLButtonElement>('play');
let t = 0, playing = false, startedAt = 0, ac: AudioContext | null = null, srcNode: AudioBufferSourceNode | null = null;
let mix: Float32Array[] | null = null, mixBuf: AudioBuffer | null = null;
let dirty = true;

function stopAudio() { try { srcNode?.stop(); } catch { /* already stopped */ } srcNode = null; }
function play() {
  if (t >= DUR - 0.05) t = 0;
  playing = true; playBtn.dataset.on = '1'; playBtn.setAttribute('aria-label', 'Pause');
  if (mixBuf) {
    ac = ac ?? new AudioContext({ sampleRate: RATE });
    stopAudio();
    srcNode = ac.createBufferSource(); srcNode.buffer = mixBuf; srcNode.connect(ac.destination);
    startedAt = ac.currentTime - t; srcNode.start(0, t);
  } else startedAt = performance.now() / 1000 - t;
}
function pause() { playing = false; playBtn.dataset.on = ''; playBtn.setAttribute('aria-label', 'Play'); stopAudio(); }
playBtn.onclick = () => (playing ? pause() : play());
scrub.oninput = () => { t = Number(scrub.value); dirty = true; if (playing) play(); };
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { t = Math.min(DUR, Math.max(0, t + (e.code === 'ArrowRight' ? 1 : -1) / (e.shiftKey ? 1 : FPS))); dirty = true; if (playing) play(); }
});

function loop() {
  if (playing) {
    t = mixBuf && ac ? ac.currentTime - startedAt : performance.now() / 1000 - startedAt;
    if (t >= DUR) { t = DUR; pause(); }
    dirty = true;
  }
  if (dirty) {
    preview.draw(Math.min(t, DUR - 1e-3));
    scrub.value = String(t); clock.textContent = `${fmt(t)} / ${fmt(DUR)}`;
    dirty = false;
  }
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- the track */
const drop = $<HTMLLabelElement>('drop');
const file = $<HTMLInputElement>('file');
const trackNote = $<HTMLParagraphElement>('track-note');
async function takeTrack(f: File) {
  trackNote.textContent = `Editing ${f.name}…`;
  try {
    const src = await decode(await f.arrayBuffer());
    if (src.duration < 183) throw new Error(`this file is ${src.duration.toFixed(1)} s; the edit needs the full 3:05 track`);
    mix = edit(src); mixBuf = toBuffer(mix);
    drop.dataset.state = 'ok';
    trackNote.textContent = `${f.name}: cut to ${DUR.toFixed(1)} s. The riser into the drop, the chorus, then the outro, every join on the beat.`;
    renderBtn.disabled = false;
    if (playing) play();
  } catch (e) {
    drop.dataset.state = 'err';
    trackNote.textContent = `Could not use that file: ${(e as Error).message}.`;
  }
}
file.onchange = () => { if (file.files?.[0]) takeTrack(file.files[0]); };
['dragenter', 'dragover'].forEach((k) => drop.addEventListener(k, (e) => { e.preventDefault(); drop.dataset.over = '1'; }));
['dragleave', 'drop'].forEach((k) => drop.addEventListener(k, () => { drop.dataset.over = ''; }));
drop.addEventListener('drop', (e) => { e.preventDefault(); const f = (e as DragEvent).dataTransfer?.files?.[0]; if (f) takeTrack(f); });

/* ---------------------------------------------------------------- render */
const renderBtn = $<HTMLButtonElement>('render');
const cancelBtn = $<HTMLButtonElement>('cancel');
const bar = $<HTMLDivElement>('bar');
const status = $<HTMLParagraphElement>('status');
const encNote = $<HTMLParagraphElement>('enc-note');
const result = $<HTMLDivElement>('result');
const saveFilm = $<HTMLButtonElement>('save-film');
const savePoster = $<HTMLButtonElement>('save-poster');
const saveNote = $<HTMLParagraphElement>('save-note');
let codec: Codec = 'hevc';
let last: Blob | null = null;
const signal = { cancelled: false };

document.querySelectorAll<HTMLButtonElement>('[data-codec]').forEach((b) => {
  b.onclick = () => {
    codec = b.dataset.codec as Codec;
    document.querySelectorAll<HTMLButtonElement>('[data-codec]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    checkEncoder();
  };
});
async function checkEncoder() {
  if (typeof VideoEncoder === 'undefined') { encNote.textContent = 'This browser cannot encode video. Open the page in Chrome or the Claude desktop app.'; renderBtn.disabled = true; return; }
  const p = await probe(codec);
  encNote.textContent = !p.video ? `${CODECS[codec].label} at 4K is not available here. Try the other codec.`
    : `${CODECS[codec].label} ${p.hardware ? 'on the hardware encoder' : 'in software (slower)'} · ${CODECS[codec].bitrate / 1e6} Mb/s · ${p.aac ? 'AAC 320 kb/s sound' : 'no AAC encoder here'}`;
}

async function run(o: { scale?: number; seconds?: number; label: string }) {
  if (!mix && !o.seconds) return;
  signal.cancelled = false; pause();
  renderBtn.disabled = true; cancelBtn.hidden = false; result.hidden = true; bar.style.setProperty('--p', '0');
  document.body.dataset.busy = '1';
  try {
    const r = await renderFilm({
      codec, audio: mix ?? clicks(), scale: o.scale, seconds: o.seconds, signal,
      onProgress: (p) => {
        bar.style.setProperty('--p', String(p.frame / p.frames));
        status.textContent = p.fps ? `${p.stage}: ${p.frame} of ${p.frames} · ${p.fps.toFixed(1)} frames a second · about ${mins(p.eta)} left` : `${p.stage}…`;
      },
    });
    last = r.blob;
    (window as unknown as { __film: Record<string, unknown> }).__film.lastRender = { bytes: r.blob.size, ms: Math.round(r.ms), frameMs: +r.frameMs.toFixed(1), label: o.label, videoChunks: r.videoChunks, audioChunks: r.audioChunks, codec, track: !!mix };
    status.textContent = `${o.label} rendered in ${mins(r.ms / 1000)} (${r.frameMs.toFixed(0)} ms to draw each frame). ${(r.blob.size / 1e6).toFixed(0)} MB.`;
    result.hidden = false; saveNote.textContent = '';
    saveFilm.dataset.name = o.seconds ? 'flower-film-test.mp4' : 'flower-launch-4k.mp4';
  } catch (e) {
    status.textContent = (e as Error).message === 'cancelled' ? 'Stopped. Nothing was saved.' : `The render failed: ${(e as Error).message}`;
  } finally {
    renderBtn.disabled = !mix; cancelBtn.hidden = true; document.body.dataset.busy = '';
  }
}
renderBtn.onclick = () => run({ label: 'The 4K film' });
cancelBtn.onclick = () => { signal.cancelled = true; };
saveFilm.onclick = async () => { if (last) saveNote.textContent = await saveBlob(last, saveFilm.dataset.name || 'flower-launch-4k.mp4'); };
savePoster.onclick = async () => {
  const f = new Film(1); f.draw(POSTER_T);
  const blob = await new Promise<Blob>((r) => f.canvas.toBlob((b) => r(b as Blob), 'image/png'));
  f.dispose();
  saveNote.textContent = await saveBlob(blob, 'flower-launch-poster.png');
};

/* ---------------------------------------------------------------- 4K still, for checking */
const loupe = $<HTMLDialogElement>('loupe');
const loupeCv = $<HTMLCanvasElement>('loupe-cv');
let big: Film | null = null;
function still(at: number) {
  big = big ?? new Film(1);
  const a = performance.now(); big.draw(at); const ms = performance.now() - a;
  loupeCv.width = W; loupeCv.height = H;
  (loupeCv.getContext('2d') as CanvasRenderingContext2D).drawImage(big.canvas, 0, 0);
  $<HTMLSpanElement>('loupe-t').textContent = `${fmt(at)} · 3840 × 2160 · drawn in ${ms.toFixed(0)} ms`;
  return ms;
}
$<HTMLButtonElement>('inspect').onclick = () => { still(t); loupe.showModal(); };
$<HTMLButtonElement>('loupe-close').onclick = () => loupe.close();
loupeCv.onclick = () => loupeCv.classList.toggle('fit');

/* ---------------------------------------------------------------- README stills, saved to this computer */
const canvasPng = (cv: HTMLCanvasElement) => new Promise<Blob>((r) => cv.toBlob((b) => r(b as Blob), 'image/png'));
async function savePlates(only?: string[]) {
  const done: { name: string; ms: number; bytes: number }[] = [];
  const P = new Plates();
  for (const [name, draw] of P.list) {
    if (only && !only.includes(name)) continue;
    const a = performance.now(); draw(); const ms = performance.now() - a;
    const b = await canvasPng(P.canvas); await saveBlob(b, `${name}.png`);
    done.push({ name, ms: Math.round(ms), bytes: b.size });
  }
  P.dispose();
  if (!only || only.includes('film-poster')) {
    const f = new Film(1); const a = performance.now(); f.draw(POSTER_T); const ms = performance.now() - a;
    const b = await canvasPng(f.canvas); f.dispose(); await saveBlob(b, 'film-poster.png');
    done.push({ name: 'film-poster', ms: Math.round(ms), bytes: b.size });
  }
  return done;
}
function gpu() {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

// for scripting from the console: FILM.still(12), await FILM.plates(), FILM.gpu()
const api = {
  seek: (s: number) => { pause(); t = s; dirty = true; },
  still: (s: number) => { const ms = still(s); loupe.showModal(); return ms; },
  test: (seconds = 3) => run({ seconds, label: `A ${seconds} s test` }),
  plates: savePlates,
  plateNames: () => { const P = new Plates(); const n = P.list.map(([x]) => x); P.dispose(); return [...n, 'film-poster']; },
  gpu,
};
(window as unknown as { __film: Record<string, unknown>; FILM: Record<string, unknown> }).__film = api;
(window as unknown as { FILM: Record<string, unknown> }).FILM = api;

// the same checks from the page that embeds this one (its parent only)
window.addEventListener('message', async (e) => {
  const m = e.data as { __film?: string; id?: number; t?: number; seconds?: number; x?: number; y?: number; times?: number[] };
  if (e.source !== window.parent || !m || typeof m !== 'object' || !m.__film) return;
  let out: unknown = null;
  if (m.__film === 'seek') { pause(); t = m.t ?? 0; dirty = true; out = true; }
  if (m.__film === 'still') {
    out = still(m.t ?? t); if (!loupe.open) loupe.showModal();
    if (m.x !== undefined) { loupeCv.classList.remove('fit'); loupe.scrollTo(m.x, m.y ?? 0); } else loupeCv.classList.add('fit');
  }
  if (m.__film === 'close') { loupe.close(); out = true; }
  if (m.__film === 'perf') { big = big ?? new Film(1); out = (m.times ?? [5, 20, 34, 43, 48, 55]).map((s) => { const a = performance.now(); big!.draw(s); return [s, Math.round(performance.now() - a)]; }); }
  if (m.__film === 'track' && typeof (m as { url?: string }).url === 'string') {
    const url = (m as { url: string }).url;
    // only this artifact's own stored assets
    if (url.startsWith('/_blob/')) {
      const b = await (await fetch(url)).blob();
      await takeTrack(new File([b], 'Neon Dust – Vice City', { type: b.type }));
      out = { track: !!mix, note: trackNote.textContent };
    }
  }
  if (m.__film === 'render' || m.__film === 'test') {
    if (m.__film === 'render') await run({ label: 'The 4K film' });
    else await run({ seconds: m.seconds ?? 3, label: `A ${m.seconds ?? 3} s test` });
    const info = (window as unknown as { __film: Record<string, unknown> }).__film.lastRender as Record<string, unknown>;
    // decode the finished file's sound and line it up against the mix: offset and clean joins
    if (last && mix) {
      try {
        const dec = await new OfflineAudioContext(2, RATE, RATE).decodeAudioData(await last.arrayBuffer());
        const a = dec.getChannelData(0), b = mix[0];
        const win = (x: Float32Array, at: number, n: number) => x.subarray(at, at + n);
        let best = 0, bestErr = Infinity;
        const at = RATE * 20, n = RATE / 2;
        for (let off = -4000; off <= 4000; off += 4) {
          const x = win(a, at + off, n), y = win(b, at, n); let e = 0;
          for (let i = 0; i < n; i += 8) e += Math.abs(x[i] - y[i]);
          if (e < bestErr) { bestErr = e; best = off; }
        }
        let rms = 0; for (let i = 0; i < a.length; i += 16) rms += a[i] * a[i];
        info.sound = { seconds: +dec.duration.toFixed(3), offsetMs: +(best / RATE * 1000).toFixed(2), rms: +Math.sqrt(rms / (a.length / 16)).toFixed(4), err: +(bestErr / (n / 8)).toFixed(5) };
      } catch (e) { info.sound = { error: String(e) }; }
    }
    // play the file back to prove it decodes
    if (last) {
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(last);
      info.playback = await new Promise((r) => { v.onloadedmetadata = () => r({ w: v.videoWidth, h: v.videoHeight, dur: v.duration }); v.onerror = () => r({ error: v.error?.code }); setTimeout(() => r('no metadata'), 8000); });
    }
    out = info;
  }
  if (m.__film === 'plates') {
    // README plates at 4K: drawn here on this computer's GPU, stored as this artifact's assets
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    const assets = c ? (await c.use('assets')) as { upload: (b: Blob) => Promise<{ id: string; url: string }> } | null : null;
    const only = (m as { only?: string[] }).only;
    const list: Record<string, unknown>[] = [];
    const png = (cv: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((r) => cv.toBlob((b) => r(b as Blob), type, q));
    const send = async (name: string, cv: HTMLCanvasElement, ms: number) => {
      const b = await png(cv);
      if (b.size <= 4_000_000) {
        const up = assets ? await assets.upload(b) : null;
        list.push({ name, id: up?.id ?? null, bytes: b.size, type: b.type, ms: Math.round(ms) });
        return;
      }
      // too big to hand over in one piece: lossless PNG halves, joined again on the other side
      const half = document.createElement('canvas'); half.width = cv.width; half.height = cv.height / 2;
      const hc = half.getContext('2d') as CanvasRenderingContext2D;
      for (const [part, y] of [['top', 0], ['bottom', cv.height / 2]] as [string, number][]) {
        hc.clearRect(0, 0, half.width, half.height); hc.drawImage(cv, 0, -y);
        const hb = await png(half);
        const up = assets ? await assets.upload(hb) : null;
        list.push({ name: `${name}@${part}`, id: up?.id ?? null, bytes: hb.size, type: hb.type, ms: Math.round(ms) });
      }
    };
    const P = new Plates();
    for (const [name, draw] of P.list) {
      if (only && !only.includes(name)) continue;
      const a = performance.now(); draw(); await send(name, P.canvas, performance.now() - a);
    }
    P.dispose();
    if (!only || only.includes('film-poster')) { const f = new Film(1); const a = performance.now(); f.draw(POSTER_T); await send('film-poster', f.canvas, performance.now() - a); f.dispose(); }
    out = list;
  }
  if (m.__film === 'state') out = { t, codec, track: !!mix, enc: encNote.textContent, status: status.textContent };
  window.parent.postMessage({ __filmReply: m.id, out }, '*');
});

await document.fonts.load('600 100px Archivo');
await document.fonts.load('500 100px Archivo');
await document.fonts.load('400 100px "Courier Prime"');
checkEncoder();
// warm every engine and look before playback, so cuts never hitch
const warmMsg = new MessageChannel();
const idle = () => new Promise<void>((r) => { warmMsg.port1.onmessage = () => r(); warmMsg.port2.postMessage(0); });
for (const s of Film.WARM) { preview.draw(s); await idle(); }
dirty = true;
loop();
