// Pixel helpers for the flattened-PDF exporter. Pure (no DOM) so they can be unit-tested in Node.

export interface PixelClass {
  /** Every pixel is (near) neutral grey: encode as 1-channel DeviceGray. */
  gray: boolean;
  /** Looks like a photo / scan (no dominant flat background): encode as JPEG. */
  photo: boolean;
}

/** Classify RGBA pixels. Text-like pages have one dominant exact background colour and few colours overall. */
export function classifyPixels(data: ArrayLike<number>, width: number, height: number): PixelClass {
  const n = width * height;
  let gray = true;
  for (let i = 0; i < n * 4; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.abs(r - g) > 3 || Math.abs(g - b) > 3 || Math.abs(r - b) > 3) {
      gray = false;
      break;
    }
  }
  const step = Math.max(1, Math.floor(n / 40000));
  const counts = new Map<number, number>();
  let samples = 0;
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    samples++;
  }
  let dominant = 0;
  for (const c of counts.values()) if (c > dominant) dominant = c;
  const photo = samples > 0 && (dominant / samples < 0.45 || counts.size / samples > 0.25);
  return { gray, photo };
}

/**
 * Rows prefixed with PNG filter type 2 ("Up"), 1 or 3 channels, ready for FlateDecode with
 * DecodeParms << /Predictor 15 /Colors c /BitsPerComponent 8 /Columns w >>.
 */
export function pngUpRows(rgba: ArrayLike<number>, width: number, height: number, gray: boolean): Uint8Array {
  const ch = gray ? 1 : 3;
  const stride = width * ch;
  const out = new Uint8Array((stride + 1) * height);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    if (gray) {
      for (let x = 0; x < width; x++) {
        const i = src + x * 4;
        cur[x] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29 + 128) >> 8;
      }
    } else {
      for (let x = 0; x < width; x++) {
        const i = src + x * 4;
        const o = x * 3;
        cur[o] = rgba[i];
        cur[o + 1] = rgba[i + 1];
        cur[o + 2] = rgba[i + 2];
      }
    }
    const row = y * (stride + 1);
    out[row] = 2;
    for (let k = 0; k < stride; k++) out[row + 1 + k] = (cur[k] - prev[k]) & 0xff;
    [prev, cur] = [cur, prev];
  }
  return out;
}

/** Outward-rounded integer pixel rect for a source-space rect at scale (sx, sy), clamped to the canvas. */
export function toPixelRect(
  r: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number,
  cw: number,
  ch: number,
): { x: number; y: number; w: number; h: number } | null {
  const x0 = Math.max(0, Math.floor(r.x * sx));
  const y0 = Math.max(0, Math.floor(r.y * sy));
  const x1 = Math.min(cw, Math.ceil((r.x + r.w) * sx));
  const y1 = Math.min(ch, Math.ceil((r.y + r.h) * sy));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** User-facing message when an enabled box can't be painted. Export must fail rather than skip it. */
export const REGION_APPLY_ERROR = "Couldn't apply one of the boxes. Please try again.";

/**
 * Canvas pixel rect for an ENABLED region. Never silently drops a region that could hide something:
 *  - throws `Error(REGION_APPLY_ERROR)` for non-finite or empty rects (or a broken scale);
 *  - returns null only when the region lies entirely outside the canvas (it hides nothing visible).
 */
export function regionPixelRect(
  r: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number,
  cw: number,
  ch: number,
): { x: number; y: number; w: number; h: number } | null {
  const ok = [r.x, r.y, r.w, r.h, sx, sy].every(Number.isFinite) && r.w > 0 && r.h > 0 && sx > 0 && sy > 0 && cw > 0 && ch > 0;
  if (!ok) throw new Error(REGION_APPLY_ERROR);
  if (r.x * sx >= cw || r.y * sy >= ch || (r.x + r.w) * sx <= 0 || (r.y + r.h) * sy <= 0) return null;
  const pr = toPixelRect(r, sx, sy, cw, ch);
  if (!pr) throw new Error(REGION_APPLY_ERROR);
  return pr;
}
