// Turns positioned tokens into a plain string (so detect() can run on it), and maps
// detected character spans back to rectangles. Shared by the image (OCR) and PDF paths.
import type { Finding, FindingKind, Rect, Region, Token } from './types';
import { charWeight } from '../pdf/geometry';

/** Looks like a wrapped tail of a key/token: no spaces, key-ish alphabet, not a short word. */
const CONTINUATION = /^[A-Za-z0-9_\-+/.]{8,}={0,2}$/; // '=' only as base64 padding: `NAME=value` is a new line, not a tail

const SECRET_KINDS = new Set<FindingKind>(['api_key', 'secret_generic', 'password', 'jwt', 'private_key', 'url_credential']);

export interface Layout {
  text: string;
  /** For each token i: its [start, end) offsets inside `text`. */
  spans: Array<{ start: number; end: number }>;
}

/** Join tokens: same line -> ' ', new line -> '\n'. Tokens are used in the order given. */
export function buildLayout(tokens: Token[]): Layout {
  let text = '';
  const spans: Layout['spans'] = [];
  tokens.forEach((t, i) => {
    if (i > 0) text += tokens[i - 1].line === t.line ? ' ' : '\n';
    const start = text.length;
    text += t.text;
    spans.push({ start, end: text.length });
  });
  return { text, spans };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function padRect(r: Rect, pad: number, bounds?: { width: number; height: number }): Rect {
  let x = r.x - pad;
  let y = r.y - pad;
  let w = r.w + pad * 2;
  let h = r.h + pad * 2;
  if (bounds) {
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(bounds.width - x, w);
    h = Math.min(bounds.height - y, h);
  }
  return { x, y, w, h };
}

/**
 * Part of a token's box that holds characters [from, to) of the token. Glyph widths are unknown
 * (OCR/PDF only give the whole word's box), so we estimate the left/right edges two ways — even
 * widths, and per-character weights (narrow i/l/t/./:, wide m/W/@) — and take whichever covers
 * MORE, then add 1.5 characters of margin. Under-covering a secret is the failure we must avoid.
 * Returns the whole box when the span covers most of it.
 */
export function subTokenRect(box: Rect, text: string, from: number, to: number): Rect {
  const n = text.length;
  if (n <= 0 || (from <= 0 && to >= n)) return { ...box };
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = charWeight(text[i]);
    weights.push(w);
    total += w;
  }
  const sum = (a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += weights[i];
    return s;
  };
  const cw = box.w / n;
  const prefix = Math.min(Math.max(0, from) * cw, (sum(0, Math.max(0, from)) / total) * box.w);
  const suffix = Math.min(Math.max(0, n - to) * cw, (sum(Math.min(n, to), n) / total) * box.w);
  const margin = 1.5 * cw;
  const x0 = box.x + Math.max(0, prefix - margin);
  const x1 = box.x + box.w - Math.max(0, suffix - margin);
  if (x1 - x0 >= box.w * 0.8) return { ...box };
  return { x: x0, y: box.y, w: x1 - x0, h: box.h };
}

/**
 * Map findings to regions. A token fully inside a finding is covered entirely; a token only
 * partly inside (e.g. `API_KEY=sk_live_…` where only the value is secret) is covered from the
 * secret's part with a one-character safety margin (see subTokenRect). Tokens of one finding are merged
 * per line, so a finding that wraps onto two lines yields two regions.
 * `pad` is in source units; callers typically use ~ max(2, 0.15 * line height).
 */
export function findingsToRegions(
  layout: Layout,
  tokens: Token[],
  findings: Finding[],
  opts: { pad?: number; bounds?: { width: number; height: number } } = {},
): Region[] {
  const regions: Region[] = [];
  let n = 0;
  for (const f of findings) {
    const byLine = new Map<number, Rect>();
    let last = -1;
    let reachesEnd = false; // does the covered run end at the end of its last token?
    layout.spans.forEach((s, i) => {
      if (s.end <= f.start || s.start >= f.end) return;
      const t = tokens[i];
      const box = subTokenRect(t.box, t.text, f.start - s.start, f.end - s.start);
      const prev = byLine.get(t.line);
      byLine.set(t.line, prev ? unionRect(prev, box) : box);
      last = i;
      reachesEnd = f.end >= s.end;
    });
    // OCR sometimes splits one unbroken secret into two words ("…/B0002 /XXXX"). For secrets,
    // swallow following words on the same line that (almost) touch the previous one.
    if (last >= 0 && SECRET_KINDS.has(f.kind)) {
      for (let i = last + 1; i < tokens.length; i++) {
        const prev = tokens[i - 1];
        const t = tokens[i];
        if (t.line !== prev.line) break;
        const gap = t.box.x - (prev.box.x + prev.box.w);
        if (gap > Math.max(2, prev.box.h * 0.3)) break;
        byLine.set(t.line, unionRect(byLine.get(t.line) ?? t.box, t.box));
        last = i;
        reachesEnd = true;
      }
      // A secret that runs to the end of a line may wrap (terminals, narrow PDFs): cover the next
      // line's first word too when it looks like more of the same secret.
      for (let wraps = 0; reachesEnd && wraps < 3; wraps++) {
        const next = tokens[last + 1];
        const cur = tokens[last];
        if (!next || next.line !== cur.line + 1 || !CONTINUATION.test(next.text)) break;
        const lineStart = Math.min(...tokens.filter((t) => t.line === cur.line).map((t) => t.box.x));
        if (next.box.x > lineStart + 2 * cur.box.h) break;
        byLine.set(next.line, { ...next.box });
        last += 1;
      }
    }
    for (const rect of byLine.values()) {
      const pad = opts.pad ?? Math.max(2, rect.h * 0.15);
      regions.push({
        id: `r${n++}`,
        rect: padRect(rect, pad, opts.bounds),
        kind: f.kind,
        label: f.label,
        findingId: f.id,
        text: f.text,
        enabled: true,
      });
    }
  }
  return regions;
}
