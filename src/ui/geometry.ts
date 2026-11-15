// Pure geometry helpers for the review editor: hit-testing, coordinate scaling, canvas sizing.
// All rects are in source units (see core/types.ts) unless a name says otherwise.
import type { Rect, Region } from '../core/types';

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Normalised rectangle spanned by two corner points (any drag direction). */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Clip a rect to [0, width] x [0, height]. */
export function clampRect(r: Rect, s: Size): Rect {
  const x0 = Math.max(0, Math.min(s.width, r.x));
  const y0 = Math.max(0, Math.min(s.height, r.y));
  const x1 = Math.max(0, Math.min(s.width, r.x + r.w));
  const y1 = Math.max(0, Math.min(s.height, r.y + r.h));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Convert a pointer position (client px) on an element showing the page to source units, clamped to the page. */
export function clientToSource(clientX: number, clientY: number, box: ClientBox, src: Size): Point {
  const fx = box.width > 0 ? (clientX - box.left) / box.width : 0;
  const fy = box.height > 0 ? (clientY - box.top) / box.height : 0;
  return {
    x: Math.max(0, Math.min(src.width, fx * src.width)),
    y: Math.max(0, Math.min(src.height, fy * src.height)),
  };
}

export function containsPoint(r: Rect, p: Point, tolerance = 0): boolean {
  return p.x >= r.x - tolerance && p.x <= r.x + r.w + tolerance && p.y >= r.y - tolerance && p.y <= r.y + r.h + tolerance;
}

export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);

/** Intersection over union, 0..1. */
export function iou(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = rectArea(a) + rectArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Which region is under point `p`? Exact hits beat near-misses (within `tolerance`, useful for
 * fingers on small boxes); among equals the smallest region wins, so a box nested inside a larger
 * one stays reachable.
 */
export function hitTest<R extends Pick<Region, 'rect'>>(regions: readonly R[], p: Point, tolerance = 0): R | undefined {
  let best: R | undefined;
  let bestScore = Infinity;
  for (const r of regions) {
    const exact = containsPoint(r.rect, p);
    if (!exact && !(tolerance > 0 && containsPoint(r.rect, p, tolerance))) continue;
    const score = (exact ? 0 : 1e15) + rectArea(r.rect);
    if (score < bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** Rect as percentages of the page, for absolutely positioned overlays that scale with the page. */
export function rectToPercent(r: Rect, s: Size): { left: number; top: number; width: number; height: number } {
  return {
    left: (r.x / s.width) * 100,
    top: (r.y / s.height) * 100,
    width: (r.w / s.width) * 100,
    height: (r.h / s.height) * 100,
  };
}

/**
 * Backing-store scale (canvas px per source unit) for showing a page `cssWidth` CSS px wide on a
 * screen with `dpr`. Capped so the canvas stays below browser limits (iOS dies around 16 MP).
 */
export function canvasScale(cssWidth: number, dpr: number, src: Size, maxPixels = 12e6, maxSide = 8192): number {
  if (src.width <= 0 || src.height <= 0) return 1;
  let scale = (Math.max(1, cssWidth) * Math.max(1, dpr)) / src.width;
  scale = Math.min(scale, maxSide / src.width, maxSide / src.height);
  const px = src.width * src.height * scale * scale;
  if (px > maxPixels) scale *= Math.sqrt(maxPixels / px);
  return Math.max(scale, 0.01);
}

/** Should a page rendered at `renderedWidth` CSS px be re-rendered for display at `neededWidth`? */
export function needsRerender(renderedWidth: number, neededWidth: number): boolean {
  if (renderedWidth <= 0) return neededWidth > 0;
  if (neededWidth > renderedWidth * 1.05) return true; // getting blurry
  return neededWidth < renderedWidth / 1.6; // wasting memory
}
