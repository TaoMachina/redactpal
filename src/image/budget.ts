// Memory/time budgets for the image path, chosen per device, plus the size arithmetic that goes with
// them. Pure (the navigator is passed in) -> unit-testable in Node.
//
// Why: phone photos are 12–48 MP. On iOS (every browser there is WebKit) a single canvas may not
// exceed 16,777,216 px, all canvases of a tab share a fixed memory budget, and the tab is killed —
// or the device stalls under memory pressure — long before a desktop would notice. Feeding a 12–16 MP
// image (plus its ImageData copy, PNG and Tesseract's own copies) through OCR there is what froze
// phones. So: analyse a smaller copy, keep the decoded bitmap under the canvas limit, and never
// upscale photos that are already big.

/** Largest image we accept at all (megapixels). */
export const MAX_IMAGE_PIXELS = 50_000_000;
/** WebKit on iOS/iPadOS: max area of one canvas (4096 × 4096). Larger canvases fail or draw nothing. */
export const IOS_MAX_CANVAS_PIXELS = 16_777_216;
/** Above this the image is treated as a big photo: shown "Preparing your photo…", never upscaled. */
export const LARGE_IMAGE_PIXELS = 6_000_000;

export interface NavigatorLike {
  userAgent?: string;
  maxTouchPoints?: number;
  /** Chromium only (GB, rounded, capped at 8). */
  deviceMemory?: number;
}

export interface DeviceProfile {
  /** iPhone / iPad / iPod (incl. iPadOS that reports itself as a Mac). */
  ios: boolean;
  /** navigator.deviceMemory in GB when reported. */
  deviceMemory: number | null;
  /** Tight memory: use the small budgets below. */
  constrained: boolean;
}

export function detectDevice(nav?: NavigatorLike): DeviceProfile {
  const n: NavigatorLike = nav ?? (typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : {});
  const ua = n.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (n.maxTouchPoints ?? 0) > 1);
  const dm = typeof n.deviceMemory === 'number' && n.deviceMemory > 0 ? n.deviceMemory : null;
  return { ios, deviceMemory: dm, constrained: ios || (dm != null && dm <= 4) };
}

export interface ImageBudget {
  /** The decoded bitmap (kept for review + export) is shrunk at decode time above this. */
  maxDecodePixels: number;
  /** Image handed to Tesseract. */
  maxOcrPixels: number;
  /** Statistics (text height, polarity, background) are computed on a copy of at most this size. */
  maxAnalysisPixels: number;
  /** Largest single canvas we create (export canvas = bitmap size). */
  maxCanvasPixels: number;
}

export const DESKTOP_BUDGET: ImageBudget = {
  maxDecodePixels: MAX_IMAGE_PIXELS,
  maxOcrPixels: 16_000_000,
  maxAnalysisPixels: 4_000_000,
  maxCanvasPixels: MAX_IMAGE_PIXELS,
};

/** Phones/tablets (all of iOS, Chromium with ≤ 4 GB). 8 MP OCR keeps 30–40 px text of a 12 MP photo at 25–35 px. */
export const CONSTRAINED_BUDGET: ImageBudget = {
  maxDecodePixels: 16_000_000, // < IOS_MAX_CANVAS_PIXELS, so export always fits one canvas
  maxOcrPixels: 8_000_000,
  maxAnalysisPixels: 3_000_000,
  maxCanvasPixels: IOS_MAX_CANVAS_PIXELS,
};

/** ≤ 2 GB devices. */
export const TIGHT_BUDGET: ImageBudget = {
  maxDecodePixels: 12_000_000,
  maxOcrPixels: 6_000_000,
  maxAnalysisPixels: 2_000_000,
  maxCanvasPixels: IOS_MAX_CANVAS_PIXELS,
};

export function budgetFor(d: DeviceProfile): ImageBudget {
  if (!d.constrained) return DESKTOP_BUDGET;
  return d.deviceMemory != null && d.deviceMemory <= 2 ? TIGHT_BUDGET : CONSTRAINED_BUDGET;
}

let cached: ImageBudget | null = null;
/** Budget for the current browser (computed once). */
export function currentBudget(): ImageBudget {
  return (cached ??= budgetFor(detectDevice()));
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Largest size with (almost exactly) the same aspect ratio and at most `maxPixels` pixels.
 * Never upscales. width × height ≤ maxPixels is guaranteed (both sides rounded down).
 */
export function fitPixels(width: number, height: number, maxPixels: number): Size {
  if (width * height <= maxPixels) return { width, height };
  const s = Math.sqrt(maxPixels / (width * height));
  let w = Math.max(1, Math.floor(width * s));
  let h = Math.max(1, Math.floor(height * s));
  // Extreme aspect ratios: a side clamped to 1 px must not push the other past the cap.
  if (w * h > maxPixels) {
    if (w === 1) h = Math.max(1, Math.floor(maxPixels));
    else w = Math.max(1, Math.floor(maxPixels / h));
  }
  return { width: w, height: h };
}

/** Displayed size for a JPEG/TIFF EXIF orientation (5–8 rotate by 90°, so the sides swap). */
export function orientedSize(width: number, height: number, orientation: number | undefined): Size {
  return orientation != null && orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/** Same aspect ratio within `tolerance` (relative)? Used to verify a resized decode wasn't distorted. */
export function sameAspect(a: Size, b: Size, tolerance = 0.02): boolean {
  if (!a.width || !a.height || !b.width || !b.height) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) <= tolerance * Math.max(ra, rb);
}

/** What to decode a W × H (displayed size) image to, given the budget. null = full size. */
export function decodeTarget(width: number, height: number, budget: ImageBudget): Size | null {
  const max = Math.min(budget.maxDecodePixels, budget.maxCanvasPixels);
  return width * height > max ? fitPixels(width, height, max) : null;
}

/**
 * resizeWidth to pass to createImageBitmap to shrink an image displayed at `shown` to about `target`
 * while decoding. Only the width is passed, so the engine keeps the aspect ratio itself: engines
 * differ in whether they resize before or after applying the EXIF rotation, and giving both sides
 * could stretch the photo. For a rotated photo the width comes from the SHORTER side, so the result
 * fits the budget whichever side the engine treats as the width (at worst it is a bit smaller).
 */
export function decodeResizeWidth(shown: Size, target: Size, rotated: boolean): number {
  const s = Math.min(target.width / shown.width, target.height / shown.height);
  const base = rotated ? Math.min(shown.width, shown.height) : shown.width;
  return Math.max(1, Math.floor(base * s));
}

/** User-facing note when RedactPal works on (and saves) a smaller copy of a huge photo. */
export function downscaleNotice(original: Size, used: Size): string {
  const mp = Math.round((original.width * original.height) / 1e6);
  return (
    `This photo is very large (${mp} MP), so to stay within your device's memory RedactPal works on a ` +
    `${used.width} × ${used.height} copy. The image you save will be that size.`
  );
}

/** Saved-image guard: the export canvas is the bitmap's size. Throws a user-facing error if it can't fit. */
export function checkExportSize(width: number, height: number, budget: ImageBudget): void {
  if (width * height > budget.maxCanvasPixels) {
    throw new Error(
      `This image is too large to save on this device (${width} × ${height}). Crop or resize it first, or use a computer.`,
    );
  }
}
