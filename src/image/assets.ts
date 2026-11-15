// Same-origin URLs of the self-hosted OCR assets. scripts/copy-vendor.mjs puts the files there
// (public/vendor/tesseract/… -> dist/vendor/tesseract/…). Keep both in sync.
//
// Nothing here may point at a CDN: tesseract.js defaults to jsdelivr for the worker, the wasm core
// and the traineddata, so every one of those paths is overridden explicitly.

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
 * './', so we resolve against the document — works from any sub-path or static host).
 */
export function ocrAssetUrls(base?: string): OcrAssetUrls {
  const b =
    base ??
    (typeof document !== 'undefined' && document.baseURI
      ? document.baseURI
      : (globalThis as { location?: { href: string } }).location?.href ?? '/');
  const root = new URL(VENDOR_DIR, b);
  return {
    workerPath: new URL('worker.min.js', root).href,
    corePath: new URL('core', root).href, // no trailing slash: tesseract.js appends "/<file>"
    langPath: new URL('lang', root).href,
  };
}
