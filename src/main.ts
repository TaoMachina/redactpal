// App entry. Owner: ui agent.
import './ui/styles.css';
import { startApp } from './ui/app';

const mount = document.getElementById('app');
if (mount) startApp(mount);

/** Mirrors tesseract.js getCore(): relaxed SIMD > SIMD > plain, LSTM-only builds (same probes as wasm-feature-detect). */
async function pickTesseractCore(cores: string[]): Promise<string | undefined> {
  const ok = (bytes: number[]) => {
    try {
      return WebAssembly.validate(new Uint8Array(bytes));
    } catch {
      return false;
    }
  };
  const relaxed = ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11]);
  const simd = ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  const name = relaxed ? 'relaxedsimd-lstm' : simd ? 'simd-lstm' : 'lstm';
  return cores.find((c) => c.endsWith(`tesseract-core-${name}.wasm.js`));
}

// Offline support: only in production builds (a service worker would fight Vite's dev server).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(async () => {
        // On the very first visit the app's own files were fetched before the worker existed;
        // hand their URLs over so they are cached too.
        const reg = await navigator.serviceWorker.ready;
        const urls = [location.href, ...performance.getEntriesByType('resource').map((e) => e.name)].filter(
          (u) => new URL(u, location.href).origin === location.origin,
        );
        reg.active?.postMessage({ type: 'cache', urls });
        // Then fetch everything else (OCR engine, PDF reader…) in the background, so the app keeps
        // working offline even for features not used yet. Only the OCR core this CPU will load.
        const list = (await (await fetch('./precache.json')).json()) as { always: string[]; core: string[] };
        const core = await pickTesseractCore(list.core);
        const rest = [...list.always, ...(core ? [core] : [])].map((f) => new URL(f, location.href).href);
        reg.active?.postMessage({ type: 'cache', urls: rest });
      })
      .catch(() => {
        /* offline support is a bonus; the app works without it */
      });
  });
}
