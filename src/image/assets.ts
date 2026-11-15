// Same-origin URLs of the self-hosted OCR assets. scripts/copy-vendor.mjs puts the files there
// (public/vendor/tesseract/… -> dist/vendor/tesseract/…). Keep both in sync.
//
// Nothing here may point at a CDN: tesseract.js defaults to jsdelivr for the worker, the wasm core
// and the traineddata, so every one of those paths is overridden explicitly.

import { appRootUrl } from '../core/root';

export const VENDOR_DIR = 'vendor/tesseract/';
/** Traineddata flavour we ship; part of the IndexedDB cache key so a model change invalidates it. */
export const LANG_DATA_VERSION = '4.0.0_best_int';

export interface OcrAssetUrls {
  /** Classic worker script (tesseract.js/dist/worker.min.js). */
  workerPath: string;
  /** Directory: tesseract.js picks tesseract-core-{relaxedsimd-,simd-,}lstm.wasm.js by feature detection. */
  corePath: string;
  /** Directory containing eng.traineddata.gz. */
  langPath: string;
}

/**
 * Absolute URLs (the worker resolves corePath/langPath against its own location, and Vite's base is
 * './', so we resolve against the app root — works from any sub-path or static host, and from
 * landing pages in sub-folders).
 */
export function ocrAssetUrls(base?: string): OcrAssetUrls {
  // `base` (tests) is the app root's page; otherwise the app root of this document (see core/root.ts).
  const root = new URL(VENDOR_DIR, base ?? appRootUrl());
  return {
    workerPath: new URL('worker.min.js', root).href,
    corePath: new URL('core', root).href, // no trailing slash: tesseract.js appends "/<file>"
    langPath: new URL('lang', root).href,
  };
}
