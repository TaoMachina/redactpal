// "Working on it" screen: progress bar fed by the modules' onProgress callbacks, plus Cancel.
import { h } from './dom';

export interface ProcessingController {
  el: HTMLElement;
  focus(): void;
  update(fraction: number, message?: string): void;
}

export function createProcessing(opts: { title: string; detail: string; onCancel(): void }): ProcessingController {
  const bar = h('progress', { class: 'progress', max: '1', 'aria-labelledby': 'proc-title' });
  const message = h('p', { class: 'processing__msg', 'aria-live': 'polite' }, 'Starting…');
  const title = h('h1', { class: 'processing__title', id: 'proc-title', tabindex: '-1' }, opts.title);
  let lastMsg = '';

  const el = h(
    'section',
    { class: 'screen processing', 'aria-labelledby': 'proc-title', 'aria-busy': 'true' },
    h('div', { class: 'processing__card' }, title, h('p', { class: 'processing__detail' }, opts.detail), bar, message, h('button', { type: 'button', class: 'btn btn--quiet', onclick: opts.onCancel }, 'Cancel')),
  );

  return {
    el,
    focus: () => title.focus({ preventScroll: true }),
    update(fraction, msg) {
      if (Number.isFinite(fraction)) bar.value = Math.max(0, Math.min(1, fraction));
      // Only touch the live region when the words change, so screen readers aren't flooded.
      if (msg && msg !== lastMsg) {
        lastMsg = msg;
        message.textContent = msg;
      }
    },
  };
}
