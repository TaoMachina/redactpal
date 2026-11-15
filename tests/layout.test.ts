import { describe, expect, it } from 'vitest';
import { buildLayout, findingsToRegions } from '../src/core/layout';
import type { Finding, Token } from '../src/core/types';

const tok = (text: string, x: number, line: number, y = line * 20): Token => ({ text, line, box: { x, y, w: text.length * 8, h: 16 } });

describe('layout', () => {
  it('joins tokens with spaces and newlines', () => {
    const tokens = [tok('mail', 0, 0), tok('a@b.co', 40, 0), tok('next', 0, 1)];
    const l = buildLayout(tokens);
    expect(l.text).toBe('mail a@b.co\nnext');
    expect(l.spans[1]).toEqual({ start: 5, end: 11 });
  });

  it('covers only the secret part of a token, with a safety margin', () => {
    const tokens = [tok('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 0, 0)];
    const l = buildLayout(tokens);
    const start = l.text.indexOf('AKIA');
    const f: Finding = { id: 'f0', start, end: l.text.length, text: l.text.slice(start), kind: 'api_key', ruleId: 'x', label: 'API key', confidence: 'high' };
    const [r] = findingsToRegions(l, tokens, [f], { pad: 0 });
    expect(r.rect.x).toBeLessThanOrEqual((start - 1) * 8); // at least one char of margin (monospace)
    expect(r.rect.x).toBeGreaterThan(0); // the variable name stays (mostly) readable
    expect(r.rect.x + r.rect.w).toBe(l.text.length * 8); // runs to the token end
  });

  it('never under-covers a secret after a run of narrow characters (proportional font)', () => {
    // Real-ish Arial advance widths (px at 20px): narrow glyphs are ~1/3 of wide ones.
    const W: Record<string, number> = { i: 4.4, l: 4.4, t: 5.6, '/': 5.6, '.': 5.6, ':': 5.6, '?': 11.1, '=': 11.7 };
    const width = (s: string) => [...s].reduce((a, c) => a + (W[c] ?? (c >= 'A' && c <= 'Z' ? 14 : 11)), 0);
    for (const prefix of ['https://api.internal.example.com/v1/files/list/all?token=', 'illlllliiiiitttt///...:::=', '?X-Goog-Signature=']) {
      const secret = 'AKQW8Z3MXN2PLV7RWMWM';
      const text = prefix + secret;
      const tokens: Token[] = [{ text, line: 0, box: { x: 0, y: 0, w: width(text), h: 20 } }];
      const l = buildLayout(tokens);
      const f: Finding = { id: 'f0', start: prefix.length, end: text.length, text: secret, kind: 'secret_generic', ruleId: 'x', label: 'Secret', confidence: 'high' };
      const [r] = findingsToRegions(l, tokens, [f], { pad: 0 });
      expect(r.rect.x, prefix).toBeLessThanOrEqual(width(prefix)); // starts at or before the secret's first glyph
    }
  });

  it('covers the wrapped tail of a secret on the next line', () => {
    const tokens = [tok('token:', 0, 0), tok('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0', 56, 0), tok('.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV', 0, 1), tok('done', 0, 2)];
    const l = buildLayout(tokens);
    const start = l.text.indexOf('eyJ');
    const end = l.text.indexOf('\n');
    const f: Finding = { id: 'f0', start, end, text: l.text.slice(start, end), kind: 'jwt', ruleId: 'jwt', label: 'JWT', confidence: 'high' };
    const r = findingsToRegions(l, tokens, [f], { pad: 0 });
    expect(r).toHaveLength(2);
    expect(r[1].rect.y).toBe(20); // the second line is covered
  });

  it('covers the whole token when the finding spans most of it', () => {
    const tokens = [tok('key=sk_test_abcdefghijklmnop', 0, 0), tok('more', 300, 0)];
    const l = buildLayout(tokens);
    const f: Finding = { id: 'f0', start: 4, end: 28, text: l.text.slice(4, 28), kind: 'api_key', ruleId: 'x', label: 'API key', confidence: 'high' };
    const r = findingsToRegions(l, tokens, [f], { pad: 0 });
    expect(r).toHaveLength(1);
    expect(r[0].rect).toEqual({ x: 0, y: 0, w: 28 * 8, h: 16 });
  });

  it('splits a wrapped finding into one region per line', () => {
    const tokens = [tok('alpha', 0, 0), tok('beta', 0, 1)];
    const l = buildLayout(tokens);
    const f: Finding = { id: 'f0', start: 0, end: l.text.length, text: l.text, kind: 'custom', ruleId: 'custom', label: 'c', confidence: 'high' };
    expect(findingsToRegions(l, tokens, [f], { pad: 0 })).toHaveLength(2);
  });

  it('swallows an OCR-split tail of a secret that touches it, but not a spaced word', () => {
    const tokens = [tok('https://hooks.slack.com/services/T1/B2', 0, 0), { text: '/XXXX', line: 0, box: { x: 38 * 8 + 1, y: 0, w: 40, h: 16 } }, { text: 'next', line: 0, box: { x: 38 * 8 + 60, y: 0, w: 32, h: 16 } }];
    const l = buildLayout(tokens);
    const f: Finding = { id: 'f0', start: 0, end: 38, text: l.text.slice(0, 38), kind: 'api_key', ruleId: 'slack_webhook', label: 'API key', confidence: 'high' };
    const [r] = findingsToRegions(l, tokens, [f], { pad: 0 });
    expect(r.rect.x + r.rect.w).toBe(38 * 8 + 1 + 40);
  });

  it('clamps padding to bounds', () => {
    const tokens = [tok('x', 0, 0, 0)];
    const l = buildLayout(tokens);
    const f: Finding = { id: 'f0', start: 0, end: 1, text: 'x', kind: 'custom', ruleId: 'custom', label: 'c', confidence: 'high' };
    const [r] = findingsToRegions(l, tokens, [f], { pad: 5, bounds: { width: 100, height: 100 } });
    expect(r.rect.x).toBe(0);
    expect(r.rect.y).toBe(0);
  });
});

describe('wrap continuation does not over-reach', () => {
  it('does not swallow the next line when the secret ends mid-token', () => {
    const tokens = [tok('DATABASE_URL=postgres://admin:pw123secret@db.example.com/app', 0, 0), tok('OPENAI_API_KEY=sk-proj-abcdefghijklmnop', 0, 1)];
    const l = buildLayout(tokens);
    const start = l.text.indexOf('admin');
    const end = l.text.indexOf('@db');
    const f: Finding = { id: 'f0', start, end, text: l.text.slice(start, end), kind: 'url_credential', ruleId: 'u', label: 'URL credential', confidence: 'high' };
    expect(findingsToRegions(l, tokens, [f], { pad: 0 })).toHaveLength(1);
  });
  it('does not treat a NAME=value line as the tail of a key', () => {
    const tokens = [tok('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrst', 0, 0), tok('GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789', 0, 1)];
    const l = buildLayout(tokens);
    const start = l.text.indexOf('sk-');
    const end = l.text.indexOf('\n');
    const f: Finding = { id: 'f0', start, end, text: l.text.slice(start, end), kind: 'api_key', ruleId: 'o', label: 'API key', confidence: 'high' };
    expect(findingsToRegions(l, tokens, [f], { pad: 0 })).toHaveLength(1);
  });
});
