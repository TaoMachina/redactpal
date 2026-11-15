// Pure helpers of the image path (no DOM, no OCR): preprocessing, coordinate mapping, token/line
// reconstruction from tesseract.js v7 blocks, image header sniffing, asset URLs.
import { describe, expect, it } from 'vitest';
import {
  analyzeBackground,
  applyTonePlanRgba,
  chooseScale,
  estimateTextHeight,
  histogram,
  localBackground,
  mapBoxToSource,
  MAX_UPSCALE,
  planTone,
  polarityMask,
  prepareOcr,
  rgbaToGray,
  snapRect,
} from '../src/image/preprocess';
import { blocksToTokens, isLikelyGarbage, type TessBlock } from '../src/image/tokens';
import { readImageSize } from '../src/image/imageSize';
import { ocrAssetUrls } from '../src/image/assets';
import { EXPORT_BACKGROUND, exportRect, paintRedacted, REGION_APPLY_ERROR, type PaintContext } from '../src/image/paint';
import type { Region } from '../src/core/types';
import { buildLayout } from '../src/core/layout';

/** Simple gray canvas for synthetic test images. */
function grayImage(w: number, h: number, bg: number) {
  const px = new Uint8Array(w * h).fill(bg);
  const rect = (x: number, y: number, rw: number, rh: number, v: number) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) px[yy * w + xx] = v;
  };
  return { px, rect, w, h };
}

/** Fake "text": rows of glyph-like vertical strokes (height th) on lines `pitch` apart. */
function drawText(img: ReturnType<typeof grayImage>, x0: number, x1: number, y0: number, y1: number, th: number, pitch: number, v: number) {
  for (let y = y0; y + th <= y1; y += pitch) for (let x = x0; x + 2 <= x1; x += 6) img.rect(x, y, 2, th, v);
}

function toRgba(px: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length * 4);
  for (let i = 0; i < px.length; i++) out.set([px[i], px[i], px[i], 255], i * 4);
  return out;
}

describe('rgbaToGray / analyzeBackground', () => {
  it('converts to luminance and composites transparency over white', () => {
    const g = rgbaToGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]));
    expect(g[0]).toBeGreaterThanOrEqual(254);
    expect(g[1]).toBe(0);
    expect(g[2]).toBe(255); // fully transparent -> white
    expect(g[3]).toBeGreaterThan(60);
    expect(g[3]).toBeLessThan(90);
  });

  it('finds the dominant level and dark themes', () => {
    const dark = grayImage(100, 50, 30);
    drawText(dark, 5, 95, 5, 45, 8, 14, 220);
    const b = analyzeBackground(histogram(dark.px));
    expect(b.dark).toBe(true);
    expect(Math.abs(b.level - 30)).toBeLessThanOrEqual(2);

    const light = grayImage(100, 50, 245);
    drawText(light, 5, 95, 5, 45, 8, 14, 20);
    expect(analyzeBackground(histogram(light.px)).dark).toBe(false);
  });
});

describe('polarityMask', () => {
  it('inverts a dark sidebar but not the light page next to it, edge within a few px', () => {
    const img = grayImage(300, 120, 245);
    img.rect(0, 0, 100, 120, 35); // dark sidebar
    drawText(img, 10, 90, 10, 110, 10, 20, 210); // light text in sidebar
    drawText(img, 120, 290, 10, 110, 10, 20, 30); // dark text on page
    const mask = polarityMask(img.px, img.w, img.h, 25, false, 12);
    const at = (x: number, y: number) => mask[y * img.w + x];
    for (const y of [5, 60, 115]) {
      for (let x = 0; x < 95; x++) expect(at(x, y)).toBe(1);
      for (let x = 105; x < 300; x++) expect(at(x, y)).toBe(0);
    }
  });

  it('inverts a small dark button (smaller than the large window) entirely, rim included', () => {
    const img = grayImage(200, 100, 248);
    img.rect(60, 35, 70, 30, 70); // button (~3 text heights tall, like real UI buttons)
    drawText(img, 70, 120, 45, 56, 10, 20, 250); // its light label
    const mask = polarityMask(img.px, img.w, img.h, 30, false, 12);
    for (let y = 35; y < 65; y++) {
      for (let x = 60; x < 130; x++) {
        if (img.px[y * img.w + x] < 100) expect(mask[y * img.w + x]).toBe(1);
      }
    }
    expect(mask[10 * img.w + 10]).toBe(0);
  });

  it('keeps everything as-is for a plain light document', () => {
    const img = grayImage(200, 100, 250);
    drawText(img, 10, 190, 10, 90, 10, 18, 20);
    expect(polarityMask(img.px, img.w, img.h, 25, false, 12).every((v) => v === 0)).toBe(true);
  });
});

describe('localBackground', () => {
  it('removes thin strokes but keeps large surfaces with their edges', () => {
    const img = grayImage(120, 80, 240);
    img.rect(20, 10, 2, 30, 20); // a text stroke
    img.rect(60, 20, 40, 40, 160); // grey box
    const bg = localBackground(img.px, img.w, img.h, 4);
    expect(bg[20 * img.w + 20]).toBe(240); // stroke gone
    expect(bg[40 * img.w + 80]).toBe(160); // box kept
    expect(bg[40 * img.w + 59]).toBe(240); // just outside the box
    expect(bg[40 * img.w + 61]).toBe(160); // just inside
  });
});

describe('planTone + applyTonePlanRgba', () => {
  it('turns a dark theme into dark text on white', () => {
    const img = grayImage(160, 80, 30);
    drawText(img, 10, 150, 10, 70, 10, 20, 215);
    const plan = planTone(img.px, img.w, img.h, 10);
    const rgba = toRgba(img.px);
    applyTonePlanRgba(rgba, img.w, img.h, plan);
    expect(plan.inverted).toBe(true);
    expect(rgba[(5 * img.w + 5) * 4]).toBeGreaterThanOrEqual(250); // background -> white
    expect(rgba[(15 * img.w + 10) * 4]).toBeLessThan(60); // text -> dark
    expect(rgba[(15 * img.w + 10) * 4 + 3]).toBe(255);
  });

  it('flattens a grey box to white while keeping its text dark', () => {
    const img = grayImage(200, 100, 250);
    img.rect(40, 30, 120, 40, 175); // grey input field
    drawText(img, 50, 150, 40, 60, 10, 20, 30);
    drawText(img, 10, 30, 10, 90, 10, 20, 30);
    const plan = planTone(img.px, img.w, img.h, 10);
    const rgba = toRgba(img.px);
    applyTonePlanRgba(rgba, img.w, img.h, plan);
    expect(rgba[(35 * img.w + 100) * 4]).toBeGreaterThanOrEqual(245); // box interior -> white
    expect(rgba[(45 * img.w + 50) * 4]).toBeLessThan(80); // text inside the box
  });

  it('works when applied at a different (upscaled) resolution', () => {
    const img = grayImage(100, 40, 30);
    drawText(img, 10, 90, 10, 30, 10, 20, 215);
    const plan = planTone(img.px, img.w, img.h, 10);
    const big = new Uint8ClampedArray(200 * 80 * 4);
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 200; x++) {
        const v = img.px[(y >> 1) * 100 + (x >> 1)]; // 2x nearest-neighbour upscale
        big.set([v, v, v, 255], (y * 200 + x) * 4);
      }
    }
    applyTonePlanRgba(big, 200, 80, plan);
    expect(big[(2 * 200 + 2) * 4]).toBeGreaterThanOrEqual(250);
    expect(big[(25 * 200 + 20) * 4]).toBeLessThan(60);
  });
});

describe('estimateTextHeight / chooseScale / prepareOcr', () => {
  it('measures line height of text-like bands', () => {
    const img = grayImage(400, 200, 250);
    drawText(img, 10, 390, 10, 190, 10, 22, 20);
    const th = estimateTextHeight(img.px, img.w, img.h, 250);
    expect(th).toBe(10);
  });

  it('returns null for a blank image', () => {
    expect(estimateTextHeight(new Uint8Array(100 * 100).fill(255), 100, 100, 255)).toBeNull();
  });

  it('upscales small text, leaves large text alone, caps pixels', () => {
    expect(chooseScale(8, 800, 600)).toBe(MAX_UPSCALE);
    expect(chooseScale(12, 800, 600)).toBe(2);
    expect(chooseScale(24, 800, 600)).toBe(1);
    expect(chooseScale(null, 800, 600)).toBe(2);
    expect(chooseScale(null, 2560, 1440)).toBe(1);
    const s = chooseScale(8, 3000, 2000);
    expect(3000 * s * 2000 * s).toBeLessThanOrEqual(16_000_000);
    expect(chooseScale(30, 8000, 6000)).toBeLessThan(1); // 48 MP -> shrink to the cap
  });

  it('prepareOcr reports text height in original pixels when analysing a downsampled copy', () => {
    const img = grayImage(400, 200, 250);
    drawText(img, 10, 390, 10, 190, 10, 22, 20);
    const prep = prepareOcr(img.px, img.w, img.h, 800, 400); // analysis copy at half size
    expect(prep.textHeight).toBe(20);
    expect(prep.scale).toBe(1); // 20 px is already close to the 24 px target
    expect(prepareOcr(img.px, img.w, img.h, 400, 200).scale).toBe(2.375); // 10 px -> upscale
  });
});

describe('coordinate mapping', () => {
  it('maps OCR-space boxes back to source pixels, rounding outward and clamping', () => {
    expect(mapBoxToSource({ x0: 3, y0: 5, x1: 9, y1: 11 }, 2, 2, 100, 100)).toEqual({ x: 1, y: 2, w: 4, h: 4 });
    expect(mapBoxToSource({ x0: 0, y0: 0, x1: 250, y1: 90 }, 2.5, 2.5, 80, 30)).toEqual({ x: 0, y: 0, w: 80, h: 30 });
    expect(mapBoxToSource({ x0: 10, y0: 10, x1: 20, y1: 20 }, 1, 1, 100, 100)).toEqual({ x: 10, y: 10, w: 10, h: 10 });
  });

  it('snapRect covers every touched pixel and drops empty rects', () => {
    expect(snapRect({ x: 1.2, y: 2.7, w: 3.1, h: 0.5 }, 100, 100)).toEqual({ x: 1, y: 2, w: 4, h: 2 });
    expect(snapRect({ x: -5, y: -5, w: 10, h: 10 }, 3, 3)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(snapRect({ x: 50, y: 50, w: 5, h: 5 }, 10, 10)).toBeNull();
    expect(snapRect({ x: 1, y: 1, w: 0, h: 5 }, 10, 10)).toBeNull();
  });
});

// --- tesseract.js v7 `blocks` -> tokens ------------------------------------------------------

type W = [text: string, x0: number, y0: number, x1: number, y1: number, conf?: number];
const word = ([text, x0, y0, x1, y1, conf = 90]: W) => ({ text, confidence: conf, bbox: { x0, y0, x1, y1 } });
const block = (...lines: W[][]): TessBlock => ({ paragraphs: [{ lines: lines.map((ws) => ({ words: ws.map(word) })) }] });
const ident = { scaleX: 1, scaleY: 1, width: 2000, height: 2000 };
const textOf = (blocks: TessBlock[], m = ident) => {
  const toks = blocksToTokens(blocks, m);
  return buildLayout(toks).text;
};

describe('blocksToTokens', () => {
  it('flattens words with increasing line numbers', () => {
    const toks = blocksToTokens(
      [block([['Email:', 10, 10, 50, 22], ['a@b.co', 55, 10, 100, 22]], [['Key', 10, 40, 40, 52]])],
      ident,
    );
    expect(toks.map((t) => [t.text, t.line])).toEqual([
      ['Email:', 0],
      ['a@b.co', 0],
      ['Key', 1],
    ]);
    expect(toks[1].box).toEqual({ x: 55, y: 10, w: 45, h: 12 });
  });

  it('maps boxes through the preprocessing scale', () => {
    const toks = blocksToTokens([block([['hi', 20, 40, 60, 64]])], { scaleX: 2, scaleY: 2, width: 100, height: 100 });
    expect(toks[0].box).toEqual({ x: 10, y: 20, w: 20, h: 12 });
  });

  it('skips empty words and obvious UI chrome, but never drops on confidence alone', () => {
    const toks = blocksToTokens(
      [block([['  ', 0, 0, 5, 12], ['|', 8, 0, 10, 12, 5], ['sk_live_x', 15, 0, 80, 12, 1], ['@', 85, 0, 92, 12, 3]])],
      ident,
    );
    expect(toks.map((t) => t.text)).toEqual(['sk_live_x', '@']);
    expect(isLikelyGarbage('|', 10)).toBe(true);
    expect(isLikelyGarbage('|', 80)).toBe(false);
    expect(isLikelyGarbage('l', 5)).toBe(false);
  });

  it('rebuilds rows from column-major blocks (aligned/log text split by Tesseract)', () => {
    // Tesseract returned the left column first, then the right column.
    const left = block([['INFO', 10, 10, 50, 22]], [['INFO', 10, 40, 50, 52]]);
    const right = block([['user=bob', 60, 10, 140, 22]], [['user=eve', 60, 40, 140, 52]]);
    expect(textOf([left, right])).toBe('INFO user=bob\nINFO user=eve');
  });

  it('glues a word Tesseract cut in two at a column boundary', () => {
    const a = block([['user=bob.', 10, 10, 90, 22]]);
    const b = block([['smith@corp.com', 91, 10, 200, 22]]);
    const toks = blocksToTokens([a, b], ident);
    expect(toks.map((t) => t.text)).toEqual(['user=bob.smith@corp.com']);
    expect(toks[0].box).toEqual({ x: 10, y: 10, w: 190, h: 12 });
  });

  it('splits one Tesseract line at a column-sized gap and orders rows top to bottom', () => {
    const blocks = [
      block(
        [['Account', 10, 10, 60, 22], ['settings', 64, 10, 110, 22], ['Sidebar:', 400, 10, 450, 22], ['Team', 454, 10, 480, 22]],
        [['Email:', 10, 40, 50, 52], ['x@y.io', 54, 40, 110, 52]],
      ),
    ];
    expect(textOf(blocks)).toBe('Account settings\nSidebar: Team\nEmail: x@y.io');
  });

  it('keeps words on one row despite different box heights (descenders, mis-sized boxes)', () => {
    const blocks = [block([['Email:', 13, 31, 42, 40], ['jane.', 46, 22, 70, 50], ['doe@example.com', 71, 31, 173, 43]])];
    expect(textOf(blocks)).toBe('Email: jane. doe@example.com');
  });

  it('handles null / empty input', () => {
    expect(blocksToTokens(null, ident)).toEqual([]);
    expect(blocksToTokens([{ paragraphs: [] }], ident)).toEqual([]);
  });
});

// --- header sniffing -----------------------------------------------------------------------------

describe('readImageSize', () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
  const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16le = (n: number) => [n & 255, (n >>> 8) & 255];
  const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

  it('PNG', () => {
    const b = bytes([0x89], 'PNG', [13, 10, 26, 10], u32be(13), 'IHDR', u32be(7000), u32be(8000), [8, 6, 0, 0, 0]);
    expect(readImageSize(b)).toEqual({ format: 'png', width: 7000, height: 8000 });
  });
  it('GIF', () => {
    expect(readImageSize(bytes('GIF89a', u16le(320), u16le(200), [0, 0, 0]))).toEqual({ format: 'gif', width: 320, height: 200 });
  });
  it('BMP (top-down, negative height)', () => {
    const b = bytes('BM', u32le(0), u32le(0), u32le(54), u32le(40), u32le(640), u32le(-480 >>> 0), [1, 0, 24, 0]);
    expect(readImageSize(b)).toEqual({ format: 'bmp', width: 640, height: 480 });
  });
  it('WebP VP8X / VP8L / VP8', () => {
    const riff = (chunk: string, payload: number[]) => bytes('RIFF', u32le(100), 'WEBP', chunk, u32le(10), payload);
    expect(readImageSize(riff('VP8X', [0, 0, 0, 0, ...[0x7f, 0x07, 0x00], ...[0x37, 0x04, 0x00]]))).toEqual({ format: 'webp', width: 1920, height: 1080 });
    const bits = (1920 - 1) | ((1080 - 1) << 14);
    expect(readImageSize(riff('VP8L', [0x2f, ...u32le(bits), 0, 0, 0, 0, 0]))).toEqual({ format: 'webp', width: 1920, height: 1080 });
    expect(readImageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(800), ...u16le(600)]))).toEqual({ format: 'webp', width: 800, height: 600 });
  });
  it('JPEG with an APP1 (EXIF) segment before SOF0', () => {
    const app1 = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0, 0];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, ...[0x0f, 0xa0], ...[0x17, 0x70], 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(readImageSize(bytes([0xff, 0xd8], app1, sof0))).toEqual({ format: 'jpeg', width: 6000, height: 4000 });
  });
  it('unknown / truncated', () => {
    expect(readImageSize(bytes('hello world, not an image'))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('ocrAssetUrls', () => {
  it('resolves same-origin vendor URLs relative to the page (Vite base "./")', () => {
    expect(ocrAssetUrls('https://tools.example.test/blot/index.html')).toEqual({
      workerPath: 'https://tools.example.test/blot/vendor/tesseract/worker.min.js',
      corePath: 'https://tools.example.test/blot/vendor/tesseract/core',
      langPath: 'https://tools.example.test/blot/vendor/tesseract/lang',
    });
    expect(ocrAssetUrls('http://localhost:5173/').workerPath).toBe('http://localhost:5173/vendor/tesseract/worker.min.js');
  });
});

describe('image export painting', () => {
  const region = (x: number, y: number, w: number, h: number, enabled = true): Region => ({
    id: 'r',
    rect: { x, y, w, h },
    kind: 'manual',
    label: 'Box',
    text: '',
    enabled,
  });

  /** Recording 2D context: logs every fill/draw with the state that applies to it. */
  function fakeCtx() {
    const log: string[] = [];
    const ctx: PaintContext<string> = {
      globalAlpha: 0.5,
      globalCompositeOperation: 'multiply',
      fillStyle: '#123456',
      fillRect(x, y, w, h) {
        log.push(`fill ${String(this.fillStyle)} ${x},${y},${w},${h} a=${this.globalAlpha} op=${this.globalCompositeOperation}`);
      },
      drawImage(img, x, y) {
        log.push(`draw ${img} ${x},${y}`);
      },
    };
    return { ctx, log };
  }

  it('fills opaque white BEFORE drawing the image, then paints enabled boxes solid', () => {
    const { ctx, log } = fakeCtx();
    paintRedacted(ctx, 'IMG', 100, 50, [region(10.2, 5.7, 20.1, 4.1), region(0, 0, 5, 5, false)], '#000000');
    expect(log).toEqual([
      `fill ${EXPORT_BACKGROUND} 0,0,100,50 a=1 op=source-over`,
      'draw IMG 0,0',
      'fill #000000 10,5,21,5 a=1 op=source-over', // snapped outward to whole pixels
    ]);
    expect(EXPORT_BACKGROUND).toBe('#ffffff');
  });

  it('never silently skips an enabled box: bad rects throw before anything is drawn', () => {
    for (const bad of [region(NaN, 0, 5, 5), region(0, 0, Infinity, 5), region(0, 0, 0, 5), region(0, 0, 5, -1)]) {
      const { ctx, log } = fakeCtx();
      expect(() => paintRedacted(ctx, 'IMG', 100, 50, [region(1, 1, 2, 2), bad], '#000')).toThrow(REGION_APPLY_ERROR);
      expect(log).toEqual([]);
    }
    // ...but a disabled bad box is fine (it is not painted at all)
    const { ctx } = fakeCtx();
    expect(() => paintRedacted(ctx, 'IMG', 100, 50, [region(NaN, 0, 5, 5, false)], '#000')).not.toThrow();
  });

  it('exportRect: clips partial boxes, skips boxes entirely outside the image', () => {
    expect(exportRect({ x: -5, y: 40, w: 10, h: 20 }, 100, 50)).toEqual({ x: 0, y: 40, w: 5, h: 10 });
    expect(exportRect({ x: 100, y: 0, w: 10, h: 10 }, 100, 50)).toBeNull();
    expect(exportRect({ x: -20, y: 0, w: 20, h: 10 }, 100, 50)).toBeNull();
    expect(exportRect({ x: 0, y: 60, w: 10, h: 10 }, 100, 50)).toBeNull();
    expect(exportRect({ x: 99.5, y: 49.5, w: 0.01, h: 0.01 }, 100, 50)).toEqual({ x: 99, y: 49, w: 1, h: 1 });
    expect(() => exportRect({ x: 0, y: 0, w: 1, h: 1 }, 0, 50)).toThrow(REGION_APPLY_ERROR);
  });
});
