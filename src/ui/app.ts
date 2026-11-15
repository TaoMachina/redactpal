// App shell and screen state machine:
//   start ──file/paste/sample──► processing ──ok──► review ──Start over──► start
//     │                              └─error──► error ──Try another file──► start
//     └──Paste text instead / pasted text──► text ──Back──► start
//
// Only the shell, start screen and input handling are in the initial bundle. Everything heavy
// (OCR, pdf.js, pdf-lib, detection, the editor) is loaded with import() when it is first needed.
import { appRootUrl } from '../core/root';
import { announce, errorMessage, h, svg } from './dom';
import { classifyFile, unsupportedMessage } from './format';
import { singleFlight, TimeoutError } from './guards';
import { CLIPBOARD_TIMEOUT_MS, installGlobalInput, readClipboard } from './input';
import { readPreset } from './preset';
import { createProcessing } from './processing';
import { discardShared, isShareLaunch, takeShared, withoutShareParam } from './share';
import { createStart } from './start';
import type { TextController } from './textmode';

interface Screen {
  name: 'start' | 'processing' | 'review' | 'text' | 'error';
  el: HTMLElement;
  focus(): void;
  destroy?(): void;
  text?: TextController;
  /** The page's own first screen (start, or text mode on a text landing page): gets no history entry. */
  entry?: boolean;
}

const MARK =
  '<svg class="brand__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="3" y="7" width="26" height="4" rx="1.5" fill="currentColor" opacity=".35"/><rect x="3" y="14" width="18" height="6" rx="1" fill="currentColor"/><rect x="3" y="23" width="21" height="4" rx="1.5" fill="currentColor" opacity=".35"/></svg>';

export function startApp(mount: HTMLElement): void {
  let terms: string[] = []; // custom terms ("hide everywhere", text-mode selections) — memory only, never persisted
  let screen: Screen | null = null;
  let job = 0; // increments to invalidate in-flight analyses (Cancel)
  let running: AbortController | null = null; // aborts the in-flight PDF analysis
  // Image analysis can't be aborted once started (decode + OCR run to the end). Cancel → pick
  // another photo must not run two of them at once on a phone (twice the memory), so a new one
  // waits for the previous to finish; its result is thrown away.
  let imageWork: Promise<unknown> = Promise.resolve();
  let imageBusy = false;

  /** Start a new job: invalidates (and aborts) whatever was running. */
  function nextJob(): number {
    running?.abort();
    running = null;
    return ++job;
  }

  // Landing-page preset and pre-rendered headline (written by the content build, see scripts/content/).
  const preset = readPreset(mount.dataset);
  const intro = mount.querySelector<HTMLElement>('[data-intro]');
  intro?.remove();

  const main = h('main', { class: 'main', id: 'main' });
  const root = appRootUrl();
  const leaveGuard = (e: MouseEvent) => {
    const busy =
      screen?.name === 'review' ||
      screen?.name === 'processing' ||
      (screen?.name === 'text' && !!screen.el.querySelector('textarea')?.value.trim());
    if (busy && !confirm('Leave this page? Your file and changes will be lost.')) e.preventDefault();
  };
  const shell = h(
    'div',
    { class: 'shell' },
    h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
    // Same markup as the pre-rendered header (scripts/content/templates.ts masthead()).
    h(
      'header',
      { class: 'masthead' },
      h('a', { class: 'brand', href: root, 'aria-label': 'RedactPal home', onclick: leaveGuard }, svg(MARK), h('span', { class: 'brand__name' }, 'RedactPal')),
      h('nav', { class: 'masthead__nav', 'aria-label': 'Site' }, h('a', { href: new URL('guides/', root).href, onclick: leaveGuard }, 'Guides')),
    ),
    main,
    footer(),
    h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('p', null, 'Drop to redact. It stays on this device.')),
  );
  mount.replaceChildren(shell);

  // ---- screens -----------------------------------------------------------------------------

  function show(next: Screen): void {
    screen?.destroy?.();
    screen = next;
    document.body.dataset.screen = next.name;
    // The review screen is an app shell: it fills the viewport exactly and only its stage/panel
    // scroll, so the document never shows a second scrollbar. Every other screen scrolls normally.
    document.documentElement.classList.toggle('is-app-shell', next.name === 'review');
    main.replaceChildren(next.el);
    if (next.name !== 'start' && !next.entry && !history.state?.blot) history.pushState({ blot: true }, '');
    window.scrollTo(0, 0);
    next.focus();
  }

  function goStart(): void {
    nextJob();
    const s = createStart({
      onFile: (f) => openFile(f),
      onPasteButton: () => void pasteFromButton(),
      onText: () => void goText(''),
      onSample: () => void openSample(),
    }, { accept: preset.accept, intro });
    show({ name: 'start', ...s });
  }

  /** "Start over" buttons: unwind our history entry so the phone back button stays sensible. */
  function startOver(): void {
    if (history.state?.blot) history.back();
    else goStart();
  }

  /** `entry`: the page opens on text mode (landing-page preset), with the page's headline above the box. */
  async function goText(initial: string, entry = false): Promise<void> {
    const id = nextJob();
    let mod: typeof import('./textmode');
    try {
      mod = await import('./textmode');
    } catch (e) {
      return goError('Text mode couldn’t load', loadError(e));
    }
    if (id !== job) return;
    const t = mod.createTextMode({ terms: () => terms, setTerms: (x) => (terms = x), back: startOver }, initial, entry ? intro : null);
    show({ name: 'text', el: t.el, focus: t.focus, text: t, entry });
  }

  function goError(title: string, detail: string): void {
    const heading = h('h1', { class: 'error__title', id: 'err-title', tabindex: '-1' }, title);
    const el = h(
      'section',
      { class: 'screen error', 'aria-labelledby': 'err-title' },
      h(
        'div',
        { class: 'error__card', role: 'alert' },
        heading,
        h('p', { class: 'error__detail' }, detail),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--primary',
            onclick: () => {
              goStart();
              // Still inside the click, so the file picker is allowed to open.
              (document.getElementById('file') as HTMLInputElement | null)?.click();
            },
          },
          'Try another file',
        ),
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: startOver }, 'Back to start'),
      ),
    );
    show({ name: 'error', el, focus: () => heading.focus({ preventScroll: true }) });
  }

  // ---- flows -------------------------------------------------------------------------------

  async function openFile(file: File): Promise<void> {
    const kind = classifyFile(file);
    if (kind === 'unsupported') return goError('This file type isn’t supported', unsupportedMessage(file));
    if (kind === 'text') {
      try {
        return void goText(await file.text());
      } catch (e) {
        return goError('We couldn’t read this file', errorMessage(e));
      }
    }

    const id = nextJob();
    const ac = new AbortController();
    running = ac;
    const isPdf = kind === 'pdf';
    const p = createProcessing({
      title: isPdf ? 'Reading your PDF' : 'Reading your image',
      detail: 'Finding text and anything sensitive. This happens on your device.',
      onCancel: () => startOver(),
    });
    show({ name: 'processing', ...p });
    const onProgress = (f: number, msg?: string) => id === job && p.update(f, msg);

    try {
      const opts = { customTerms: terms };
      onProgress(0, 'Loading the reader…');
      const [{ docFromImage, docFromPdf }, { createReview }] = await Promise.all([import('./doc'), import('./review')]);
      let doc;
      if (isPdf) {
        const pdf = await import('../pdf');
        doc = docFromPdf(await pdf.analyzePdf(file, { ...opts, signal: ac.signal }, onProgress), file.name, pdf.exportRedactedPdf);
      } else {
        const img = await import('../image');
        const previous = imageWork;
        const mine = (async () => {
          if (imageBusy) onProgress(0, 'Finishing the previous image…');
          await previous;
          if (id !== job) return null; // cancelled while waiting: don't start at all
          imageBusy = true;
          try {
            return await img.analyzeImage(file, opts, onProgress);
          } finally {
            imageBusy = false;
          }
        })();
        imageWork = mine.catch(() => undefined);
        const analysis = await mine;
        if (!analysis) return;
        doc = docFromImage(analysis, file.name, img.exportRedactedImage);
      }
      if (id !== job) {
        // Cancelled while working: release what we got.
        doc.image?.bitmap.close();
        doc.pdf?.dispose();
        return;
      }
      const r = createReview(doc, { terms: () => terms, setTerms: (x) => (terms = x), startOver });
      show({ name: 'review', ...r });
      const n = doc.pages.reduce((s, pg) => s + new Set(pg.regions.map((r) => r.findingId ?? r.id)).size, 0);
      const unread = doc.pages.some((pg) => pg.warning);
      announce(
        n
          ? `Found ${n} thing${n === 1 ? '' : 's'} to hide. Review them before sharing.${unread ? ' Some of it couldn’t be read automatically — check it and draw boxes by hand.' : ''}`
          : unread
            ? 'Some of it couldn’t be read automatically. Check it and draw boxes over anything you want hidden.'
            : 'Nothing sensitive found. You can draw boxes yourself.',
      );
    } catch (e) {
      if (id !== job || isAbortError(e)) return;
      goError(isPdf ? 'We couldn’t open this PDF' : 'We couldn’t open this image', friendly(e, isPdf));
    }
  }

  async function openSample(): Promise<void> {
    try {
      const { createSampleScreenshot } = await import('./sample');
      await openFile(await createSampleScreenshot());
    } catch (e) {
      goError('The sample couldn’t be created', errorMessage(e));
    }
  }

  // One clipboard read at a time (iOS shows one system "Paste" callout per read), and never longer
  // than CLIPBOARD_TIMEOUT_MS: nothing waits on it, and a late answer is dropped, not acted on.
  const readOnce = singleFlight(readClipboard, CLIPBOARD_TIMEOUT_MS + 500);
  async function pasteFromButton(): Promise<void> {
    const from = screen;
    try {
      const r = await readOnce();
      if (!r || screen !== from) return; // a read is already pending, or the user moved on
      if (r.file) return openFile(r.file);
      if (r.text?.trim()) return void goText(r.text);
      announce('The clipboard is empty.');
    } catch (e) {
      if (screen !== from) return;
      announce(
        e instanceof TimeoutError
          ? 'The clipboard didn’t answer. Tap Paste again, or choose a file instead.'
          : 'Your browser didn’t allow reading the clipboard. Choose a file instead.',
      );
    }
  }

  // ---- global input ------------------------------------------------------------------------

  installGlobalInput({
    onFiles(files) {
      if (screen?.name === 'processing') return announce('Still working on the previous file.');
      if (screen?.name === 'review' && !confirm('Open the new file? Your changes to the current one will be lost.')) return;
      if (files.length > 1) announce('Opened the first file only.');
      void openFile(files[0]);
    },
    onText(text) {
      if (screen?.name === 'text') return screen.text?.setText(text);
      if (screen?.name === 'start' || screen?.name === 'error') void goText(text);
    },
  });

  window.addEventListener('popstate', () => {
    if (screen && screen.name !== 'start') goStart();
  });

  // ---- launched from the share sheet (Android, installed app) -------------------------------
  // public/sw.js parked the shared file/text and redirected to ./?shared=1. Take it (which deletes
  // it), tidy the address, and carry on exactly as if it had been chosen here.
  async function receiveShare(): Promise<void> {
    const item = await takeShared();
    if (!item) return; // nothing arrived: the start screen is already showing
    if (screen?.name !== 'start') return; // the user already picked something else meanwhile
    if (item.kind === 'file') void openFile(item.file);
    else void goText(item.text);
  }

  if (isShareLaunch(location.search)) {
    history.replaceState(history.state, '', withoutShareParam(location.href));
    goStart();
    void receiveShare();
  } else {
    if (preset.mode === 'text') {
      // Keep the headline on screen while text mode loads (it is a separate chunk).
      if (intro) main.replaceChildren(h('section', { class: 'screen start' }, intro));
      void goText('', true);
    } else goStart();
    // A share that was parked but never opened (e.g. the app failed to load) is not kept around.
    void discardShared();
  }
}

function isAbortError(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

function loadError(e: unknown): string {
  return /fetch|import|module/i.test(errorMessage(e))
    ? 'Part of the app couldn’t be loaded. Check your connection once, reload, and it will be kept for offline use.'
    : errorMessage(e);
}

function friendly(e: unknown, isPdf: boolean): string {
  if (/dynamically imported module|Importing a module script failed|error loading/i.test(errorMessage(e))) return loadError(e);
  const msg = errorMessage(e);
  if (/password|encrypt/i.test(msg)) return 'This PDF is password-protected. Open it, print or save it without a password, and try again.';
  if (/decode|bitmap|source image|InvalidStateError|could not be decoded/i.test(msg))
    return 'This image format couldn’t be opened in your browser. Try a PNG or JPG, or take a screenshot of it.';
  if (/invalid pdf|pdf structure|InvalidPDF/i.test(msg)) return 'This doesn’t look like a valid PDF file.';
  return `${isPdf ? 'The PDF' : 'The image'} couldn’t be processed: ${msg}`;
}

function footer(): HTMLElement {
  const point = (title: string, body: string) => h('li', null, h('strong', null, title), ' ', body);
  return h(
    'footer',
    { class: 'foot' },
    h(
      'details',
      { class: 'how' },
      h('summary', null, 'How it works'),
      h(
        'ul',
        { class: 'how__list' },
        point('On your device.', 'Text recognition and detection run in this page. It is blocked from connecting to any other server.'),
        point('Detection can miss things.', 'It finds patterns like emails, card numbers and API keys, not names — draw a box over a name and RedactPal offers to hide it everywhere. Always check before you share.'),
        point('Solid boxes only.', 'Blur and pixelation can be reversed, so RedactPal never uses them.'),
        point('Rebuilt from pixels.', 'You get a new PNG, or a new PDF of page images: no location data, metadata or hidden text. PDF text won’t be selectable.'),
        point('Nothing is kept.', 'Closing the tab forgets your file and your terms.'),
      ),
      // Which build this is (answers "is my phone on the latest version?") without cluttering the page.
      h('p', { class: 'how__ver' }, `Version ${__BUILD__}`),
    ),
  );
}
