// PUBLIC API of the image path (OCR + export). Browser-only. Owner: image agent.
//
// Pipeline: decode (EXIF orientation applied; huge photos shrunk at decode time on phones) ->
// preprocess in a Web Worker (upscale small text, grayscale, invert dark surfaces locally, flatten
// tinted backgrounds, stretch contrast; on a copy within the device's OCR budget) -> Tesseract LSTM
// (self-hosted, one shared worker) -> word tokens mapped back to the BITMAP's pixels -> buildLayout
// -> detect -> regions. Budgets per device: budget.ts.
import type { DetectOptions, PageAnalysis, Progress, Region, Token } from '../core/types';
import { buildLayout, findingsToRegions } from '../core/layout';
import { detect } from '../detect';
import {
  checkExportSize,
  currentBudget,
  decodeResizeWidth,
  decodeTarget,
  DESKTOP_BUDGET,
  downscaleNotice,
  fitPixels,
  LARGE_IMAGE_PIXELS,
  MAX_IMAGE_PIXELS,
  orientedSize,
  type ImageBudget,
  type Size,
} from './budget';
import { canvasToPng, createCanvas, releaseCanvas, resizedBitmap } from './canvas';
import { isHeif, readImageSize } from './imageSize';
import { preprocess } from './offload';
import { IMAGE_OCR_FAILED_WARNING, paintRedacted } from './paint';
import { blocksToTokens } from './tokens';
import { disposeWhenIdle, preloadWorker, recognizePng } from './worker';

export { ocrAssetUrls } from './assets';
export { MAX_IMAGE_PIXELS } from './budget';
export { IMAGE_OCR_FAILED_WARNING, REGION_APPLY_ERROR } from './paint';

/** Progress message while a big photo is being prepared for OCR. */
export const PREPARING_PHOTO = 'Preparing your photo…';

/** Largest file we try to read at all. */
export const MAX_IMAGE_BYTES = 200 * 1024 * 1024;

export interface OcrResult {
  width: number;
  height: number;
  tokens: Token[];
}

type OcrSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | Blob;

let ocrQueue: Promise<unknown> = Promise.resolve();
let pendingJobs = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
/** Phones: terminate the recognizer this long after the last OCR job. Its wasm heap never shrinks,
 *  and would otherwise hold its peak (hundreds of MB) through review and export. */
export const RELEASE_RECOGNIZER_AFTER_MS = 3000;

/**
 * OCR an image/canvas. Assets (worker, wasm core, traineddata) are served from our own origin — never a CDN.
 * Token boxes are in the source's own pixel space (natural image px / canvas px), whatever scaling
 * preprocessing used internally. Calls are serialized on one shared worker.
 */
export function ocr(source: OcrSource, onProgress?: Progress): Promise<OcrResult> {
  return ocrJob(source, onProgress);
}

function ocrJob(source: OcrSource, onProgress?: Progress, prepareMessage?: string): Promise<OcrResult> {
  // Serialize whole jobs (not just recognition) so concurrent callers — e.g. several scanned PDF
  // pages — don't each hold a large preprocessed canvas in memory at the same time.
  pendingJobs++;
  clearTimeout(releaseTimer);
  const run = ocrQueue.then(
    () => ocrNow(source, onProgress, prepareMessage),
    () => ocrNow(source, onProgress, prepareMessage),
  );
  ocrQueue = run.catch(() => undefined);
  void ocrQueue.then(() => {
    if (--pendingJobs === 0 && currentBudget() !== DESKTOP_BUDGET) {
      releaseTimer = setTimeout(() => void disposeWhenIdle(), RELEASE_RECOGNIZER_AFTER_MS);
    }
  });
  return run;
}

async function ocrNow(source: OcrSource, onProgress?: Progress, prepareMessage?: string): Promise<OcrResult> {
  let owned: ImageBitmap | null = null;
  let src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  if (source instanceof Blob) {
    owned = await decodeImage(source);
    src = owned;
  } else {
    src = source;
  }
  try {
    const width = src.width;
    const height = src.height;
    if (!width || !height) throw new Error('This image is empty (0 × 0 pixels).');
    checkPixelCount(width, height);

    // Load the recognizer while the image is being prepared (it is needed right after).
    preloadWorker();
    if (prepareMessage) onProgress?.(0, prepareMessage);
    const { png, scaleX, scaleY } = await preprocessForOcr(src);
    const { blocks } = await recognizePng(png, onProgress);
    const tokens = blocksToTokens(blocks, { scaleX, scaleY, width, height });
    return { width, height, tokens };
  } finally {
    owned?.close();
  }
}

export interface PreprocessResult {
  png: Blob;
  /** OCR-image px per source px. */
  scaleX: number;
  scaleY: number;
  /** For diagnostics. */
  textHeight: number | null;
  inverted: boolean;
}

/** Produce the grayscale, polarity-normalised, (up/down)scaled PNG that Tesseract sees.
 *  Runs in a Web Worker when possible; otherwise never blocks the main thread for more than ~30 ms. */
export async function preprocessForOcr(
  src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  budget: ImageBudget = currentBudget(),
): Promise<PreprocessResult> {
  const out = await preprocess(src, budget);
  const { width: scaleX, height: scaleY } = ocrScale({ width: src.width, height: src.height }, out);
  return { png: out.png, scaleX, scaleY, textHeight: out.textHeight, inverted: out.inverted };
}

/** OCR px per source px on each axis (token boxes are divided by this to get back to source px). */
export function ocrScale(source: Size, ocrImage: Size): Size {
  return { width: ocrImage.width / source.width, height: ocrImage.height / source.height };
}

export interface ImageAnalysis extends PageAnalysis {
  /** The decoded image: what the review screen draws and the exporter saves. width/height are its size. */
  bitmap: ImageBitmap;
  /** Set when the file was larger than this device can handle and RedactPal works on a smaller copy. */
  original?: Size;
  /** User-facing note to show with the result (e.g. "the saved image will be W × H"). */
  notice?: string;
}

/** Decode + OCR + detect + map to regions.
 *  Decode failures (bad/unsupported file) throw. An OCR failure does NOT: the result then has no
 *  tokens/findings/regions and a `warning`, so the user can still draw boxes by hand. */
export async function analyzeImage(file: Blob, opts: DetectOptions = {}, onProgress?: Progress): Promise<ImageAnalysis> {
  onProgress?.(0, 'Opening image…');
  const { bitmap, original, downscaled } = await decodeImageDetailed(file);
  try {
    const { width, height } = bitmap;
    const extra: Pick<ImageAnalysis, 'original' | 'notice'> = downscaled
      ? { original, notice: downscaleNotice(original, { width, height }) }
      : {};
    const big = downscaled || original.width * original.height > LARGE_IMAGE_PIXELS;
    let tokens: Token[];
    try {
      tokens = (await ocrJob(bitmap, (f, msg) => onProgress?.(0.02 + 0.88 * f, msg), big ? PREPARING_PHOTO : undefined)).tokens;
    } catch (e) {
      console.warn('RedactPal: OCR failed', e);
      onProgress?.(1, 'Done');
      return { width, height, tokens: [], text: '', findings: [], regions: [], warning: IMAGE_OCR_FAILED_WARNING, bitmap, ...extra };
    }
    onProgress?.(0.9, 'Looking for sensitive info…');
    const layout = buildLayout(tokens);
    const findings = detect(layout.text, opts);
    const regions = findingsToRegions(layout, tokens, findings, { bounds: { width, height } });
    onProgress?.(1, 'Done');
    return { width, height, tokens, text: layout.text, findings, regions, bitmap, ...extra };
  } catch (e) {
    bitmap.close();
    throw e;
  }
}

export interface ExportImageOptions {
  /** Opaque fill colour as #rgb or #rrggbb. Default '#000000'. Alpha is not allowed (must stay opaque). */
  color?: string;
}

/** Paint enabled regions with solid opaque fill onto a fresh canvas and re-encode as PNG.
 *  Re-encoding drops EXIF/GPS and any hidden data from the original file. */
export async function exportRedactedImage(bitmap: ImageBitmap, regions: Region[]): Promise<Blob> {
  return exportRedactedImageWith(bitmap, regions, {});
}

/**
 * Same as exportRedactedImage, with a choice of fill colour.
 *
 * Safety properties:
 *  - Fills are fully opaque solid rectangles, snapped OUTWARD to whole pixels (no anti-aliased,
 *    half-transparent edges). Never blur/pixelate: those are reversible.
 *  - The output is a brand-new PNG encoded from canvas pixels. Nothing from the original file
 *    container survives: no EXIF (GPS, camera, timestamps, thumbnails), XMP, IPTC, ICC profile,
 *    comments or trailing data. The browser has already converted pixels to sRGB on decode.
 *  - The image is drawn over an opaque white background, so the output is fully opaque: colour
 *    hidden in transparent or near-transparent pixels can't survive (or be revealed by stripping alpha).
 *  - Any enabled region that can't be painted fails the export (never silently skipped).
 *  - The export canvas is the bitmap's full size. On phones decodeImage() already keeps the bitmap
 *    under the canvas limit; if it somehow isn't, we refuse with a clear message rather than save a
 *    resampled image (resampling would blend pixels from under a box into its edge).
 */
export async function exportRedactedImageWith(bitmap: ImageBitmap, regions: Region[], opts: ExportImageOptions): Promise<Blob> {
  const color = opts.color ?? '#000000';
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    throw new Error('Redaction colour must be an opaque hex colour like #000000.');
  }
  const W = bitmap.width;
  const H = bitmap.height;
  if (!W || !H) throw new Error('The image is no longer available. Please open it again.');
  checkExportSize(W, H, currentBudget());
  const { canvas, ctx } = createCanvas(W, H);
  try {
    paintRedacted(ctx, bitmap, W, H, regions, color);
    return await canvasToPng(canvas);
  } finally {
    releaseCanvas(canvas);
  }
}

/** Release the OCR worker (call when the app is idle for long / on unload). Waits for running OCR jobs. */
export async function disposeOcr(): Promise<void> {
  await disposeWhenIdle();
}

/** Optional: start downloading/initialising the recognizer early (e.g. on first user interaction). */
export function preloadOcr(): void {
  preloadWorker();
}

// ---------------------------------------------------------------------------------------------

const SUPPORTED = 'Use a PNG, JPEG, WebP, GIF or BMP image.';
const HEIC_UNSUPPORTED = "Your browser can't open HEIC photos. Convert it to JPEG or PNG first (or share it as \"Most Compatible\").";
/** A decode that hasn't finished after this long is abandoned with a friendly error (never a hang). */
export const DECODE_TIMEOUT_MS = 60_000;

/** Decode with EXIF orientation applied. Throws user-facing errors. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return (await decodeImageDetailed(file)).bitmap;
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  /** Displayed size of the file (EXIF orientation applied) when the header was readable, else the decoded size. */
  original: Size;
  /** The bitmap is smaller than the file (very large image on a memory-constrained device). */
  downscaled: boolean;
}

/**
 * Decode with EXIF orientation applied. Images above the device's decode budget are shrunk at
 * decode time (createImageBitmap resize), or right after decoding if the engine ignores the resize
 * options, so no more than the budget stays in memory. Throws user-facing errors, never hangs.
 */
export async function decodeImageDetailed(file: Blob, budget: ImageBudget = currentBudget()): Promise<DecodedImage> {
  const type = (file.type || '').toLowerCase();
  const name = (file as Partial<File>).name ?? '';
  if (type === 'image/svg+xml') {
    throw new Error(`SVG images aren't supported. Export or screenshot it as PNG first.`);
  }
  if (type && !type.startsWith('image/')) {
    throw new Error(`This file type (${type}) isn't an image RedactPal can read. ${SUPPORTED}`);
  }
  if (file.size === 0) throw new Error('This file is empty.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`This image file is too large (${Math.round(file.size / 1048576)} MB). Please use one under ${MAX_IMAGE_BYTES / 1048576} MB.`);
  }
  // Refuse giant images before decoding allocates width*height*4 bytes; learn the displayed size.
  let shown: Size | null = null;
  let rotated = false;
  let heif = /hei[cf]/.test(type) || /\.hei[cf]$/i.test(name);
  try {
    const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    heif ||= isHeif(head);
    const hdr = readImageSize(head);
    if (hdr) {
      checkPixelCount(hdr.width, hdr.height);
      shown = orientedSize(hdr.width, hdr.height, hdr.orientation);
      rotated = shown.width !== hdr.width;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('This image is too large')) throw e;
    // unreadable header: let the decoder decide
  }

  const target = shown ? decodeTarget(shown.width, shown.height, budget) : null;
  const resizeWidth = shown && target ? decodeResizeWidth(shown, target, rotated) : null;
  let bitmap = await withTimeout(decodeWithFallbacks(file, resizeWidth), DECODE_TIMEOUT_MS, (late) => late?.close());
  if (!bitmap) {
    throw new Error(
      heif ? HEIC_UNSUPPORTED : `This image couldn't be opened — it may be damaged or in a format your browser can't read. ${SUPPORTED}`,
    );
  }
  const original = shown ?? { width: bitmap.width, height: bitmap.height };
  try {
    checkPixelCount(bitmap.width, bitmap.height);
    // Resize options ignored, or no readable header: shrink now (from the bitmap, so orientation is settled).
    const limit = Math.min(budget.maxDecodePixels, budget.maxCanvasPixels);
    if (bitmap.width * bitmap.height > limit) {
      const fit = fitPixels(bitmap.width, bitmap.height, limit);
      let small: ImageBitmap;
      try {
        small = await resizedBitmap(bitmap, fit.width, fit.height);
      } catch {
        throw new Error(
          `This image is too large for this device (${bitmap.width} × ${bitmap.height}). Please crop or resize it, or use a computer.`,
        );
      }
      bitmap.close();
      bitmap = small;
    }
  } catch (e) {
    bitmap.close();
    throw e;
  }
  const downscaled = bitmap.width * bitmap.height < original.width * original.height;
  return { bitmap, original, downscaled };
}

/** createImageBitmap with progressively fewer options. Returns null if nothing could decode the file. */
async function decodeWithFallbacks(file: Blob, resizeWidth: number | null): Promise<ImageBitmap | null> {
  const attempts: Array<ImageBitmapOptions | undefined> = [];
  if (resizeWidth) {
    // Only resizeWidth: the engine keeps the aspect ratio itself (see decodeResizeWidth).
    const resize: ImageBitmapOptions = { resizeWidth, resizeQuality: 'high' };
    attempts.push({ imageOrientation: 'from-image', ...resize }, resize);
  }
  attempts.push({ imageOrientation: 'from-image' }, undefined);
  for (const opts of attempts) {
    try {
      return opts ? await createImageBitmap(file, opts) : await createImageBitmap(file);
    } catch {
      // Older engines reject unknown option values (e.g. 'from-image'): try the next, simpler call.
    }
  }
  return null;
}

/** Resolve with `p`, or reject with a friendly error after `ms`; a late result is handed to `onLate`. */
function withTimeout<T>(p: Promise<T>, ms: number, onLate: (v: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Opening this image took too long on this device. Try a smaller or cropped image.'));
    }, ms);
    p.then(
      (v) => {
        if (timedOut) onLate(v);
        else {
          clearTimeout(timer);
          resolve(v);
        }
      },
      (e) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function checkPixelCount(w: number, h: number): void {
  if (w * h > MAX_IMAGE_PIXELS) {
    const mp = Math.round((w * h) / 1e6);
    throw new Error(
      `This image is too large (${w} × ${h}, ${mp} MP). The limit is ${MAX_IMAGE_PIXELS / 1e6} MP — please crop or resize it.`,
    );
  }
}
