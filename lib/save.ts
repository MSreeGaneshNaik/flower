/**
 * Hands a finished file to the person. On the open web: a download, or on phones the share sheet
 * (which can save to Photos). Inside a claude.ai artifact the frame blocks downloads, so files go
 * through the platform's `downloads` capability, which shows the viewer a confirmation.
 */

export type SaveResult = 'saved' | 'declined' | 'busy' | 'app' | 'format' | 'unavailable';

/** what to tell the person when a save did not happen */
export const SAVE_MESSAGES: Record<Exclude<SaveResult, 'saved'>, string> = {
  declined: 'Not saved. Press Download to try again.',
  busy: 'Another save is still waiting for an answer. Try again in a moment.',
  app: 'This app cannot save files. Open Flower in a browser or on a computer to save it.',
  format: 'This view cannot save that kind of file. PNG works everywhere.',
  unavailable: 'Saving is not available here.',
};

type PlatformDownloads = { save(r: { filename: string; data: Blob }): Promise<{ status: string }> };
type ClaudeRuntime = { use?: (name: string) => Promise<unknown> };

export const isEmbedded = () => (window as unknown as { __FLOWER_EMBED?: boolean }).__FLOWER_EMBED === true;

let platform: Promise<PlatformDownloads | null> | null = null;
/** the artifact runtime's downloads namespace, or null where it is not offered; asked once */
function platformDownloads(): Promise<PlatformDownloads | null> | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!c?.use) return null; // the runtime may not have arrived yet: ask again later
  if (!platform) platform = c.use('downloads').then((d) => (d as PlatformDownloads | null) || null).catch(() => null);
  return platform;
}

/**
 * Inside an artifact: resolves true once the platform can save files, false if it cannot.
 * The runtime arrives after the page's first run, so it is looked for for up to ten seconds.
 */
export function canSaveHere(): Promise<boolean> {
  if (!isEmbedded()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const look = () => {
      const p = platformDownloads();
      if (p) p.then((d) => resolve(!!d));
      else if (Date.now() - t0 < 10000) window.setTimeout(look, 200);
      else resolve(false);
    };
    look();
  });
}

/** saves through whichever route this page has */
export async function saveFile(blob: Blob, name: string): Promise<SaveResult> {
  if (isEmbedded()) {
    const d = await (platformDownloads() || Promise.resolve(null));
    if (!d) return 'unavailable';
    try {
      await d.save({ filename: name, data: blob });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      return code === 'declined' ? 'declined' : code === 'rate_limited' ? 'busy' : code === 'host_unavailable' ? 'app' : code === 'extension_not_enabled' ? 'format' : 'unavailable';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'saved';
}

/** true on touch devices whose share sheet takes files: there "Save Image" puts it straight into Photos (never inside an artifact, whose frame refuses Web Share) */
export const prefersShare = (file: File) =>
  !isEmbedded() && window.matchMedia('(pointer: coarse)').matches && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

/** must run from a tap; the person cancelling the sheet is not an error */
export const shareFile = (file: File) => navigator.share({ files: [file] }).catch(() => {});
