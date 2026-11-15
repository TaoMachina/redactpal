// pdf.js page -> positioned word Tokens (page space, scale 1, top-left origin).
// Uses only the pdf.js page API (no DOM), so it also runs in Node tests with the legacy build.
import type { PDFPageProxy } from 'pdfjs-dist';
import type { Token } from '../core/types';
import { aabb, clipRect, itemsToTokens, type TextItemLike, type TextStyleLike } from './geometry';

export interface ExtractedText {
  width: number;
  height: number;
  /** Tokens from the text layer, then form-field / FreeText annotation values. */
  tokens: Token[];
  /** Non-whitespace characters in the text layer (scanned-page heuristic). */
  charCount: number;
  annotationCount: number;
}

interface AnnotationLike {
  subtype?: string;
  rect?: number[];
  fieldValue?: unknown;
  contentsObj?: { str?: string };
  textContent?: string[];
}

function annotationText(a: AnnotationLike): string {
  if (a.subtype === 'Widget') {
    const v = a.fieldValue;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(' ');
    return '';
  }
  if (a.subtype === 'FreeText') return a.contentsObj?.str || (a.textContent ?? []).join(' ');
  return '';
}

export async function extractTextTokens(page: PDFPageProxy): Promise<ExtractedText> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = (tc.items as unknown[]).filter((i): i is TextItemLike => typeof (i as TextItemLike).str === 'string');
  let charCount = 0;
  for (const it of items) charCount += it.str.replace(/\s+/g, '').length;
  const tokens = itemsToTokens(items, tc.styles as Record<string, TextStyleLike>, vp);

  // Form field values and FreeText annotations are painted onto the page but are not part of the
  // text layer. Add them as whole-annotation tokens so detection sees them too.
  let annotationCount = 0;
  try {
    const annots = (await page.getAnnotations({ intent: 'display' })) as AnnotationLike[];
    annotationCount = annots.length;
    let line = tokens.length ? tokens[tokens.length - 1].line + 1 : 0;
    for (const a of annots) {
      const text = annotationText(a).replace(/\s+/g, ' ').trim();
      if (!text || !a.rect || a.rect.length < 4) continue;
      const [x1, y1, x2, y2] = a.rect;
      const p1 = vp.convertToViewportPoint(x1, y1) as [number, number];
      const p2 = vp.convertToViewportPoint(x2, y2) as [number, number];
      const box = clipRect(aabb([p1, p2]), vp.width, vp.height);
      if (!box) continue;
      tokens.push({ text, box, line: line++ });
    }
  } catch {
    // Annotations are best effort.
  }
  return { width: vp.width, height: vp.height, tokens, charCount, annotationCount };
}
