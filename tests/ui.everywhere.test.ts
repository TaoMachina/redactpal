import { describe, expect, it } from 'vitest';
import { buildLayout, findingsToRegions } from '../src/core/layout';
import type { Region, Token } from '../src/core/types';
import { detect } from '../src/detect';
import {
  countOccurrences,
  coverage,
  enableTermRegions,
  findTerm,
  isWorthyPhrase,
  phraseFromTokens,
  suggestEverywhere,
  tokensUnderRect,
  trimPunctuation,
  withoutTerm,
  withTerm,
  type EverywherePage,
} from '../src/ui/everywhere';

/** Lay words out left to right, 10 units per character, one line per array. */
function lines(...rows: string[][]): Token[] {
  const out: Token[] = [];
  rows.forEach((words, line) => {
    let x = 0;
    for (const w of words) {
      out.push({ text: w, box: { x, y: line * 20, w: w.length * 10, h: 12 }, line });
      x += w.length * 10 + 10;
    }
  });
  return out;
}

const page = (index: number, tokens: Token[], regions: Region[] = []): EverywherePage => ({ index, tokens, regions });

const manual = (id: string, x: number, y: number, w: number, h: number, enabled = true): Region => ({
  id,
  rect: { x, y, w, h },
  kind: 'manual',
  label: 'Your box',
  text: '',
  enabled,
});

/** A box exactly over tokens [from, to] (inclusive) of one line. */
function boxOver(tokens: Token[], from: number, to: number): { x: number; y: number; w: number; h: number } {
  const a = tokens[from].box;
  const b = tokens[to].box;
  return { x: a.x - 1, y: a.y - 1, w: b.x + b.w - a.x + 2, h: a.h + 2 };
}

/** An enabled (or not) manual box over tokens [from, to] of one line. */
function over(id: string, tokens: Token[], from: number, to: number, enabled = true): Region {
  const r = boxOver(tokens, from, to);
  return manual(id, r.x, r.y, r.w, r.h, enabled);
}

describe('everywhere: tokens under a box', () => {
  const t = lines(['Hello', 'Maria', 'Lopez', 'there']);

  it('measures coverage as a share of the target', () => {
    expect(coverage({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 20, h: 20 })).toBeCloseTo(0.5);
    expect(coverage({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(0);
    expect(coverage({ x: 3, y: 3, w: 0, h: 0 }, { x: 0, y: 0, w: 5, h: 5 })).toBe(1);
  });

  it('picks tokens covered by at least half their area, in reading order', () => {
    // "Maria" x 60..110, "Lopez" x 120..170. Box 55..150 covers all of Maria and 60% of Lopez.
    expect(tokensUnderRect(t, { x: 55, y: -2, w: 95, h: 16 })).toEqual([1, 2]);
    // 55..140: 40% of Lopez is not enough.
    expect(tokensUnderRect(t, { x: 55, y: -2, w: 85, h: 16 })).toEqual([1]);
    expect(tokensUnderRect(t, { x: 400, y: 0, w: 50, h: 50 })).toEqual([]);
  });

  it('keeps reading order across lines', () => {
    const two = lines(['Maria'], ['Lopez']);
    expect(tokensUnderRect(two, { x: 0, y: 0, w: 60, h: 40 })).toEqual([0, 1]);
  });
});

describe('everywhere: phrase', () => {
  it('joins like buildLayout, one space between lines, trims edge punctuation', () => {
    const t = lines(['(Maria'], ['Lopez),']);
    expect(phraseFromTokens(t, [0, 1])).toBe('Maria Lopez');
    expect(phraseFromTokens(lines(['“ACME', 'Corp.”']), [0, 1])).toBe('ACME Corp');
    expect(trimPunctuation(' -- jane@x.io; ')).toBe('jane@x.io');
    expect(trimPunctuation('C++')).toBe('C++'); // symbols are not punctuation
  });

  it('needs at least two letters or digits', () => {
    expect(isWorthyPhrase('a')).toBe(false);
    expect(isWorthyPhrase('')).toBe(false);
    expect(isWorthyPhrase('a-')).toBe(false);
    expect(isWorthyPhrase('Al')).toBe(true);
    expect(isWorthyPhrase('42')).toBe(true);
    expect(isWorthyPhrase('李明')).toBe(true);
  });
});

describe('everywhere: counting occurrences', () => {
  const p0 = lines(['Maria', 'Lopez', 'wrote', 'to', 'maria', 'lopez'], ['Ask', 'Maria'], ['Lopez', 'today.', 'MariaLopez', 'Marias', 'Lopez']);
  const p1 = lines(['MARIA', 'LOPEZ,', 'again']);

  it('is case-insensitive, whole-word, spans line breaks and pages', () => {
    // p0: "Maria Lopez", "maria lopez", "Maria\nLopez" (not MariaLopez, not "Marias Lopez"); p1: "MARIA LOPEZ"
    expect(countOccurrences([page(0, p0), page(1, p1)], 'Maria Lopez')).toBe(4);
  });

  it('skips the occurrence that was boxed, and ones already hidden by an enabled region', () => {
    const source = { page: 0, tokens: [0, 1] };
    expect(countOccurrences([page(0, p0), page(1, p1)], 'Maria Lopez', source)).toBe(3);
    // Hide p1's occurrence with an enabled box: no longer counted.
    const hiddenP1 = page(1, p1, [over('m1', p1, 0, 1)]);
    expect(countOccurrences([page(0, p0), hiddenP1], 'Maria Lopez', source)).toBe(2);
    // A disabled region does not hide anything.
    const offP1 = page(1, p1, [over('m1', p1, 0, 1, false)]);
    expect(countOccurrences([page(0, p0), offP1], 'Maria Lopez', source)).toBe(3);
    // Half an occurrence covered (only "MARIA") still counts.
    const halfP1 = page(1, p1, [over('m1', p1, 0, 0)]);
    expect(countOccurrences([page(0, p0), halfP1], 'Maria Lopez', source)).toBe(3);
  });

  it('counts nothing once detect() hides the term (regions line up with occurrences)', () => {
    const tokens = p0;
    const layout = buildLayout(tokens);
    const findings = detect(layout.text, { customTerms: ['Maria Lopez'] });
    const regions = findingsToRegions(layout, tokens, findings);
    expect(findings.filter((f) => f.kind === 'custom')).toHaveLength(3);
    expect(countOccurrences([page(0, tokens, regions)], 'Maria Lopez')).toBe(0);
  });

  it('handles phrases with regex characters and partial-token matches', () => {
    const t = lines(['Price:', '$5.00', 'or', '$5.00.']);
    expect(countOccurrences([page(0, t)], '$5.00')).toBe(2);
    const e = lines(['Contact', 'jane@acme.io', 'or', 'jane@acme.io,', 'thanks']);
    expect(countOccurrences([page(0, e)], 'jane@acme.io', { page: 0, tokens: [1] })).toBe(1);
  });
});

describe('everywhere: suggestion after drawing a box', () => {
  const p0 = lines(['From:', 'Maria', 'Lopez'], ['Signed,', 'Maria', 'Lopez']);
  const p1 = lines(['cc', 'maria', 'lopez', 'and', 'Bob']);

  it('offers the phrase under the box with the number of other occurrences', () => {
    const drawn = boxOver(p0, 1, 2);
    const pages = [page(0, p0, [manual('m', drawn.x, drawn.y, drawn.w, drawn.h)]), page(1, p1)];
    expect(suggestEverywhere(pages, 0, drawn)).toEqual({ phrase: 'Maria Lopez', count: 2 });
  });

  it('works on a later page too', () => {
    const drawn = boxOver(p1, 1, 2);
    expect(suggestEverywhere([page(0, p0), page(1, p1)], 1, drawn)).toEqual({ phrase: 'maria lopez', count: 2 });
  });

  it('offers nothing over empty space, over a lone character, or for unique text', () => {
    expect(suggestEverywhere([page(0, p0)], 0, { x: 500, y: 0, w: 40, h: 40 })).toBeNull();
    expect(suggestEverywhere([page(0, lines(['a', 'b', 'a']))], 0, boxOver(lines(['a', 'b', 'a']), 0, 0))).toBeNull();
    expect(suggestEverywhere([page(0, p1)], 0, boxOver(p1, 4, 4))).toBeNull(); // "Bob" appears once
    expect(suggestEverywhere([page(3, p1)], 0, boxOver(p1, 4, 4))).toBeNull(); // unknown page
  });

  it('offers nothing when every other occurrence is already hidden', () => {
    const drawn = boxOver(p0, 1, 2);
    const other = boxOver(p0, 4, 5);
    const p1Box = boxOver(p1, 1, 2);
    const pages = [
      page(0, p0, [manual('a', drawn.x, drawn.y, drawn.w, drawn.h), manual('b', other.x, other.y, other.w, other.h)]),
      page(1, p1, [manual('c', p1Box.x, p1Box.y, p1Box.w, p1Box.h)]),
    ];
    expect(suggestEverywhere(pages, 0, drawn)).toBeNull();
  });
});

describe('everywhere: terms and regions', () => {
  it('adds and removes terms case-insensitively', () => {
    expect(withTerm(['Acme'], 'maria')).toEqual(['Acme', 'maria']);
    expect(withTerm(['Acme', 'Maria'], 'maria')).toEqual(['Acme', 'Maria']);
    expect(withoutTerm(['Acme', 'Maria'], 'MARIA ')).toEqual(['Acme']);
    expect(findTerm(['Acme', 'Maria'], 'maria')).toBe('Maria');
    expect(findTerm(['Acme'], 'maria')).toBeUndefined();
  });

  it('switches matching custom regions back on (a whole finding at once)', () => {
    const custom = (id: string, text: string, findingId: string, enabled: boolean): Region => ({
      id,
      rect: { x: 0, y: 0, w: 1, h: 1 },
      kind: 'custom',
      label: 'Custom: Maria Lopez',
      findingId,
      text,
      enabled,
    });
    const pages = [
      { regions: [custom('a', 'Maria Lopez', 'f0', false), custom('b', 'Maria\nLopez', 'f1', false), custom('c', 'Maria\nLopez', 'f1', false)] },
      { regions: [custom('d', 'Bob', 'f0', false), { ...manual('m', 0, 0, 1, 1), enabled: true }] },
    ];
    expect(enableTermRegions(pages, 'maria lopez')).toBe(3);
    expect(pages[0].regions.every((r) => r.enabled)).toBe(true);
    expect(pages[1].regions[0].enabled).toBe(false);
  });
});

import { snapToWords } from '../src/ui/everywhere';

describe('snapToWords', () => {
  const bounds = { width: 1000, height: 500 };
  const word = (text: string, x: number, w: number) => ({ text, line: 0, box: { x, y: 100, w, h: 20 } });
  it('grows a box over the back half of a word to the whole word', () => {
    const tokens = [word('Trainor', 100, 80), word('said', 200, 40)];
    const r = snapToWords(tokens, { x: 140, y: 98, w: 45, h: 24 }, bounds);
    expect(r.x).toBeLessThanOrEqual(100);
    expect(r.x + r.w).toBeGreaterThanOrEqual(180);
    expect(r.x + r.w).toBeLessThan(200); // does not grab the next word
  });
  it('leaves a box over empty space alone', () => {
    const tokens = [word('Trainor', 100, 80)];
    const drawn = { x: 400, y: 300, w: 50, h: 30 };
    expect(snapToWords(tokens, drawn, bounds)).toEqual(drawn);
  });
  it('ignores a word only grazed by the box', () => {
    const tokens = [word('Trainor', 100, 80)];
    const drawn = { x: 170, y: 98, w: 60, h: 24 }; // covers ~12% of the word
    expect(snapToWords(tokens, drawn, bounds)).toEqual(drawn);
  });
});
