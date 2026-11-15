// Global input: paste anywhere, drag & drop onto the whole window, clipboard button for phones.
import { isEditable } from './dom';

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

  let depth = 0;
  const body = document.body;
  const setDragging = (on: boolean) => body.classList.toggle('is-dragging', on);

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    depth = 0;
    setDragging(false);
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

  window.addEventListener('paste', onPaste);
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
  };
}

export const canReadClipboard = (): boolean => !!navigator.clipboard && typeof navigator.clipboard.read === 'function';

/** Explicit "Paste" button (phones have no Ctrl+V). Returns an image file, or text, or nothing. */
export async function readClipboard(): Promise<{ file?: File; text?: string }> {
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
