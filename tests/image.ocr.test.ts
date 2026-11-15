// End-to-end OCR in Node with the REAL tesseract.js v7 + the shipped traineddata (from node_modules,
// no network): validates the v7 `blocks` output format, our preprocessing (dark theme, 12 px text),
// coordinate mapping back to the original image and line reconstruction.
// The browser path differs only in using canvas for decode/resize/encode.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore -- no @types/node in this project; vitest runs in Node
import zlib from 'node:zlib';
// @ts-ignore -- see above
import { fileURLToPath } from 'node:url';
import Tesseract from 'tesseract.js';
import { applyTonePlanRgba, prepareOcr, rgbaToGray } from '../src/image/preprocess';
import { blocksToTokens, type TessBlock } from '../src/image/tokens';
import { OCR_PARAMS } from '../src/image/params';
import { LANG_DATA_VERSION } from '../src/image/assets';
import { buildLayout } from '../src/core/layout';

// 520×130 dark-theme UI snippet (#1e1f22 background, #dcdcdc 12 px Segoe UI text).
const FIXTURE_DARK_PNG =
  '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';

// --- minimal PNG codec + bilinear resize (stand-ins for the browser canvas) -----------------------

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function decodePng(buf: Uint8Array): { w: number; h: number; rgba: Uint8ClampedArray } {
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat: Uint8Array[] = [];
  while (o < buf.length) {
    const len = u32(buf, o);
    const type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
    const d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = u32(d, 0);
      h = u32(d, 4);
      ct = d[9];
    }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((off, d) => (all.set(d, off), off + d.length), 0);
  const raw: Uint8Array = zlib.inflateSync(all);
  const stride = w * bpp;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + p) & 255;
    }
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (bpp === 1) rgba.set([px[i], px[i], px[i], 255], i * 4);
    else rgba.set([px[i * bpp], px[i * bpp + 1], px[i * bpp + 2], bpp === 4 ? px[i * 4 + 3] : 255], i * 4);
  }
  return { w, h, rgba };
}

function crc32(b: Uint8Array): number {
  let crc = ~0;
  for (const x of b) {
    let c = (crc ^ x) & 255;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function encodePng(w: number, h: number, rgba: Uint8ClampedArray): Uint8Array {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const parts: number[][] = [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]];
  const chunk = (type: string, data: Uint8Array) => {
    const td = new Uint8Array(4 + data.length);
    td.set([...type].map((c) => c.charCodeAt(0)));
    td.set(data, 4);
    parts.push(be(data.length), Array.from(td), be(crc32(td)));
  };
  chunk('IHDR', new Uint8Array([...be(w), ...be(h), 8, 6, 0, 0, 0]));
  chunk('IDAT', new Uint8Array(zlib.deflateSync(raw)));
  chunk('IEND', new Uint8Array(0));
  return new Uint8Array(parts.flat());
}

function resize(src: Uint8ClampedArray, w: number, h: number, ow: number, oh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const sy = Math.max(0, ((y + 0.5) * h) / oh - 0.5);
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < ow; x++) {
      const sx = Math.max(0, ((x + 0.5) * w) / ow - 0.5);
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const top = src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx;
        const bot = src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx;
        out[(y * ow + x) * 4 + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return out;
}

// --- the test ------------------------------------------------------------------------------------

let worker: Tesseract.Worker;

beforeAll(async () => {
  const langPath = fileURLToPath(new URL(`../node_modules/@tesseract.js-data/eng/${LANG_DATA_VERSION}`, import.meta.url));
  worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, { langPath, cacheMethod: 'none' });
  await worker.setParameters(OCR_PARAMS as unknown as Partial<Tesseract.WorkerParams>);
}, 60_000);

afterAll(async () => {
  await worker?.terminate();
});

describe('OCR pipeline (Node, real tesseract.js v7)', () => {
  it('reads a small dark-theme screenshot exactly and maps boxes to original pixels', async () => {
    const { w, h, rgba } = decodePng(b64(FIXTURE_DARK_PNG));
    expect([w, h]).toEqual([520, 130]);

    const prep = prepareOcr(rgbaToGray(rgba), w, h, w, h);
    expect(prep.plan.inverted).toBe(true);
    expect(prep.scale).toBeGreaterThan(2); // 12 px text gets upscaled

    const ow = Math.round(w * prep.scale);
    const oh = Math.round(h * prep.scale);
    const big = resize(rgba, w, h, ow, oh);
    applyTonePlanRgba(big, ow, oh, prep.plan);
    const png = encodePng(ow, oh, big);
    const res = await worker.recognize(png as unknown as Tesseract.ImageLike, {}, { blocks: true, text: false });

    const tokens = blocksToTokens(res.data.blocks as unknown as TessBlock[], { scaleX: ow / w, scaleY: oh / h, width: w, height: h });
    const { text } = buildLayout(tokens);
    expect(text.split('\n')).toEqual([
      'Account settings',
      'Sidebar: Team',
      'Email: jane.doe@example.com',
      'API key: sk_live_51HxQ2aBcDeFgH7kLmNoPq',
      'Server 192.168.10.24 port 8443',
      'Card 4242 4242 4242 4242 exp 12/29',
    ]);

    // Boxes are in ORIGINAL pixels: the email is drawn at x≈46..175, y≈30..45.
    const email = tokens.find((t) => t.text === 'jane.doe@example.com')!;
    expect(email.box.x).toBeGreaterThanOrEqual(40);
    expect(email.box.x).toBeLessThanOrEqual(50);
    expect(email.box.x + email.box.w).toBeGreaterThanOrEqual(170);
    expect(email.box.x + email.box.w).toBeLessThanOrEqual(180);
    expect(email.box.y).toBeGreaterThanOrEqual(26);
    expect(email.box.y + email.box.h).toBeLessThanOrEqual(48);
    for (const t of tokens) {
      expect(t.box.x + t.box.w).toBeLessThanOrEqual(w);
      expect(t.box.y + t.box.h).toBeLessThanOrEqual(h);
    }
  }, 60_000);
});
