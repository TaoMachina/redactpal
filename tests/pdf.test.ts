import { describe, expect, it } from 'vitest';
import {
  capScale,
  charWeight,
  clipRect,
  clusterLines,
  dedupeOcrTokens,
  exportScaleFor,
  imageRects,
  itemsToTokens,
  mergeRects,
  mul,
  pieceBox,
  placeItem,
  renumberLines,
  scaleTokens,
  segmentsToTokens,
  splitWords,
  textCoverage,
  TEXT_COVER_MIN,
  type PlacedItem,
  type TextItemLike,
} from '../src/pdf/geometry';
import { classifyPixels, pngUpRows, regionPixelRect, REGION_APPLY_ERROR, toPixelRect } from '../src/pdf/encode';
import type { Token } from '../src/core/types';

// US Letter, rotation 0: pdf.js viewport transform at scale 1 is [1,0,0,-1,0,792].
const VP = { transform: [1, 0, 0, -1, 0, 792], width: 612, height: 792 };

function item(str: string, x: number, y: number, size = 12, width?: number, extra: Partial<TextItemLike> = {}): TextItemLike {
  // Helvetica-ish: ~0.5em per char unless given.
  return { str, transform: [size, 0, 0, size, x, y], width: width ?? str.length * size * 0.5, height: size, fontName: 'f1', ...extra };
}

describe('pdf geometry: item placement', () => {
  it('mul matches pdf.js Util.transform', () => {
    expect(mul([1, 0, 0, -1, 0, 792], [12, 0, 0, 12, 72, 700])).toEqual([12, 0, 0, -12, 72, 92]);
  });

  it('places a horizontal item with a top-left origin box', () => {
    const p = placeItem(item('Hello', 72, 700, 12, 30), VP)!;
    expect(p.ox).toBeCloseTo(72);
    expect(p.oy).toBeCloseTo(92); // baseline, y down
    expect(p.fs).toBeCloseTo(12);
    expect(p.angle).toBe(0);
    const box = pieceBox(p, 0, p.len);
    expect(box.x).toBeCloseTo(72);
    expect(box.w).toBeCloseTo(30);
    // covers from above cap height down past the descender
    expect(box.y).toBeLessThanOrEqual(92 - 0.8 * 12 + 1e-9);
    expect(box.y + box.h).toBeGreaterThanOrEqual(92 + 0.2 * 12 - 1e-9);
  });

  it('honours viewport scale (e.g. scale 2)', () => {
    const vp2 = { transform: [2, 0, 0, -2, 0, 1584], width: 1224, height: 1584 };
    const p = placeItem(item('Hello', 72, 700, 12, 30), vp2)!;
    expect(p.fs).toBeCloseTo(24);
    expect(p.len).toBeCloseTo(60);
    expect(p.ox).toBeCloseTo(144);
  });

  it('handles /Rotate 90 (viewport transform swaps axes): text runs downwards', () => {
    // pdf.js PageViewport for viewBox [0,0,612,792], rotation 90, scale 1: [0,1,1,0,0,0].
    const vp90 = { transform: [0, 1, 1, 0, 0, 0], width: 792, height: 612 };
    const p = placeItem(item('Hello', 72, 700, 12, 30), vp90)!;
    expect(p.angle).toBe(90);
    expect(p.ox).toBeCloseTo(700);
    expect(p.oy).toBeCloseTo(72);
    const box = pieceBox(p, 0, p.len);
    expect(box.h).toBeCloseTo(30); // advance is vertical now
    expect(box.y).toBeCloseTo(72);
    expect(box.w).toBeGreaterThan(12 * 0.99); // font height is horizontal
    // glyph tops point to +x after a clockwise quarter turn: box extends to the right of the baseline
    expect(box.x + box.w).toBeGreaterThan(700 + 12 * 0.8 - 1e-9);
  });

  it('uses font ascent/descent but clamps to never under-cover', () => {
    const p = placeItem(item('x', 0, 700), VP, { ascent: 0.3, descent: -0.01 })!;
    expect(p.asc).toBeGreaterThanOrEqual(0.8);
    expect(p.desc).toBeGreaterThanOrEqual(0.2);
  });
});

describe('pdf geometry: word splitting', () => {
  it('splits on whitespace with proportional, widened ranges', () => {
    const str = 'mail alice@example.com now';
    const ws = splitWords(str, 260);
    expect(ws.map((w) => w.text)).toEqual(['mail', 'alice@example.com', 'now']);
    // monotonic, inside the item
    for (const w of ws) {
      expect(w.s0).toBeGreaterThanOrEqual(0);
      expect(w.s1).toBeLessThanOrEqual(260);
      expect(w.s1).toBeGreaterThan(w.s0);
    }
    expect(ws[0].atStart).toBe(true);
    expect(ws[2].atEnd).toBe(true);
    // over-cover: neighbouring ranges overlap thanks to the margin
    expect(ws[0].s1).toBeGreaterThan(ws[1].s0);
  });

  it('word in a long item does not cover the whole item', () => {
    const str = 'This is a long sentence that mentions secret AKIAIOSFODNN7EXAMPLE somewhere in the middle of it';
    const len = 500;
    const ws = splitWords(str, len);
    const key = ws.find((w) => w.text === 'AKIAIOSFODNN7EXAMPLE')!;
    expect(key.s1 - key.s0).toBeLessThan(len * 0.35);
    // with a uniform-width font the key starts at char index 45; estimate must cover it
    const start = (str.indexOf('AKIA') / str.length) * len;
    const end = ((str.indexOf('AKIA') + 20) / str.length) * len;
    const mono = splitWords(str, len, { mono: true }).find((w) => w.text === 'AKIAIOSFODNN7EXAMPLE')!;
    expect(mono.s0).toBeLessThanOrEqual(start);
    expect(mono.s1).toBeGreaterThanOrEqual(end);
  });

  it('mirrors ranges for RTL items', () => {
    const ltr = splitWords('ab cd', 50);
    const rtl = splitWords('ab cd', 50, { rtl: true });
    expect(rtl[0].s0).toBeCloseTo(50 - ltr[0].s1);
    expect(rtl[0].s1).toBeCloseTo(50 - ltr[0].s0);
  });

  it('char weights: narrow < normal < wide < CJK', () => {
    expect(charWeight('i')).toBeLessThan(charWeight('a'));
    expect(charWeight('a')).toBeLessThan(charWeight('W'));
    expect(charWeight('W')).toBeLessThan(charWeight('中'));
    expect(charWeight('i', true)).toBe(1);
  });
});

describe('pdf geometry: lines and tokens', () => {
  it('orders lines top→bottom and words left→right regardless of stream order', () => {
    const items = [item('second line', 72, 680), item('world', 120, 700), item('hello', 72, 700)];
    const toks = itemsToTokens(items, {}, VP);
    expect(toks.map((t) => t.text)).toEqual(['hello', 'world', 'second', 'line']);
    expect(toks[0].line).toBe(toks[1].line);
    expect(toks[2].line).toBe(toks[1].line + 1);
  });

  it('glues items that split a word (no gap, no space)', () => {
    const a = item('AKIAIOSF', 72, 700, 10, 40);
    const b = item('ODNN7EXAMPLE', 112.5, 700, 10, 60);
    const toks = itemsToTokens([a, b], {}, VP);
    expect(toks.map((t) => t.text)).toEqual(['AKIAIOSFODNN7EXAMPLE']);
    expect(toks[0].box.x).toBeCloseTo(72);
    expect(toks[0].box.x + toks[0].box.w).toBeCloseTo(172.5);
  });

  it('does not glue across a visible gap or explicit space', () => {
    const toks = itemsToTokens([item('foo', 72, 700, 10, 15), item('bar', 92, 700, 10, 15)], {}, VP);
    expect(toks.map((t) => t.text)).toEqual(['foo', 'bar']);
    const toks2 = itemsToTokens([item('foo', 72, 700, 10, 15), item(' bar', 87, 700, 10, 20)], {}, VP);
    expect(toks2.map((t) => t.text)).toEqual(['foo', 'bar']);
  });

  it('keeps sub/superscripts on their line and drops overprinted duplicates', () => {
    const toks = itemsToTokens([item('E=mc', 72, 700, 12, 30), item('2', 102.5, 704, 7, 4), item('E=mc', 72.2, 700, 12, 30)], {}, VP);
    expect(new Set(toks.map((t) => t.line)).size).toBe(1);
    expect(toks.map((t) => t.text)).toEqual(['E=mc2']);
  });

  it('reads real two-column text column by column; titles act as separators', () => {
    const items: TextItemLike[] = [item('A full width title that spans across both columns of the page', 72, 740, 12, 470)];
    for (let r = 0; r < 8; r++) {
      const y = 700 - r * 14;
      items.push(item(`left column line ${r} with words`, 72, y, 10, 220));
      items.push(item(`right column line ${r} with words`, 320, y, 10, 220));
    }
    const toks = itemsToTokens(items, {}, VP);
    const text = toks.map((t) => t.text).join(' ');
    expect(text.indexOf('title')).toBeLessThan(text.indexOf('left'));
    // all left lines before any right line
    expect(text.lastIndexOf('left')).toBeLessThan(text.indexOf('right'));
  });

  it('does NOT split a key/value table into columns', () => {
    const items: TextItemLike[] = [];
    const keys = ['Username:', 'Password:', 'Host:', 'Port:', 'Token:', 'Region:'];
    keys.forEach((k, r) => {
      items.push(item(k, 72, 700 - r * 14, 10, 45));
      items.push(item(`value${r}`, 250, 700 - r * 14, 10, 30));
    });
    const toks = itemsToTokens(items, {}, VP);
    const pw = toks.findIndex((t) => t.text === 'Password:');
    expect(toks[pw + 1].text).toBe('value1');
    expect(toks[pw + 1].line).toBe(toks[pw].line);
  });

  it('drops text outside the page and clips boxes', () => {
    const toks = itemsToTokens([item('offpage', 700, 700), item('edge', 600, 700, 12, 30)], {}, VP);
    expect(toks.map((t) => t.text)).toEqual(['edge']);
    expect(toks[0].box.x + toks[0].box.w).toBeLessThanOrEqual(612);
  });

  it('segmentsToTokens numbers lines from firstLine', () => {
    const p = placeItem(item('a b', 72, 700), VP) as PlacedItem;
    const toks = segmentsToTokens([{ items: [p] }, { items: [p] }], 5);
    expect(toks.map((t) => t.line)).toEqual([5, 5, 6, 6]);
    expect(clusterLines([p]).length).toBe(1);
  });

  it('renumberLines / scaleTokens', () => {
    const toks: Token[] = [
      { text: 'a', box: { x: 10, y: 10, w: 10, h: 10 }, line: 3 },
      { text: 'b', box: { x: 30, y: 10, w: 10, h: 10 }, line: 3 },
      { text: 'c', box: { x: 10, y: 30, w: 10, h: 10 }, line: 9 },
    ];
    expect(renumberLines(toks, 0).map((t) => t.line)).toEqual([0, 0, 1]);
    const s = scaleTokens(toks, 0.5, 0.25, 100, 200);
    expect(s[0].box).toEqual({ x: 105, y: 202.5, w: 5, h: 2.5 });
  });
});

describe('pdf geometry: images and scaling', () => {
  const OPS = { save: 10, restore: 11, transform: 12, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, imageOps: [85] };
  it('tracks the CTM to find painted image rects in page space', () => {
    const fn = [10, 12, 85, 11, 74, 85, 75];
    const args = [null, [200, 0, 0, 100, 72, 600], ['img1'], null, [[1, 0, 0, 1, 0, 0], [0, 0, 612, 792]], ['img2'], null];
    const rects = imageRects(fn, args, OPS, VP);
    expect(rects[0]).toEqual({ x: 72, y: 92, w: 200, h: 100 });
    expect(rects[1]).toEqual({ x: 0, y: 791, w: 1, h: 1 }); // unit square at the origin, y flipped
  });

  it('mergeRects unions overlaps', () => {
    const m = mergeRects([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 5, y: 5, w: 10, h: 10 },
      { x: 100, y: 100, w: 1, h: 1 },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ x: 0, y: 0, w: 15, h: 15 });
  });

  it('capScale respects pixel and side caps', () => {
    expect(capScale(612, 792, 2, 1e9)).toBe(2);
    const s = capScale(612, 792, 10, 4_000_000);
    expect(612 * 792 * s * s).toBeLessThanOrEqual(4_000_000 + 1);
    expect(capScale(20000, 10, 1, 1e12, 16384)).toBeCloseTo(16384 / 20000);
  });
});

describe('pdf export encoding helpers', () => {
  it('toPixelRect rounds outward and clamps', () => {
    expect(toPixelRect({ x: 10.2, y: 5.7, w: 10, h: 1 }, 2, 2, 1000, 1000)).toEqual({ x: 20, y: 11, w: 21, h: 3 });
    expect(toPixelRect({ x: -5, y: -5, w: 10, h: 10 }, 1, 1, 3, 3)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(toPixelRect({ x: 50, y: 50, w: 10, h: 10 }, 1, 1, 10, 10)).toBeNull();
  });

  it('classifies a white page with black text as grey, not photo', () => {
    const w = 100, h = 100;
    const d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 0; i < 500; i++) d.fill(0, i * 4 * 7, i * 4 * 7 + 3);
    expect(classifyPixels(d, w, h)).toEqual({ gray: true, photo: false });
  });

  it('classifies noise as a colour photo', () => {
    const w = 64, h = 64;
    const d = new Uint8ClampedArray(w * h * 4);
    let s = 1;
    for (let i = 0; i < d.length; i++) d[i] = (s = (s * 1103515245 + 12345) & 0x7fffffff) & 0xff;
    expect(classifyPixels(d, w, h)).toEqual({ gray: false, photo: true });
  });

  it('pngUpRows writes filter bytes and Up deltas', () => {
    // 2x2 RGBA: row0 = (10,20,30),(40,50,60); row1 = (11,22,33),(40,50,60)
    const d = [10, 20, 30, 255, 40, 50, 60, 255, 11, 22, 33, 255, 40, 50, 60, 255];
    const rgb = pngUpRows(d, 2, 2, false);
    expect(Array.from(rgb)).toEqual([2, 10, 20, 30, 40, 50, 60, 2, 1, 2, 3, 0, 0, 0]);
    const g = pngUpRows([100, 100, 100, 255, 100, 100, 100, 255], 2, 1, true);
    expect(Array.from(g)).toEqual([2, 100, 100]);
  });
});

describe('pdf geometry: robustness', () => {
  it('glyph-by-glyph items (common in some generators) become words, quickly', () => {
    const items: TextItemLike[] = [];
    const line = 'token sk_live_abcdefghijklmnopqrstuvwx here and more words to fill the line';
    for (let r = 0; r < 80; r++) {
      let x = 40;
      for (const ch of line) {
        if (ch !== ' ') items.push(item(ch, x, 760 - r * 9, 7, 3.5));
        x += 3.5;
      }
    }
    const t0 = performance.now();
    const toks = itemsToTokens(items, {}, VP);
    expect(performance.now() - t0).toBeLessThan(1000);
    const first = toks.filter((t) => t.line === toks[0].line).map((t) => t.text);
    expect(first.slice(0, 3)).toEqual(['token', 'sk_live_abcdefghijklmnopqrstuvwx', 'here']);
  });

  it('vertical-writing items get a generous, unsplit box', () => {
    const p = placeItem(item('秘密情報', 300, 700, 12, 12), VP, { vertical: true })!;
    p.len = 48;
    const box = pieceBox(p, 0, p.len);
    expect(box.h).toBeGreaterThanOrEqual(48);
    expect(box.w).toBeGreaterThanOrEqual(12);
    const toks = segmentsToTokens([{ items: [p] }]);
    expect(toks).toHaveLength(1);
    expect(toks[0].text).toBe('秘密情報');
  });
});

describe('pdf: which images get OCR on a text page', () => {
  const tok = (text: string, x: number, y: number, w: number, h: number, line = 0): Token => ({ text, box: { x, y, w, h }, line });
  const page = { x: 0, y: 0, w: 612, h: 792 };

  it('a scan with a stamped text header (>= 20 chars) is still mostly uncovered image => OCR it', () => {
    // "CONFIDENTIAL – Page 1 of 3" across the top: 21 non-space chars, but only a sliver of the page area.
    const header = [tok('CONFIDENTIAL', 200, 20, 90, 12), tok('–', 294, 20, 6, 12), tok('Page', 304, 20, 28, 12), tok('1', 336, 20, 6, 12), tok('of', 346, 20, 12, 12), tok('3', 362, 20, 6, 12)];
    expect(header.map((t) => t.text).join('').length).toBeGreaterThanOrEqual(20);
    expect(textCoverage(header, page)).toBeLessThan(0.01);
    expect(textCoverage(header, page)).toBeLessThan(TEXT_COVER_MIN);
  });

  it('an OCR-ed scan with an invisible text layer is mostly covered => no second OCR', () => {
    // 11pt words on a 13pt pitch filling the text block of the page, 4pt gaps between 40pt words.
    const words: Token[] = [];
    for (let y = 72, line = 0; y + 11 <= 720; y += 13, line++) for (let x = 72; x + 40 <= 540; x += 44) words.push(tok('word', x, y, 40, 11, line));
    expect(textCoverage(words, page)).toBeGreaterThan(TEXT_COVER_MIN);
  });

  it('coverage only counts the part of a token inside the image, and caps at 1', () => {
    const img = { x: 100, y: 100, w: 100, h: 100 };
    expect(textCoverage([tok('a', 50, 100, 100, 100)], img)).toBeCloseTo(0.5);
    expect(textCoverage([tok('a', 0, 0, 500, 500), tok('b', 0, 0, 500, 500)], img)).toBe(1);
    expect(textCoverage([], img)).toBe(0);
  });

  it('OCR words already in the text layer are dropped, new ones kept', () => {
    const text = [tok('CONFIDENTIAL', 200, 20, 90, 12)];
    const ocr = [tok('CONF1DENTIAL', 201, 19, 88, 14, 0), tok('alice@example.com', 72, 100, 120, 12, 1), tok('x', 288, 20, 10, 12, 1)];
    expect(dedupeOcrTokens(text, ocr).map((t) => t.text)).toEqual(['alice@example.com', 'x']);
    expect(dedupeOcrTokens([], ocr)).toBe(ocr);
  });
});

describe('pdf export: boxes are never silently skipped', () => {
  it('maps a region to canvas pixels at the export scale (outward-rounded)', () => {
    expect(regionPixelRect({ x: 10.2, y: 20.6, w: 30, h: 10 }, 1.5, 1.5, 918, 1188)).toEqual({ x: 15, y: 30, w: 46, h: 16 });
  });

  it('throws a user-facing error for non-finite or empty rects', () => {
    for (const r of [
      { x: NaN, y: 0, w: 10, h: 10 },
      { x: 0, y: Infinity, w: 10, h: 10 },
      { x: 0, y: 0, w: 0, h: 10 },
      { x: 0, y: 0, w: 10, h: -2 },
    ]) {
      expect(() => regionPixelRect(r, 2, 2, 1224, 1584)).toThrow(REGION_APPLY_ERROR);
    }
    expect(() => regionPixelRect({ x: 0, y: 0, w: 10, h: 10 }, NaN, 2, 1224, 1584)).toThrow(REGION_APPLY_ERROR);
  });

  it('skips regions entirely outside the page, clips partial ones', () => {
    expect(regionPixelRect({ x: 700, y: 0, w: 10, h: 10 }, 2, 2, 1224, 1584)).toBeNull();
    expect(regionPixelRect({ x: -20, y: 0, w: 20, h: 10 }, 2, 2, 1224, 1584)).toBeNull();
    expect(regionPixelRect({ x: 600, y: 780, w: 50, h: 50 }, 2, 2, 1224, 1584)).toEqual({ x: 1200, y: 1560, w: 24, h: 24 });
  });

  it('clipRect returns null (not a NaN rect) for non-finite input', () => {
    expect(clipRect({ x: NaN, y: 0, w: 10, h: 10 }, 100, 100)).toBeNull();
    expect(clipRect({ x: 0, y: 0, w: Infinity, h: 10 }, 100, 100)).toBeNull();
    expect(clipRect({ x: 0, y: 0, w: 10, h: 10 }, NaN, 100)).toBeNull();
    expect(clipRect({ x: 5, y: 5, w: 10, h: 10 }, 100, 100)).toEqual({ x: 5, y: 5, w: 10, h: 10 });
  });

  it('lowers the export scale for long documents', () => {
    expect(exportScaleFor(1)).toBe(2);
    expect(exportScaleFor(30)).toBe(2);
    expect(exportScaleFor(31)).toBe(1.5);
    expect(exportScaleFor(100)).toBe(1.5);
    expect(exportScaleFor(101)).toBe(1.25);
    expect(exportScaleFor(200, 3)).toBe(1.25);
    expect(exportScaleFor(10, 1)).toBe(1);
  });
});
