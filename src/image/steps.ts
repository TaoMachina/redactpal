// Interruptible pixel work. Heavy loops in preprocess.ts are written as generators that `yield`
// every row (or every few thousand items). The same code then runs:
//  - straight through (runSync): in the preprocessing Web Worker and in Node tests, and
//  - time-sliced (timeSlicer): on the main thread when no worker is available, giving the browser
//    a chance to handle taps and paint every ~30 ms instead of freezing for seconds on a big photo.
// No DOM access -> unit-testable in Node.

/** A resumable computation that eventually returns T. */
export type Steps<T> = Generator<void, T, void>;

/** Run to completion without yielding to the event loop. */
export function runSync<T>(g: Steps<T>): T {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** Drives Steps and long native-call sequences (`tick` between them). */
export interface Slicer {
  run<T>(g: Steps<T>): Promise<T>;
  /** Yield to the event loop if the current slice has used up its time. */
  tick(): Promise<void>;
}

/** Never yields: for workers (blocking there is fine) and tests. */
export const syncSlicer: Slicer = {
  run: async <T>(g: Steps<T>) => runSync(g),
  tick: async () => undefined,
};

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Let the browser handle input and paint. Prefers scheduler.yield(), then a message-channel task, then setTimeout. */
export function yieldToEventLoop(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s && typeof s.yield === 'function') return s.yield();
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Main-thread slicer: yields whenever `sliceMs` of uninterrupted work has been done. */
export function timeSlicer(sliceMs = 30, yielder: () => Promise<void> = yieldToEventLoop): Slicer {
  let start = now();
  const tick = async (): Promise<void> => {
    if (now() - start >= sliceMs) {
      await yielder();
      start = now();
    }
  };
  return {
    async run<T>(g: Steps<T>): Promise<T> {
      let r = g.next();
      while (!r.done) {
        if (now() - start >= sliceMs) {
          await yielder();
          start = now();
        }
        r = g.next();
      }
      return r.value;
    },
    tick,
  };
}
