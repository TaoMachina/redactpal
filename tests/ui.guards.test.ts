import { describe, expect, it } from 'vitest';
import { createDragState, singleFlight, TimeoutError, withTimeout, type Timers } from '../src/ui/guards';

/** Manual clock: timers fire only when advanced. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set(fn, ms) {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= now && pending.has(id)) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance, count: () => pending.size };
}

function track() {
  const fake = fakeTimers();
  const changes: boolean[] = [];
  const d = createDragState((on) => changes.push(on), fake.timers, 1000);
  return { d, changes, ...fake };
}

describe('drag overlay state', () => {
  it('shows on enter and hides when the last leave balances the enters', () => {
    const { d, changes } = track();
    d.enter();
    d.enter(); // entering a child
    d.leave();
    expect(d.active).toBe(true);
    d.leave();
    expect(d.active).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('clears on drop / reset even when the counter drifted', () => {
    const { d } = track();
    d.enter();
    d.enter();
    d.enter();
    d.reset();
    expect(d.active).toBe(false);
    d.leave(); // a late leave after the reset must not go negative or flip it back on
    expect(d.active).toBe(false);
    d.enter();
    d.leave();
    expect(d.active).toBe(false);
  });

  it('clears by itself when the drag events stop (no leave/drop ever arrives)', () => {
    const { d, advance, count } = track();
    d.enter();
    advance(999);
    expect(d.active).toBe(true);
    advance(1);
    expect(d.active).toBe(false);
    expect(count()).toBe(0);
  });

  it('stays up while dragover keeps arriving', () => {
    const { d, advance } = track();
    d.enter();
    for (let i = 0; i < 10; i++) {
      advance(400);
      d.over();
    }
    expect(d.active).toBe(true);
    advance(1000);
    expect(d.active).toBe(false);
  });

  it('a dragover after a stray reset brings the overlay back for a real drag', () => {
    const { d, changes } = track();
    d.enter();
    d.reset(); // e.g. pointerdown/blur mid-drag
    d.over();
    expect(d.active).toBe(true);
    d.leave();
    expect(d.active).toBe(false);
    expect(changes).toEqual([true, false, true, false]);
  });

  it('reports each change once and leaves no timer behind', () => {
    const { d, changes, count } = track();
    d.reset();
    d.leave();
    expect(changes).toEqual([]);
    d.enter();
    d.over();
    d.over();
    expect(changes).toEqual([true]);
    d.reset();
    expect(count()).toBe(0);
  });
});

describe('withTimeout', () => {
  it('passes through a value or error that arrives in time', async () => {
    const { timers, count } = fakeTimers();
    await expect(withTimeout(Promise.resolve(5), 100, timers)).resolves.toBe(5);
    await expect(withTimeout(Promise.reject(new Error('no')), 100, timers)).rejects.toThrow('no');
    expect(count()).toBe(0);
  });

  it('rejects with TimeoutError when the promise never settles', async () => {
    const { timers, advance } = fakeTimers();
    const p = withTimeout(new Promise<never>(() => {}), 100, timers);
    advance(100);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it('ignores a result that arrives after the timeout', async () => {
    const { timers, advance } = fakeTimers();
    let resolve!: (v: number) => void;
    const p = withTimeout(new Promise<number>((r) => (resolve = r)), 100, timers);
    advance(100);
    resolve(1);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('singleFlight', () => {
  it('ignores calls while one is pending, then allows the next', async () => {
    const { timers } = fakeTimers();
    let calls = 0;
    let resolve!: (v: string) => void;
    const run = singleFlight(() => {
      calls++;
      return new Promise<string>((r) => (resolve = r));
    }, 1000, timers);
    const a = run();
    await expect(run()).resolves.toBeUndefined();
    resolve('x');
    await expect(a).resolves.toBe('x');
    expect(calls).toBe(1);
    const b = run();
    resolve('y');
    await expect(b).resolves.toBe('y');
    expect(calls).toBe(2);
  });

  it('releases the lock after the timeout even if the call never settles', async () => {
    const { timers, advance } = fakeTimers();
    let calls = 0;
    const run = singleFlight(() => {
      calls++;
      return new Promise<string>(() => {});
    }, 1000, timers);
    const a = run();
    advance(1000);
    await expect(a).rejects.toBeInstanceOf(TimeoutError);
    void run().catch(() => undefined);
    expect(calls).toBe(2);
  });
});
