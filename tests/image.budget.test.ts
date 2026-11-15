// Phone-safety of the image path: per-device budgets, size/scale decisions, box remapping when OCR
// runs on a DOWNscaled copy, EXIF orientation / HEIF sniffing, time-sliced pixel work, and the
// decode fallback chain (createImageBitmap stubbed — Node has none).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  budgetFor,
  checkExportSize,
  CONSTRAINED_BUDGET,
  decodeResizeWidth,
  decodeTarget,
  DESKTOP_BUDGET,
  detectDevice,
  downscaleNotice,
  fitPixels,
  IOS_MAX_CANVAS_PIXELS,
  orientedSize,
  sameAspect,
  TIGHT_BUDGET,
} from '../src/image/budget';
import { chooseScale, mapBoxToSource, MAX_UPSCALE, NO_UPSCALE_ABOVE_PIXELS, polarityMask, polarityMaskSteps } from '../src/image/preprocess';
import { blocksToTokens, type TessBlock } from '../src/image/tokens';
import { isHeif, readImageSize } from '../src/image/imageSize';
import { runSync, syncSlicer, timeSlicer, type Steps } from '../src/image/steps';
import { STRIP_PIXELS, stripRows } from '../src/image/pipeline';
import { DECODE_TIMEOUT_MS, decodeImageDetailed, ocrScale } from '../src/image';

const UA = {
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('device budgets', () => {
  it('treats every iOS browser (incl. Chrome = WebKit, and iPadOS posing as a Mac) as constrained', () => {
    expect(detectDevice({ userAgent: UA.iphoneChrome })).toMatchObject({ ios: true, constrained: true });
    expect(detectDevice({ userAgent: UA.iphoneSafari })).toMatchObject({ ios: true, constrained: true });
    expect(detectDevice({ userAgent: UA.ipadOs, maxTouchPoints: 5 })).toMatchObject({ ios: true, constrained: true });
    expect(detectDevice({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toMatchObject({ ios: false, constrained: false });
    expect(detectDevice({ userAgent: UA.windows, deviceMemory: 8 })).toMatchObject({ constrained: false });
    expect(detectDevice({ userAgent: UA.android, deviceMemory: 4 })).toMatchObject({ ios: false, constrained: true });
    expect(detectDevice({})).toMatchObject({ ios: false, deviceMemory: null, constrained: false });
  });

  it('picks smaller budgets on constrained devices, smallest on ≤ 2 GB', () => {
    expect(budgetFor(detectDevice({ userAgent: UA.windows }))).toBe(DESKTOP_BUDGET);
    expect(budgetFor(detectDevice({ userAgent: UA.iphoneChrome }))).toBe(CONSTRAINED_BUDGET);
    expect(budgetFor(detectDevice({ userAgent: UA.android, deviceMemory: 2 }))).toBe(TIGHT_BUDGET);
    for (const b of [CONSTRAINED_BUDGET, TIGHT_BUDGET]) {
      expect(b.maxDecodePixels).toBeLessThan(IOS_MAX_CANVAS_PIXELS); // export canvas = bitmap must fit
      expect(b.maxCanvasPixels).toBeLessThanOrEqual(IOS_MAX_CANVAS_PIXELS);
      expect(b.maxOcrPixels).toBeLessThanOrEqual(8_000_000);
      expect(b.maxAnalysisPixels).toBeLessThan(b.maxOcrPixels);
    }
  });
});

describe('size arithmetic', () => {
  it('fitPixels keeps the aspect ratio, never exceeds the cap, never upscales', () => {
    expect(fitPixels(800, 600, 1_000_000)).toEqual({ width: 800, height: 600 });
    for (const [w, h, max] of [
      [4032, 3024, 8_000_000],
      [3024, 4032, 8_000_000],
      [8064, 6048, 16_000_000],
      [5712, 4284, 16_000_000],
      [12000, 300, 1_000_000],
      [1, 50_000, 10_000],
    ]) {
      const f = fitPixels(w, h, max);
      expect(f.width * f.height).toBeLessThanOrEqual(max);
      expect(f.width).toBeLessThanOrEqual(w);
      expect(f.height).toBeLessThanOrEqual(h);
      if (f.width > 1 && f.height > 1) {
        expect(Math.abs(f.width / f.height - w / h)).toBeLessThan((w / h) * 0.01 + 1 / f.height);
        expect(f.width * f.height).toBeGreaterThan(max * 0.97); // not needlessly small
      }
    }
  });

  it('decodeTarget: 12 MP photos decode at full size on phones; 24/48 MP shrink below the iOS canvas limit', () => {
    expect(decodeTarget(4032, 3024, CONSTRAINED_BUDGET)).toBeNull();
    const t24 = decodeTarget(5712, 4284, CONSTRAINED_BUDGET)!;
    const t48 = decodeTarget(8064, 6048, CONSTRAINED_BUDGET)!;
    for (const t of [t24, t48]) {
      expect(t.width * t.height).toBeLessThanOrEqual(CONSTRAINED_BUDGET.maxDecodePixels);
      expect(t.width * t.height).toBeLessThan(IOS_MAX_CANVAS_PIXELS);
    }
    expect(decodeTarget(8064, 6048, DESKTOP_BUDGET)).toBeNull(); // desktop keeps full resolution
  });

  it('orientedSize swaps sides for EXIF 5–8 only; sameAspect detects a stretched decode', () => {
    expect(orientedSize(4032, 3024, 6)).toEqual({ width: 3024, height: 4032 });
    expect(orientedSize(4032, 3024, 3)).toEqual({ width: 4032, height: 3024 });
    expect(orientedSize(4032, 3024, undefined)).toEqual({ width: 4032, height: 3024 });
    expect(sameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1500 })).toBe(true);
    expect(sameAspect({ width: 4000, height: 3000 }, { width: 3000, height: 4000 })).toBe(false);
  });

  it('decodeResizeWidth never exceeds the budget, whichever way the engine applies EXIF rotation', () => {
    const max = CONSTRAINED_BUDGET.maxDecodePixels;
    for (const [rawW, rawH, orientation] of [
      [8064, 6048, 6], // portrait iPhone photo: stored landscape, shown portrait
      [8064, 6048, 1],
      [6048, 8064, 8],
      [5712, 4284, 6],
    ]) {
      const shown = orientedSize(rawW, rawH, orientation);
      const rotated = shown.width !== rawW;
      const target = decodeTarget(shown.width, shown.height, CONSTRAINED_BUDGET)!;
      const rw = decodeResizeWidth(shown, target, rotated);
      // Engine A rotates first (width basis = shown width); engine B resizes the stored image first.
      for (const basis of [{ w: shown.width, h: shown.height }, { w: rawW, h: rawH }]) {
        const outH = Math.round((rw * basis.h) / basis.w);
        expect(rw * outH).toBeLessThanOrEqual(max * 1.001);
      }
      if (!rotated) expect(rw).toBe(target.width);
      else expect(rw).toBe(Math.floor(Math.min(shown.width, shown.height) * Math.min(target.width / shown.width, target.height / shown.height)));
    }
  });

  it('export guard: refuses a bitmap larger than one iOS canvas, allows it on desktop', () => {
    expect(() => checkExportSize(5712, 4284, CONSTRAINED_BUDGET)).toThrow(/too large to save on this device/);
    expect(() => checkExportSize(4032, 3024, CONSTRAINED_BUDGET)).not.toThrow();
    expect(() => checkExportSize(5712, 4284, DESKTOP_BUDGET)).not.toThrow();
  });

  it('downscaleNotice names the original size and the size that will be saved', () => {
    const n = downscaleNotice({ width: 8064, height: 6048 }, { width: 4618, height: 3464 });
    expect(n).toContain('49 MP');
    expect(n).toContain('4618 × 3464');
  });

  it('strips are ~1 MP and at least one row', () => {
    expect(stripRows(1000) * 1000).toBeLessThanOrEqual(STRIP_PIXELS);
    expect(stripRows(4032)).toBe(Math.floor(STRIP_PIXELS / 4032));
    expect(stripRows(5_000_000)).toBe(1);
  });
});

describe('OCR scale decisions', () => {
  it('never upscales big photos, even when the text looks small', () => {
    expect(chooseScale(9, 4032, 3024)).toBe(1); // 12 MP photo: was 1.125 (15.4 MP) before
    expect(chooseScale(9, 5712, 4284)).toBeLessThan(1);
    expect(chooseScale(null, 4032, 3024)).toBe(1);
    expect(4032 * 3024).toBeGreaterThan(NO_UPSCALE_ABOVE_PIXELS);
  });

  it('keeps upscaling small screenshot text (incl. 4K at 100%) within the budget', () => {
    expect(chooseScale(8, 800, 600, CONSTRAINED_BUDGET.maxOcrPixels)).toBe(MAX_UPSCALE);
    const s = chooseScale(9, 1920, 1080, CONSTRAINED_BUDGET.maxOcrPixels);
    expect(s).toBeGreaterThan(1.5);
    expect(1920 * s * 1080 * s).toBeLessThanOrEqual(CONSTRAINED_BUDGET.maxOcrPixels);
    expect(chooseScale(9, 3840, 2160)).toBeGreaterThan(1); // 8.3 MP is still allowed to upscale on desktop
  });

  it('shrinks to the OCR budget in fine steps, never above it', () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [4618, 3464],
      [8064, 6048],
      [2048, 2732],
    ]) {
      for (const max of [CONSTRAINED_BUDGET.maxOcrPixels, TIGHT_BUDGET.maxOcrPixels, DESKTOP_BUDGET.maxOcrPixels]) {
        const s = chooseScale(30, w, h, max);
        expect(Math.round(w * s) * Math.round(h * s)).toBeLessThanOrEqual(max * 1.001);
        if (w * h > max) expect(Math.round(w * s) * Math.round(h * s)).toBeGreaterThan(max * 0.98); // fine steps
      }
    }
    expect(chooseScale(30, 4032, 3024, 8_000_000)).toBe(207 / 256);
  });
});

describe('box remapping when OCR ran on a downscaled copy', () => {
  it('ocrScale is OCR px per source px on each axis', () => {
    expect(ocrScale({ width: 4032, height: 3024 }, { width: 3150, height: 2362 })).toEqual({ width: 3150 / 4032, height: 2362 / 3024 });
  });

  it('maps boxes outward so they cover every source pixel of the word (property)', () => {
    const W = 4032;
    const H = 3024;
    const sx = 3150 / W;
    const sy = 2362 / H;
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 500; i++) {
      const x0 = Math.floor(rnd() * 3000);
      const y0 = Math.floor(rnd() * 2300);
      const b = { x0, y0, x1: x0 + 1 + Math.floor(rnd() * 140), y1: y0 + 1 + Math.floor(rnd() * 60) };
      const r = mapBoxToSource(b, sx, sy, W, H);
      expect(r.x).toBeLessThanOrEqual(b.x0 / sx);
      expect(r.y).toBeLessThanOrEqual(b.y0 / sy);
      expect(r.x + r.w).toBeGreaterThanOrEqual(Math.min(W, b.x1 / sx));
      expect(r.y + r.h).toBeGreaterThanOrEqual(Math.min(H, b.y1 / sy));
      expect(r.w).toBeLessThanOrEqual((b.x1 - b.x0) / sx + 2); // and not much more
      expect(Number.isInteger(r.x) && Number.isInteger(r.w)).toBe(true);
    }
  });

  it('blocksToTokens puts a word read on the 0.78× OCR copy back at its original-photo position', () => {
    const W = 4032;
    const H = 3024;
    const ocr = { width: 3150, height: 2362 };
    const { width: scaleX, height: scaleY } = ocrScale({ width: W, height: H }, ocr);
    // "jane@example.com" occupies x 1000..1600, y 500..540 in the original photo.
    const bbox = { x0: Math.floor(1000 * scaleX), y0: Math.floor(500 * scaleY), x1: Math.ceil(1600 * scaleX), y1: Math.ceil(540 * scaleY) };
    const blocks: TessBlock[] = [{ paragraphs: [{ lines: [{ words: [{ text: 'jane@example.com', confidence: 95, bbox }] }] }] }];
    const [t] = blocksToTokens(blocks, { scaleX, scaleY, width: W, height: H });
    expect(t.text).toBe('jane@example.com');
    expect(t.box.x).toBeLessThanOrEqual(1000);
    expect(t.box.y).toBeLessThanOrEqual(500);
    expect(t.box.x + t.box.w).toBeGreaterThanOrEqual(1600);
    expect(t.box.y + t.box.h).toBeGreaterThanOrEqual(540);
    expect(t.box.x).toBeGreaterThanOrEqual(998);
    expect(t.box.x + t.box.w).toBeLessThanOrEqual(1603);
  });
});

describe('header sniffing for phone photos', () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
  const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const le16 = (n: number) => [n & 255, (n >>> 8) & 255];

  function jpeg(w: number, h: number, orientation: number | null, littleEndian = false): Uint8Array {
    const u16 = littleEndian ? le16 : be16;
    const u32 = (n: number) => (littleEndian ? [...le16(n & 0xffff), ...le16(n >>> 16)] : [...be16(n >>> 16), ...be16(n & 0xffff)]);
    const parts: Array<number[] | string> = [[0xff, 0xd8]];
    if (orientation != null) {
      const tiff = [
        ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
        ...u16(42),
        ...u32(8),
        ...u16(2), // two IFD0 entries: an unrelated one, then Orientation
        ...u16(0x010f), ...u16(2), ...u32(4), ...u32(0),
        ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
        ...u32(0),
      ];
      const payload = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
      parts.push([0xff, 0xe1, ...be16(payload.length + 2), ...payload]);
    }
    parts.push([0xff, 0xc0, 0x00, 0x11, 0x08, ...be16(h), ...be16(w), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    return bytes(...parts);
  }

  it('reads the EXIF orientation (both byte orders) next to the stored size', () => {
    expect(readImageSize(jpeg(4032, 3024, 6))).toEqual({ format: 'jpeg', width: 4032, height: 3024, orientation: 6 });
    expect(readImageSize(jpeg(4032, 3024, 8, true))).toEqual({ format: 'jpeg', width: 4032, height: 3024, orientation: 8 });
    expect(readImageSize(jpeg(4032, 3024, null))).toEqual({ format: 'jpeg', width: 4032, height: 3024 });
    expect(readImageSize(jpeg(4032, 3024, 42))).toEqual({ format: 'jpeg', width: 4032, height: 3024 }); // invalid value ignored
  });

  it('recognises HEIC containers but not AVIF', () => {
    const ftyp = (major: string, ...compat: string[]) => {
      const size = 16 + 4 * compat.length;
      return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compat);
    };
    expect(isHeif(ftyp('heic', 'mif1', 'heic'))).toBe(true);
    expect(isHeif(ftyp('mif1', 'mif1', 'heic'))).toBe(true);
    expect(isHeif(ftyp('avif', 'mif1', 'avif'))).toBe(false);
    expect(isHeif(ftyp('mif1', 'mif1', 'avif'))).toBe(false);
    expect(isHeif(jpeg(10, 10, null))).toBe(false);
  });
});

describe('time-sliced pixel work', () => {
  it('generator kernels give the same result as the plain functions', () => {
    const w = 120;
    const h = 80;
    const g = new Uint8Array(w * h).map((_, i) => ((i % w) < 50 ? 25 : 235));
    expect(runSync(polarityMaskSteps(g, w, h, 12, false, 5))).toEqual(polarityMask(g, w, h, 12, false, 5));
  });

  it('timeSlicer yields once a slice has used its time; syncSlicer never does', async () => {
    function* busy(steps: number, msEach: number): Steps<number> {
      for (let i = 0; i < steps; i++) {
        const end = performance.now() + msEach;
        while (performance.now() < end) {
          /* spin */
        }
        yield;
      }
      return steps;
    }
    let yields = 0;
    const slicer = timeSlicer(10, async () => {
      yields++;
    });
    expect(await slicer.run(busy(12, 3))).toBe(12); // 36 ms of work in 10 ms slices
    expect(yields).toBeGreaterThanOrEqual(2);
    expect(yields).toBeLessThanOrEqual(6);
    expect(await syncSlicer.run(busy(3, 1))).toBe(3);
  });
});

// --- decode fallback chain ---------------------------------------------------------------------------

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };
const g = globalThis as Record<string, unknown>;
const originalCib = g.createImageBitmap;
afterEach(() => {
  g.createImageBitmap = originalCib;
  vi.useRealTimers();
});

function jpegFile(w: number, h: number, orientation: number | null): Blob {
  const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const parts: number[] = [0xff, 0xd8];
  if (orientation != null) {
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, ...be16(orientation), 0, 0, 0, 0, 0, 0];
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    parts.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload);
  }
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, ...be16(h), ...be16(w), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  return new Blob([new Uint8Array(parts)], { type: 'image/jpeg' });
}

const fake = (width: number, height: number): FakeBitmap => ({ width, height, close: vi.fn() });

describe('decodeImageDetailed (phone budget)', () => {
  it('shrinks a 48 MP photo while decoding, passing only resizeWidth, and reports the original size', async () => {
    const calls: unknown[] = [];
    g.createImageBitmap = vi.fn(async (_src: unknown, opts?: ImageBitmapOptions) => {
      calls.push(opts);
      const w = opts?.resizeWidth ?? 8064;
      return fake(w, Math.round((w * 6048) / 8064));
    });
    const d = await decodeImageDetailed(jpegFile(8064, 6048, 1), CONSTRAINED_BUDGET);
    expect(calls[0]).toMatchObject({ imageOrientation: 'from-image', resizeQuality: 'high' });
    expect((calls[0] as ImageBitmapOptions).resizeHeight).toBeUndefined();
    expect(d.original).toEqual({ width: 8064, height: 6048 });
    expect(d.downscaled).toBe(true);
    expect(d.bitmap.width * d.bitmap.height).toBeLessThanOrEqual(CONSTRAINED_BUDGET.maxDecodePixels);
  });

  it('uses the shown (EXIF-rotated) size for a portrait photo', async () => {
    g.createImageBitmap = vi.fn(async (_src: unknown, opts?: ImageBitmapOptions) => {
      const w = opts?.resizeWidth ?? 6048;
      return fake(w, Math.round((w * 8064) / 6048)); // engine rotates first
    });
    const d = await decodeImageDetailed(jpegFile(8064, 6048, 6), CONSTRAINED_BUDGET);
    expect(d.original).toEqual({ width: 6048, height: 8064 });
    expect(d.bitmap.height).toBeGreaterThan(d.bitmap.width);
    expect(d.bitmap.width * d.bitmap.height).toBeLessThanOrEqual(CONSTRAINED_BUDGET.maxDecodePixels * 1.001);
  });

  it("falls back when 'from-image' is rejected, and shrinks after decoding when resize options are ignored", async () => {
    const full = fake(8064, 6048);
    const small = fake(4618, 3464);
    g.createImageBitmap = vi.fn(async (src: unknown, opts?: ImageBitmapOptions) => {
      if (opts?.imageOrientation) throw new TypeError("The provided value 'from-image' is not a valid enum value");
      if (src === full) return opts?.resizeWidth ? fake(opts.resizeWidth, opts.resizeHeight!) : small;
      return full; // ignores resizeWidth
    });
    const d = await decodeImageDetailed(jpegFile(8064, 6048, null), CONSTRAINED_BUDGET);
    expect(full.close).toHaveBeenCalled(); // the 48 MP bitmap is not kept
    expect(d.bitmap.width * d.bitmap.height).toBeLessThanOrEqual(CONSTRAINED_BUDGET.maxDecodePixels);
    expect(d.downscaled).toBe(true);
  });

  it('keeps 12 MP photos at full size on phones and everything at full size on desktop', async () => {
    g.createImageBitmap = vi.fn(async (_src: unknown, opts?: ImageBitmapOptions) => {
      expect(opts?.resizeWidth).toBeUndefined();
      return fake(4032, 3024);
    });
    expect((await decodeImageDetailed(jpegFile(4032, 3024, 1), CONSTRAINED_BUDGET)).downscaled).toBe(false);
    g.createImageBitmap = vi.fn(async () => fake(8064, 6048));
    expect((await decodeImageDetailed(jpegFile(8064, 6048, 1), DESKTOP_BUDGET)).downscaled).toBe(false);
  });

  it('gives a HEIC-specific message when a HEIC file cannot be decoded', async () => {
    g.createImageBitmap = vi.fn(async () => {
      throw new Error('decode failed');
    });
    const heic = new Blob([new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63, 1, 2, 3])]);
    await expect(decodeImageDetailed(heic, CONSTRAINED_BUDGET)).rejects.toThrow(/HEIC/);
    const named = new File([new Uint8Array([1, 2, 3, 4])], 'IMG_0001.HEIC', { type: '' });
    await expect(decodeImageDetailed(named, CONSTRAINED_BUDGET)).rejects.toThrow(/HEIC/);
  });

  it('never hangs: a decode that does not finish fails with a friendly message', async () => {
    vi.useFakeTimers();
    g.createImageBitmap = vi.fn(() => new Promise(() => undefined));
    const p = decodeImageDetailed(jpegFile(4032, 3024, 1), CONSTRAINED_BUDGET);
    const check = expect(p).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS + 10);
    await check;
  });
});
