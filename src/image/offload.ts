// Runs OCR preprocessing off the main thread when the browser can (module Worker + OffscreenCanvas
// 2D in workers: Chromium, Firefox, Safari/iOS ≥ 16.4), otherwise on the main thread in ~30 ms
// slices. Either way the result is the same PNG + size; callers map boxes with ocrSize / sourceSize.
import { fitPixels } from './budget';
import { resizedBitmap } from './canvas';
import { preprocessImage, type PreprocessBudget, type PreprocessOutput, type PreprocessReply, type PreprocessSource } from './pipeline';
import { timeSlicer } from './steps';

/** A preprocessing job that takes longer than this is abandoned (OCR then fails gracefully). */
export const PREPROCESS_TIMEOUT_MS = 90_000;
const TOO_SLOW = 'Preparing this image took too long on this device. Try a smaller or cropped image.';

/** The worker could not start (old browser, no OffscreenCanvas 2D in workers): use the main thread. */
class WorkerUnavailable extends Error {}

let workerBroken = false;
let nextId = 1;

function workerSupported(): boolean {
  return (
    !workerBroken &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

/**
 * Preprocess `src` for OCR within `budget`. The returned width/height are the OCR image's size, so
 * OCR px per source px = width / src.width (and height / src.height).
 * `textHeight` is in source px.
 */
export async function preprocess(src: PreprocessSource, budget: PreprocessBudget): Promise<PreprocessOutput> {
  if (workerSupported()) {
    try {
      return await preprocessInWorker(src, budget);
    } catch (e) {
      if (!(e instanceof WorkerUnavailable)) throw e;
      console.warn('RedactPal: preprocessing worker unavailable, using the main thread', e.message);
    }
  }
  return preprocessImage(src, budget, timeSlicer());
}

async function preprocessInWorker(src: PreprocessSource, budget: PreprocessBudget): Promise<PreprocessOutput> {
  const W = src.width;
  const H = src.height;
  // The worker gets its own copy (transferred, so not copied again). Big images are shrunk to the
  // OCR budget right here — natively, cheaply — so the copy is never larger than what OCR can use.
  const fit = fitPixels(W, H, budget.maxOcrPixels);
  let bitmap: ImageBitmap;
  try {
    bitmap = fit.width === W && fit.height === H ? await createImageBitmap(src) : await resizedBitmap(src, fit.width, fit.height);
  } catch (e) {
    throw new WorkerUnavailable(`could not copy the image for the worker: ${String(e)}`);
  }
  const inW = bitmap.width;

  let worker: Worker;
  try {
    // Vite bundles this as a separate same-origin module chunk (assets/preprocess.worker-*.js).
    worker = new Worker(new URL('./preprocess.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    bitmap.close();
    throw new WorkerUnavailable(String(e));
  }
  const id = nextId++;
  try {
    const out = await new Promise<PreprocessOutput>((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => reject(new Error(TOO_SLOW)), PREPROCESS_TIMEOUT_MS);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };
      worker.onmessage = (e: MessageEvent<PreprocessReply>) => {
        const r = e.data;
        if (r.ok && r.ready) {
          ready = true;
          return;
        }
        if (r.id !== id) return;
        if (r.ok) done(() => resolve(r.result));
        else if (r.unsupported) {
          workerBroken = true;
          done(() => reject(new WorkerUnavailable(r.message)));
        } else done(() => reject(new Error(r.message)));
      };
      worker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        // Before "ready": the module could not load (old engine, blocked) -> fall back for good.
        // After: the worker died mid-job (most likely out of memory) -> fail this OCR, don't retry.
        if (!ready) workerBroken = true;
        done(() => reject(ready ? new Error('Preparing this image ran out of memory on this device.') : new WorkerUnavailable(e.message || 'worker failed to load')));
      };
      worker.onmessageerror = () => done(() => reject(new WorkerUnavailable('worker message could not be read')));
      worker.postMessage({ id, bitmap, budget }, [bitmap]);
    });
    // The worker measured text height on its (possibly shrunk) copy.
    return { ...out, textHeight: out.textHeight == null ? null : out.textHeight * (W / inW) };
  } finally {
    worker.terminate(); // frees the worker's heap right away (matters on phones)
    bitmap.close(); // no-op once transferred
  }
}
