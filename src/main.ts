// App entry. Owner: ui agent.
import './ui/base.css';
import './ui/styles.css';
import './ui/site.css';
import { appRootUrl } from './core/root';
import { startApp } from './ui/app';
import { initInstall } from './ui/install';

// Listen for the browser's "this can be installed" signal before it can fire (see ui/install.ts).
initInstall();

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
    // The worker and its file list live at the app root, also when this is a landing page in a
    // sub-folder (/redact-pdf/): one worker, scoped to the whole app.
    const root = appRootUrl();
    navigator.serviceWorker
      .register(new URL('sw.js', root).href, { scope: root })
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
        // `prune`: this is the complete list, so once it is cached the worker deletes files left over
        // from earlier versions. Also kept: this page (how the app opens offline) and what it loaded
        // (so a tab still running an older version keeps working).
        const list = (await (await fetch(new URL('precache.json', root), { cache: 'no-cache' })).json()) as { always: string[]; core: string[] };
        const core = await pickTesseractCore(list.core);
        const rest = [...list.always, ...(core ? [core] : [])].map((f) => new URL(f, root).href);
        reg.active?.postMessage({ type: 'cache', urls: rest, prune: true, page: location.href, keep: urls });
      })
      .catch(() => {
        /* offline support is a bonus; the app works without it */
      });
  });
}
