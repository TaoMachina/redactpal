// Pure geometry helpers for the PDF path: pdf.js text items -> word-level Tokens.
// No DOM, no pdf.js runtime import — unit-tested in Node (tests/pdf.test.ts).
//
// Coordinate conventions
//   - "PDF space": PDF user space, y up (what pdf.js text items use).
//   - "page space": pdf.js viewport at scale 1 (includes /Rotate and /UserUnit), CSS-px-like units,
//     origin top-left, y down. This is the `Rect` source space for PDF pages (see core/types.ts).
//   A pdf.js transform is [a, b, c, d, e, f] mapping (x, y) -> (a x + c y + e, b x + d y + f).
import type { Rect, Token } from '../core/types';

export type Mat = [number, number, number, number, number, number];

/** m1 × m2, same convention as pdf.js `Util.transform(m1, m2)` (apply m2 first, then m1). */
export function mul(m1: ArrayLike<number>, m2: ArrayLike<number>): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function applyPoint(m: ArrayLike<number>, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function aabb(points: Array<[number, number]>): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Intersect `r` with [0,W]x[0,H]; null if nothing is left (or if any coordinate is NaN/infinite). */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  if (![r.x, r.y, r.w, r.h, width, height].every(Number.isFinite)) return null;
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(width, r.x + r.w);
  const y1 = Math.min(height, r.y + r.h);
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Area of the intersection of two rects (0 if disjoint). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Minimal shape of a pdf.js TextItem we rely on. */
export interface TextItemLike {
  str: string;
  transform: ArrayLike<number>;
  /** Advance width in PDF user units (already includes font size, Tz, CTM scale). */
  width: number;
  height: number;
  dir?: string;
  fontName?: string;
  hasEOL?: boolean;
}

/** Minimal shape of a pdf.js TextStyle. */
export interface TextStyleLike {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
  fontFamily?: string;
}

export interface ViewportLike {
  /** pdf.js `viewport.transform` (PDF space -> page space). */
  transform: ArrayLike<number>;
  width: number;
  height: number;
}

/** A text item placed in page space. */
export interface PlacedItem {
  str: string;
  /** Baseline origin in page space. */
  ox: number;
  oy: number;
  /** Unit vector along the text direction (page space). */
  ux: number;
  uy: number;
  /** Unit vector pointing from the baseline towards the glyph tops (page space). */
  vx: number;
  vy: number;
  /** Font size in page units. */
  fs: number;
  /** Advance length in page units. */
  len: number;
  /** Ascent / descent as positive fractions of fs. */
  asc: number;
  desc: number;
  rtl: boolean;
  vertical: boolean;
  mono: boolean;
  /** Text direction, whole degrees in [0, 360). */
  angle: number;
}

const DEFAULT_ASCENT = 0.85;
const DEFAULT_DESCENT = 0.25;

/** Place one text item. Returns null for items without visible extent. */
export function placeItem(item: TextItemLike, vp: ViewportLike, style: TextStyleLike = {}): PlacedItem | null {
  const m = mul(vp.transform, item.transform);
  // Effective viewport scale (scale × userUnit); rotation-invariant.
  const vpScale = Math.hypot(vp.transform[0], vp.transform[1]) || 1;
  let fs = Math.hypot(m[2], m[3]);
  const dirLen = Math.hypot(m[0], m[1]);
  if (!(fs > 0) && item.height > 0) fs = item.height * vpScale;
  if (!(fs > 0)) return null;
  let ux = 1, uy = 0;
  if (dirLen > 0) {
    ux = m[0] / dirLen;
    uy = m[1] / dirLen;
  }
  // "Up" in page space: the item's y axis mapped through the viewport (y-flip makes it point up-screen).
  let vx = m[2] / fs;
  let vy = m[3] / fs;
  // Guard against degenerate/skewed matrices: fall back to the perpendicular of u.
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
    vx = uy;
    vy = -ux;
  }
  const vertical = !!style.vertical;
  const len = Math.abs((vertical ? item.height : item.width) * vpScale);
  // Ascent/descent from the font when sane, clamped so we never under-cover.
  const rawAsc = typeof style.ascent === 'number' && style.ascent > 0 ? style.ascent : DEFAULT_ASCENT;
  const rawDesc = typeof style.descent === 'number' && style.descent < 0 ? -style.descent : DEFAULT_DESCENT;
  const asc = Math.min(1.15, Math.max(0.8, rawAsc));
  const desc = Math.min(0.4, Math.max(0.2, rawDesc));
  let angle = Math.round((Math.atan2(uy, ux) * 180) / Math.PI) % 360;
  if (angle < 0) angle += 360;
  return {
    str: item.str,
    ox: m[4],
    oy: m[5],
    ux, uy, vx, vy,
    fs,
    len,
    asc,
    desc,
    rtl: item.dir === 'rtl',
    vertical,
    mono: /mono/i.test(style.fontFamily ?? ''),
    angle,
  };
}

/** Axis-aligned page-space box of the part of `p` between advance offsets s0..s1 (page units). */
export function pieceBox(p: PlacedItem, s0: number, s1: number): Rect {
  if (p.vertical) {
    // Vertical writing: glyphs run downwards from the origin; we don't split, and cover generously.
    const half = p.fs * 0.75;
    return aabb([
      [p.ox - half, p.oy - p.fs * 0.25],
      [p.ox + half, p.oy + Math.max(p.len, p.fs) + p.fs * 0.25],
    ]);
  }
  const pts: Array<[number, number]> = [];
  for (const s of [s0, s1]) {
    for (const t of [-p.desc * p.fs, p.asc * p.fs]) {
      pts.push([p.ox + p.ux * s + p.vx * t, p.oy + p.uy * s + p.vy * t]);
    }
  }
  return aabb(pts);
}

// ---------------------------------------------------------------- word splitting

const NARROW = new Set("iIl1!|.,:;'`fjrt()[]{}/\\-\"");
const WIDE = new Set('mwMW@%&');

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x20000
  );
}

/** Rough relative advance of one character (1 ≈ a lowercase letter / digit). */
export function charWeight(ch: string, mono = false): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (isWide(cp)) return 1.8;
  if (mono) return 1;
  if (/\s/.test(ch)) return 0.5;
  if (NARROW.has(ch)) return 0.55;
  if (WIDE.has(ch)) return 1.5;
  if (ch >= 'A' && ch <= 'Z') return 1.25;
  return 1;
}

export interface WordPiece {
  text: string;
  /** Advance offsets inside the item (page units), already widened by a safety margin. */
  s0: number;
  s1: number;
  /** True if the piece touches the item's start / end (it may continue a word from a neighbour item). */
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Split an item's string into whitespace-separated words with estimated advance ranges.
 * Widths are proportional to per-character weights; each word is widened by ~1 average character
 * on both sides (clamped to the item) so estimation errors over-cover rather than under-cover.
 */
export function splitWords(str: string, len: number, opts: { mono?: boolean; rtl?: boolean; margin?: number } = {}): WordPiece[] {
  const chars = Array.from(str);
  if (!chars.length) return [];
  const weights = chars.map((c) => charWeight(c, opts.mono));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const unit = len / total;
  const margin = (opts.margin ?? 1) * unit;
  const out: WordPiece[] = [];
  let acc = 0;
  let i = 0;
  while (i < chars.length) {
    if (/\s/.test(chars[i])) {
      acc += weights[i];
      i++;
      continue;
    }
    const startIdx = i;
    const a = acc;
    let text = '';
    while (i < chars.length && !/\s/.test(chars[i])) {
      text += chars[i];
      acc += weights[i];
      i++;
    }
    let s0 = a * unit - margin;
    let s1 = acc * unit + margin;
    if (opts.rtl) [s0, s1] = [len - s1, len - s0];
    out.push({
      text,
      s0: Math.max(0, s0),
      s1: Math.min(len, s1),
      atStart: startIdx === 0,
      atEnd: i === chars.length,
    });
  }
  return out;
}

// ---------------------------------------------------------------- line clustering

interface Cand {
  p: PlacedItem;
  /** Baseline position across the text direction ("down" axis of the text frame). */
  key: number;
  /** Start/end along the text direction. */
  a0: number;
  a1: number;
  order: number;
}

interface Row {
  cands: Cand[];
  key: number;
  fs: number;
  /** Vertical band (across the text direction) of the row's largest-font item. */
  top: number;
  bot: number;
}

function band(c: Cand): [number, number] {
  return [c.key - c.p.asc * c.p.fs, c.key + c.p.desc * c.p.fs];
}

/** Same visual line? Same baseline (within half the smaller font size), or a clearly smaller item
 *  (sub/superscript) lying mostly inside the band of the larger one. */
function sameRow(c: Cand, row: Row): boolean {
  if (Math.abs(c.key - row.key) <= LAYOUT.sameLine * Math.min(c.p.fs, row.fs)) return true;
  const [t, b] = band(c);
  const small = Math.min(c.p.fs, row.fs), big = Math.max(c.p.fs, row.fs);
  if (small > 0.85 * big) return false;
  const overlap = Math.min(b, row.bot) - Math.max(t, row.top);
  const smallH = c.p.fs <= row.fs ? b - t : row.bot - row.top;
  return overlap >= 0.6 * smallH;
}

export interface LineSegment {
  items: PlacedItem[];
}

/** Thresholds (in units of font size). Exported for tests / tuning. */
export const LAYOUT = {
  /** Two baselines closer than this (× smaller font size) are the same visual line. */
  sameLine: 0.5,
  /** Items closer than this along the line, with no whitespace between, are glued into one word. */
  glue: 0.18,
  /** Minimum gap that can be a column gutter. */
  gutterGap: 1.0,
  /** A gutter needs at least this many rows with a gap there… */
  gutterMinRows: 5,
  /** …and both sides' median segment length must be ≥ this (× font size), i.e. real text columns, not a key/value table. */
  gutterMinColumn: 8,
};

function frame(p: PlacedItem): { nx: number; ny: number } {
  // "Down" axis of the text frame: u rotated +90° in y-down page space.
  return { nx: -p.uy, ny: p.ux };
}

function clusterRows(cands: Cand[]): Row[] {
  const sorted = [...cands].sort((a, b) => a.key - b.key || a.a0 - b.a0);
  const rows: Row[] = [];
  for (const c of sorted) {
    const row = rows[rows.length - 1];
    if (row && sameRow(c, row)) {
      row.cands.push(c);
      if (c.p.fs > row.fs * 1.15) {
        // A clearly bigger item defines the line (e.g. we started the row with its superscript).
        row.key = c.key;
        row.fs = c.p.fs;
        [row.top, row.bot] = band(c);
      } else if (c.p.fs >= row.fs * 0.85) {
        // Running mean of same-size baselines.
        row.key += (c.key - row.key) / row.cands.length;
        row.fs = Math.max(row.fs, c.p.fs);
      }
    } else {
      const [top, bot] = band(c);
      rows.push({ cands: [c], key: c.key, fs: c.p.fs, top, bot });
    }
  }
  for (const r of rows) r.cands.sort((a, b) => a.a0 - b.a0 || a.order - b.order);
  return rows;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Find column gutters (positions along the text direction) shared by many rows of real text. */
function findGutters(rows: Row[]): number[] {
  const mids: Array<{ m: number; fs: number }> = [];
  for (const r of rows) {
    let prevEnd = r.cands.length ? r.cands[0].a1 : 0;
    for (let i = 1; i < r.cands.length; i++) {
      const gap = r.cands[i].a0 - prevEnd;
      if (gap > LAYOUT.gutterGap * r.fs) mids.push({ m: (prevEnd + r.cands[i].a0) / 2, fs: r.fs });
      prevEnd = Math.max(prevEnd, r.cands[i].a1);
    }
  }
  if (mids.length < LAYOUT.gutterMinRows) return [];
  mids.sort((a, b) => a.m - b.m);
  // Cluster candidate positions.
  const clusters: Array<{ ms: number[]; fs: number }> = [];
  for (const { m, fs } of mids) {
    const c = clusters[clusters.length - 1];
    if (c && m - c.ms[c.ms.length - 1] <= 1.5 * fs) {
      c.ms.push(m);
      c.fs = Math.max(c.fs, fs);
    } else clusters.push({ ms: [m], fs });
  }
  const gutters: number[] = [];
  for (const c of clusters) {
    if (c.ms.length < LAYOUT.gutterMinRows) continue;
    const g = median(c.ms);
    let support = 0, crossing = 0;
    const left: number[] = [], right: number[] = [];
    for (const r of rows) {
      const crosses = r.cands.some((k) => k.a0 < g && k.a1 > g);
      if (crosses) {
        crossing++;
        continue;
      }
      const l = r.cands.filter((k) => k.a1 <= g);
      const rt = r.cands.filter((k) => k.a0 >= g);
      if (l.length && rt.length) {
        support++;
        left.push(Math.max(...l.map((k) => k.a1)) - Math.min(...l.map((k) => k.a0)));
        right.push(Math.max(...rt.map((k) => k.a1)) - Math.min(...rt.map((k) => k.a0)));
      }
    }
    if (
      support >= LAYOUT.gutterMinRows &&
      support >= crossing &&
      median(left) >= LAYOUT.gutterMinColumn * c.fs &&
      median(right) >= LAYOUT.gutterMinColumn * c.fs
    ) {
      gutters.push(g);
    }
  }
  return gutters;
}

/**
 * Group placed items into visual line segments in reading order.
 * - Items are grouped by text direction (whole degrees); the biggest group comes first.
 * - Within a group, baselines are clustered into rows (top→bottom), items sorted along the line.
 * - Real multi-column text (a gutter shared by many rows whose both sides look like text columns) is
 *   read column by column; rows that cross the gutter (titles, full-width paragraphs) act as band separators.
 *   Key/value tables are NOT split, so "Password:   hunter2" stays on one line for detection.
 */
export function clusterLines(items: PlacedItem[]): LineSegment[] {
  const groups = new Map<string, Cand[]>();
  items.forEach((p, order) => {
    const gk = p.vertical ? 'v' : String(p.angle);
    let key: number, a0: number, a1: number;
    if (p.vertical) {
      // Vertical CJK: columns run right→left, glyphs top→bottom.
      key = -p.ox;
      a0 = p.oy;
      a1 = p.oy + p.len;
    } else {
      const { nx, ny } = frame(p);
      key = p.ox * nx + p.oy * ny;
      const along = p.ox * p.ux + p.oy * p.uy;
      a0 = along;
      a1 = along + p.len;
    }
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = []));
    g.push({ p, key, a0, a1, order });
  });
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === 'v' && b[0] !== 'v') return 1;
    if (b[0] === 'v' && a[0] !== 'v') return -1;
    return b[1].length - a[1].length;
  });

  const out: LineSegment[] = [];
  for (const [, cands] of ordered) {
    const rows = clusterRows(cands);
    const gutters = findGutters(rows);
    if (!gutters.length) {
      for (const r of rows) out.push({ items: r.cands.map((c) => c.p) });
      continue;
    }
    // Bands of consecutive non-crossing rows; within a band, emit column by column.
    const bounds = [-Infinity, ...gutters, Infinity];
    let band: Row[] = [];
    const flush = () => {
      for (let col = 0; col < bounds.length - 1; col++) {
        for (const r of band) {
          const seg = r.cands.filter((c) => c.a0 >= bounds[col] && c.a0 < bounds[col + 1]);
          if (seg.length) out.push({ items: seg.map((c) => c.p) });
        }
      }
      band = [];
    };
    for (const r of rows) {
      const crosses = gutters.some((g) => r.cands.some((k) => k.a0 < g && k.a1 > g));
      if (crosses) {
        flush();
        out.push({ items: r.cands.map((c) => c.p) });
      } else band.push(r);
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------- tokens

function along(p: PlacedItem): number {
  return p.vertical ? p.oy : p.ox * p.ux + p.oy * p.uy;
}

/**
 * Turn line segments into word Tokens. Words may span several items (pdf.js sometimes splits a word
 * into several items, e.g. at kerning changes) — items with (almost) no gap and no whitespace between
 * are glued together so detection sees "AKIAIOSFODNN7EXAMPLE", not "AKIAIOSF ODNN7EXAMPLE".
 */
export function segmentsToTokens(segments: LineSegment[], firstLine = 0): Token[] {
  const tokens: Token[] = [];
  let line = firstLine;
  for (const seg of segments) {
    let cur: Token | null = null;
    let prev: PlacedItem | null = null;
    let prevEndsInWord = false;
    let prevEnd = -Infinity;
    for (const p of seg.items) {
      if (!p.str) continue;
      const a0 = along(p);
      // Drop overprinted duplicates (fake bold: same text drawn twice with a tiny offset).
      if (prev && prev.str === p.str && Math.abs(a0 - along(prev)) < 0.3 * p.fs) continue;
      const pieces = p.vertical
        ? [{ text: p.str.replace(/\s+/g, ''), s0: 0, s1: p.len, atStart: true, atEnd: true }].filter((w) => w.text)
        : splitWords(p.str, p.len, { mono: p.mono, rtl: p.rtl });
      const startsWithSpace = /^\s/.test(p.str);
      const gap = a0 - prevEnd;
      const glue = prevEndsInWord && !startsWithSpace && gap <= LAYOUT.glue * p.fs;
      for (let idx = 0; idx < pieces.length; idx++) {
        const w = pieces[idx];
        const box = pieceBox(p, w.s0, w.s1);
        if (idx === 0 && glue && w.atStart && cur) {
          cur.text += w.text;
          cur.box = union(cur.box, box);
        } else {
          cur = { text: w.text, box, line };
          tokens.push(cur);
        }
      }
      if (!pieces.length) cur = null;
      prevEndsInWord = pieces.length > 0 && pieces[pieces.length - 1].atEnd && !/\s$/.test(p.str);
      prevEnd = Math.max(prevEnd, a0 + p.len);
      prev = p;
    }
    if (tokens.length && tokens[tokens.length - 1].line === line) line++;
  }
  return tokens;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Full pipeline: pdf.js text items (+ styles) -> word Tokens in page space, in reading order,
 * clipped to the page. Tokens fully outside the page (text outside the crop box) are dropped.
 */
export function itemsToTokens(
  items: TextItemLike[],
  styles: Record<string, TextStyleLike>,
  vp: ViewportLike,
  firstLine = 0,
): Token[] {
  const placed: PlacedItem[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const p = placeItem(it, vp, (it.fontName && styles[it.fontName]) || {});
    if (p) placed.push(p);
  }
  const tokens = segmentsToTokens(clusterLines(placed), firstLine);
  const out: Token[] = [];
  for (const t of tokens) {
    const box = clipRect(t.box, vp.width, vp.height);
    if (box) out.push({ ...t, box });
  }
  return out;
}

/** Re-number lines to be consecutive (after filtering) starting at `first`. */
export function renumberLines(tokens: Token[], first = 0): Token[] {
  let line = first - 1;
  let last: number | null = null;
  return tokens.map((t) => {
    if (t.line !== last) {
      line++;
      last = t.line;
    }
    return { ...t, line };
  });
}

/** Scale tokens from another pixel space (e.g. an OCR canvas) into page space, with an offset. */
export function scaleTokens(tokens: Token[], sx: number, sy: number, dx = 0, dy = 0): Token[] {
  return tokens.map((t) => ({
    ...t,
    box: { x: dx + t.box.x * sx, y: dy + t.box.y * sy, w: t.box.w * sx, h: t.box.h * sy },
  }));
}

// ---------------------------------------------------------------- images on a page

/**
 * Page-space rectangles of raster images painted by an operator list (pdf.js `getOperatorList()`),
 * used to decide which parts of a text page also need OCR (e.g. embedded screenshots).
 * Tracks the CTM through save/restore/transform and form XObjects; images map the unit square.
 */
export function imageRects(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: { save: number; restore: number; transform: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number; imageOps: number[] },
  vp: ViewportLike,
): Rect[] {
  const imageOps = new Set(ops.imageOps);
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  const stack: Mat[] = [];
  const out: Rect[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null;
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform && args && args.length >= 6) ctm = mul(ctm, args as number[]);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0];
      if (Array.isArray(m) || ArrayBuffer.isView(m)) ctm = mul(ctm, m as unknown as number[]);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (imageOps.has(fn)) {
      const m = mul(vp.transform, ctm);
      const r = clipRect(aabb([applyPoint(m, 0, 0), applyPoint(m, 1, 0), applyPoint(m, 0, 1), applyPoint(m, 1, 1)]), vp.width, vp.height);
      if (r) out.push(r);
    }
  }
  return out;
}

/** Merge overlapping rectangles (simple repeated pairwise union). */
export function mergeRects(rects: Rect[]): Rect[] {
  const rs = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          rs[i] = union(a, b);
          rs.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return rs;
}

/** Largest scale ≤ `scale` such that a w×h page fits in `maxPixels` and `maxSide`. */
export function capScale(w: number, h: number, scale: number, maxPixels: number, maxSide = 16384): number {
  let s = scale;
  if (w * h * s * s > maxPixels) s = Math.sqrt(maxPixels / (w * h));
  if (Math.max(w, h) * s > maxSide) s = maxSide / Math.max(w, h);
  return s;
}

// ---------------------------------------------------------------- OCR on text pages

/** An embedded image whose area is covered less than this by text-layer word boxes still gets OCR'd. */
export const TEXT_COVER_MIN = 0.3;

/**
 * Fraction (0..1) of `r`'s area covered by the boxes of `tokens`. Based on area, not character
 * count: a stamped header ("CONFIDENTIAL – Page 1 of 3") over a full-page scan covers a few percent
 * of it, while an OCR'd scan with an invisible text layer covers a large part.
 * Token boxes are assumed not to overlap each other (true for word tokens); the sum is capped at 1.
 */
export function textCoverage(tokens: Token[], r: Rect): number {
  const area = r.w * r.h;
  if (!(area > 0)) return 1;
  let covered = 0;
  for (const t of tokens) covered += overlapArea(t.box, r);
  return Math.min(1, covered / area);
}

/**
 * OCR tokens that do not duplicate a text-layer token: an OCR word is dropped when more than half
 * of its box lies on text-layer words (the same text, read twice). Order is preserved.
 */
export function dedupeOcrTokens(textTokens: Token[], ocrTokens: Token[], maxOverlap = 0.5): Token[] {
  if (!textTokens.length) return ocrTokens;
  return ocrTokens.filter((o) => {
    const area = o.box.w * o.box.h;
    if (!(area > 0)) return false;
    let covered = 0;
    for (const t of textTokens) {
      covered += overlapArea(o.box, t.box);
      if (covered > maxOverlap * area) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- export

/** Render scale for flattened-PDF export: smaller for long documents so the output (and memory) stays bounded. */
export function exportScaleFor(pageCount: number, requested = 2): number {
  const cap = pageCount > 100 ? 1.25 : pageCount > 30 ? 1.5 : Infinity;
  return Math.min(requested, cap);
}
