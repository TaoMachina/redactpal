// Output-side test in Node: pixels -> flattened PDF (pdf-lib + CompressionStream) -> read back with pdf.js.
import { beforeAll, describe, expect, it } from 'vitest';
import { addFlatePage, createOutputDoc, saveOutput } from '../src/pdf/flatten';

type Pdfjs = typeof import('pdfjs-dist');
let pdfjs: Pdfjs;

beforeAll(async () => {
  // @ts-ignore -- the worker bundle ships no type declarations
  (globalThis as Record<string, unknown>).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
});

function pixels(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  return d;
}

async function decodedImage(page: Awaited<ReturnType<Awaited<ReturnType<Pdfjs['getDocument']>['promise']>['getPage']>>) {
  const ops = await page.getOperatorList();
  const idx = ops.fnArray.findIndex((f) => f === pdfjs.OPS.paintImageXObject);
  expect(idx).toBeGreaterThanOrEqual(0);
  const id = (ops.argsArray[idx] as unknown[])[0] as string;
  return new Promise<{ width: number; height: number; data: Uint8ClampedArray; kind: number }>((resolve) =>
    (page.objs as unknown as { get(id: string, cb: (v: unknown) => void): void }).get(id, (v) => resolve(v as never)),
  );
}

function rgbAt(img: { width: number; data: Uint8ClampedArray; kind: number }, x: number, y: number): number[] {
  const bpp = img.kind === pdfjs.ImageKind.RGBA_32BPP ? 4 : 3;
  const i = (y * img.width + x) * bpp;
  return Array.from(img.data.slice(i, i + 3));
}

describe('flattened PDF output', () => {
  it('writes lossless Flate pages (RGB and grey) with minimal metadata', async () => {
    const out = await createOutputDoc();
    const w = 60, h = 40;
    // colour page: red background, a black "redaction" box at (10..29, 5..14)
    const rgb = pixels(w, h, (x, y) => (x >= 10 && x < 30 && y >= 5 && y < 15 ? [0, 0, 0] : [200, 30, 40]));
    await addFlatePage(out, 300, 200, rgb, w, h, false);
    // grey page: white with a black box
    const gray = pixels(w, h, (x, y) => (x >= 40 && y >= 20 ? [0, 0, 0] : [255, 255, 255]));
    await addFlatePage(out, 612, 792, gray, w, h, true);
    const blob = await saveOutput(out);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    expect(doc.numPages).toBe(2);
    const { info, metadata } = (await doc.getMetadata()) as { info: Record<string, unknown>; metadata: unknown };
    expect(info.Producer).toBe('RedactPal');
    for (const k of ['Title', 'Author', 'Creator', 'Subject', 'Keywords', 'CreationDate', 'ModDate']) expect(info[k], k).toBeUndefined();
    expect(metadata).toBeFalsy(); // no XMP

    const p1 = await doc.getPage(1);
    expect(p1.getViewport({ scale: 1 }).width).toBeCloseTo(300);
    expect(p1.getViewport({ scale: 1 }).height).toBeCloseTo(200);
    expect((await p1.getTextContent()).items).toHaveLength(0); // no text layer at all
    const img1 = await decodedImage(p1);
    expect([img1.width, img1.height]).toEqual([w, h]);
    expect(rgbAt(img1, 0, 0)).toEqual([200, 30, 40]);
    expect(rgbAt(img1, 15, 10)).toEqual([0, 0, 0]);
    expect(rgbAt(img1, 59, 39)).toEqual([200, 30, 40]);

    const p2 = await doc.getPage(2);
    expect(p2.getViewport({ scale: 1 }).width).toBeCloseTo(612);
    const img2 = await decodedImage(p2);
    expect(rgbAt(img2, 5, 5)).toEqual([255, 255, 255]);
    expect(rgbAt(img2, 50, 30)).toEqual([0, 0, 0]);
    await doc.loadingTask.destroy();
  });
});
