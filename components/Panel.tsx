'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { FLOWERS, FLOWER_ORDER } from '@/lib/engine/flowers';
import { ENDINGS, ENDING_ORDER, GLYPH_ORDER, GLYPH_SETS, GROUNDS, GROUND_ORDER, PALETTES, PALETTE_ORDER } from '@/lib/engine/looks';
import type { FlowerId } from '@/lib/engine/types';
import { accession, type StudioState } from '@/lib/share';
import { ASPECTS, ASPECT_ORDER, COPY as copy, type AspectId } from '@/lib/copy';
import { IconCheck, IconChevron, IconDownload, IconImage, IconLink, IconRecord, IconShare, IconStop } from './Icons';

export type SectionId = 'flower' | 'words' | 'look' | 'ending' | 'share';
export const SECTION_ORDER: SectionId[] = ['flower', 'words', 'look', 'ending', 'share'];

export interface PanelProps {
  state: StudioState;
  set: (patch: Partial<StudioState>) => void;
  onFlower: (id: FlowerId) => void;
  thumbs: Partial<Record<FlowerId, string>>;
  aspect: AspectId;
  setAspect: (a: AspectId) => void;
  onCopy: () => void;
  onShare: (() => void) | null;
  onRecord: () => void;
  onExport: () => void;
  copied: boolean;
  /** a finished clip waiting for a tap: Save or share on phones, or a retry after a declined save */
  clip?: File | null;
  clipNote?: string;
  canShareClip?: boolean;
  /** this view can save files (always on the open web; inside an artifact only with the downloads capability) */
  canSave?: boolean;
  onSaveClip?: () => void;
  onDownloadClip?: () => void;
  recording: { progress: number } | null;
  recordable: boolean;
  /** MP4 or WebM, known only in the browser */
  format: string;
  /** inside a claude.ai artifact: downloads and query links are blocked */
  embedded?: boolean;
  /** phones show one section at a time */
  only?: SectionId;
}

const rgb = (c: [number, number, number]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
// detail divides the character size: Very small is 70% of Small (1.25 / 0.7)
const SIZES = [{ v: 0.8, label: 'Large' }, { v: 1, label: 'Medium' }, { v: 1.25, label: 'Small' }, { v: 1.79, label: 'Very small' }];

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className={options.length > 4 ? 'segmented grid3' : 'segmented'} role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v}
            className={value === o.v ? 'seg on' : 'seg'} onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="label-row"><label className="label" htmlFor={id}>{label}</label><span className="value num">{format(value)}</span></div>
      <input id={id} className="range" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={format(value)} />
    </div>
  );
}

/** A panel section. On desktop its header opens and closes it and shows what it is set to; in the phone sheet it is always open. */
function Sec({ id, title, summary, open, onToggle, collapsible, children }: {
  id: SectionId; title: string; summary: string; open: boolean; onToggle: (el: HTMLElement) => void; collapsible: boolean; children: ReactNode;
}) {
  if (!collapsible) {
    return (
      <section className="sec" aria-labelledby={`ttl-${id}`}>
        <h2 id={`ttl-${id}`} className="sec-title">{title}</h2>
        {children}
      </section>
    );
  }
  return (
    <section className={open ? 'sec acc open' : 'sec acc'}>
      <h2 className="sec-head">
        <button type="button" className="sec-toggle" aria-expanded={open} aria-controls={`body-${id}`} onClick={(e) => onToggle(e.currentTarget)}>
          <span className="sec-title" id={`ttl-${id}`}>{title}</span>
          <span className="sec-summary">{summary}</span>
          <IconChevron />
        </button>
      </h2>
      <div className="sec-body" id={`body-${id}`} role="region" aria-labelledby={`ttl-${id}`} inert={!open}>
        <div className="sec-inner"><div className="sec-pad">{children}</div></div>
      </div>
    </section>
  );
}

const OPEN_KEY = 'flower.sections';
const DEFAULT_OPEN: Record<SectionId, boolean> = { flower: true, words: false, look: false, ending: false, share: false };

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="toggle-row" onClick={() => onChange(!on)}>
      <span>{label}</span><span className={on ? 'switch on' : 'switch'} aria-hidden="true"><span /></span>
    </button>
  );
}

/**
 * A section opening near the bottom scrolls itself into view while it opens, on the same
 * ease-out curve as the fold, so the scroll never runs ahead of the space it needs.
 */
function reveal(btn: HTMLElement) {
  const sec = btn.closest('section'), panel = btn.closest('.panel') as HTMLElement | null;
  const pad = sec?.querySelector('.sec-pad') as HTMLElement | null;
  if (!sec || !panel || !pad) return;
  const pr = panel.getBoundingClientRect(), hr = btn.getBoundingClientRect();
  const over = hr.bottom + pad.offsetHeight + 8 - pr.bottom;
  const dist = Math.min(over, hr.top - pr.top - 16); // the header itself stays on screen
  if (dist <= 0) return;
  const start = panel.scrollTop, dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 560, t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    panel.scrollTop = start + dist * (1 - Math.pow(1 - k, 5));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function Panel(p: PanelProps) {
  const { state: s, set } = p;
  const flower = FLOWERS[s.flower];
  const show = (id: SectionId) => !p.only || p.only === id;
  const [open, setOpen] = useState(DEFAULT_OPEN);
  useEffect(() => {
    try { const v = JSON.parse(window.localStorage.getItem(OPEN_KEY) || 'null'); if (v && typeof v === 'object') setOpen({ ...DEFAULT_OPEN, ...v }); } catch { /* storage may be blocked */ }
  }, []);
  const toggle = (id: SectionId, btn: HTMLElement) => {
    if (!open[id]) reveal(btn);
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
      return next;
    });
  };
  const acc = (id: SectionId) => ({ id, open: open[id], onToggle: (el: HTMLElement) => toggle(id, el), collapsible: !p.only });
  const phrase = s.phrase.trim() || 'let it bloom';
  const summary: Record<SectionId, string> = {
    flower: flower.latin,
    words: s.to ? `\u201c${phrase}\u201d for ${s.to}` : `\u201c${phrase}\u201d`,
    look: `${PALETTES[s.palette].name} \u00b7 ${GLYPH_SETS[s.glyphs].name} \u00b7 ${GROUNDS[s.ground].name}`,
    ending: `${ENDINGS[s.ending].name}${s.stem ? '' : ' \u00b7 no stem'}`,
    share: p.embedded && !p.canSave ? 'On the deployed site' : p.recording ? `Recording ${Math.round(p.recording.progress * 100)}%` : p.embedded ? 'Clip or image' : 'Link, clip or image',
  };

  return (
    <div className="panel-inner">
      {/* the label slip */}
      {!p.only && (
        <div className="slip" aria-label="Specimen label">
          <div className="slip-row"><span className="slip-k">Specimen</span><span className="slip-v data"><i>{flower.latin}</i> ({flower.name.toLowerCase()})</span></div>
          <div className="slip-row"><span className="slip-k">Accession</span><span className="slip-v data">{accession(s)}</span></div>
          <div className="slip-row"><span className="slip-k">For</span><span className="slip-v data">{s.to || '—'}</span></div>
        </div>
      )}

      {show('flower') && (
        <Sec title={copy.sections.flower} summary={summary.flower} {...acc('flower')}>
          <div className="specimens" role="radiogroup" aria-labelledby="ttl-flower">
            {FLOWER_ORDER.map((id) => {
              const f = FLOWERS[id];
              const on = s.flower === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'specimen on' : 'specimen'} onClick={() => p.onFlower(id)}>
                  <span className="thumb">{p.thumbs[id] ? <img src={p.thumbs[id]} alt="" width={56} height={56} /> : <span className="thumb-wait" />}</span>
                  <span className="specimen-text">
                    <span className="specimen-name">{f.name}</span>
                    <span className="specimen-sub"><i>{f.latin}</i></span>
                  </span>
                  {on && <span className="specimen-check" aria-hidden="true"><IconCheck /></span>}
                </button>
              );
            })}
          </div>
        </Sec>
      )}

      {show('words') && (
        <Sec title={copy.sections.words} summary={summary.words} {...acc('words')}>
          <div className="pair">
            <div className="field">
              <label className="label" htmlFor="f-to">{copy.fields.to}</label>
              <input id="f-to" className="input data" value={s.to} maxLength={32} placeholder="A name" autoComplete="off"
                onChange={(e) => set({ to: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-from">{copy.fields.from}</label>
              <input id="f-from" className="input data" value={s.from} maxLength={32} placeholder="Your name" autoComplete="off"
                onChange={(e) => set({ from: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-phrase">{copy.fields.phrase}</label>
            <input id="f-phrase" className="input data" value={s.phrase} maxLength={40} spellCheck={false} autoComplete="off"
              onChange={(e) => set({ phrase: e.target.value })} />
          </div>
          <Slider label="How much of it shows" value={s.words} min={0} max={1} step={0.05} onChange={(v) => set({ words: v })}
            format={(v) => (v < 0.05 ? 'Hidden' : `${Math.round(v * 100)}%`)} />
        </Sec>
      )}

      {show('look') && (
        <Sec title={copy.sections.look} summary={summary.look} {...acc('look')}>
          <div className="field">
            <span className="label" id="lbl-pal">{copy.fields.palette}: <span className="value">{PALETTES[s.palette].name}</span></span>
            <div className="swatches" role="radiogroup" aria-labelledby="lbl-pal">
              {PALETTE_ORDER.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={s.palette === id} aria-label={PALETTES[id].name} title={PALETTES[id].name}
                  className={s.palette === id ? 'swatch on' : 'swatch'} onClick={() => set({ palette: id })}>
                  {id === 'natural'
                    ? <span className="sw natural" style={{ ['--a' as string]: rgb(FLOWERS[s.flower].materials.petal.mid), ['--b' as string]: rgb(FLOWERS[s.flower].materials.petal.base) }} />
                    : <span className="sw" style={{ background: rgb(PALETTES[id].swatch) }} />}
                </button>
              ))}
            </div>
          </div>
          <Segmented label={copy.fields.glyphs} value={s.glyphs} onChange={(v) => set({ glyphs: v })}
            options={GLYPH_ORDER.map((g) => ({ v: g, label: GLYPH_SETS[g].name }))} />
          <Segmented label={copy.fields.ground} value={s.ground} onChange={(v) => set({ ground: v })}
            options={GROUND_ORDER.map((g) => ({ v: g, label: GROUNDS[g].name }))} />
          <Segmented label="Character size" value={s.detail} onChange={(v) => set({ detail: v })}
            options={SIZES.map((o) => ({ v: o.v, label: o.label }))} />
          <Slider label="Brightness" value={s.brightness} min={0.5} max={2} step={0.05} onChange={(v) => set({ brightness: v })}
            format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Glow" value={s.glow} min={0} max={1.5} step={0.05} onChange={(v) => set({ glow: v })}
            format={(v) => (v < 0.05 ? 'Off' : `${Math.round(v * 100)}%`)} />
        </Sec>
      )}

      {show('ending') && (
        <Sec title={copy.sections.ending} summary={summary.ending} {...acc('ending')}>
          <div className="endings" role="radiogroup" aria-labelledby="ttl-ending">
            {ENDING_ORDER.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={s.ending === id} className={s.ending === id ? 'ending on' : 'ending'}
                onClick={() => set({ ending: id })}>
                <span className="ending-name">{ENDINGS[id].name}</span>
                <span className="ending-line">{ENDINGS[id].line}</span>
              </button>
            ))}
          </div>
          <Toggle label={copy.fields.stem} on={s.stem} onChange={(v) => set({ stem: v })} />
          <Toggle label={copy.fields.spin} on={s.spin > 0} onChange={(v) => set({ spin: v ? 1 : 0 })} />
        </Sec>
      )}

      {show('share') && p.embedded && !p.canSave && (
        <Sec title={copy.sections.share} summary={summary.share} {...acc('share')}>
          <p className="help">Clips, images and gift links work on the deployed Flower site. This view cannot save files.</p>
        </Sec>
      )}

      {show('share') && (!p.embedded || p.canSave) && (
        <Sec title={copy.sections.share} summary={summary.share} {...acc('share')}>
          {p.embedded ? (
            <p className="help">Gift links work once Flower has its own site. Clips and images save from here.</p>
          ) : (
            <>
              <div className="share-actions">
                <button type="button" className="btn primary" onClick={p.onCopy}>
                  {p.copied ? <IconCheck /> : <IconLink />}<span>{p.copied ? copy.actions.copied : copy.actions.copy}</span>
                </button>
                {p.onShare && (
                  <button type="button" className="btn" onClick={p.onShare}><IconShare /><span>Share</span></button>
                )}
              </div>
              <p className="help">{s.to ? `Opens straight into the bloom, for ${s.to}.` : 'Opens straight into the bloom. Add a name above to address it.'}</p>
            </>
          )}
          <Segmented label={copy.frame} value={p.aspect} onChange={p.setAspect}
            options={ASPECT_ORDER.map((a) => ({ v: a, label: `${ASPECTS[a].name} ${a}` }))} />
          <div className="share-actions">
            <button type="button" className={p.recording ? 'btn rec on' : 'btn rec'} onClick={p.onRecord} disabled={!p.recordable && !p.recording}>
              {p.recording ? <IconStop /> : <IconRecord />}
              <span>{p.recording ? `${copy.actions.recording} ${Math.round(p.recording.progress * 100)}%` : copy.actions.record}</span>
            </button>
            <button type="button" className="btn" onClick={p.onExport} disabled={!!p.recording}><IconImage /><span>{copy.actions.export}</span></button>
          </div>
          {p.clip ? (
            <div className="share-actions">
              <button type="button" className={p.canShareClip ? 'btn' : 'btn primary'} onClick={p.onDownloadClip}><IconDownload /><span>{p.canShareClip ? 'Download' : 'Save clip'}</span></button>
              {p.canShareClip && (
                <button type="button" className="btn primary" onClick={p.onSaveClip}><IconShare /><span>Save or share clip</span></button>
              )}
            </div>
          ) : null}
          <p className="help" role="status">
            {p.clip ? (p.clipNote || 'Your clip is ready. Save or share puts it in Photos or straight into an app.')
              : p.recordable
                ? `${ASPECTS[p.aspect].w} by ${ASPECTS[p.aspect].h}, one full bloom${s.ending === 'stay' ? ' (10 seconds)' : ''}. Saves as ${p.format}.`
                : 'This browser cannot record video. Export an image or a GIF instead.'}
          </p>
        </Sec>
      )}
    </div>
  );
}
