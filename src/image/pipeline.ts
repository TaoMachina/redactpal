// Canvas side of OCR preprocessing: analysis copy -> tone plan -> scaled, tone-mapped PNG for
// Tesseract. Runs unchanged in the preprocessing Web Worker (OffscreenCanvas, syncSlicer) and, as a
// fallback, on the main thread (timeSlicer: yields every ~30 ms so taps and paints still happen).
//
// Memory: pixels are read back in strips of ~1 MP (never a full-size ImageData copy), every canvas is
// zeroed as soon as it is done, and the analysis-only buffers are dropped before the big canvas exists.
import { fitPixels } from './budget';
import { canvasToPng, createCanvas, releaseCanvas, type Ctx2D } from './canvas';
import { applyTonePlanRgba, prepareOcrSteps, rgbaToGray } from './preprocess';
import type { Slicer } from './steps';

export interface PreprocessBudget {
  maxOcrPixels: number;
  maxAnalysisPixels: number;
}

export interface PreprocessOutput {
  png: Blob;
  /** Size of the image in `png` (OCR px). */
  width: number;
  height: number;
  /** Estimated text height in INPUT px (null if none found). */
  textHeight: number | null;
  inverted: boolean;
}

export type PreprocessSource = (ImageBitmap | HTMLCanvasElement | OffscreenCanvas) & { width: number; height: number };

/** Pixels per getImageData/putImageData strip. */
export const STRIP_PIXELS = 1 << 20;

/** Rows per strip for an image `width` px wide. */
export function stripRows(width: number): number {
  return Math.max(1, Math.floor(STRIP_PIXELS / Math.max(1, width)));
}

export async function preprocessImage(src: PreprocessSource, budget: PreprocessBudget, slicer: Slicer): Promise<PreprocessOutput> {
  const W = src.width;
  const H = src.height;
  if (!W || !H) throw new Error('This image is empty (0 × 0 pixels).');

  // 1) Statistics on a (possibly downsampled) copy.
  const { width: aw, height: ah } = fitPixels(W, H, budget.maxAnalysisPixels);
  const gray = new Uint8Array(aw * ah);
  const an = createCanvas(aw, ah);
  try {
    smooth(an.ctx);
    an.ctx.drawImage(src, 0, 0, aw, ah);
    await slicer.tick();
    const rows = stripRows(aw);
    for (let y = 0; y < ah; y += rows) {
      const n = Math.min(rows, ah - y);
      rgbaToGray(an.ctx.getImageData(0, y, aw, n).data, gray.subarray(y * aw, (y + n) * aw));
      await slicer.tick();
    }
  } finally {
    releaseCanvas(an.canvas);
  }
  const prep = await slicer.run(prepareOcrSteps(gray, aw, ah, W, H, budget.maxOcrPixels));
  const plan = prep.plan;
  plan.normalized = new Uint8Array(0); // analysis-only; free it before the big canvas exists

  // 2) Scale + tone-map the full image, strip by strip.
  const ow = Math.max(1, Math.round(W * prep.scale));
  const oh = Math.max(1, Math.round(H * prep.scale));
  const out = createCanvas(ow, oh);
  try {
    smooth(out.ctx);
    out.ctx.drawImage(src, 0, 0, ow, oh);
    await slicer.tick();
    const rows = stripRows(ow);
    for (let y = 0; y < oh; y += rows) {
      const n = Math.min(rows, oh - y);
      const img = out.ctx.getImageData(0, y, ow, n);
      applyTonePlanRgba(img.data, ow, n, plan, y, oh);
      out.ctx.putImageData(img, 0, y);
      await slicer.tick();
    }
    const png = await canvasToPng(out.canvas);
    return { png, width: ow, height: oh, textHeight: prep.textHeight, inverted: plan.inverted };
  } finally {
    releaseCanvas(out.canvas);
  }
}

function smooth(ctx: Ctx2D): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

// --- worker protocol (see preprocess.worker.ts / offload.ts) ---------------------------------------

export interface PreprocessRequest {
  id: number;
  bitmap: ImageBitmap;
  budget: PreprocessBudget;
}

export type PreprocessReply =
  | { id: number; ok: true; ready: true }
  | { id: number; ok: true; ready?: undefined; result: PreprocessOutput }
  | { id: number; ok: false; unsupported: boolean; message: string };
