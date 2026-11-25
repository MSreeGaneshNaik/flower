'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { FLOWERS } from '@/lib/engine/flowers';
import { ENDINGS, GROUNDS } from '@/lib/engine/looks';
import { FlowerRenderer, turntable } from '@/lib/engine/renderer';
import type { FlowerConfig } from '@/lib/engine/types';
import { exportGif, exportStill, exportSvg, gifInfo, sizeFor, type Angle, type GifMotion } from '@/lib/export';
import { SAVE_MESSAGES, prefersShare, saveFile, shareFile } from '@/lib/save';
import { ASPECTS, ASPECT_ORDER, type AspectId } from '@/lib/copy';
import { IconCheck, IconClose, IconDownload, IconOrbit, IconShare } from './Icons';
import { Segmented, Slider, Toggle } from './Panel';

type Fmt = 'png' | 'jpg' | 'svg' | 'gif';
type Preset = 'front' | 'angled' | 'side' | 'above';
const FORMATS: { v: Fmt; label: string }[] = [{ v: 'png', label: 'PNG' }, { v: 'jpg', label: 'JPG' }, { v: 'svg', label: 'SVG' }, { v: 'gif', label: 'GIF' }];
const RASTER = [{ v: 1920, label: 'HD' }, { v: 2560, label: '2K' }, { v: 3840, label: '4K' }];
const GIF_SIZES = [{ v: 480, label: 'Small' }, { v: 720, label: 'Medium' }, { v: 1080, label: 'Large' }];
const MOTIONS: { v: GifMotion; label: string }[] = [{ v: 'turn', label: 'One full turn' }, { v: 'bloom', label: 'The whole bloom' }];
const PRESETS: { v: Preset; label: string }[] = [{ v: 'front', label: 'Front' }, { v: 'angled', label: 'Angled' }, { v: 'side', label: 'Side' }, { v: 'above', label: 'Above' }];
const PREFS_KEY = 'flower.export';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const deg = (r: number) => Math.round((r * 180) / Math.PI);
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const PITCH = [-0.9, 1.4] as const;

interface Props {
  cfg: FlowerConfig;
  aspect: AspectId;
  setAspect: (a: AspectId) => void;
  /** where the stage clock was when the dialog opened */
  t: number;
  playing: boolean;
  fileBase: string;
  title: string;
  onClose: () => void;
}

/** Pick an angle by dragging the flower, pick a format, get one file. */
export default function ExportDialog(p: Props) {
  const { cfg } = p;
  const tl = ENDINGS[cfg.ending].timeline;
  const tMin = 1.6, tMax = isFinite(tl.end) ? tl.end - 0.3 : tl.bloom1 + 3;
  const home = { yaw: FLOWERS[cfg.flower].view.yaw, pitch: FLOWERS[cfg.flower].view.pitch };

  const [prefs, setPrefs] = useState({ fmt: 'png' as Fmt, long: 3840, gifLong: 720, motion: 'turn' as GifMotion, transparent: false });
  const [moment, setMoment] = useState(() => (p.playing || p.t < tMin ? Math.min(6.4, tMax) : clamp(p.t, tMin, tMax)));
  // the angle is absolute, so it stays put while the moment slider moves
  // playing: start from the flower's composed front; paused: exactly the angle on screen
  const [angle, setAngle] = useState<Angle>(() => (p.playing || p.t < tMin ? home : turntable(cfg, clamp(p.t, tMin, tMax))));
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  /** on phones the finished file waits for a tap on Save or share (the share sheet must start from a tap) */
  const [ready, setReady] = useState<File | null>(null);
  const [closing, setClosing] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<FlowerRenderer | null>(null);
  const job = useRef<{ aborted: boolean } | null>(null);
  const inertia = useRef(0);
  const dragRef = useRef<{ x: number; y: number; hist: { t: number; x: number }[] } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const { fmt } = prefs;
  const alpha = prefs.transparent && (fmt === 'png' || fmt === 'svg');
  const ground = GROUNDS[cfg.ground];
  const setPref = (patch: Partial<typeof prefs>) => setPrefs((o) => {
    const next = { ...o, ...patch };
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
    return next;
  });
  useEffect(() => {
    try { const v = JSON.parse(window.localStorage.getItem(PREFS_KEY) || 'null'); if (v && typeof v === 'object') setPrefs((o) => ({ ...o, ...v })); } catch { /* storage may be blocked */ }
  }, []);

  /* ---------- open as a modal; Esc and the backdrop close it */
  const reduced = useRef(false);
  useLayoutEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);
  const requestClose = useCallback(() => {
    if (job.current) job.current.aborted = true;
    cancelAnimationFrame(inertia.current);
    if (reduced.current) { p.onClose(); return; }
    setClosing(true);
    window.setTimeout(p.onClose, 160);
  }, [p.onClose]);

  /* ---------- the live preview: same layout as the file, drawn small */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setBox({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!canvasRef.current) return;
    const r = new FlowerRenderer(canvasRef.current, { alpha });
    rRef.current = r;
    return () => { r.dispose(); rRef.current = null; };
  }, [alpha]);
  const sized = useRef('');
  const raf = useRef(0);
  const draw = useCallback(() => {
    const r = rRef.current;
    if (!r || box.w < 2) return;
    const A = ASPECTS[p.aspect];
    // twice the box in device pixels, so the characters keep the file's proportions
    const dw = Math.round(box.w * 2), dh = Math.round(box.h * 2);
    r.setConfig(cfg);
    const key = `${dw}x${dh}|${p.aspect}|${cfg.detail}`;
    if (sized.current !== key) { r.resize(dw, dh, dw / A.w); sized.current = key; }
    const base = turntable(cfg, moment);
    r.offset = { yaw: angle.yaw - base.yaw, pitch: angle.pitch - base.pitch };
    r.transparent = alpha;
    r.quality = dragging ? 0.75 : 1;
    r.render(moment);
  }, [alpha, angle, box, cfg, dragging, moment, p.aspect]);
  useEffect(() => { sized.current = ''; }, [alpha]);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [draw]);

  /* ---------- turning it by hand: 1:1 drag, a little momentum on release */
  const kx = TAU / Math.max(240, box.w * 1.25), ky = Math.PI / Math.max(240, box.h * 1.8);
  const turn = (dx: number, dy: number) => setAngle((a) => ({ yaw: a.yaw + dx * kx, pitch: clamp(a.pitch + dy * ky, PITCH[0], PITCH[1]) }));
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    cancelAnimationFrame(inertia.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, hist: [{ t: e.timeStamp, x: e.clientX }] };
    setDragging(true); setTouched(true);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    turn(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
    d.hist.push({ t: e.timeStamp, x: e.clientX });
    if (d.hist.length > 6) d.hist.shift();
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const a = d.hist[0], b = d.hist[d.hist.length - 1];
    let v = b.t - a.t > 0 && e.timeStamp - b.t < 80 ? (b.x - a.x) / (b.t - a.t) : 0; // px per ms
    if (reduced.current || Math.abs(v) < 0.15) { setDragging(false); return; }
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - last); last = now;
      turn(v * dt, 0);
      v *= Math.pow(0.94, dt / 16);
      if (Math.abs(v) > 0.01) inertia.current = requestAnimationFrame(step);
      else setDragging(false);
    };
    inertia.current = requestAnimationFrame(step);
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const s = e.shiftKey ? 3 : 1;
    const m: Record<string, [number, number]> = { ArrowLeft: [-0.26, 0], ArrowRight: [0.26, 0], ArrowUp: [0, 0.14], ArrowDown: [0, -0.14] };
    const k = m[e.key];
    if (!k) return;
    e.preventDefault(); setTouched(true);
    setAngle((a) => ({ yaw: a.yaw + k[0] * s, pitch: clamp(a.pitch + k[1] * s, PITCH[0], PITCH[1]) }));
  };
  const presetAngle = (v: Preset): Angle => v === 'front' ? home
    : v === 'angled' ? { yaw: home.yaw + 0.75, pitch: home.pitch + 0.3 }
      : v === 'side' ? { yaw: home.yaw + Math.PI / 2, pitch: home.pitch }
        : { yaw: home.yaw + 0.35, pitch: 1.15 };
  const preset = PRESETS.find(({ v }) => {
    const a = presetAngle(v);
    return Math.abs(wrap(angle.yaw - a.yaw)) < 0.02 && Math.abs(angle.pitch - a.pitch) < 0.02;
  })?.v ?? ('' as Preset);
  const pick = (v: Preset) => {
    cancelAnimationFrame(inertia.current);
    const a = presetAngle(v);
    // take the short way round
    setAngle((cur) => ({ yaw: cur.yaw + wrap(a.yaw - cur.yaw), pitch: a.pitch }));
    setTouched(true);
  };
  const turnDeg = deg(wrap(angle.yaw - home.yaw)), tiltDeg = deg(angle.pitch - home.pitch);
  const stage = moment < tl.bloom1 - 0.3 ? 'Opening' : isFinite(tl.end0) && moment >= tl.end0 ? ENDINGS[cfg.ending].name : 'Full bloom';

  useEffect(() => { setReady(null); }, [prefs, angle, moment, p.aspect]);

  /* ---------- the file */
  const px = fmt === 'gif' ? sizeFor(p.aspect, prefs.gifLong) : sizeFor(p.aspect, prefs.long);
  const gi = gifInfo(cfg, prefs.motion);
  const detail = fmt === 'svg' ? 'Vector, sharp at any size'
    : fmt === 'gif' ? `${px.w} × ${px.h}, ${gi.seconds.toFixed(1)} s loop`
      : `${px.w} × ${px.h} px`;
  const name = `${p.fileBase}-${p.aspect.replace(':', 'x')}`;

  const run = async () => {
    if (busy) return;
    const ctl = { aborted: false };
    job.current = ctl;
    setNote(null);
    setBusy({ done: 0, total: fmt === 'gif' ? gi.frames : 1, label: fmt === 'gif' ? 'Preparing frames' : 'Rendering' });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const t0 = performance.now();
    const base = turntable(cfg, moment);
    const j = { cfg, aspect: p.aspect, t: moment, offset: { yaw: angle.yaw - base.yaw, pitch: angle.pitch - base.pitch } };
    try {
      let blob: Blob, file: string;
      if (fmt === 'svg') {
        blob = exportSvg({ ...j, transparent: alpha, title: p.title });
        file = `${name}.svg`;
      } else if (fmt === 'gif') {
        blob = await exportGif({ ...j, longSide: prefs.gifLong, motion: prefs.motion, signal: ctl,
          onProgress: (done, total) => setBusy({ done, total, label: `Frame ${done} of ${total}` }) });
        file = `${name}-${prefs.motion}.gif`;
      } else {
        blob = await exportStill({ ...j, longSide: prefs.long, format: fmt, transparent: alpha });
        file = `${name}-${RASTER.find((r) => r.v === prefs.long)?.label.toLowerCase() ?? prefs.long}.${fmt}`;
      }
      if (ctl.aborted) return;
      const made = new File([blob], file, { type: blob.type });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      if (prefersShare(made)) {
        setReady(made);
        setNote({ ok: true, text: `Ready: ${size(blob.size)} in ${secs} s` });
      } else {
        const res = await saveFile(made, file);
        if (res === 'saved') setNote({ ok: true, text: `Saved ${file}, ${size(blob.size)} in ${secs} s` });
        else { setReady(made); setNote({ ok: false, text: SAVE_MESSAGES[res] }); }
      }
    } catch (err) {
      if (!ctl.aborted) setNote({ ok: false, text: err instanceof Error && err.name !== 'AbortError' ? `Could not export: ${err.message}` : 'Export stopped.' });
    } finally {
      if (job.current === ctl) job.current = null;
      setBusy(null);
    }
  };
  // the file is already made: saving again never re-renders
  const saveAgain = async (f: File) => {
    const res = await saveFile(f, f.name);
    if (res === 'saved') { setNote({ ok: true, text: `Saved ${f.name}, ${size(f.size)}` }); if (!prefersShare(f)) setReady(null); }
    else setNote({ ok: false, text: SAVE_MESSAGES[res] });
  };
  const cancel = () => { if (job.current) job.current.aborted = true; setBusy(null); setNote({ ok: false, text: 'Export stopped.' }); };

  const frameStyle = { ['--ar' as string]: String(ASPECTS[p.aspect].w / ASPECTS[p.aspect].h), ['--ground' as string]: `rgb(${ground.color.map((v) => Math.round(v * 255)).join(',')})` };

  return (
    <dialog ref={dialogRef} className={closing ? 'xp closing' : 'xp'} aria-labelledby="xp-title"
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      onClick={(e) => { if (e.target === dialogRef.current) requestClose(); }}>
      <div className="xp-card">
        <header className="xp-head">
          <h2 id="xp-title" className="xp-title">Export image</h2>
          <button type="button" className="t-btn xp-x" aria-label="Close" onClick={requestClose}><IconClose /></button>
        </header>

        <div className="xp-body">
          <div className="xp-view">
            <div className="xp-stage">
              <div ref={frameRef} className={alpha ? 'xp-frame checker' : 'xp-frame'} style={frameStyle}>
                <canvas key={alpha ? 'alpha' : 'opaque'} ref={canvasRef} className={dragging ? 'xp-canvas grabbing' : 'xp-canvas'}
                  tabIndex={0} role="slider" aria-label="Angle. Drag, or use the arrow keys, to turn and tilt the flower"
                  aria-valuemin={-180} aria-valuemax={180} aria-valuenow={turnDeg}
                  aria-valuetext={`Turned ${turnDeg} degrees, tilted ${tiltDeg} degrees`}
                  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} />
                <span className={touched ? 'xp-hint gone' : 'xp-hint'} aria-hidden="true"><IconOrbit /> Drag to turn</span>
              </div>
            </div>
            <div className="xp-angle">
              <Segmented label="Angle" value={preset} onChange={pick} options={PRESETS} />
              <p className="xp-read num" aria-hidden="true">Turn {turnDeg}° · Tilt {tiltDeg > 0 ? '+' : ''}{tiltDeg}°</p>
            </div>
            <Slider label="Moment" value={moment} min={tMin} max={tMax} step={0.05} onChange={setMoment}
              format={(v) => `${stage}, ${v.toFixed(1)} s`} />
          </div>

          <fieldset className="xp-side" disabled={!!busy}>
            <legend className="sr">File</legend>
            <Segmented label="Format" value={fmt} onChange={(v) => setPref({ fmt: v })} options={FORMATS} />
            {(fmt === 'png' || fmt === 'jpg') && (
              <Segmented label="Size" value={prefs.long} onChange={(v) => setPref({ long: v })} options={RASTER} />
            )}
            {fmt === 'gif' && (
              <>
                <Segmented label="Motion" value={prefs.motion} onChange={(v) => setPref({ motion: v })} options={MOTIONS} />
                <Segmented label="Size" value={prefs.gifLong} onChange={(v) => setPref({ gifLong: v })} options={GIF_SIZES} />
              </>
            )}
            <Segmented label="Frame" value={p.aspect} onChange={p.setAspect}
              options={ASPECT_ORDER.map((a) => ({ v: a, label: ASPECTS[a].name }))} />
            {(fmt === 'png' || fmt === 'svg') && (
              <Toggle label="Transparent background" on={prefs.transparent} onChange={(v) => setPref({ transparent: v })} />
            )}
            <p className="help">
              {fmt === 'svg' ? 'Every character is live text, sharp at any size. Double-clicked, it opens in your browser; drag it into Figma or Illustrator to edit it.'
                : fmt === 'gif' ? (prefs.motion === 'turn' ? 'One looping .gif that turns the flower a full circle from this angle.' : 'One looping .gif of the whole bloom, seen from this angle.')
                  : fmt === 'jpg' ? 'Smallest file, no transparency.'
                    : alpha ? 'The glow stays, so it sits best on dark backgrounds.'
                      : 'Lossless, best for posting and printing.'}
            </p>
          </fieldset>
        </div>

        <footer className="xp-foot">
          <p className={note ? (note.ok ? 'xp-note ok' : 'xp-note') : 'xp-note'} role="status" aria-live="polite">
            {busy ? busy.label : note ? <>{note.ok && <IconCheck />}{note.text}</> : detail}
          </p>
          {busy ? (
            <div className="xp-progress">
              <div className={busy.total > 1 ? 'xp-bar' : 'xp-bar indet'} role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={busy.total} aria-valuenow={busy.done}>
                <span style={{ transform: `scaleX(${busy.total ? Math.max(0.04, busy.done / busy.total) : 0.04})` }} />
              </div>
              <button type="button" className="btn" onClick={cancel}>Cancel</button>
            </div>
          ) : ready ? (
            <div className="xp-ready">
              {prefersShare(ready) ? (
                <>
                  <button type="button" className="btn" onClick={() => saveAgain(ready)}><IconDownload /><span>Download</span></button>
                  <button type="button" className="btn primary xp-go" onClick={() => shareFile(ready)}><IconShare /><span>Save or share</span></button>
                </>
              ) : (
                <button type="button" className="btn primary xp-go" onClick={() => saveAgain(ready)}><IconDownload /><span>Download {fmt.toUpperCase()}</span></button>
              )}
            </div>
          ) : (
            <button type="button" className="btn primary xp-go" onClick={run}>
              <IconDownload /><span>Download {fmt.toUpperCase()}</span>
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
