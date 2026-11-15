// Global input: paste anywhere, drag & drop onto the whole window, clipboard button for phones.
import { isEditable } from './dom';
import { createDragState, withTimeout } from './guards';

export interface InputHandlers {
  onFiles(files: File[]): void;
  onText(text: string): void;
}

function filesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const files = Array.from(dt.files ?? []);
  if (files.length) return files;
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function installGlobalInput(h: InputHandlers): () => void {
  const onPaste = (e: ClipboardEvent) => {
    const files = filesFrom(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      h.onFiles(files);
      return;
    }
    if (isEditable(e.target)) return; // normal paste into a field
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.trim()) {
      e.preventDefault();
      h.onText(text);
    }
  };

  // The overlay is pointer-events: none, but it covers the page, so a stuck one looks like a frozen
  // app. See guards.ts for why it can never stay up.
  const drag = createDragState((on) => document.body.classList.toggle('is-dragging', on));

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drag.enter();
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    drag.over();
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    drag.leave();
  };
  const onDrop = (e: DragEvent) => {
    drag.reset();
    const files = filesFrom(e.dataTransfer);
    if (files.length) {
      e.preventDefault();
      h.onFiles(files);
      return;
    }
    if (isEditable(e.target)) return;
    const text = e.dataTransfer?.getData('text/plain') ?? '';
    if (text.trim()) {
      e.preventDefault();
      h.onText(text);
    }
  };
  const clear = () => drag.reset();
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') drag.reset();
  };

  window.addEventListener('paste', onPaste);
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragend', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('pointerdown', clear, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    drag.reset();
    window.removeEventListener('dragend', clear);
    window.removeEventListener('blur', clear);
    window.removeEventListener('pointerdown', clear, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
  };
}

export const canReadClipboard = (): boolean => !!navigator.clipboard && typeof navigator.clipboard.read === 'function';

/** How long the "Paste" button waits for the clipboard. On iOS read() shows a system "Paste"
 *  callout and stays pending until it is tapped or dismissed; it must never hold the UI. */
export const CLIPBOARD_TIMEOUT_MS = 10_000;

/** Explicit "Paste" button (phones have no Ctrl+V). Returns an image file, or text, or nothing.
 *  Rejects with TimeoutError when the clipboard doesn't answer in time. */
export async function readClipboard(): Promise<{ file?: File; text?: string }> {
  return withTimeout(readClipboardNow(), CLIPBOARD_TIMEOUT_MS);
}

async function readClipboardNow(): Promise<{ file?: File; text?: string }> {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) {
      const blob = await item.getType(type);
      return { file: new File([blob], `pasted-image.${type.split('/')[1] || 'png'}`, { type }) };
    }
  }
  for (const item of items) {
    if (item.types.includes('text/plain')) return { text: await (await item.getType('text/plain')).text() };
  }
  return {};
}
