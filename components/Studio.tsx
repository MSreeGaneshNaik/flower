'use client';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FLOWERS, FLOWER_ORDER } from '@/lib/engine/flowers';
import { ENDINGS } from '@/lib/engine/looks';
import { FlowerRenderer } from '@/lib/engine/renderer';
import type { FlowerConfig, FlowerId } from '@/lib/engine/types';
import { DEFAULT_STATE, decodeState, encodeState, type StudioState } from '@/lib/share';
import { SAVE_MESSAGES, canSaveHere, prefersShare, saveFile, shareFile } from '@/lib/save';
import { ASPECTS, COPY, type AspectId } from '@/lib/copy';
import Panel, { SECTION_ORDER, type SectionId } from './Panel';
import { FlowerMark, IconClose, IconPause, IconPlay, IconReplay, IconSliders } from './Icons';
import { useThumbs } from './useThumbs';

// the export dialog (and its GIF encoder) loads the first time someone opens it
const ExportDialog = lazy(() => import('./ExportDialog'));

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) || null;
};
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; // taste-skill-ignore: a clock
const SECTION_NAMES: Record<SectionId, string> = { flower: 'Flower', words: 'Words', look: 'Look', ending: 'Ending', share: 'Share' };

export default function Studio() {
  const [state, setState] = useState<StudioState>(DEFAULT_STATE);
  const [viewer, setViewer] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [aspect, setAspect] = useState<AspectId>('9:16');
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState<{ progress: number } | null>(null);
  const [caps, setCaps] = useState({ recordable: false, format: 'WebM', share: false });
  const [phone, setPhone] = useState(false);
  const [sheet, setSheet] = useState<SectionId | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  /** running inside a claude.ai artifact frame: no downloads, no query links */
  const [embedded, setEmbedded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** a finished clip waits here: for Save or share on phones, or for a retry after a declined save */
  const [clip, setClip] = useState<File | null>(null);
  const [clipNote, setClipNote] = useState('');
  /** this view can save files: always on the open web; inside an artifact once its downloads capability answers */
  const [canSave, setCanSave] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<FlowerRenderer | null>(null);
  // dirty: something changed while paused, so the next frame must be drawn
  const clock = useRef({ t: 0, last: 0, playing: true, scrubbing: false, recording: false, exporting: false, dirty: true });
  const scrubRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const recHostRef = useRef<HTMLDivElement>(null);
  const recStop = useRef<(() => void) | null>(null);
  const quality = useRef({ avg: 16, n: 0, dprCap: 2 });

  const set = useCallback((patch: Partial<StudioState>) => setState((s) => ({ ...s, ...patch })), []);
  const engineCfg: FlowerConfig = useMemo(() => ({
    flower: state.flower, palette: state.palette, glyphs: state.glyphs, ground: state.ground, ending: state.ending,
    phrase: state.phrase, stem: state.stem, spin: state.spin, brightness: state.brightness, glow: state.glow, detail: state.detail, words: state.words,
  }), [state.flower, state.palette, state.glyphs, state.ground, state.ending, state.phrase, state.stem, state.spin, state.brightness, state.glow, state.detail, state.words]);
  // gift viewers have no picker, and before the link is read the look is not known yet
  const thumbs = useThumbs({ palette: state.palette, glyphs: state.glyphs, ground: state.ground, phrase: state.phrase }, ready && !viewer);
  const tl = ENDINGS[state.ending].timeline;
  const scrubMax = isFinite(tl.loop) ? tl.loop : tl.bloom1 + 2.4;

  /* ---------- read the link once; learn what this browser can do */
  useEffect(() => {
    const { state: s, viewer: v } = decodeState(window.location.search);
    setState(s); setViewer(v); setReady(true);
    setEmbedded((window as unknown as { __FLOWER_EMBED?: boolean }).__FLOWER_EMBED === true);
    canSaveHere().then(setCanSave);
    const mime = pickMime();
    setCaps({
      recordable: !!mime && typeof HTMLCanvasElement.prototype.captureStream === 'function',
      format: mime && mime.includes('mp4') ? 'MP4' : 'WebM',
      share: typeof navigator.share === 'function',
    });
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setPhone(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  /* ---------- keep the address bar in step with the studio */
  useEffect(() => {
    if (!ready || viewer || embedded) return;
    const id = window.setTimeout(() => {
      try { window.history.replaceState(null, '', window.location.pathname + encodeState(state, false)); } catch { /* sandboxed frame */ }
    }, 250);
    return () => window.clearTimeout(id);
  }, [state, ready, viewer, embedded]);

  /* ---------- the renderer and its size */
  const fit = useCallback(() => {
    const r = rRef.current, el = stageRef.current;
    if (!r || !el) return;
    const rect = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, quality.current.dprCap);
    r.resize(rect.width * dpr, rect.height * dpr, dpr);
    clock.current.dirty = true;
  }, []);
  useEffect(() => {
    if (!canvasRef.current || !stageRef.current) return;
    rRef.current = new FlowerRenderer(canvasRef.current);
    rRef.current.setConfig(engineCfg);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stageRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);
  useEffect(() => {
    const r = rRef.current;
    if (!r) return;
    r.setConfig(engineCfg);
    clock.current.dirty = true;
  }, [engineCfg]);

  /* ---------- the clock */
  useEffect(() => { clock.current.playing = playing; }, [playing]);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const c = clock.current, r = rRef.current;
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;
      c.last = now;
      const moving = c.playing && !c.scrubbing;
      // the export dialog draws its own preview; the stage holds still meanwhile. Paused, it draws only when something changed.
      if (r && !c.recording && !c.exporting && (moving || c.scrubbing || c.dirty)) {
        c.dirty = false;
        const T = r.timeline();
        if (moving) c.t += dt;
        if (isFinite(T.loop) && c.t >= T.loop) c.t = 0;
        r.render(c.t);
        const max = isFinite(T.loop) ? T.loop : T.bloom1 + 2.4;
        if (scrubRef.current && !c.scrubbing) scrubRef.current.value = String(Math.min(c.t, max));
        if (timeRef.current) timeRef.current.textContent = fmt(c.t);
        // quality governor: drop pixel density, then sampling, if drawing itself runs long.
        // It times the drawing, not the gap between frames, so a 30 fps battery cap is not mistaken for a slow device.
        if (moving && document.visibilityState === 'visible') {
          const q = quality.current;
          q.avg = q.avg * 0.95 + Math.min(100, r.lastCost) * 0.05;
          if (++q.n > 120 && q.avg > 28) {
            q.n = 0;
            if (q.dprCap > 1) { q.dprCap = 1; fit(); }
            else if (r.quality > 0.8) r.quality = 0.8;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fit]);

  /* ---------- actions */
  const replay = useCallback(() => { clock.current.t = 0; setPlaying(true); }, []);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const onFlower = useCallback((id: FlowerId) => {
    set({ flower: id });
    const c = clock.current;
    c.dirty = true;
    // show the new flower open straight away
    if (c.t < 5.9 || (isFinite(tl.end0) && c.t > tl.end0)) c.t = 5.9;
  }, [set, tl.end0]);
  const giftUrl = useCallback(() => window.location.origin + window.location.pathname + encodeState(state, true), [state]);
  const onCopy = useCallback(async () => {
    const url = giftUrl();
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link', url); }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }, [giftUrl]);
  const onShare = useCallback(() => {
    const f = FLOWERS[state.flower];
    navigator.share({ title: `A ${f.name.toLowerCase()}${state.to ? ` for ${state.to}` : ''}`, text: state.phrase, url: giftUrl() }).catch(() => {});
  }, [giftUrl, state.flower, state.to, state.phrase]);
  const fileBase = `flower-${state.flower}${state.to ? '-' + state.to.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''}`;

  useEffect(() => {
    clock.current.exporting = exportOpen;
    if (!exportOpen) { clock.current.last = 0; clock.current.dirty = true; }
  }, [exportOpen]);
  const onExport = useCallback(() => { if (!recStop.current) setExportOpen(true); }, []);

  const onRecord = useCallback(() => {
    if (recStop.current) { recStop.current(); return; }
    const mime = pickMime();
    const host = recHostRef.current;
    if (!mime || !host) return;
    const { w, h } = ASPECTS[aspect];
    const cv = document.createElement('canvas');
    cv.className = 'rec-canvas';
    cv.style.aspectRatio = `${w} / ${h}`;
    const r = new FlowerRenderer(cv);
    // reels are 1080 wide; drawing and encoding twice that only makes phones drop frames
    r.setConfig(engineCfg); r.resize(w, h, 1);
    host.appendChild(cv);
    const T = r.timeline();
    const dur = isFinite(T.loop) ? T.loop : 10;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 10e6 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    let stopped = false, start = 0, lastUi = 0, raf = 0;
    const finish = () => {
      if (stopped) return;
      stopped = true; cancelAnimationFrame(raf);
      if (rec.state !== 'inactive') rec.stop();
    };
    rec.onstop = () => {
      const type = mime.split(';')[0];
      const file = new File(chunks, `${fileBase}-${aspect.replace(':', 'x')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type });
      if (prefersShare(file)) { setClip(file); setClipNote(''); }
      else saveFile(file, file.name).then((res) => { if (res !== 'saved') { setClip(file); setClipNote(SAVE_MESSAGES[res]); } });
      r.dispose(); cv.remove(); recStop.current = null;
      clock.current.recording = false; clock.current.dirty = true; setRecording(null);
    };
    const step = (now: number) => {
      if (stopped) return;
      if (!start) start = now;
      const t = (now - start) / 1000;
      if (t >= dur) { finish(); return; }
      r.render(t);
      if (now - lastUi > 200) { lastUi = now; setRecording({ progress: t / dur }); }
      raf = requestAnimationFrame(step);
    };
    clock.current.recording = true;
    setClip(null); setClipNote('');
    recStop.current = finish;
    setRecording({ progress: 0 });
    rec.start(500);
    raf = requestAnimationFrame(step);
  }, [aspect, engineCfg, fileBase]);

  /* ---------- keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exportOpen) return;
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space' && tgt.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'r' || e.key === 'R') replay();
      else if (e.key === 'h' || e.key === 'H') setChromeHidden((v) => !v);
      else if ((e.key === 'e' || e.key === 'E') && !viewer && canSave) onExport();
      else if (e.key === 'Escape') setSheet(null);
      else if (!viewer && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const i = FLOWER_ORDER.indexOf(state.flower);
        onFlower(FLOWER_ORDER[(i + (e.key === 'ArrowRight' ? 1 : FLOWER_ORDER.length - 1)) % FLOWER_ORDER.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, replay, onFlower, onExport, exportOpen, canSave, state.flower, viewer]);

  const flower = FLOWERS[state.flower];

  const panelProps = {
    state, set, onFlower, thumbs, aspect, setAspect, onCopy, onShare: caps.share ? onShare : null,
    onRecord, onExport, copied, clip, clipNote, canSave, canShareClip: !!clip && prefersShare(clip),
    onSaveClip: () => clip && shareFile(clip),
    onDownloadClip: () => {
      if (!clip) return;
      saveFile(clip, clip.name).then((res) => {
        if (res !== 'saved') setClipNote(SAVE_MESSAGES[res]);
        else if (!prefersShare(clip)) { setClip(null); setClipNote(''); }
      });
    }, recording, recordable: caps.recordable, format: caps.format, embedded,
  };
  const sections = embedded && !canSave ? SECTION_ORDER.filter((id) => id !== 'share') : SECTION_ORDER;

  /* ---------- the gift: straight into the bloom */
  if (viewer) {
    const editorHref = typeof window !== 'undefined' ? window.location.pathname + encodeState(state, false) : '/';
    return (
      <main className="studio viewer" data-ground={state.ground}>
        <div className="stage" ref={stageRef}>
          <canvas ref={canvasRef} role="img" aria-label={`A ${flower.name.toLowerCase()} drawn in characters${state.to ? `, for ${state.to}` : ''}, with the words ${state.phrase} on its petals`} />
          <div className="rec-host" ref={recHostRef} />
        </div>
        <section className="gift" aria-label="Message">
          <h1 className="gift-to">{state.to ? `For ${state.to}` : `A ${flower.name.toLowerCase()}`}</h1>
          <p className="gift-line">{flower.meaning}.{state.from && <> From {state.from}.</>}</p>
          <div className="gift-actions">
            <button type="button" className="btn" onClick={replay}><IconReplay /><span>Replay</span></button>
            <a className="btn quiet" href={editorHref}>Make your own</a>
          </div>
        </section>
      </main>
    );
  }

  /* ---------- the studio */
  return (
    <main className={['studio', chromeHidden && 'chrome-hidden', phone && sheet && 'sheet-open'].filter(Boolean).join(' ')} data-ground={state.ground}>
      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} role="img" aria-label={`A ${flower.name.toLowerCase()} drawn in characters, ${ENDINGS[state.ending].name.toLowerCase()} ending`} />
        <div className={recording ? 'rec-host on' : 'rec-host'} ref={recHostRef} aria-live="polite">
          {recording && <p className="rec-chip">Recording {ASPECTS[aspect].name.toLowerCase()} clip, {Math.round(recording.progress * 100)}%</p>}
        </div>

        <header className="topbar">
          <h1 className="wordmark"><FlowerMark /><span>Flower</span></h1>
        </header>

        <div className="transport" role="group" aria-label="Playback">
          <button type="button" className="t-btn" onClick={togglePlay} aria-label={playing ? COPY.actions.pause : COPY.actions.play}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="t-btn" onClick={replay} aria-label={COPY.actions.replay}><IconReplay /></button>
          <div className="scrub">
            <input ref={scrubRef} type="range" min={0} max={scrubMax} step={0.01} defaultValue={0} aria-label="Time"
              onPointerDown={() => { clock.current.scrubbing = true; }}
              onPointerUp={() => { clock.current.scrubbing = false; }}
              onChange={(e) => { clock.current.t = Number(e.target.value); clock.current.dirty = true; }} />
            <div className="marks" aria-hidden="true">
              <span style={{ left: `${(tl.bloom0 / scrubMax) * 100}%` }}>Bloom</span>
              {isFinite(tl.end0) && <span style={{ left: `${(tl.end0 / scrubMax) * 100}%` }}>{ENDINGS[state.ending].name}</span>}
            </div>
          </div>
          <span className="t-time num" ref={timeRef}>0:00</span>
        </div>

        {phone && (
          <nav className="tabbar" aria-label="Controls">
            {sections.map((id) => (
              <button key={id} type="button" className={sheet === id ? 'tab on' : 'tab'} aria-expanded={sheet === id} onClick={() => setSheet(sheet === id ? null : id)}>
                {SECTION_NAMES[id]}
              </button>
            ))}
          </nav>
        )}
      </div>

      {!phone && (
        <aside className="panel" aria-label="Controls">
          <Panel {...panelProps} />
        </aside>
      )}
      {phone && sheet && (
        <aside className="panel sheet" aria-label={SECTION_NAMES[sheet]}>
          <div className="sheet-head">
            <span className="sheet-title"><IconSliders /> {COPY.sections[sheet]}</span>
            <button type="button" className="t-btn" aria-label="Close" onClick={() => setSheet(null)}><IconClose /></button>
          </div>
          <Panel {...panelProps} only={sheet} />
        </aside>
      )}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog cfg={engineCfg} aspect={aspect} setAspect={setAspect} t={clock.current.t} playing={playing} fileBase={fileBase}
            title={`A ${flower.name.toLowerCase()} drawn in characters${state.to ? `, for ${state.to}` : ''}`} onClose={() => setExportOpen(false)} />
        </Suspense>
      )}
    </main>
  );
}
