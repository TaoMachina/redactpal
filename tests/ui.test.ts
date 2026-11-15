import { describe, expect, it } from 'vitest';
import type { Finding, Region } from '../src/core/types';
import {
  canvasScale,
  clampRect,
  clientToSource,
  hitTest,
  iou,
  needsRerender,
  rectFromPoints,
  rectToPercent,
} from '../src/ui/geometry';
import { reconcileRegions } from '../src/ui/reconcile';
import { activeFindings, buildHighlightHtml, escapeHtml } from '../src/ui/highlight';
import {
  classifyFile,
  countHidden,
  customTermOf,
  doneMessage,
  groupRegions,
  parseTerms,
  pasteShortcut,
  redactedFilename,
} from '../src/ui/format';
import { shortLabel, toneOf } from '../src/ui/kinds';

const region = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Region> = {}): Region => ({
  id,
  rect: { x, y, w, h },
  kind: 'email',
  label: 'Email address',
  text: 'a@b.co',
  enabled: true,
  ...extra,
});

const finding = (start: number, end: number, text: string, extra: Partial<Finding> = {}): Finding => ({
  id: `f${start}`,
  start,
  end,
  text,
  kind: 'email',
  ruleId: 'email',
  label: 'Email address',
  confidence: 'high',
  ...extra,
});

describe('geometry', () => {
  it('normalises rects from any drag direction', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, w: 6, h: 18 });
  });

  it('clamps rects to the page', () => {
    expect(clampRect({ x: -5, y: 90, w: 20, h: 30 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 90, w: 15, h: 10 });
  });

  it('maps client px to source units and clamps', () => {
    const box = { left: 100, top: 50, width: 200, height: 100 };
    const src = { width: 1000, height: 500 };
    expect(clientToSource(200, 100, box, src)).toEqual({ x: 500, y: 250 });
    expect(clientToSource(0, 1000, box, src)).toEqual({ x: 0, y: 500 });
  });

  it('hit-tests, preferring exact hits and smaller regions', () => {
    const big = region('big', 0, 0, 100, 100);
    const small = region('small', 40, 40, 10, 10);
    expect(hitTest([big, small], { x: 45, y: 45 })?.id).toBe('small');
    expect(hitTest([big, small], { x: 5, y: 5 })?.id).toBe('big');
    expect(hitTest([small], { x: 60, y: 60 })).toBeUndefined();
    expect(hitTest([small], { x: 53, y: 45 }, 5)?.id).toBe('small');
    // exact hit on big beats tolerance hit on small
    expect(hitTest([big, small], { x: 52, y: 45 }, 5)?.id).toBe('big');
  });

  it('computes IoU', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(50 / 150);
  });

  it('converts rects to percentages', () => {
    expect(rectToPercent({ x: 50, y: 25, w: 100, h: 50 }, { width: 200, height: 100 })).toEqual({ left: 25, top: 25, width: 50, height: 50 });
  });

  it('caps canvas size', () => {
    expect(canvasScale(500, 2, { width: 1000, height: 1000 })).toBe(1);
    const s = canvasScale(4000, 3, { width: 4000, height: 12000 });
    expect(4000 * 12000 * s * s).toBeLessThanOrEqual(12e6 + 1);
    expect(12000 * s).toBeLessThanOrEqual(8192);
  });

  it('decides when to re-render', () => {
    expect(needsRerender(0, 300)).toBe(true);
    expect(needsRerender(300, 300)).toBe(false);
    expect(needsRerender(300, 400)).toBe(true);
    expect(needsRerender(800, 400)).toBe(true);
    expect(needsRerender(500, 400)).toBe(false);
  });
});

describe('reconcileRegions', () => {
  let n = 0;
  const id = () => `new${++n}`;

  it('keeps toggles and ids for findings that persist, adds new ones enabled, keeps manual boxes', () => {
    const prev = [
      region('a', 0, 0, 50, 10, { enabled: false, text: 'x@y.com' }),
      region('b', 0, 20, 50, 10, { text: 'gone@y.com' }),
      region('m1', 5, 5, 5, 5, { kind: 'manual', label: 'Your box', text: '' }),
    ];
    const next = [
      region('r0', 0, 0, 51, 10, { text: 'x@y.com', findingId: 'f1' }),
      region('r1', 0, 40, 30, 10, { kind: 'custom', label: 'Custom term', text: 'Jane', findingId: 'f2' }),
    ];
    const out = reconcileRegions(prev, next, id);
    expect(out.map((r) => r.id)).toEqual(['a', 'new1', 'm1']);
    expect(out[0].enabled).toBe(false);
    expect(out[0].findingId).toBe('f1');
    expect(out[1].enabled).toBe(true);
    expect(out[2].kind).toBe('manual');
  });

  it('does not match on text alone when the box moved far away', () => {
    const prev = [region('a', 0, 0, 50, 10, { enabled: false })];
    const next = [region('r0', 0, 500, 50, 10)];
    const out = reconcileRegions(prev, next, id);
    expect(out[0].id).not.toBe('a');
    expect(out[0].enabled).toBe(true);
  });

  it('keeps all boxes of a wrapped finding in one state', () => {
    const prev = [region('a', 0, 0, 50, 10, { enabled: false })];
    const next = [region('r0', 0, 0, 50, 10, { findingId: 'f1' }), region('r1', 0, 12, 50, 10, { findingId: 'f1' })];
    const out = reconcileRegions(prev, next, id);
    expect(out.every((r) => !r.enabled)).toBe(true);
  });
});

describe('highlight', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });

  it('wraps findings and escapes everything around and inside them', () => {
    const text = '<b>mail</b> me@x.io <script>';
    const start = text.indexOf('me@x.io');
    const html = buildHighlightHtml(text, [finding(start, start + 7, 'me@x.io')]);
    expect(html.startsWith('&lt;b&gt;mail&lt;/b&gt; <button')).toBe(true);
    expect(html).toContain('>me@x.io</button>');
    expect(html.endsWith(' &lt;script&gt;')).toBe(true);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
  });

  it('escapes hostile finding values in attributes', () => {
    const text = '"><img src=x>';
    const html = buildHighlightHtml(text, [finding(0, text.length, text, { label: '"x' })]);
    expect(html).not.toContain('<img');
    expect(html).toContain('data-key="&quot;&gt;&lt;img src=x&gt;"');
  });

  it('marks kept values and skips overlapping findings', () => {
    const text = 'aa bb';
    const html = buildHighlightHtml(text, [finding(0, 2, 'aa'), finding(1, 4, 'a b'), finding(3, 5, 'bb')], new Set(['bb']));
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain('class="hl tone-contact is-off" data-key="bb"');
  });

  it('keeps a trailing newline visible', () => {
    expect(buildHighlightHtml('a\n', [])).toBe('a\n\u200b');
  });

  it('filters kept findings', () => {
    expect(activeFindings([finding(0, 2, 'aa'), finding(3, 5, 'bb')], new Set(['aa'])).map((f) => f.text)).toEqual(['bb']);
  });
});

describe('format', () => {
  it('classifies files', () => {
    expect(classifyFile({ type: 'image/png', name: 'a.png' })).toBe('image');
    expect(classifyFile({ type: '', name: 'shot.JPG' })).toBe('image');
    expect(classifyFile({ type: 'application/pdf', name: 'x' })).toBe('pdf');
    expect(classifyFile({ type: '', name: 'doc.pdf' })).toBe('pdf');
    expect(classifyFile({ type: 'text/plain', name: 'a.txt' })).toBe('text');
    expect(classifyFile({ type: '', name: '.env' })).toBe('text');
    expect(classifyFile({ type: 'image/svg+xml', name: 'a.svg' })).toBe('unsupported');
    expect(classifyFile({ type: 'application/zip', name: 'a.zip' })).toBe('unsupported');
  });

  it('builds redacted filenames', () => {
    expect(redactedFilename('Screenshot 2024-05-01 at 10.42.png', 'png')).toBe('Screenshot 2024-05-01 at 10.42-redacted.png');
    expect(redactedFilename('contract.final.PDF', 'pdf')).toBe('contract.final-redacted.pdf');
    expect(redactedFilename('', 'png')).toBe('blot-redacted.png');
    expect(redactedFilename(undefined, 'pdf')).toBe('blot-redacted.pdf');
    expect(redactedFilename('C:\\fakepath\\a:b.png', 'png')).toBe('ab-redacted.png');
  });

  it('parses custom terms', () => {
    expect(parseTerms(' Jane Doe, acme ,ACME,\nProject Falcon; x ,')).toEqual(['Jane Doe', 'acme', 'Project Falcon']);
    expect(parseTerms('')).toEqual([]);
  });

  it('groups regions by kind, one item per finding, manual last', () => {
    const placed = [
      { page: 0, region: region('m', 0, 0, 1, 1, { kind: 'manual', label: 'Your box', text: '' }) },
      { page: 0, region: region('a', 0, 0, 1, 1, { findingId: 'f1' }) },
      { page: 0, region: region('b', 0, 2, 1, 1, { findingId: 'f1', enabled: false }) },
      { page: 0, region: region('c', 0, 4, 1, 1, { kind: 'api_key', label: 'AWS access key', findingId: 'f2', enabled: false }) },
      { page: 1, region: region('d', 0, 0, 1, 1, { findingId: 'f1' }) },
    ];
    const groups = groupRegions(placed);
    expect(groups.map((g) => g.kind)).toEqual(['email', 'api_key', 'manual']);
    expect(groups[0].items.map((i) => i.regionIds)).toEqual([['a', 'b'], ['d']]);
    expect(groups[0].items[0].enabled).toBe(true);
    expect(groups[1].items[0].enabled).toBe(false);
    expect(countHidden(placed)).toBe(3); // email f1 p0, email f1 p1, manual
  });

  it('gives every custom term its own group (so each can be unticked or stopped)', () => {
    const custom = (id: string, term: string, findingId: string): Region =>
      region(id, 0, 0, 1, 1, { kind: 'custom', label: `Custom: ${term}`, text: term, findingId });
    const placed = [
      { page: 0, region: custom('a', 'Maria Lopez', 'f0') },
      { page: 0, region: region('e', 0, 2, 1, 1, { findingId: 'f1' }) },
      { page: 0, region: custom('b', 'Acme', 'f2') },
      { page: 1, region: custom('c', 'Maria Lopez', 'f0') },
    ];
    const groups = groupRegions(placed);
    expect(groups.map((g) => g.key)).toEqual(['custom:maria lopez', 'email', 'custom:acme']);
    expect(groups[0]).toMatchObject({ kind: 'custom', term: 'Maria Lopez', title: '“Maria Lopez”' });
    expect(groups[0].items.map((i) => i.regionIds)).toEqual([['a'], ['c']]);
    expect(groups[1].term).toBeUndefined();
    expect(customTermOf('Custom: Jane')).toBe('Jane');
    expect(customTermOf('Email address')).toBe('Email address');
  });

  it('writes the done message', () => {
    expect(doneMessage(5, 'image')).toBe('Done — 5 items hidden, location data & metadata removed.');
    expect(doneMessage(1, 'pdf')).toBe('Done — 1 item hidden, text layer & metadata removed.');
    expect(doneMessage(0, 'image')).toBe('Done — Nothing hidden, location data & metadata removed.');
  });

  it('picks the paste shortcut', () => {
    expect(pasteShortcut('MacIntel')).toBe('⌘V');
    expect(pasteShortcut('macOS')).toBe('⌘V');
    expect(pasteShortcut('Win32')).toBe('Ctrl+V');
  });
});

describe('kinds', () => {
  it('has short labels and tones, with a fallback', () => {
    expect(shortLabel('api_key')).toBe('API key');
    expect(toneOf('email')).toBe('contact');
    expect(toneOf('manual')).toBe('manual');
    expect(shortLabel('something_new')).toBe('Sensitive');
  });
});
