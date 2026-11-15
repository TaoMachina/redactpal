// analyzeImage() in Node: decoding is stubbed (no createImageBitmap in Node) and OCR fails for real
// (no canvas in Node), which is exactly the "OCR failed" path the UI must survive.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeImage, IMAGE_OCR_FAILED_WARNING } from '../src/image';

const g = globalThis as Record<string, unknown>;
const original = g.createImageBitmap;

afterEach(() => {
  g.createImageBitmap = original;
  vi.restoreAllMocks();
});

const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], { type: 'image/png' });

describe('analyzeImage', () => {
  it('returns an empty analysis with a warning when OCR fails (user still reaches review)', async () => {
    const bitmap = { width: 40, height: 30, close: vi.fn() };
    g.createImageBitmap = vi.fn(async () => bitmap);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await analyzeImage(png(), {});
    expect(a.warning).toBe(IMAGE_OCR_FAILED_WARNING);
    expect(a).toMatchObject({ width: 40, height: 30, tokens: [], text: '', findings: [], regions: [] });
    expect(a.bitmap).toBe(bitmap);
    expect(bitmap.close).not.toHaveBeenCalled(); // the review screen still needs it
  });

  it('still throws when the file cannot be decoded', async () => {
    g.createImageBitmap = vi.fn(async () => {
      throw new Error('decode failed');
    });
    await expect(analyzeImage(png(), {})).rejects.toThrow(/couldn.t be opened/);
    await expect(analyzeImage(new Blob([], { type: 'image/png' }), {})).rejects.toThrow(/empty/);
  });
});
