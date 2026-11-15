// Small pieces of state that must never get stuck on touch devices / iOS (pure, unit-tested).
//
// - createDragState: the whole-window "Drop to redact" overlay. dragenter/dragleave counters drift
//   (iOS drags between apps, Safari's missing dragleave, drops outside the window, a tab switch
//   mid-drag), so besides the counter the overlay clears on drop/dragend/blur/visibilitychange/
//   pointerdown and on a safety timer that every dragover re-arms. A real drag fires dragover
//   continuously (every few hundred ms), so the timer only fires once the drag is really gone.
// - withTimeout: a promise that settles within `ms`, whatever the wrapped promise does (iOS's
//   clipboard "Paste" callout can leave navigator.clipboard.read() pending).

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface DragState {
  /** dragenter with files */
  enter(): void;
  /** dragover with files: proves the drag is still alive */
  over(): void;
  /** dragleave with files */
  leave(): void;
  /** drop, dragend, blur, hidden tab, any pointerdown, safety timeout: always clears */
  reset(): void;
  readonly active: boolean;
}

export const DRAG_SAFETY_MS = 1500;

export function createDragState(onChange: (active: boolean) => void, timers: Timers = realTimers, safetyMs = DRAG_SAFETY_MS): DragState {
  let depth = 0;
  let active = false;
  let timer: unknown = null;

  const set = (on: boolean) => {
    if (on === active) return;
    active = on;
    onChange(on);
  };
  const disarm = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const arm = () => {
    disarm();
    timer = timers.set(() => {
      timer = null;
      reset();
    }, safetyMs);
  };
  function reset(): void {
    disarm();
    depth = 0;
    set(false);
  }

  return {
    enter() {
      depth++;
      set(true);
      arm();
    },
    over() {
      // A dragover without a dragenter (enter happened before we listened, or the counter was
      // reset by a stray pointerdown): the drag is real, so show the overlay again.
      if (depth === 0) depth = 1;
      set(true);
      arm();
    },
    leave() {
      depth = Math.max(0, depth - 1);
      if (depth === 0) reset();
    },
    reset,
    get active() {
      return active;
    },
  };
}

export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Settles like `p`, or rejects with TimeoutError after `ms`. A late result is ignored. */
export function withTimeout<T>(p: Promise<T>, ms: number, timers: Timers = realTimers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const handle = timers.set(() => {
      if (done) return;
      done = true;
      reject(new TimeoutError());
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        timers.clear(handle);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        timers.clear(handle);
        reject(e);
      },
    );
  });
}

/**
 * Run at most one `fn` at a time; a call while one is pending is ignored (returns undefined).
 * The lock is released when `fn` settles or after `ms`, so a promise that never settles cannot
 * lock the button forever. Used for the "Paste" button (one system callout at a time).
 */
export function singleFlight<T>(fn: () => Promise<T>, ms: number, timers: Timers = realTimers): () => Promise<T | undefined> {
  let pending = false;
  return async () => {
    if (pending) return undefined;
    pending = true;
    try {
      return await withTimeout(fn(), ms, timers);
    } finally {
      pending = false;
    }
  };
}
