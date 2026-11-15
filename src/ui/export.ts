// Getting the redacted result out: clipboard, download, Web Share. All triggered by explicit clicks.

export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard && typeof navigator.clipboard.write === 'function';
}

/**
 * Copy a PNG. The blob is passed as a promise so Safari keeps the click's user activation while
 * the export is still running.
 */
export async function copyPng(blob: Promise<Blob>): Promise<void> {
  if (!canCopyImage()) throw new Error('unsupported');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (e) {
    // Older Chromium only accepts a resolved Blob.
    const b = await blob;
    if (e instanceof DOMException && e.name === 'NotAllowedError') throw e;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // iOS needs the URL to live a little while after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles(): boolean {
  try {
    if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'needs-gesture' | 'failed';

export async function shareFile(blob: Blob, filename: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  try {
    if (!navigator.canShare?.({ files: [file] })) return 'failed';
    await navigator.share({ files: [file], title: filename });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // Safari drops user activation if the export took too long; a second tap works.
    if (e instanceof DOMException && e.name === 'NotAllowedError') return 'needs-gesture';
    return 'failed';
  }
}
