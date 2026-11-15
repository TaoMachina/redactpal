// Pure pixel helpers for OCR preprocessing (no DOM, no runtime imports -> unit-testable in Node).
//
// Why: Tesseract's LSTM model wants text roughly 20–30 px tall, dark on light. UI screenshots
// routinely have 11–14 px text, dark themes, dark sidebars/code blocks inside light pages and
// coloured buttons. Upscaling small text, normalising polarity LOCALLY (so a dark sidebar is
// inverted while the light page next to it is not) and stretching contrast is the single biggest
// accuracy lever we have (measured on 12–13 px UI text: mangled secrets -> exact matches).
//
// Heavy loops are generators (see steps.ts) so the main-thread fallback can pause every ~30 ms; the
// plain exported functions run them straight through and keep their original signatures.
import type { Rect } from '../core/types';
import { runSync, type Steps } from './steps';

/** Desired text height as measured by estimateTextHeight() (≈ 0.75 × CSS font size). */
export const TARGET_TEXT_HEIGHT = 24;
/** Never upscale more than this (more hurts speed and, past ~3x, accuracy too). */
export const MAX_UPSCALE = 3;
/** Default cap on the pixel count of the image handed to Tesseract (memory + time; < iOS canvas limit).
 *  Phones use a lower cap, see budget.ts. */
export const MAX_OCR_PIXELS = 16_000_000;
/** Analysis (stats) is done on a copy of at most this many pixels (default; see budget.ts). */
export const MAX_ANALYSIS_PIXELS = 4_000_000;
/** Images larger than this are never upscaled (big photos / 5K screenshots already have large text). */
export const NO_UPSCALE_ABOVE_PIXELS = 9_000_000;
/** Work between two yields in 1-D loops. */
const CHUNK = 1 << 16;

/** Rec. 601 luminance, integer approximation. Transparent pixels are composited over white. */
function lum(r: number, g: number, b: number, a: number): number {
  const l = (r * 77 + g * 150 + b * 29) >> 8;
  return a < 255 ? ((l * a + 255 * (255 - a)) / 255) | 0 : l;
}

/** RGBA (canvas ImageData layout) -> 8-bit luminance. */
export function rgbaToGray(rgba: ArrayLike<number>, out?: Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const g = out ?? new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = lum(rgba[j], rgba[j + 1], rgba[j + 2], rgba[j + 3]);
  return g;
}

export function histogram(gray: ArrayLike<number>): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) h[gray[i]]++;
  return h;
}

/** Gray level at the given fraction (0..1) of the cumulative histogram. */
export function percentile(hist: Uint32Array, fraction: number): number {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  if (total === 0) return 0;
  const target = fraction * total;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

export interface BackgroundInfo {
  /** Dominant (most common) gray level — almost always the background in a screenshot. */
  level: number;
  /** Share of pixels within ±12 levels of `level`. */
  share: number;
  /** Dark theme: light text on a dark background. */
  dark: boolean;
}

/**
 * Background = mode of a lightly smoothed histogram. A screenshot is dominated by flat background
 * pixels, so the mode is robust even with lots of text/icons. `dark` when that level is below mid-gray.
 */
export function analyzeBackground(hist: Uint32Array): BackgroundInfo {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < 256; i++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < 256) s += hist[j];
    }
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  let near = 0;
  for (let i = Math.max(0, best - 12); i <= Math.min(255, best + 12); i++) near += hist[i];
  return { level: best, share: total ? near / total : 0, dark: best < 128 };
}

/** Gray levels below/above these count as "dark"/"light" pixels for polarity decisions. */
export const DARK_LEVEL = 100;
export const LIGHT_LEVEL = 156;

/**
 * Per-pixel "invert here?" mask (1 = invert). Dark (< DARK_LEVEL) and light (> LIGHT_LEVEL) pixels
 * are counted in a square window around each pixel, at two scales:
 *  - large window (`radius`, a few text heights): text covers well under half of it, so it measures
 *    the SURFACE. Clearly dark (≥ 60%) -> invert; light (≥ 35%) -> keep; mid-tone surface -> the
 *    text decides (light text -> invert); no information -> the global decision.
 *  - small window (`smallRadius`, ~1 text height): catches dark objects smaller than the large
 *    window — buttons, badges, chips, terminal panes in a corner. Clearly dark (≥ 60%) -> invert.
 * Thresholds are majorities, so the mask edge lands within a few px of a panel's real edge.
 * (Tesseract's layout analysis otherwise classifies dark boxes with text as pictures and skips them.)
 */
export function polarityMask(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  radius: number,
  globalDark: boolean,
  smallRadius = 0,
): Uint8Array {
  return runSync(polarityMaskSteps(gray, width, height, radius, globalDark, smallRadius));
}

export function* polarityMaskSteps(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  radius: number,
  globalDark: boolean,
  smallRadius = 0,
): Steps<Uint8Array> {
  const W1 = width + 1;
  // Integral images of the dark/light indicator images.
  const iDark = new Uint32Array(W1 * (height + 1));
  const iLight = new Uint32Array(W1 * (height + 1));
  for (let y = 0; y < height; y++) {
    integralRow(gray, width, y, iDark, iLight);
    yield;
  }
  const r = Math.max(1, Math.round(radius));
  const rs = Math.round(smallRadius);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    polarityRow(iDark, iLight, width, height, y, r, rs, globalDark, mask);
    yield;
  }
  yield* growIntoDarkSteps(mask, gray, width, height, Math.max(4, 2 * rs + 2)); // 4-connected steps: corners need ~2x
  return mask;
}

// Per-row kernels of polarityMask. Plain functions (not generator code) so engines fully optimise them.
function integralRow(gray: ArrayLike<number>, width: number, y: number, iDark: Uint32Array, iLight: Uint32Array): void {
  const W1 = width + 1;
  let rd = 0;
  let rl = 0;
  for (let x = 0; x < width; x++) {
    const v = gray[y * width + x];
    if (v < DARK_LEVEL) rd++;
    else if (v > LIGHT_LEVEL) rl++;
    const k = (y + 1) * W1 + x + 1;
    iDark[k] = iDark[k - W1] + rd;
    iLight[k] = iLight[k - W1] + rl;
  }
}

function polarityRow(
  iDark: Uint32Array,
  iLight: Uint32Array,
  width: number,
  height: number,
  y: number,
  r: number,
  rs: number,
  globalDark: boolean,
  mask: Uint8Array,
): void {
  const W1 = width + 1;
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(height, y + r + 1);
  const sy0 = Math.max(0, y - rs);
  const sy1 = Math.min(height, y + rs + 1);
  const r0 = y0 * W1;
  const r1 = y1 * W1;
  const s0 = sy0 * W1;
  const s1 = sy1 * W1;
  for (let x = 0; x < width; x++) {
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(width, x + r + 1);
    const area = (x1 - x0) * (y1 - y0);
    const d = iDark[r1 + x1] - iDark[r0 + x1] - iDark[r1 + x0] + iDark[r0 + x0];
    const l = iLight[r1 + x1] - iLight[r0 + x1] - iLight[r1 + x0] + iLight[r0 + x0];
    let inv: boolean;
    if (d >= 0.6 * area) inv = true; // clearly a dark surface
    else if (l >= 0.35 * area) inv = false; // light surface
    else if (d >= 0.35 * area) inv = d > l;
    else if (d !== l) inv = l > d; // mid-tone surface: light text -> invert
    else inv = globalDark;
    if (!inv && rs > 0) {
      const sx0 = Math.max(0, x - rs);
      const sx1 = Math.min(width, x + rs + 1);
      const sd = iDark[s1 + sx1] - iDark[s0 + sx1] - iDark[s1 + sx0] + iDark[s0 + sx0];
      inv = sd >= 0.6 * (sx1 - sx0) * (sy1 - sy0);
    }
    mask[y * width + x] = inv ? 1 : 0;
  }
}

/**
 * Window thresholds leave a thin un-inverted rim (and rounded corners) along the inside edge of
 * inverted dark objects; a dark rim around inverted content looks like a picture frame to
 * Tesseract's layout analysis. Extend the mask into DARK pixels connected to an inverted dark
 * pixel, at most `maxDist` px (so dark text near a panel is not swallowed).
 */
function* growIntoDarkSteps(mask: Uint8Array, gray: ArrayLike<number>, width: number, height: number, maxDist: number): Steps<void> {
  const n = width * height;
  const dist = new Uint16Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] && gray[i] < DARK_LEVEL) {
      queue[tail++] = i;
      dist[i] = 1;
    }
    if ((i & (CHUNK - 1)) === CHUNK - 1) yield;
  }
  while (head < tail) {
    if ((head & (CHUNK - 1)) === CHUNK - 1) yield;
    const i = queue[head++];
    const dd = dist[i];
    if (dd > maxDist) continue;
    const x = i % width;
    for (let k = 0; k < 4; k++) {
      const j = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < width - 1 ? i + 1 : -1) : k === 2 ? i - width : i + width;
      if (j < 0 || j >= n || mask[j] || gray[j] >= DARK_LEVEL) continue;
      mask[j] = 1;
      dist[j] = dd + 1;
      queue[tail++] = j;
    }
  }
}

/**
 * 1-D running max (or min) over a window of 2r+1 (van Herk / Gil-Werman, O(n) for any r) of the
 * `n` samples at src[off ..], written to dst[off ..]. Out-of-range samples count as 0 (max) / 255 (min).
 * `p`, `g`, `h`: scratch of at least n + 2r.
 */
function runningExtreme(
  src: Uint8Array,
  dst: Uint8Array,
  off: number,
  n: number,
  r: number,
  isMax: boolean,
  p: Uint8Array,
  g: Uint8Array,
  h: Uint8Array,
): void {
  const w = 2 * r + 1;
  const len = n + 2 * r;
  const pad = isMax ? 0 : 255;
  p.fill(pad, 0, r);
  p.set(src.subarray(off, off + n), r);
  p.fill(pad, r + n, len);
  // g: running extreme from the start of each block of w; h: from the end of each block.
  for (let i = 0, c = 0; i < len; i++, c++) {
    if (c === w) c = 0;
    const v = p[i];
    if (c === 0) g[i] = v;
    else {
      const a = g[i - 1];
      g[i] = isMax ? (a > v ? a : v) : a < v ? a : v;
    }
  }
  for (let i = len - 1, c = (len - 1) % w; i >= 0; i--, c = c === 0 ? w - 1 : c - 1) {
    const v = p[i];
    if (i === len - 1 || c === w - 1) h[i] = v;
    else {
      const a = h[i + 1];
      h[i] = isMax ? (a > v ? a : v) : a < v ? a : v;
    }
  }
  for (let i = 0; i < n; i++) {
    // window [i, i + 2r] in padded coordinates
    const a = h[i];
    const b = g[i + 2 * r];
    dst[off + i] = isMax ? (a > b ? a : b) : a < b ? a : b;
  }
}

/** Cache-blocked transpose: src is width × height (row-major), dst becomes height × width. */
function transpose(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
  const B = 64;
  for (let by = 0; by < height; by += B) {
    const ey = Math.min(height, by + B);
    for (let bx = 0; bx < width; bx += B) {
      const ex = Math.min(width, bx + B);
      for (let y = by; y < ey; y++) {
        const row = y * width;
        for (let x = bx; x < ex; x++) dst[x * height + y] = src[row + x];
      }
    }
  }
}

/**
 * Separable square max (dilate) or min (erode) filter of radius r. The vertical pass runs on a
 * transposed copy so both passes read memory sequentially (a strided column walk is several times
 * slower on large images).
 */
function* extremeFilterSteps(img: Uint8Array, width: number, height: number, r: number, isMax: boolean): Steps<Uint8Array> {
  const a = new Uint8Array(img.length);
  const b = new Uint8Array(img.length);
  const scratch = Math.max(width, height) + 2 * r;
  const p = new Uint8Array(scratch);
  const g = new Uint8Array(scratch);
  const h = new Uint8Array(scratch);
  for (let y = 0; y < height; y++) {
    runningExtreme(img, a, y * width, width, r, isMax, p, g, h);
    yield;
  }
  transpose(a, b, width, height); // b: height × width -> rows are the original columns
  yield;
  for (let x = 0; x < width; x++) {
    runningExtreme(b, a, x * height, height, r, isMax, p, g, h);
    yield;
  }
  transpose(a, b, height, width);
  return b;
}

/**
 * Local background of a dark-on-light image: grayscale closing (max then min filter). Removes dark
 * structures thinner than 2r+1 px (text strokes) while keeping larger surfaces — grey buttons,
 * table header rows, input fields, tinted cards — with their real edges.
 */
export function localBackground(img: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return runSync(localBackgroundSteps(img, width, height, r));
}

export function* localBackgroundSteps(img: Uint8Array, width: number, height: number, r: number): Steps<Uint8Array> {
  const dilated = yield* extremeFilterSteps(img, width, height, r, true);
  return yield* extremeFilterSteps(dilated, width, height, r, false);
}

/** Everything needed to turn the (scaled) colour image into Tesseract input. */
export interface TonePlan {
  /** 1 = invert this pixel. Resolution maskWidth × maskHeight (nearest-neighbour lookup). */
  mask: Uint8Array;
  /** Local background level (after polarity normalisation), same resolution as `mask`. */
  background: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  /** After polarity + background normalisation, map [lo, hi] -> [0, 255]. */
  lo: number;
  hi: number;
  /** True if any part of the image gets inverted (diagnostics). */
  inverted: boolean;
  /** The analysis gray image after normalisation (dark text on white everywhere). */
  normalized: Uint8Array;
}

/** v * 255 / bg, clamped (bg = local background; flattens tinted surfaces to white). */
function flatten(v: number, bg: number): number {
  const f = bg > 0 ? (v * 255) / bg : 255;
  return f > 255 ? 255 : f | 0;
}

/**
 * Build the tone plan from the analysis-size gray image:
 *  1. local polarity (dark surfaces inverted, see polarityMask),
 *  2. background flattening: divide by the local background so grey/tinted surfaces become white
 *     (Tesseract's layout analysis otherwise treats filled boxes with text as pictures and skips them),
 *  3. global contrast stretch.
 * `textHeight` (analysis px) sets the window sizes; null -> a size-based default.
 */
export function planTone(gray: Uint8Array, width: number, height: number, textHeight: number | null): TonePlan {
  return runSync(planToneSteps(gray, width, height, textHeight));
}

export function* planToneSteps(gray: Uint8Array, width: number, height: number, textHeight: number | null): Steps<TonePlan> {
  const bg = analyzeBackground(histogram(gray));
  const th = textHeight ?? Math.max(8, Math.min(width, height) / 60);
  const mask = yield* polarityMaskSteps(gray, width, height, Math.max(6, Math.round(th * 2.5)), bg.dark, Math.max(3, Math.round(th * 1.2)));
  const norm = new Uint8Array(gray.length);
  let inverted = false;
  for (let i = 0; i < gray.length; i++) {
    if (mask[i]) {
      norm[i] = 255 - gray[i];
      inverted = true;
    } else norm[i] = gray[i];
    if ((i & (CHUNK - 1)) === CHUNK - 1) yield;
  }
  const background = yield* localBackgroundSteps(norm, width, height, Math.max(2, Math.round(th * 0.6)));
  for (let i = 0; i < norm.length; i++) {
    norm[i] = flatten(norm[i], background[i]);
    if ((i & (CHUNK - 1)) === CHUNK - 1) yield;
  }
  const h = histogram(norm);
  let lo = percentile(h, 0.005);
  let hi = percentile(h, 0.995);
  hi = Math.max(hi, analyzeBackground(h).level);
  if (hi - lo < 32) {
    // Nearly flat image: stretching would only amplify noise.
    lo = 0;
    hi = 255;
  }
  return { mask, background, maskWidth: width, maskHeight: height, lo, hi, inverted, normalized: norm };
}

/**
 * In place: RGBA (width × height, any scale of the analysed image) -> gray R=G=B with local
 * polarity + background normalisation and contrast stretch, alpha forced opaque.
 * Strips: `rgba` may hold just rows y0 .. y0+height of an image that is `totalHeight` rows tall
 * (so the caller never needs a full-size ImageData copy).
 */
export function applyTonePlanRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  plan: TonePlan,
  y0 = 0,
  totalHeight = height,
): void {
  const stretch = new Uint8Array(256);
  const span = Math.max(1, plan.hi - plan.lo);
  for (let v = 0; v < 256; v++) stretch[v] = Math.max(0, Math.min(255, Math.round(((v - plan.lo) * 255) / span)));
  const mx = new Uint32Array(width);
  for (let x = 0; x < width; x++) mx[x] = Math.min(plan.maskWidth - 1, Math.floor(((x + 0.5) * plan.maskWidth) / width));
  for (let y = 0; y < height; y++) {
    const my = Math.min(plan.maskHeight - 1, Math.floor(((y0 + y + 0.5) * plan.maskHeight) / totalHeight));
    const mrow = my * plan.maskWidth;
    for (let x = 0, j = y * width * 4; x < width; x++, j += 4) {
      const k = mrow + mx[x];
      let l = lum(rgba[j], rgba[j + 1], rgba[j + 2], rgba[j + 3]);
      if (plan.mask[k]) l = 255 - l;
      const v = stretch[flatten(l, plan.background[k])];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
  }
}

/**
 * Estimate the typical text height (px) without OCR.
 * The image is cut into vertical strips; in each strip, consecutive rows that contain "ink"
 * (pixels far from the background level) form bands — mostly text lines. We return an upper
 * percentile of plausible band heights (upper, because a narrow strip may only see x-height letters).
 * Empirically ≈ 0.75 × the CSS font size. Returns null when nothing text-like is found.
 */
export function estimateTextHeight(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  bgLevel: number,
  opts: { inkDelta?: number; strips?: number } = {},
): number | null {
  return runSync(estimateTextHeightSteps(gray, width, height, bgLevel, opts));
}

export function* estimateTextHeightSteps(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  bgLevel: number,
  opts: { inkDelta?: number; strips?: number } = {},
): Steps<number | null> {
  if (width < 8 || height < 8) return null;
  const inkDelta = opts.inkDelta ?? 48;
  const strips = Math.max(1, Math.min(opts.strips ?? 8, Math.floor(width / 24)));
  const stripW = Math.ceil(width / strips);
  const bands: number[] = [];
  const maxBand = Math.max(8, Math.floor(height / 3));
  for (let s = 0; s < strips; s++) {
    const x0 = s * stripW;
    const x1 = Math.min(width, x0 + stripW);
    let run = 0;
    for (let y = 0; y <= height; y++) {
      if ((y & 63) === 63) yield;
      let ink = false;
      if (y < height) {
        const row = y * width;
        let count = 0;
        for (let x = x0; x < x1; x++) {
          const d = gray[row + x] - bgLevel;
          if (d > inkDelta || d < -inkDelta) {
            // Require 2 ink pixels per row-segment to ignore isolated noise/JPEG ringing.
            if (++count >= 2) {
              ink = true;
              break;
            }
          }
        }
      }
      if (ink) run++;
      else if (run > 0) {
        if (run >= 4 && run <= maxBand) bands.push(run);
        run = 0;
      }
    }
  }
  if (bands.length === 0) return null;
  bands.sort((a, b) => a - b);
  return bands[Math.min(bands.length - 1, Math.floor(bands.length * 0.7))];
}

/**
 * Pick the OCR scale factor. Upscales small text toward TARGET_TEXT_HEIGHT, never above
 * MAX_UPSCALE (and never for images above NO_UPSCALE_ABOVE_PIXELS), and shrinks only if the result
 * would exceed `maxPixels`.
 */
export function chooseScale(
  textHeight: number | null,
  width: number,
  height: number,
  maxPixels = MAX_OCR_PIXELS,
): number {
  let s: number;
  if (textHeight == null) {
    // No estimate: small images are usually crops of small UI text.
    s = Math.max(width, height) < 1600 ? 2 : 1;
  } else if (textHeight >= TARGET_TEXT_HEIGHT * 0.8) {
    s = 1;
  } else {
    s = Math.min(MAX_UPSCALE, TARGET_TEXT_HEIGHT / textHeight);
  }
  // Big photos: text is rarely tiny, and an upscaled 12 MP photo is what runs phones out of memory.
  if (width * height > NO_UPSCALE_ABOVE_PIXELS) s = Math.min(s, 1);
  const maxS = Math.sqrt(maxPixels / Math.max(1, width * height));
  s = Math.min(s, maxS);
  // Round down so the scale is stable: 1/8 steps when upscaling, 1/256 when shrinking (coarse steps
  // would throw away a noticeable part of a big photo's resolution).
  const step = s < 1 ? 256 : 8;
  return Math.max(0.05, Math.floor(s * step) / step);
}

/** Tesseract bbox (x0,y0 top-left, x1,y1 bottom-right, exclusive) in OCR-image px. */
export interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Map a bbox from the preprocessed (scaled) image back to ORIGINAL image pixels.
 * Rounded outward to whole pixels (we would rather cover a pixel too many than too few) and
 * clamped to the image bounds.
 */
export function mapBoxToSource(b: Bbox, scaleX: number, scaleY: number, width: number, height: number): Rect {
  const x0 = Math.max(0, Math.floor(b.x0 / scaleX));
  const y0 = Math.max(0, Math.floor(b.y0 / scaleY));
  const x1 = Math.min(width, Math.ceil(b.x1 / scaleX));
  const y1 = Math.min(height, Math.ceil(b.y1 / scaleY));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Round a rect outward to whole pixels and clamp to bounds (used before painting). */
export function snapRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface OcrPreparation {
  plan: TonePlan;
  /** OCR scale relative to the ORIGINAL image (not the analysis copy). */
  scale: number;
  /** Estimated text height in original px (null if none found). */
  textHeight: number | null;
}

/**
 * The whole analysis step, shared by the browser path and the Node tests:
 * rough text height on the raw image -> local polarity/background plan -> refined text height on
 * the normalised image (where dark panels no longer read as one giant "ink" band) -> OCR scale.
 * `gray` is the analysis copy (aw × ah) of an image whose original size is W × H.
 */
export function prepareOcr(gray: Uint8Array, aw: number, ah: number, W: number, H: number, maxPixels = MAX_OCR_PIXELS): OcrPreparation {
  return runSync(prepareOcrSteps(gray, aw, ah, W, H, maxPixels));
}

export function* prepareOcrSteps(
  gray: Uint8Array,
  aw: number,
  ah: number,
  W: number,
  H: number,
  maxPixels = MAX_OCR_PIXELS,
): Steps<OcrPreparation> {
  const rough = yield* estimateTextHeightSteps(gray, aw, ah, analyzeBackground(histogram(gray)).level);
  const plan = yield* planToneSteps(gray, aw, ah, rough);
  const refined = yield* estimateTextHeightSteps(plan.normalized, aw, ah, analyzeBackground(histogram(plan.normalized)).level);
  const est = refined ?? rough;
  const textHeight = est == null ? null : est * (W / aw);
  return { plan, scale: chooseScale(textHeight, W, H, maxPixels), textHeight };
}
