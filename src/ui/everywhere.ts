// "Drag → hide everywhere": when the user draws a box over some text, find what that text says and
// how many other times it appears, so the review screen can offer to hide every occurrence (as a
// custom term). Pure: no DOM; works on tokens and regions only.
import { buildLayout, subTokenRect } from '../core/layout';
import type { Rect, Region, Token } from '../core/types';
import { customTermRegex } from '../detect';
import { rectArea } from './geometry';

/** Minimum share of a token's area that a rectangle must cover for the token to count as "under" it. */
export const MIN_COVER = 0.5;

/** The pieces of a page this module needs (ReviewPage satisfies it). */
export interface EverywherePage {
  index: number;
  tokens: Token[];
  regions: Region[];
}

export interface Suggestion {
  phrase: string;
  /** Occurrences outside the drawn box that are not already hidden. */
  count: number;
}

function overlapArea(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/** Share (0..1) of `target`'s area that `cover` covers. A zero-area target counts if its corner is inside. */
export function coverage(target: Rect, cover: Rect): number {
  const area = rectArea(target);
  if (area <= 0) {
    const inside = target.x >= cover.x && target.x <= cover.x + cover.w && target.y >= cover.y && target.y <= cover.y + cover.h;
    return inside ? 1 : 0;
  }
  return overlapArea(target, cover) / area;
}

/** Indices of the tokens under `rect` (≥ `minCover` of each token's area), in reading order. */
export function tokensUnderRect(tokens: readonly Token[], rect: Rect, minCover = MIN_COVER): number[] {
  const out: number[] = [];
  tokens.forEach((t, i) => {
    if (t.text.trim() && coverage(t.box, rect) >= minCover) out.push(i);
  });
  return out;
}

const EDGE_PUNCT = /^[\s\p{P}]+|[\s\p{P}]+$/gu;

/** Remove punctuation (and whitespace) at both ends: “(Maria Lopez),” → “Maria Lopez”. */
export const trimPunctuation = (s: string): string => s.replace(EDGE_PUNCT, '');

/**
 * The phrase the tokens spell, joined the way buildLayout joins them (space within a line, a line
 * break between lines), with every run of whitespace collapsed to one space and edge punctuation
 * trimmed.
 */
export function phraseFromTokens(tokens: readonly Token[], indices: readonly number[]): string {
  const picked = indices.map((i) => tokens[i]).filter((t): t is Token => !!t);
  return trimPunctuation(buildLayout(picked).text.replace(/\s+/g, ' '));
}

/** Worth offering? At least two letters or digits (a lone "a" or "-" is not). */
export function isWorthyPhrase(phrase: string): boolean {
  return (phrase.match(/[\p{L}\p{N}]/gu) ?? []).length >= 2;
}

/** Is the part [from, to) of token `t` already hidden by an enabled region? */
function tokenPartCovered(t: Token, from: number, to: number, enabled: readonly Region[]): boolean {
  const part = subTokenRect(t.box, t.text, from, to);
  return enabled.some((r) => coverage(part, r.rect) >= MIN_COVER);
}

/**
 * How many times `phrase` occurs across `pages` (case-insensitive, whole word — the same matcher
 * detect() uses for custom terms), not counting occurrences whose every token is already hidden by
 * an enabled region, nor the occurrence made of `source` tokens (the box just drawn).
 */
export function countOccurrences(
  pages: readonly EverywherePage[],
  phrase: string,
  source?: { page: number; tokens: readonly number[] },
): number {
  const re = customTermRegex(phrase);
  if (!re) return 0;
  let count = 0;
  for (const page of pages) {
    const layout = buildLayout(page.tokens);
    const enabled = page.regions.filter((r) => r.enabled);
    const sourceTokens = source && source.page === page.index ? new Set(source.tokens) : null;
    for (const m of layout.text.matchAll(re)) {
      if (!m[0]) continue;
      const start = m.index;
      const end = start + m[0].length;
      const hit: number[] = [];
      layout.spans.forEach((s, i) => {
        if (s.end > start && s.start < end) hit.push(i);
      });
      if (!hit.length) continue;
      if (sourceTokens && hit.some((i) => sourceTokens.has(i))) continue;
      const covered = hit.every((i) => {
        const s = layout.spans[i];
        return tokenPartCovered(page.tokens[i], start - s.start, end - s.start, enabled);
      });
      if (!covered) count++;
    }
  }
  return count;
}

/**
 * What to offer after a box was drawn on page `pageIndex` over `rect`: the phrase under it and how
 * many more times it appears. Null when the box covers no (meaningful) text or it appears nowhere
 * else.
 */
export function suggestEverywhere(pages: readonly EverywherePage[], pageIndex: number, rect: Rect): Suggestion | null {
  const page = pages.find((p) => p.index === pageIndex);
  if (!page) return null;
  const under = tokensUnderRect(page.tokens, rect);
  if (!under.length) return null;
  const phrase = phraseFromTokens(page.tokens, under);
  if (!isWorthyPhrase(phrase)) return null;
  const count = countOccurrences(pages, phrase, { page: pageIndex, tokens: under });
  return count > 0 ? { phrase, count } : null;
}

/** Case-insensitive term lookup (terms are deduped that way, like detect() does). */
export const findTerm = (terms: readonly string[], phrase: string): string | undefined => {
  const k = phrase.trim().toLocaleLowerCase();
  return terms.find((t) => t.trim().toLocaleLowerCase() === k);
};

/** `terms` plus `phrase`, unless it is already there. */
export const withTerm = (terms: readonly string[], phrase: string): string[] => (findTerm(terms, phrase) ? [...terms] : [...terms, phrase]);

/** `terms` without `phrase` (case-insensitive). */
export const withoutTerm = (terms: readonly string[], phrase: string): string[] => {
  const k = phrase.trim().toLocaleLowerCase();
  return terms.filter((t) => t.trim().toLocaleLowerCase() !== k);
};

/**
 * Turn on every custom region that matches `phrase`. Re-detection keeps earlier on/off choices, so
 * after "Hide all" an occurrence the user had un-ticked before would otherwise stay visible.
 * Returns how many regions were switched on.
 */
export function enableTermRegions(pages: readonly Pick<EverywherePage, 'regions'>[], phrase: string): number {
  const re = customTermRegex(phrase);
  if (!re) return 0;
  const test = new RegExp(re.source, 'iu');
  let n = 0;
  for (const page of pages) {
    const ids = new Set(page.regions.filter((r) => r.kind === 'custom' && test.test(r.text)).map((r) => r.findingId ?? r.id));
    for (const r of page.regions) {
      if (r.kind === 'custom' && ids.has(r.findingId ?? r.id) && !r.enabled) {
        r.enabled = true;
        n++;
      }
    }
  }
  return n;
}
