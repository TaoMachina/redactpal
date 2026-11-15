// PUBLIC API of the image path (OCR + export). Browser-only. Owner: image agent.
//
// Pipeline: decode (EXIF orientation applied) -> preprocess (upscale small text, grayscale,
// invert dark surfaces locally, flatten tinted backgrounds, stretch contrast) -> Tesseract LSTM
// (self-hosted, one shared worker) -> word tokens mapped back to ORIGINAL pixels -> buildLayout
// -> detect -> regions.
import type { DetectOptions, PageAnalysis, Progress, Region, Token } from '../core/types';
import { buildLayout, findingsToRegions } from '../core/layout';
import { detect } from '../detect';
import { canvasToPng, createCanvas, releaseCanvas } from './canvas';
import { readImageSize } from './imageSize';
import { IMAGE_OCR_FAILED_WARNING, paintRedacted } from './paint';
import { MAX_ANALYSIS_PIXELS, applyTonePlanRgba, prepareOcr, rgbaToGray } from './preprocess';
import { blocksToTokens } from './tokens';
import { disposeWhenIdle, preloadWorker, recognizePng } from './worker';

export { ocrAssetUrls } from './assets';
export { IMAGE_OCR_FAILED_WARNING, REGION_APPLY_ERROR } from './paint';

/** Largest image we accept (megapixels). Bigger images risk exhausting memory, especially on phones. */
export const MAX_IMAGE_PIXELS = 50_000_000;
/** Largest file we try to read at all. */
export const MAX_IMAGE_BYTES = 200 * 1024 * 1024;

export interface OcrResult {
  width: number;
  height: number;
  tokens: Token[];
}

type OcrSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | Blob;

let ocrQueue: Promise<unknown> = Promise.resolve();

/**
 * OCR an image/canvas. Assets (worker, wasm core, traineddata) are served from our own origin — never a CDN.
 * Token boxes are in the source's own pixel space (natural image px / canvas px), whatever scaling
 * preprocessing used internally. Calls are serialized on one shared worker.
 */
export function ocr(source: OcrSource, onProgress?: Progress): Promise<OcrResult> {
  // Serialize whole jobs (not just recognition) so concurrent callers — e.g. several scanned PDF
  // pages — don't each hold a large preprocessed canvas in memory at the same time.
  const run = ocrQueue.then(
    () => ocrNow(source, onProgress),
    () => ocrNow(source, onProgress),
  );
  ocrQueue = run.catch(() => undefined);
  return run;
}

async function ocrNow(source: OcrSource, onProgress?: Progress): Promise<OcrResult> {
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

/** Produce the grayscale, polarity-normalised, upscaled PNG that Tesseract sees. */
export async function preprocessForOcr(src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas): Promise<PreprocessResult> {
  const W = src.width;
  const H = src.height;

  // 1) Statistics on a (possibly downsampled) copy.
  const a = Math.min(1, Math.sqrt(MAX_ANALYSIS_PIXELS / (W * H)));
  const aw = Math.max(1, Math.round(W * a));
  const ah = Math.max(1, Math.round(H * a));
  const an = createCanvas(aw, ah);
  an.ctx.imageSmoothingEnabled = true;
  an.ctx.imageSmoothingQuality = 'high';
  an.ctx.drawImage(src, 0, 0, aw, ah);
  const gray = rgbaToGray(an.ctx.getImageData(0, 0, aw, ah).data);
  releaseCanvas(an.canvas);
  const { plan: tone, scale: s, textHeight } = prepareOcr(gray, aw, ah, W, H);

  // 2) Scale + tone-map the full image.
  const ow = Math.max(1, Math.round(W * s));
  const oh = Math.max(1, Math.round(H * s));
  const out = createCanvas(ow, oh);
  try {
    out.ctx.imageSmoothingEnabled = true;
    out.ctx.imageSmoothingQuality = 'high';
    out.ctx.drawImage(src, 0, 0, ow, oh);
    const img = out.ctx.getImageData(0, 0, ow, oh);
    applyTonePlanRgba(img.data, ow, oh, tone);
    out.ctx.putImageData(img, 0, 0);
    const png = await canvasToPng(out.canvas);
    return { png, scaleX: ow / W, scaleY: oh / H, textHeight, inverted: tone.inverted };
  } finally {
    releaseCanvas(out.canvas);
  }
}

export interface ImageAnalysis extends PageAnalysis {
  bitmap: ImageBitmap;
}

/** Decode + OCR + detect + map to regions.
 *  Decode failures (bad/unsupported file) throw. An OCR failure does NOT: the result then has no
 *  tokens/findings/regions and a `warning`, so the user can still draw boxes by hand. */
export async function analyzeImage(file: Blob, opts: DetectOptions = {}, onProgress?: Progress): Promise<ImageAnalysis> {
  onProgress?.(0, 'Opening image…');
  const bitmap = await decodeImage(file);
  try {
    const { width, height } = bitmap;
    let tokens: Token[];
    try {
      tokens = (await ocr(bitmap, (f, msg) => onProgress?.(0.02 + 0.88 * f, msg))).tokens;
    } catch (e) {
      console.warn('Blot: OCR failed', e);
      onProgress?.(1, 'Done');
      return { width, height, tokens: [], text: '', findings: [], regions: [], warning: IMAGE_OCR_FAILED_WARNING, bitmap };
    }
    onProgress?.(0.9, 'Looking for sensitive info…');
    const layout = buildLayout(tokens);
    const findings = detect(layout.text, opts);
    const regions = findingsToRegions(layout, tokens, findings, { bounds: { width, height } });
    onProgress?.(1, 'Done');
    return { width, height, tokens, text: layout.text, findings, regions, bitmap };
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
 */
export async function exportRedactedImageWith(bitmap: ImageBitmap, regions: Region[], opts: ExportImageOptions): Promise<Blob> {
  const color = opts.color ?? '#000000';
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    throw new Error('Redaction colour must be an opaque hex colour like #000000.');
  }
  const W = bitmap.width;
  const H = bitmap.height;
  if (!W || !H) throw new Error('The image is no longer available. Please open it again.');
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

/** Decode with EXIF orientation applied. Throws user-facing errors. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/svg+xml') {
    throw new Error(`SVG images aren't supported. Export or screenshot it as PNG first.`);
  }
  if (type && !type.startsWith('image/')) {
    throw new Error(`This file type (${type}) isn't an image Blot can read. ${SUPPORTED}`);
  }
  if (file.size === 0) throw new Error('This file is empty.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`This image file is too large (${Math.round(file.size / 1048576)} MB). Please use one under ${MAX_IMAGE_BYTES / 1048576} MB.`);
  }
  // Refuse giant images before decoding allocates width*height*4 bytes.
  try {
    const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    const hdr = readImageSize(head);
    if (hdr) checkPixelCount(hdr.width, hdr.height);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('This image is too large')) throw e;
    // unreadable header: let the decoder decide
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      // Very old engines reject the options bag; modern ones apply EXIF orientation by default.
      bitmap = await createImageBitmap(file);
    } catch {
      if (/hei[cf]/.test(type)) {
        throw new Error(`Your browser can't open HEIC photos. Convert it to JPEG or PNG first (or share it as "Most Compatible").`);
      }
      throw new Error(`This image couldn't be opened — it may be damaged or in a format your browser can't read. ${SUPPORTED}`);
    }
  }
  try {
    checkPixelCount(bitmap.width, bitmap.height);
  } catch (e) {
    bitmap.close();
    throw e;
  }
  return bitmap;
}

function checkPixelCount(w: number, h: number): void {
  if (w * h > MAX_IMAGE_PIXELS) {
    const mp = Math.round((w * h) / 1e6);
    throw new Error(
      `This image is too large (${w} × ${h}, ${mp} MP). The limit is ${MAX_IMAGE_PIXELS / 1e6} MP — please crop or resize it.`,
    );
  }
}
