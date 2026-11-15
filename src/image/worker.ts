// One shared, lazily created tesseract.js worker. Calls are serialized (Tesseract's API is
// single-threaded per worker anyway) so concurrent ocr() calls from the image and PDF paths queue up.
import type { Progress } from '../core/types';
import { LANG_DATA_VERSION, ocrAssetUrls } from './assets';
import { OCR_PARAMS } from './params';
import type { TessBlock } from './tokens';

type TesseractModule = typeof import('tesseract.js');
type TessWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

let workerPromise: Promise<TessWorker> | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** Progress sink of the job currently running (the worker's logger is fixed at creation). */
let activeProgress: Progress | undefined;

const LOADING = 'Loading text recognizer…';
const READING = 'Reading text…';

/** Share of the overall ocr() progress bar spent on (first-time) loading. */
const LOAD_SHARE = 0.4;

// Maps tesseract.js logger statuses onto one monotonic 0..1 fraction: loading 0..0.4, reading 0.4..1.
function onLog(m: { status?: string; progress?: number }): void {
  const p = activeProgress;
  if (!p) return;
  const f = typeof m.progress === 'number' ? Math.max(0, Math.min(1, m.progress)) : 0;
  switch (m.status) {
    case 'loading tesseract core':
      p(LOAD_SHARE * (0.0 + 0.3 * f), LOADING);
      break;
    case 'initializing tesseract':
      p(LOAD_SHARE * (0.3 + 0.1 * f), LOADING);
      break;
    case 'loading language traineddata':
      p(LOAD_SHARE * (0.4 + 0.5 * f), LOADING);
      break;
    case 'initializing api':
      p(LOAD_SHARE * (0.9 + 0.1 * f), LOADING);
      break;
    case 'recognizing text':
      p(LOAD_SHARE + (1 - LOAD_SHARE) * f, READING);
      break;
  }
}

function createSharedWorker(): Promise<TessWorker> {
  return (async () => {
    const T = await import('tesseract.js');
    const urls = ocrAssetUrls();
    // tesseract.js v7 swallows some init failures (e.g. traineddata 404) and never settles the
    // createWorker() promise; its errorHandler still fires, so we race against it.
    let fail!: (e: unknown) => void;
    const failed = new Promise<never>((_, reject) => (fail = reject));
    failed.catch(() => undefined); // late errors (after init) are reported per job instead
    const created = T.createWorker('eng', T.OEM.LSTM_ONLY, {
      workerPath: urls.workerPath,
      corePath: urls.corePath,
      langPath: urls.langPath,
      gzip: true,
      // Classic same-origin worker instead of a blob: bootstrap (simpler CSP story).
      workerBlobURL: false,
      // Traineddata is cached in this origin's IndexedDB (no network involved). The cache key
      // includes the model flavour so changing it can never load a stale model.
      cachePath: `blot-tesseract-${LANG_DATA_VERSION}`,
      cacheMethod: 'write',
      logger: onLog,
      errorHandler: (e: unknown) => fail(e),
    });
    const w = await Promise.race([created, failed]);
    // Screenshot-friendly parameters (see params.ts for why PSM 4).
    await w.setParameters(OCR_PARAMS as unknown as Parameters<TessWorker['setParameters']>[0]);
    return w;
  })();
}

function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    const p = createSharedWorker();
    workerPromise = p;
    // Do not cache a failed init: the next call retries from scratch.
    p.catch(() => {
      if (workerPromise === p) workerPromise = null;
    });
  }
  return workerPromise;
}

/** Start loading the worker/model in the background (e.g. when the app becomes idle). Never throws. */
export function preloadWorker(): void {
  getWorker().catch(() => undefined);
}

/** Run `fn` exclusively on the shared worker. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export interface RecognizeOutput {
  blocks: TessBlock[];
}

/** Recognize a (preprocessed) PNG. Errors are rethrown as user-facing messages. */
export function recognizePng(png: Blob, onProgress?: Progress): Promise<RecognizeOutput> {
  return exclusive(async () => {
    activeProgress = onProgress;
    try {
      let w: TessWorker;
      try {
        onProgress?.(0, LOADING);
        w = await getWorker();
      } catch (e) {
        throw friendly('The text recognizer could not be loaded. Check your connection to this site and try again.', e);
      }
      try {
        onProgress?.(LOAD_SHARE, READING);
        const res = await w.recognize(png, {}, { blocks: true, text: false });
        onProgress?.(1, READING);
        return { blocks: (res.data.blocks ?? []) as unknown as TessBlock[] };
      } catch (e) {
        // A failed recognize may leave the wasm heap in a bad state: start fresh next time.
        await disposeWorker();
        throw friendly('Text recognition failed on this image. You can still draw boxes by hand.', e);
      }
    } finally {
      activeProgress = undefined;
    }
  });
}

/** Terminate the shared worker (waits for the running job, if any). */
export function disposeWorker(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  if (!p) return Promise.resolve();
  return p.then(
    (w) => w.terminate().then(() => undefined),
    () => undefined,
  );
}

/** Queue-aware disposal: lets running/queued OCR jobs finish first. */
export function disposeWhenIdle(): Promise<void> {
  return exclusive(disposeWorker);
}

function friendly(message: string, cause: unknown): Error {
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}
