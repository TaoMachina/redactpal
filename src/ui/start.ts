// Start screen: headline, the big drop zone, and the two secondary ways in.
import { SOURCE_URL } from './config';
import { h, isCoarsePointer } from './dom';
import { pasteShortcut } from './format';
import { createInstallLink } from './install';

export interface StartHandlers {
  onFile(file: File): void;
  onPasteButton(): void;
  onText(): void;
  onSample(): void;
}

export interface StartController {
  el: HTMLElement;
  focus(): void;
  destroy(): void;
}

export function createStart(on: StartHandlers): StartController {
  const coarse = isCoarsePointer();
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent;
  const key = pasteShortcut(platform);

  const fileInput = h('input', {
    type: 'file',
    id: 'file',
    class: 'sr-only',
    accept: 'image/*,application/pdf,.pdf',
    tabindex: '-1',
    onchange: () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (f) on.onFile(f);
    },
    // Picker closed without a file (iOS fires 'cancel', or nothing at all): nothing was started, so
    // there is no state to undo; just make sure the next pick of the same file still fires change.
    oncancel: () => {
      fileInput.value = '';
    },
  });
  const choose = h('button', { type: 'button', class: 'btn btn--primary btn--lg', onclick: () => fileInput.click() }, coarse ? 'Choose a photo or PDF' : 'Choose a file');
  const title = h('h1', { class: 'start__title', id: 'start-title', tabindex: '-1' }, 'Hide sensitive info before you share.');

  // The specimen: three "lines of a document", one of them already blotted out. Decorative.
  const specimen = h(
    'div',
    { class: 'specimen', 'aria-hidden': 'true' },
    h('span', { class: 'specimen__line' }, h('i', { style: { width: '22%' } }), h('i', { style: { width: '38%' } }), h('i', { style: { width: '16%' } })),
    h('span', { class: 'specimen__line' }, h('i', { style: { width: '14%' } }), h('b', { class: 'specimen__blot' }), h('i', { style: { width: '20%' } })),
    h('span', { class: 'specimen__line' }, h('i', { style: { width: '30%' } }), h('i', { style: { width: '26%' } })),
  );

  const zone = h(
    'div',
    {
      class: 'dropzone',
      role: 'group',
      'aria-labelledby': 'dz-title',
      // The whole zone is a click target for mouse users; the real control is the button.
      onclick: (e: MouseEvent) => {
        if (!(e.target as Element).closest('button')) fileInput.click();
      },
    },
    specimen,
    // One message, said once. Phones: the button says it all (the title stays for screen readers).
    h(
      'p',
      { class: coarse ? 'dropzone__title sr-only' : 'dropzone__title', id: 'dz-title' },
      coarse ? 'Choose a screenshot, photo or PDF' : `Paste (${key}) or drop a screenshot, photo or PDF`,
    ),
    h(
      'div',
      { class: 'dropzone__actions' },
      choose,
      null, // No Paste button on phones: a screenshot there goes to Photos, not the clipboard; tapping the box opens the picker.
    ),
  );

  const install = createInstallLink();
  const el = h(
    'section',
    { class: 'screen start', 'aria-labelledby': 'start-title' },
    h(
      'div',
      { class: 'start__intro' },
      title,
      h('p', { class: 'start__lede' }, 'Redact screenshots, PDFs and text. Everything stays in your browser — nothing is uploaded.'),
    ),
    zone,
    fileInput,
    h(
      'div',
      { class: 'start__alt' },
      h('button', { type: 'button', class: 'btn btn--quiet', onclick: on.onSample }, 'Try a sample'),
      h('button', { type: 'button', class: 'linkbtn linkbtn--soft', onclick: on.onText }, 'or type/paste text'),
    ),
    h(
      'p',
      { class: 'trust' },
      'Runs on your device. Turn off Wi-Fi and it still works. ',
      SOURCE_URL ? h('a', { href: SOURCE_URL, rel: 'noopener' }, 'Open source (MIT)') : h('span', null, 'Open source (MIT).'),
      install.el,
    ),
  );

  return { el, focus: () => title.focus({ preventScroll: true }), destroy: install.destroy };
}
