// pdf.js setup for Vite. Everything is served from our own origin:
//  - the worker is bundled by Vite (`?url`),
//  - CMaps (CJK & other predefined encodings), standard fonts (non-embedded Helvetica/Times/…) and the
//    wasm image decoders (JPX/JPEG2000, JBIG2 — common in scanned PDFs) are emitted as hashed Vite
//    assets and handed to pdf.js through a custom BinaryDataFactory (main thread fetch, same origin).
// pdf.js has no CDN default: if an asset were missing it would just warn and degrade, never phone home.
// Loaded lazily (dynamic import from ./index.ts) so pdf.js stays out of the main bundle.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export { pdfjs };

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function byFilename(mods: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, url] of Object.entries(mods)) m.set(path.slice(path.lastIndexOf('/') + 1), url);
  return m;
}

const ASSETS: Record<string, Map<string, string>> = {
  cMapUrl: byFilename(
    import.meta.glob('../../node_modules/pdfjs-dist/cmaps/*.bcmap', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ),
  standardFontDataUrl: byFilename(
    import.meta.glob('../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ),
  wasmUrl: byFilename(
    // JPX (JPEG 2000) and JBIG2 decoders only; the QuickJS scripting sandbox is never shipped.
    import.meta.glob('../../node_modules/pdfjs-dist/wasm/{openjpeg,jbig2}.wasm', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ),
};

/** Same-origin replacement for pdf.js' DOMBinaryDataFactory (which needs a directory URL). */
class BlotBinaryDataFactory {
  // pdf.js constructs the factory with { cMapUrl, standardFontDataUrl, wasmUrl }; we ignore them.
  constructor(_opts?: unknown) {}
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = ASSETS[kind]?.get(filename);
    if (!url) throw new Error(`Blot: no bundled pdf.js ${kind} asset "${filename}"`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blot: failed to load ${url} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Safe, offline-only getDocument() parameters. */
export function documentParams(data: Uint8Array): Parameters<typeof pdfjs.getDocument>[0] {
  return {
    data,
    // Assets via our factory (main thread). The base URLs are dummies so pdf.js knows they exist;
    // they are never fetched directly because useWorkerFetch is false.
    cMapUrl: 'blot-assets/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'blot-assets/standard_fonts/',
    wasmUrl: 'blot-assets/wasm/',
    useWorkerFetch: false,
    BinaryDataFactory: BlotBinaryDataFactory,
    useWasm: true,
    // No XFA forms (they can contain scripts / remote resources). Non-embedded fonts use local() system
    // fonts (no network; best for non-embedded CJK), Symbol/ZapfDingbats come from our bundled standard fonts.
    // Scripting is never enabled: we only use the core API (no viewer, no annotation layer, no sandbox).
    enableXfa: false,
    // We render on the main thread; no extra renderer worker.
    disableWorkerRendering: true,
    // The whole file is in memory: no range/stream requests.
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false, // ignored by pdf.js ≥ 5 (no eval-based font rendering); kept as intent marker
    stopAtErrors: false,
    verbosity: 0,
  } as Parameters<typeof pdfjs.getDocument>[0];
}
