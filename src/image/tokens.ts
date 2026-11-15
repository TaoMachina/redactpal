// Convert tesseract.js v7 `blocks` output (recognize(img, {}, { blocks: true })) into Redactly tokens.
// Pure, no DOM -> unit-testable in Node.
//
// Reading order: Tesseract's own page layout (PSM 3) recognises words well, but on UI screenshots it
// often cuts aligned/monospaced content (logs, tables, terminals) into column blocks and returns them
// column by column — "user=bob." in one block, "smith@corp.com" in another. Detection needs
// "key: value" and emails on one line, so we rebuild lines geometrically:
//   1. split each Tesseract line at very large horizontal gaps (separate UI columns),
//   2. cluster the pieces into visual rows by vertical overlap,
//   3. within a row, join pieces left-to-right unless a large gap separates them (new line), and glue
//      pieces that touch (a word Tesseract cut in half at a column boundary).
// Lines are then numbered top-to-bottom, left-to-right.
import type { Rect, Token } from '../core/types';
import { mapBoxToSource, type Bbox } from './preprocess';

/** Minimal structural view of tesseract.js v7 `data.blocks` (block > paragraph > line > word). */
export interface TessWord {
  text: string;
  confidence: number;
  bbox: Bbox;
}
export interface TessLine {
  words: TessWord[];
  bbox?: Bbox;
}
export interface TessParagraph {
  lines: TessLine[];
}
export interface TessBlock {
  paragraphs: TessParagraph[];
}

/** A gap wider than this many text heights separates columns (-> different lines). */
export const COLUMN_GAP = 3;
/** Pieces of different Tesseract lines closer than this many text heights are one word. */
export const GLUE_GAP = 0.12;

/**
 * Words that are almost certainly UI chrome misread as text (borders, separators, icon edges):
 * only quote/bar/tilde-like glyphs AND very low confidence. Anything with letters, digits or
 * secret-relevant punctuation (@ . : / = _ - +) is always kept — confidence alone never drops a word.
 */
const CHROME_ONLY = /^[|¦‖`~'"‘’“”«»—–]+$/;
export function isLikelyGarbage(text: string, confidence: number): boolean {
  return confidence < 30 && CHROME_ONLY.test(text);
}

export interface TokenMapping {
  scaleX: number;
  scaleY: number;
  /** Original (source) image size, for clamping. */
  width: number;
  height: number;
}

interface Word {
  text: string;
  box: Rect;
}
interface Piece {
  words: Word[];
  src: number; // index of the Tesseract line it came from
  x0: number;
  x1: number;
  y0: number; // robust (median) vertical extent
  y1: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function makePiece(words: Word[], src: number): Piece {
  return {
    words,
    src,
    x0: Math.min(...words.map((w) => w.box.x)),
    x1: Math.max(...words.map((w) => w.box.x + w.box.w)),
    y0: median(words.map((w) => w.box.y)),
    y1: median(words.map((w) => w.box.y + w.box.h)),
  };
}

const height = (p: { y0: number; y1: number }) => Math.max(1, p.y1 - p.y0);

/** Flatten Tesseract blocks into word tokens (source px) with geometric line numbers. */
export function blocksToTokens(blocks: TessBlock[] | null | undefined, m: TokenMapping): Token[] {
  if (!blocks) return [];

  // 1) Words per Tesseract line, mapped to source pixels, split at column-sized gaps.
  const pieces: Piece[] = [];
  let src = 0;
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const ln of para.lines ?? []) {
        const words: Word[] = [];
        for (const w of ln.words ?? []) {
          const text = (w.text ?? '').trim();
          if (!text || isLikelyGarbage(text, w.confidence)) continue;
          const box = mapBoxToSource(w.bbox, m.scaleX, m.scaleY, m.width, m.height);
          if (box.w <= 0 || box.h <= 0) continue;
          words.push({ text, box });
        }
        if (words.length) {
          words.sort((a, b) => a.box.x - b.box.x);
          const h = median(words.map((w) => w.box.h));
          let cur: Word[] = [words[0]];
          for (let i = 1; i < words.length; i++) {
            const prev = words[i - 1];
            if (words[i].box.x - (prev.box.x + prev.box.w) > COLUMN_GAP * h) {
              pieces.push(makePiece(cur, src));
              cur = [];
            }
            cur.push(words[i]);
          }
          pieces.push(makePiece(cur, src));
        }
        src++;
      }
    }
  }
  return piecesToTokens(pieces);
}

function piecesToTokens(pieces: Piece[]): Token[] {
  // 2) Cluster into rows by vertical overlap (pieces visited top to bottom).
  pieces.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const rows: { y0: number; y1: number; pieces: Piece[] }[] = [];
  for (const p of pieces) {
    let best: (typeof rows)[number] | null = null;
    let bestRatio = 0.5; // need ≥ 50% overlap of the smaller height
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 8; i--) {
      const r = rows[i];
      const ov = Math.min(r.y1, p.y1) - Math.max(r.y0, p.y0);
      const ratio = ov / Math.min(height(r), height(p));
      if (ratio >= bestRatio) {
        bestRatio = ratio;
        best = r;
      }
    }
    if (best) {
      const n = best.pieces.length;
      best.y0 = (best.y0 * n + p.y0) / (n + 1);
      best.y1 = (best.y1 * n + p.y1) / (n + 1);
      best.pieces.push(p);
    } else {
      rows.push({ y0: p.y0, y1: p.y1, pieces: [p] });
    }
  }
  rows.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));

  // 3) Within a row: left to right; big gap -> new line; touching pieces of different lines -> glue.
  const tokens: Token[] = [];
  let line = 0;
  for (const row of rows) {
    const ps = row.pieces.sort((a, b) => a.x0 - b.x0);
    const h = height(row);
    let lineTokens: Token[] = [];
    let prev: Piece | null = null;
    const flush = () => {
      if (lineTokens.length) {
        tokens.push(...lineTokens);
        line++;
      }
      lineTokens = [];
    };
    for (const p of ps) {
      if (prev) {
        const gap = p.x0 - prev.x1;
        if (gap > COLUMN_GAP * h) flush();
        else if (gap <= GLUE_GAP * h && p.src !== prev.src && lineTokens.length) {
          // A word cut in two by Tesseract's column split: merge into the previous token.
          const last = lineTokens[lineTokens.length - 1];
          const first = p.words[0];
          last.text += first.text;
          last.box = union(last.box, first.box);
          for (const w of p.words.slice(1)) lineTokens.push({ text: w.text, box: w.box, line });
          prev = p;
          continue;
        }
      }
      for (const w of p.words) lineTokens.push({ text: w.text, box: w.box, line });
      prev = p;
    }
    flush();
  }
  return tokens;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
