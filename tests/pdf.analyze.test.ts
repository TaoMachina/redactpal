// analyzePdf() end to end in Node (text pages only — OCR/rendering need a browser).
import { beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-ignore -- no @types/node in this project; vitest runs in Node
import zlib from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { analyzePdf, MAX_PAGES, OCR_FAILED_WARNING, PdfError } from '../src/pdf';

beforeAll(async () => {
  // pdf.js "fake worker": run the worker code in-process (no Worker in Node).
  // @ts-ignore -- the worker bundle ships no type declarations
  (globalThis as Record<string, unknown>).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
});

const EMAIL = 'alice.smith@example.com';
const AWS = 'AKIAIOSFODNN7EXAMPLE';

async function samplePdf(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle('Secret plan');
  doc.setAuthor('Alice Smith');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  p1.drawText(`Please contact ${EMAIL} for access.`, { x: 72, y: 700, size: 11, font });
  p1.drawText(`aws_access_key_id = ${AWS}`, { x: 72, y: 670, size: 11, font });
  const p2 = doc.addPage([400, 300]);
  p2.drawText('Nothing sensitive on this page, just a sentence.', { x: 20, y: 250, size: 10, font });
  return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

describe('analyzePdf (Node, text layer)', () => {
  it('extracts tokens, detects secrets, maps regions onto the drawn text, reads metadata', async () => {
    const progress: string[] = [];
    const a = await analyzePdf(await samplePdf(), {}, (_f, m) => m && progress.push(m));
    try {
      expect(a.pageCount).toBe(2);
      expect(progress).toContain('Reading page 1 of 2…');
      expect(progress).toContain('Reading page 2 of 2…');
      expect(a.metadata.Title).toBe('Secret plan');
      expect(a.metadata.Author).toBe('Alice Smith');

      const [p1, p2] = a.pages;
      expect(p1.width).toBeCloseTo(612);
      expect(p2.width).toBeCloseTo(400);
      expect(p1.scanned).toBe(false);
      expect(p1.warning).toBeUndefined();
      expect(p2.warning).toBeUndefined();
      expect(p1.text).toContain(EMAIL);
      const kinds = p1.findings.map((f) => f.kind);
      expect(kinds).toContain('email');
      expect(kinds).toContain('api_key');

      const email = p1.regions.find((r) => r.kind === 'email')!;
      const key = p1.regions.find((r) => r.kind === 'api_key')!;
      // email baseline at y = 792-700 = 92, AWS at 122; regions cover their own line only
      expect(email.rect.y).toBeLessThan(92 - 7);
      expect(email.rect.y + email.rect.h).toBeGreaterThan(92 + 1);
      expect(email.rect.y + email.rect.h).toBeLessThan(122 - 7);
      expect(key.rect.y).toBeGreaterThan(92);
      // word-level: the region starts after "Please contact " and after "aws_access_key_id = "
      expect(email.rect.x).toBeGreaterThan(72 + 50);
      expect(key.rect.x).toBeGreaterThan(72 + 80);
      expect(email.enabled).toBe(true);
      expect(new Set(a.pages.flatMap((p) => p.regions.map((r) => r.id))).size).toBe(a.pages.flatMap((p) => p.regions).length);
    } finally {
      a.dispose();
    }
  });

  it('friendly error for non-PDF input', async () => {
    await expect(analyzePdf(new Blob(['hello, not a pdf']))).rejects.toMatchObject({ name: 'PdfError', code: 'invalid' });
    await expect(analyzePdf(new Blob([]))).rejects.toBeInstanceOf(PdfError);
  });

  it(`refuses more than ${MAX_PAGES} pages`, async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i <= MAX_PAGES; i++) doc.addPage([100, 100]);
    const blob = new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>]);
    await expect(analyzePdf(blob)).rejects.toMatchObject({ code: 'too_many_pages' });
  });
});

/** Tiny grey RGB PNG (stand-in for a scanned page image). */
function grayPng(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: Uint8Array) => {
    const td = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data]));
    return [...be(data.length), ...td, ...be(crc(td))];
  };
  const raw = new Uint8Array((w * 3 + 1) * h).fill(200);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const ihdr = new Uint8Array([...be(w), ...be(h), 8, 2, 0, 0, 0]);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IDAT', zlib.deflateSync(raw)), ...chunk('IEND', new Uint8Array())]);
}

describe('analyzePdf: OCR decisions, failures and cancel (Node: OCR always fails, there is no canvas)', () => {
  async function pdfWith(build: (doc: PDFDocument) => Promise<void>): Promise<Blob> {
    const doc = await PDFDocument.create();
    await build(doc);
    return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  }

  it('a page whose OCR throws gets a warning; analysis keeps going', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const blob = await pdfWith(async (doc) => {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.addPage([300, 300]); // no text layer => whole-page OCR (fails in Node)
      doc.addPage([300, 300]).drawText(`Mail ${EMAIL} please, thank you.`, { x: 10, y: 250, size: 10, font });
    });
    const a = await analyzePdf(blob);
    try {
      expect(a.pages).toHaveLength(2);
      expect(a.pages[0].warning).toBe(OCR_FAILED_WARNING);
      expect(a.pages[0].scanned).toBe(false);
      expect(a.pages[1].warning).toBeUndefined();
      expect(a.pages[1].findings.map((f) => f.kind)).toContain('email');
    } finally {
      a.dispose();
      warn.mockRestore();
    }
  });

  it('a scan with a stamped text header (>= 20 chars) is still OCR-ed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const blob = await pdfWith(async (doc) => {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const img = await doc.embedPng(grayPng(8, 8));
      const p = doc.addPage([612, 792]);
      p.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
      p.drawText('CONFIDENTIAL \u2013 Page 1 of 3', { x: 220, y: 770, size: 10, font });
    });
    const a = await analyzePdf(blob);
    try {
      const [p] = a.pages;
      expect(p.text).toContain('CONFIDENTIAL');
      // The full-page image was sent to OCR (which can only fail in Node) instead of being skipped.
      expect(p.warning).toBe(OCR_FAILED_WARNING);
    } finally {
      a.dispose();
      warn.mockRestore();
    }
  });

  it('rejects with AbortError when the signal is aborted (before start, or between pages)', async () => {
    const isAbort = { name: 'AbortError' };
    const pre = new AbortController();
    pre.abort();
    await expect(analyzePdf(await samplePdf(), { signal: pre.signal })).rejects.toMatchObject(isAbort);

    const ac = new AbortController();
    const seen: string[] = [];
    const run = analyzePdf(await samplePdf(), { signal: ac.signal }, (_f, m) => {
      if (m) seen.push(m);
      if (m === 'Reading page 2 of 2\u2026') ac.abort();
    });
    // Aborting during page 2 still finishes that page's work, then stops before anything else.
    await expect(run).rejects.toBeInstanceOf(DOMException);
    await expect(run).rejects.toMatchObject(isAbort);
    expect(seen).not.toContain('Done');
  });
});
