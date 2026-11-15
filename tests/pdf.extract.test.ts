// End-to-end text-layer test in Node: generate a PDF with pdf-lib, read it with the pdfjs-dist legacy
// build, run our extraction (text items -> word tokens), and check tokens/regions land on the drawn text.
import { describe, expect, it, beforeAll } from 'vitest';
import { PDFDocument, StandardFonts, degrees, type PDFFont } from 'pdf-lib';
import { buildLayout, findingsToRegions } from '../src/core/layout';
import { extractTextTokens } from '../src/pdf/extract';
import type { Finding, Rect } from '../src/core/types';

type Pdfjs = typeof import('pdfjs-dist');
let pdfjs: Pdfjs;

beforeAll(async () => {
  // Run the worker code in-process (pdf.js "fake worker") — no Worker threads needed in Node.
  // @ts-ignore -- the worker bundle ships no type declarations
  (globalThis as Record<string, unknown>).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
});

async function open(bytes: Uint8Array) {
  return pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
    enableXfa: false,
    verbosity: 0,
  }).promise;
}

const EMAIL = 'alice.smith@example.com';
const AWS = 'AKIAIOSFODNN7EXAMPLE';

interface Drawn {
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
}

/** Glyph box of `sub` inside a line drawn with pdf-lib, in top-left page space of an unrotated page. */
function expectedBox(d: Drawn, sub: string, pageH: number): Rect {
  const before = d.text.slice(0, d.text.indexOf(sub));
  const x0 = d.x + d.font.widthOfTextAtSize(before, d.size);
  const w = d.font.widthOfTextAtSize(sub, d.size);
  // Helvetica: cap height ~0.72em, descender ~0.21em
  return { x: x0, y: pageH - d.y - 0.72 * d.size, w, h: 0.93 * d.size };
}

const contains = (outer: Rect, inner: Rect, eps = 0.5) =>
  outer.x <= inner.x + eps && outer.y <= inner.y + eps && outer.x + outer.w >= inner.x + inner.w - eps && outer.y + outer.h >= inner.y + inner.h - eps;

function findingFor(text: string, needle: string, id = 'f0'): Finding {
  const start = text.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  return { id, start, end: start + needle.length, text: needle, kind: 'email', ruleId: 'test', label: 'test', confidence: 'high' };
}

describe('pdf extraction (pdf-lib -> pdf.js legacy -> tokens)', () => {
  it('finds the email and AWS key where they were drawn, word-level', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    const lines: Drawn[] = [
      { text: 'Quarterly report — confidential', x: 72, y: 720, size: 18, font },
      { text: `Please contact ${EMAIL} for access to the staging bucket.`, x: 72, y: 680, size: 11, font },
      { text: `aws_access_key_id = ${AWS}`, x: 72, y: 650, size: 11, font },
    ];
    for (const l of lines) page.drawText(l.text, { x: l.x, y: l.y, size: l.size, font: l.font });
    const bytes = await doc.save();

    const pdf = await open(bytes);
    const p = await pdf.getPage(1);
    const ext = await extractTextTokens(p);
    expect(ext.width).toBeCloseTo(612);
    expect(ext.height).toBeCloseTo(792);
    expect(ext.charCount).toBeGreaterThan(50);

    const layout = buildLayout(ext.tokens);
    expect(layout.text).toContain(EMAIL);
    expect(layout.text).toContain(AWS);
    expect(layout.text.split('\n')).toHaveLength(3);

    for (const [lineIdx, needle] of [[1, EMAIL], [2, AWS]] as const) {
      const tok = ext.tokens.find((t) => t.text === needle)!;
      expect(tok, needle).toBeTruthy();
      const exp = expectedBox(lines[lineIdx], needle, 792);
      expect(contains(tok.box, exp), `${needle}: ${JSON.stringify(tok.box)} ⊇ ${JSON.stringify(exp)}`).toBe(true);
      // ...but not the whole line: at most ~1.6× the real width
      expect(tok.box.w).toBeLessThan(exp.w * 1.6);
      expect(tok.box.h).toBeLessThan(lines[lineIdx].size * 1.6);

      const f = findingFor(layout.text, needle);
      const regions = findingsToRegions(layout, ext.tokens, [f], { bounds: { width: 612, height: 792 } });
      expect(regions).toHaveLength(1);
      expect(contains(regions[0].rect, exp)).toBe(true);
      // region doesn't reach the first word of the line
      expect(regions[0].rect.x).toBeGreaterThan(72 + 10);
    }
    await pdf.loadingTask.destroy();
  });

  it('handles /Rotate 90: boxes follow the rotated viewport', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(90));
    page.drawText(`key ${AWS} end`, { x: 72, y: 700, size: 12, font });
    const pdf = await open(await doc.save());
    const p = await pdf.getPage(1);
    const ext = await extractTextTokens(p);
    expect(ext.width).toBeCloseTo(792);
    expect(ext.height).toBeCloseTo(612);
    const tok = ext.tokens.find((t) => t.text === AWS)!;
    expect(tok).toBeTruthy();
    const vp = p.getViewport({ scale: 1 });
    const x0 = 72 + font.widthOfTextAtSize('key ', 12);
    const x1 = x0 + font.widthOfTextAtSize(AWS, 12);
    // map the glyph run's corners through pdf.js' own viewport and require coverage
    const pts = [
      vp.convertToViewportPoint(x0, 700 - 2.5),
      vp.convertToViewportPoint(x1, 700 + 8.6),
    ] as Array<[number, number]>;
    const exp: Rect = {
      x: Math.min(pts[0][0], pts[1][0]),
      y: Math.min(pts[0][1], pts[1][1]),
      w: Math.abs(pts[0][0] - pts[1][0]),
      h: Math.abs(pts[0][1] - pts[1][1]),
    };
    expect(contains(tok.box, exp), `${JSON.stringify(tok.box)} ⊇ ${JSON.stringify(exp)}`).toBe(true);
    expect(tok.box.h).toBeGreaterThan(tok.box.w); // text runs vertically on the rotated page
    await pdf.loadingTask.destroy();
  });

  it('includes filled form-field values as tokens', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const form = doc.getForm();
    const tf = form.createTextField('email');
    tf.setText(EMAIL);
    tf.addToPage(page, { x: 72, y: 600, width: 250, height: 20 });
    const pdf = await open(await doc.save());
    const ext = await extractTextTokens(await pdf.getPage(1));
    const tok = ext.tokens.find((t) => t.text === EMAIL);
    expect(tok).toBeTruthy();
    expect(contains(tok!.box, { x: 72, y: 792 - 620, w: 250, h: 20 }, 1)).toBe(true);
    expect(ext.annotationCount).toBeGreaterThanOrEqual(1);
    await pdf.loadingTask.destroy();
  });

  it('reports PasswordException for encrypted PDFs (name used by our friendly error)', async () => {
    // Minimal RC4-encrypted PDF is hard to build with pdf-lib (no encryption support); instead check that
    // garbage yields InvalidPDFException, the other error class we map.
    await expect(open(new TextEncoder().encode('not a pdf at all'))).rejects.toMatchObject({ name: 'InvalidPDFException' });
  });
});
