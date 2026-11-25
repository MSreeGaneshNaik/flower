// One authored icon set: 20px box, 1.6px stroke, round joins.
type P = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconPlay = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M6.5 4.5v11l9-5.5-9-5.5z" fill="currentColor" stroke="none" /></svg>);
export const IconPause = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M7 4.5v11M13 4.5v11" strokeWidth={2.2} /></svg>);
export const IconReplay = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4" /><path d="M4 3.5v3.2h3.2" /></svg>);
export const IconLink = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" /></svg>);
export const IconRecord = ({ size = 18 }: P) => (<svg {...base(size)}><circle cx="10" cy="10" r="4.2" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="7.2" /></svg>);
export const IconStop = ({ size = 18 }: P) => (<svg {...base(size)}><rect x="5.5" y="5.5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" /></svg>);
export const IconImage = ({ size = 18 }: P) => (<svg {...base(size)}><rect x="3.5" y="4.5" width="13" height="11" rx="1.5" /><path d="M3.5 13l4-4 3.5 3.5 2-2 3.5 3.5" /></svg>);
export const IconChevron = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M6 8l4 4 4-4" /></svg>);
export const IconCheck = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M5 10.5l3.2 3L15 6.5" /></svg>);
export const IconShare = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M10 3.5v9M6.5 7L10 3.5 13.5 7" /><path d="M5 10.5v5h10v-5" /></svg>);
export const IconClose = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>);
export const IconDownload = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M10 3.5v9M6.5 9L10 12.5 13.5 9" /><path d="M4.5 15.5h11" /></svg>);
export const IconOrbit = ({ size = 16 }: P) => (<svg {...base(size)}><ellipse cx="10" cy="10" rx="7" ry="3.2" /><path d="M13.8 5.4l1.6 1.4-2 .9" /><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" /></svg>);
export const IconSliders = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M4 6h8M15 6h1M4 14h2M9 14h7" /><circle cx="13.5" cy="6" r="1.6" /><circle cx="7.5" cy="14" r="1.6" /></svg>);

/** The Flower mark: five petals drawn as character cells around a centre dot. */
export const FlowerMark = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx="12" cy="6.6" rx="3.1" ry="4.6" fill="currentColor" opacity="0.9" transform={`rotate(${a} 12 12)`} />
    ))}
    <circle cx="12" cy="12" r="2.4" fill="var(--mark-core, #000)" />
  </svg>
);
