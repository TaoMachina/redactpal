// Pure painting step of the image exporter, written against a minimal 2D-context interface so it can
// be unit-tested in Node with a recording fake (tests/image.test.ts). No DOM access here.
import type { Rect, Region } from '../core/types';
import { snapRect } from './preprocess';

/** User-facing message when an enabled box can't be painted. Export must fail rather than skip it. */
export const REGION_APPLY_ERROR = "Couldn't apply one of the boxes. Please try again.";
/** Shown when OCR failed: the user still reaches the review screen and can draw boxes by hand. */
export const IMAGE_OCR_FAILED_WARNING = "We couldn't read the text in this image — draw boxes over anything you want hidden.";

/** Background painted under the image, so (near-)transparent pixels can't carry hidden RGB into the output. */
export const EXPORT_BACKGROUND = '#ffffff';

/** The subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D the exporter uses. */
export interface PaintContext<S> {
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: S, dx: number, dy: number): void;
}

/**
 * Whole-pixel rect to fill for an ENABLED region on a W×H image. Never silently drops a box that
 * could hide something: throws `Error(REGION_APPLY_ERROR)` for non-finite or empty rects, and
 * returns null only when the region lies entirely outside the image (it hides nothing visible).
 */
export function exportRect(r: Rect, width: number, height: number): Rect | null {
  const ok = [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0 && width > 0 && height > 0;
  if (!ok) throw new Error(REGION_APPLY_ERROR);
  if (r.x >= width || r.y >= height || r.x + r.w <= 0 || r.y + r.h <= 0) return null;
  const rect = snapRect(r, width, height);
  if (!rect) throw new Error(REGION_APPLY_ERROR);
  return rect;
}

/**
 * Paint the export: opaque white background, the image on top, then every enabled region as a
 * solid fill. Rects are validated BEFORE anything is drawn, so a bad box fails the export cleanly.
 */
export function paintRedacted<S>(ctx: PaintContext<S>, image: S, width: number, height: number, regions: Region[], color: string): void {
  const rects: Rect[] = [];
  for (const r of regions) {
    if (!r.enabled) continue;
    const rect = exportRect(r.rect, width, height);
    if (rect) rects.push(rect);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = color;
  for (const rect of rects) ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}
