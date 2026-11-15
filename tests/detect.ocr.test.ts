import { describe, expect, it } from 'vitest';
import { detect } from '../src/detect';

describe('OCR-damaged secrets', () => {
  it('extends a key through an OCR-misread character to the end of the word', () => {
    const t = 'OPENAI_API_KEY=sk-proj-Xq7b2Lm9TzR4vN8cWk3pYf6Hd1Sa@Ej5Gu2Io7K1 next';
    const f = detect(t).find((x) => x.kind === 'api_key' || x.kind === 'secret_generic');
    expect(f?.text).toBe('sk-proj-Xq7b2Lm9TzR4vN8cWk3pYf6Hd1Sa@Ej5Gu2Io7K1');
  });

  it('stops at JSON punctuation', () => {
    const t = '{"key": "sk_live_abcdefghijklmnopqrstuvwx", "x": 1}';
    const f = detect(t).find((x) => x.kind === 'api_key');
    expect(f?.text).toBe('sk_live_abcdefghijklmnopqrstuvwx');
  });
});

describe('custom terms never lose an overlap', () => {
  it('a term inside an email becomes one custom finding covering both', () => {
    const fs = detect('write to support@acme.com today', { customTerms: ['Acme'] });
    expect(fs).toHaveLength(1);
    expect(fs[0].kind).toBe('custom');
    expect(fs[0].text).toBe('support@acme.com');
  });
  it('a term equal to a detected value is still custom', () => {
    const fs = detect('mail support@acme.com', { customTerms: ['support@acme.com'] });
    expect(fs.map((f) => [f.kind, f.text])).toEqual([['custom', 'support@acme.com']]);
  });
  it('a term spanning two findings merges them all', () => {
    const fs = detect('a@b.co and c@d.co', { customTerms: ['b.co and c'] });
    expect(fs.map((f) => f.text)).toEqual(['a@b.co and c@d.co']);
  });
});

describe('OCR-spaced Slack webhook', () => {
  it('detects a webhook URL with a stray OCR space', () => {
    const fs = detect('SLACK_WEBHOOK=https://hooks .slack.com/services/T0801/B880802 /0000000000000000000000K');
    expect(fs.some((f) => f.text.startsWith('https://hooks .slack.com/services/T0801'))).toBe(true);
  });
});
