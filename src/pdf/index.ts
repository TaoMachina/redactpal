// PUBLIC API of the PDF path. Browser-only. Owner: pdf agent.
//
// Pipeline: pdf.js (lazy-loaded, self-hosted) -> per page: text layer -> word Tokens (geometry.ts)
// [+ OCR for scanned pages / large embedded images] -> buildLayout -> detect -> findingsToRegions.
// Export never touches the original bytes: every page is rendered, painted, re-encoded and placed
// into a brand-new pdf-lib document.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DetectOptions, PageAnalysis, Progress, Rect, Region, Token } from '../core/types';
import { buildLayout, findingsToRegions } from '../core/layout';
import { detect } from '../detect';
import { extractTextTokens } from './extract';
import {
  capScale,
  clipRect,
  dedupeOcrTokens,
  exportScaleFor,
  imageRects,
  mergeRects,
  renumberLines,
  scaleTokens,
  textCoverage,
  TEXT_COVER_MIN,
} from './geometry';
import { classifyPixels, regionPixelRect, toPixelRect } from './encode';

export interface PdfPage extends PageAnalysis {
  index: number; // 0-based
  /** true if the page is (mostly) a scanned image and its text was read by OCR. */
  scanned: boolean;
  /** Render the page (without redactions) into `canvas` at `scale` (1 = source units). Sets canvas size. */
  render(canvas: HTMLCanvasElement, scale: number): Promise<void>;
}

export interface PdfAnalysis {
  pageCount: number;
  pages: PdfPage[];
  /** Metadata found in the original (title/author/creator/producer/...) so the UI can show what will be removed. */
  metadata: Record<string, string>;
  dispose(): void;
}

// ---------------------------------------------------------------- limits & errors

/** Hard cap on pages per document (analysis is sequential and may OCR every page). */
export const MAX_PAGES = 200;
/** Fewer non-whitespace text-layer characters than this => OCR the whole rendered page. */
export const SCANNED_MAX_CHARS = 20;
/** An OCR'd image covering at least this fraction of the page makes the page count as "scanned". */
const SCANNED_MIN_IMAGE_AREA = 0.8;
/** Shown on a page whose OCR failed: "nothing found" there would be false reassurance. */
export const OCR_FAILED_WARNING = "This page couldn't be read automatically — check it and draw boxes by hand.";
/** OCR render resolution (~200 DPI) and pixel cap. */
const OCR_SCALE = 200 / 72;
const OCR_MAX_PIXELS = 8_000_000;
/** Embedded images at least this fraction of the page (and ≥ 36pt on both sides) get OCR'd on text pages. */
const OCR_IMAGE_MIN_AREA = 0.05;
const OCR_IMAGE_MIN_SIDE = 36;
const OCR_IMAGE_MAX_PER_PAGE = 6;
/** Pixel caps: preview rendering (iOS Safari canvas limit) and export (memory per page). */
const RENDER_MAX_PIXELS = 16_777_216;
const EXPORT_MAX_PIXELS = 12_000_000;
const EXPORT_DEFAULT_SCALE = 2;
const JPEG_QUALITY = 0.92;

export type PdfErrorCode = 'password' | 'invalid' | 'too_many_pages' | 'closed' | 'unknown';

/** Error with a user-presentable message (`message`) and a machine-readable `code`. */
export class PdfError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PdfError';
    this.code = code;
  }
}

function loadError(e: unknown): PdfError {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'PasswordException') {
    return new PdfError(
      'password',
      'This PDF is password-protected. RedactPal can’t open encrypted PDFs yet — remove the password first ' +
        '(e.g. open it in your PDF viewer and save or “Print to PDF” an unprotected copy), then drop that copy here.',
      e,
    );
  }
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return new PdfError('invalid', 'This file doesn’t look like a valid PDF — it may be corrupted or incomplete.', e);
  }
  const msg = (e as { message?: string })?.message;
  return new PdfError('unknown', `Couldn’t read this PDF${msg ? `: ${msg}` : '.'}`, e);
}

// ---------------------------------------------------------------- lazy deps

type PdfjsModule = typeof import('./pdfjs');
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  return (pdfjsPromise ??= import('./pdfjs'));
}

// ---------------------------------------------------------------- rendering

const OPS_IMAGE_NAMES = [
  'paintImageXObject',
  'paintInlineImageXObject',
  'paintImageMaskXObject',
  'paintImageXObjectRepeat',
  'paintInlineImageXObjectGroup',
  'paintImageMaskXObjectGroup',
] as const;

function isCancel(e: unknown): boolean {
  return (e as { name?: string })?.name === 'RenderingCancelledException';
}

function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError';
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/** Render a page into a canvas at `scale` (capped to `maxPixels`). Sets the canvas size. */
async function renderPage(mod: PdfjsModule, page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, maxPixels: number) {
  const base = page.getViewport({ scale: 1 });
  const s = capScale(base.width, base.height, Math.max(scale, 0.01), maxPixels);
  const viewport = page.getViewport({ scale: s });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const task = page.render({ canvas, viewport, intent: 'display', annotationMode: mod.pdfjs.AnnotationMode.ENABLE });
  return { task, done: task.promise };
}

interface CanvasSlot {
  gen: number;
  cancel?: () => void;
  done: Promise<void>;
}

// ---------------------------------------------------------------- OCR

function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const n = canvas.width * canvas.height;
  const step = Math.max(1, Math.floor(n / 250_000));
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) return false;
  }
  return true;
}

async function ocrCanvas(canvas: HTMLCanvasElement, onProgress: Progress): Promise<{ width: number; height: number; tokens: Token[] }> {
  const { ocr } = await import('../image');
  return ocr(canvas, onProgress);
}

/** Which embedded images on a text page deserve OCR: large ones whose area is mostly NOT covered by
 *  text-layer words (a scan with a stamped header still gets read; an OCR'd scan with an invisible
 *  text layer does not get read twice). */
async function imagesToOcr(mod: PdfjsModule, page: PDFPageProxy, width: number, height: number, textTokens: Token[]): Promise<Rect[]> {
  const OPS = mod.pdfjs.OPS as unknown as Record<string, number>;
  const opList = await page.getOperatorList({ intent: 'display', annotationMode: mod.pdfjs.AnnotationMode.ENABLE });
  const vp = page.getViewport({ scale: 1 });
  const rects = imageRects(
    opList.fnArray,
    opList.argsArray,
    {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      paintFormXObjectBegin: OPS.paintFormXObjectBegin,
      paintFormXObjectEnd: OPS.paintFormXObjectEnd,
      imageOps: OPS_IMAGE_NAMES.map((n) => OPS[n]).filter((x) => typeof x === 'number'),
    },
    vp,
  );
  const pageArea = width * height;
  return mergeRects(rects)
    .filter((r) => r.w >= OCR_IMAGE_MIN_SIDE && r.h >= OCR_IMAGE_MIN_SIDE && r.w * r.h >= OCR_IMAGE_MIN_AREA * pageArea)
    .filter((r) => textCoverage(textTokens, r) < TEXT_COVER_MIN)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, OCR_IMAGE_MAX_PER_PAGE);
}

// ---------------------------------------------------------------- metadata

const SKIP_INFO = new Set(['PDFFormatVersion', 'IsLinearized', 'IsAcroFormPresent', 'IsXFAPresent', 'IsCollectionPresent', 'IsSignaturesPresent', 'EncryptFilterName']);

function clip(s: string, n = 300): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

async function readMetadata(mod: PdfjsModule, doc: PDFDocumentProxy): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v === null || v === undefined) return;
    const s = clip(typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (s) out[k] = s;
  };
  try {
    const md = await doc.getMetadata();
    const info = md.info as Record<string, unknown> | undefined;
    const metadata = md.metadata as unknown as Iterable<[string, unknown]> | null;
    for (const [k, v] of Object.entries(info ?? {})) {
      if (SKIP_INFO.has(k)) continue;
      if (k === 'Custom' && v && typeof v === 'object') {
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) put(`Custom: ${ck}`, cv);
        continue;
      }
      if (typeof v === 'string' && /Date$/.test(k)) {
        const d = mod.pdfjs.PDFDateString.toDateObject(v);
        put(k, d ? d.toISOString() : v);
      } else if (typeof v === 'string' || typeof v === 'number') put(k, v);
      else if (v && typeof v === 'object' && 'name' in v) put(k, (v as { name: unknown }).name);
    }
    if (info?.IsAcroFormPresent) out['Form fields'] = 'yes';
    if (info?.IsXFAPresent) out['XFA form'] = 'yes';
    if (info?.IsSignaturesPresent) out['Digital signatures'] = 'yes';
    if (typeof info?.EncryptFilterName === 'string') out['Encryption'] = info.EncryptFilterName;
    if (metadata) {
      out['XMP metadata'] = 'present';
      let n = 0;
      for (const [k, v] of metadata) {
        if (n++ >= 30) break;
        put(`XMP ${k}`, v);
      }
    }
  } catch {
    // Metadata is informational only.
  }
  try {
    const att = (await doc.getAttachments()) as unknown as Map<string, { filename?: string }> | Record<string, { filename?: string }> | null;
    const list = att ? (att instanceof Map ? [...att.values()] : Object.values(att)) : [];
    const names = list.map((a) => a?.filename ?? '?');
    if (names.length) out['Attachments'] = clip(`${names.length} file(s): ${names.join(', ')}`);
  } catch {
    /* ignore */
  }
  try {
    const js = (await doc.getJSActions()) as unknown as Map<unknown, unknown> | Record<string, unknown> | null;
    if (js && (js instanceof Map ? js.size : Object.keys(js).length)) out['JavaScript'] = 'yes';
  } catch {
    /* ignore */
  }
  return out;
}

// ---------------------------------------------------------------- analyze

export interface AnalyzePdfOptions extends DetectOptions {
  /** Abort analysis (checked before each page and each OCR call): rejects with DOMException 'AbortError'. */
  signal?: AbortSignal;
}

export async function analyzePdf(file: Blob, opts: AnalyzePdfOptions = {}, onProgress?: Progress): Promise<PdfAnalysis> {
  const { signal, ...detectOpts } = opts;
  checkAbort(signal);
  onProgress?.(0, 'Opening PDF…');
  const mod = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (!data.length) throw new PdfError('invalid', 'This file is empty.');

  const task = mod.pdfjs.getDocument(mod.documentParams(data));
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    task.destroy().catch(() => {});
    throw loadError(e);
  }

  let closed = false;
  const slots = new WeakMap<HTMLCanvasElement, CanvasSlot>();
  const assertOpen = () => {
    if (closed) throw new PdfError('closed', 'This PDF was closed.');
  };

  /** Public render: latest call per canvas wins; earlier in-flight renders on that canvas are cancelled. */
  const renderInto = async (index: number, canvas: HTMLCanvasElement, scale: number) => {
    assertOpen();
    let slot = slots.get(canvas);
    if (!slot) slots.set(canvas, (slot = { gen: 0, done: Promise.resolve() }));
    const gen = ++slot.gen;
    slot.cancel?.();
    const prev = slot.done;
    let release!: () => void;
    slot.done = new Promise<void>((r) => (release = r));
    try {
      await prev;
      if (gen !== slot.gen) return; // superseded by a newer render on this canvas
      assertOpen();
      const page = await doc.getPage(index + 1);
      if (gen !== slot.gen) return;
      const { task: rt, done } = await renderPage(mod, page, canvas, scale, RENDER_MAX_PIXELS);
      slot.cancel = () => rt.cancel();
      try {
        await done;
      } catch (e) {
        if (!isCancel(e)) throw e;
      } finally {
        slot.cancel = undefined;
      }
    } finally {
      release();
    }
  };

  try {
    const n = doc.numPages;
    if (n > MAX_PAGES) {
      throw new PdfError('too_many_pages', `This PDF has ${n} pages. RedactPal handles up to ${MAX_PAGES} pages at a time — split it into smaller parts first.`);
    }
    const metadata = await readMetadata(mod, doc);
    let annotationTotal = 0;
    const pages: PdfPage[] = [];

    for (let i = 0; i < n; i++) {
      checkAbort(signal);
      const report = (f: number, msg: string) => onProgress?.(Math.min(1, (i + Math.max(0, Math.min(1, f))) / n), msg);
      const label = `Reading page ${i + 1} of ${n}…`;
      report(0, label);
      const page = await doc.getPage(i + 1);
      const ext = await extractTextTokens(page);
      annotationTotal += ext.annotationCount;
      const { width, height } = ext;
      let tokens = ext.tokens;
      let scanned = false;
      let warning: string | undefined;
      const ocrFailed = (e: unknown) => {
        console.warn(`RedactPal: OCR failed on page ${i + 1}`, e);
        warning = OCR_FAILED_WARNING;
      };

      try {
        const wholePage = ext.charCount < SCANNED_MAX_CHARS;
        const crops = wholePage ? [] : await imagesToOcr(mod, page, width, height, tokens);
        if (wholePage || crops.length) {
          checkAbort(signal);
          const canvas = document.createElement('canvas');
          try {
            const { done } = await renderPage(mod, page, canvas, OCR_SCALE, OCR_MAX_PIXELS);
            await done;
            const sx = canvas.width / width, sy = canvas.height / height;
            const ocrTokens: Token[] = [];
            // OCR lines get their own line-number range (per crop) so they never join text-layer lines.
            let nextLine = tokens.length ? tokens[tokens.length - 1].line + 1 : 0;
            const targets: Array<{ x: number; y: number; w: number; h: number } | null> = wholePage
              ? isBlank(canvas)
                ? []
                : [null]
              : crops.map((r) => toPixelRect(r, sx, sy, canvas.width, canvas.height)).filter((r) => r !== null);
            let readArea = 0;
            for (let k = 0; k < targets.length; k++) {
              checkAbort(signal);
              const pr = targets[k];
              const sub = (f: number) => report(0.1 + 0.9 * ((k + f) / targets.length), `Reading page ${i + 1} of ${n} (OCR)…`);
              sub(0);
              let src = canvas;
              try {
                if (pr) {
                  src = document.createElement('canvas');
                  src.width = pr.w;
                  src.height = pr.h;
                  src.getContext('2d')!.drawImage(canvas, pr.x, pr.y, pr.w, pr.h, 0, 0, pr.w, pr.h);
                }
                const res = await ocrCanvas(src, (f) => sub(f));
                const rx = pr ? pr.x : 0, ry = pr ? pr.y : 0, rw = pr ? pr.w : canvas.width, rh = pr ? pr.h : canvas.height;
                const scaled = scaleTokens(res.tokens, rw / (res.width || rw) / sx, rh / (res.height || rh) / sy, rx / sx, ry / sy);
                const kept: Token[] = [];
                for (const t of scaled) {
                  const box = clipRect(t.box, width, height);
                  if (box && t.text.trim()) kept.push({ ...t, box });
                }
                // Text over an image (e.g. a stamped header on a scan) is already in the text layer: keep one copy.
                const renum = renumberLines(dedupeOcrTokens(tokens, kept), nextLine);
                if (renum.length) nextLine = renum[renum.length - 1].line + 1;
                ocrTokens.push(...renum);
                readArea = Math.max(readArea, (rw / sx) * (rh / sy));
              } catch (e) {
                if (isAbort(e)) throw e;
                ocrFailed(e); // keep going: other crops and the text layer are still useful
              } finally {
                if (src !== canvas) src.width = src.height = 0;
              }
            }
            if (ocrTokens.length) tokens = [...tokens, ...ocrTokens];
            scanned = readArea > 0 && (wholePage || readArea >= SCANNED_MIN_IMAGE_AREA * width * height);
          } finally {
            canvas.width = canvas.height = 0;
          }
        }
      } catch (e) {
        if (isAbort(e)) throw e;
        // OCR is best effort: keep whatever the text layer gave us, but tell the user this page wasn't fully read.
        ocrFailed(e);
      } finally {
        page.cleanup();
      }

      const layout = buildLayout(tokens);
      const findings = detect(layout.text, detectOpts);
      const regions = findingsToRegions(layout, tokens, findings, { bounds: { width, height } }).map((r) => ({ ...r, id: `p${i + 1}-${r.id}` }));
      pages.push({
        index: i,
        width,
        height,
        tokens,
        text: layout.text,
        findings,
        regions,
        scanned,
        ...(warning ? { warning } : {}),
        render: (canvas, scale) => renderInto(i, canvas, scale),
      });
      report(1, label);
    }
    checkAbort(signal);
    if (annotationTotal) metadata['Annotations'] = String(annotationTotal);
    onProgress?.(1, 'Done');

    return {
      pageCount: n,
      pages,
      metadata,
      dispose() {
        if (closed) return;
        closed = true;
        doc.loadingTask.destroy().catch(() => {});
      },
    };
  } catch (e) {
    closed = true;
    doc.loadingTask.destroy().catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------- export

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject) : reject(new Error(`Could not encode ${type}`))),
      type,
      quality,
    );
  });
}

/** Build a NEW PDF where every page is a flattened image with enabled regions painted solid.
 *  Nothing from the original text layer, annotations, attachments or metadata survives. */
export async function exportRedactedPdf(
  analysis: PdfAnalysis,
  regionsByPage: Region[][],
  opts: { scale?: number; onProgress?: Progress } = {},
): Promise<Blob> {
  const flat = await import('./flatten');
  const out = await flat.createOutputDoc();
  const n = analysis.pages.length;
  // Long documents: lower resolution keeps per-page canvases and the output size (all page images
  // are held until saving) bounded. Regions are mapped with the actual canvas/page ratio below.
  const scale = exportScaleFor(Math.max(n, analysis.pageCount), opts.scale ?? EXPORT_DEFAULT_SCALE);
  const deflateOk = flat.canDeflate();

  for (let i = 0; i < n; i++) {
    const page = analysis.pages[i];
    opts.onProgress?.(i / n, `Flattening page ${i + 1} of ${n}…`);
    const canvas = document.createElement('canvas');
    try {
      // Same viewport (incl. /Rotate) as analysis, so region coordinates line up.
      await page.render(canvas, capScale(page.width, page.height, scale, EXPORT_MAX_PIXELS));
      const cw = canvas.width, chh = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.fillStyle = '#000';
      const sx = cw / page.width, sy = chh / page.height;
      for (const r of regionsByPage[i] ?? []) {
        if (!r.enabled) continue;
        // Throws a user-facing error for an unusable box; null only if it lies entirely off the page.
        const pr = regionPixelRect(r.rect, sx, sy, cw, chh);
        if (pr) ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      }
      // Encode from the painted pixels: the redaction is part of the image, nothing underneath survives.
      const img = ctx.getImageData(0, 0, cw, chh);
      const cls = classifyPixels(img.data, cw, chh);
      if (cls.photo) {
        await flat.addJpegPage(out, page.width, page.height, await canvasToBytes(canvas, 'image/jpeg', JPEG_QUALITY));
      } else if (deflateOk) {
        await flat.addFlatePage(out, page.width, page.height, img.data, cw, chh, cls.gray);
      } else {
        await flat.addPngPage(out, page.width, page.height, await canvasToBytes(canvas, 'image/png'));
      }
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  opts.onProgress?.(1, 'Saving PDF…');
  return flat.saveOutput(out);
}
