// Review screen for images and PDFs. Deliberately small:
//   one hint line · the page(s) with semi-transparent boxes · one outcome button.
// Findings list and "Always hide…" live in a collapsed disclosure. Boxes turn solid black at the
// moment of export (and on "Show final"); the exported file is always solid fill.
import type { Rect } from '../core/types';
import { disposeDoc, metadataEntries, newRegionId, redetect, type ReviewDoc } from './doc';
import { announce, debounce, errorMessage, h, isCoarsePointer, isEditable } from './dom';
import { canCopyImage, canShareFiles, copyPng, downloadBlob, shareFile } from './export';
import { renderFindings } from './findings';
import { countHidden, doneMessage, groupRegions, parseTerms, plural, redactedFilename, type FindingItem, type PlacedRegion } from './format';
import { PageView, type PageViewHost } from './pageview';

export interface ReviewHost {
  terms(): string[];
  setTerms(terms: string[]): void;
  startOver(): void;
}

export interface ReviewController {
  el: HTMLElement;
  focus(): void;
  destroy(): void;
}

type Via = 'copy' | 'download' | 'share';

export function createReview(doc: ReviewDoc, host: ReviewHost): ReviewController {
  const coarse = isCoarsePointer();
  const isPdf = doc.type === 'pdf';
  const filename = redactedFilename(doc.name, isPdf ? 'pdf' : 'png');
  const canCopy = !isPdf && canCopyImage();
  const canShare = canShareFiles();
  // One primary action that states the outcome. Share on phones/tablets (it's how people send
  // things there), Copy on desktop, Download for PDFs or when neither is available.
  const primaryVia: Via = isPdf ? 'download' : coarse && canShare ? 'share' : canCopy ? 'copy' : canShare ? 'share' : 'download';

  const st = {
    final: false,
    zoomed: false,
    drawMode: false,
    selected: null as string | null,
    hot: null as string | null,
    version: 0,
    done: null as Via | null,
    busy: false,
    open: false,
  };

  // ---- model helpers -----------------------------------------------------------------------

  const placed = (): PlacedRegion[] => doc.pages.flatMap((p) => p.regions.map((region) => ({ page: p.index, region })));
  const pageOf = (index: number) => doc.pages.find((p) => p.index === index);
  const findRegion = (id: string) => placed().find((x) => x.region.id === id);
  const hiddenCount = () => countHidden(placed());

  function changed(): void {
    st.version++;
    if (st.done) {
      st.done = null;
      setFinal(false, true);
    }
    refreshAll();
  }

  const pageHost: PageViewHost = {
    state: () => ({ preview: st.final, drawMode: st.drawMode, selected: st.selected, coarse }),
    toggle(pageIndex, regionId) {
      const page = pageOf(pageIndex);
      const r = page?.regions.find((x) => x.id === regionId);
      if (!page || !r || r.kind === 'manual') return;
      const value = !r.enabled;
      for (const x of page.regions) if (x.id === r.id || (r.findingId && x.findingId === r.findingId)) x.enabled = value;
      st.selected = null;
      changed();
      announce(`${r.label}: ${value ? 'will be hidden' : 'will stay visible'}`);
    },
    select(id) {
      if (st.selected === id) return;
      st.selected = id;
      for (const v of views) v.refresh();
    },
    create(pageIndex, rect: Rect) {
      const page = pageOf(pageIndex);
      if (!page) return;
      const id = newRegionId('m');
      page.regions.push({ id, rect, kind: 'manual', label: 'Your box', text: '', enabled: true });
      st.selected = id;
      changed();
      announce(coarse ? 'Box added.' : 'Box added. Press Delete to remove it.');
    },
    remove(id) {
      for (const p of doc.pages) p.regions = p.regions.filter((r) => r.id !== id);
      if (st.selected === id) st.selected = null;
      changed();
      announce('Box removed.');
    },
    hover: (key) => setHot(key),
  };

  function setHot(key: string | null): void {
    if (st.hot === key) return;
    st.hot = key;
    for (const v of views) v.markHot(key);
    for (const li of findingsEl.querySelectorAll<HTMLElement>('.fitem')) li.classList.toggle('is-hot', li.dataset.item === key);
  }

  // ---- top bar -----------------------------------------------------------------------------

  const title = h('h1', { class: 'review__title', id: 'review-title', tabindex: '-1' }, doc.name || (isPdf ? 'Your PDF' : 'Your image'));
  const drawBtn = coarse
    ? h('button', { type: 'button', class: 'btn btn--tool', 'aria-pressed': 'false', onclick: () => setDraw(!st.drawMode), title: 'Then drag over anything you want hidden' }, 'Draw a box')
    : null;
  const zoomBtn = h('button', { type: 'button', class: 'btn btn--tool', 'aria-pressed': 'false', onclick: () => setZoom(!st.zoomed), title: 'See small text up close' }, 'Enlarge');
  const finalBtn = h(
    'button',
    { type: 'button', class: 'btn btn--tool btn--subtle', 'aria-pressed': 'false', title: 'See exactly what will be shared (hold, or click to switch)' },
    'Preview',
  );
  bindHoldToggle(finalBtn, (v) => setFinal(v));

  const bar = h(
    'div',
    { class: 'review__bar' },
    h('button', { type: 'button', class: 'btn btn--quiet btn--back', onclick: () => host.startOver(), title: 'Close this and pick another file' }, 'New file'),
    h('div', { class: 'review__heading' }, title),
    h('div', { class: 'review__tools', role: 'toolbar', 'aria-label': 'View' }, drawBtn, zoomBtn, finalBtn),
  );

  // ---- stage -------------------------------------------------------------------------------

  const hint = h('p', { class: 'hint', id: 'stage-hint', 'aria-live': 'polite' });
  const notice = isPdf ? pdfNotice(doc) : null;
  const stage = h('div', { class: 'stage' });
  const views: PageView[] = doc.pages.map(
    (p) =>
      new PageView(p, pageHost, {
        lazy: isPdf,
        scrollRoot: stage,
        maxWidth: isPdf ? p.width * 1.75 : p.width,
        label: isPdf ? `Page ${p.index + 1} of ${doc.pages.length}${p.scanned ? ' · scanned, text read by OCR' : ''}` : undefined,
      }),
  );
  const pagesEl = h('div', { class: 'pages', 'aria-describedby': 'stage-hint' }, views.map((v) => v.el));
  stage.append(...[hint, notice, pagesEl].filter((x): x is HTMLElement => !!x));

  // ---- disclosure: findings + Always hide --------------------------------------------------

  const findingsEl = h('div', { class: 'findings' });
  const termsInput = h('input', {
    type: 'text',
    id: 'terms',
    class: 'input',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'e.g. Jane Doe, Acme, Project Falcon',
    'aria-describedby': 'terms-hint terms-error',
    value: host.terms().join(', '),
  });
  const termsError = h('p', { class: 'field__error', id: 'terms-error', role: 'alert' });
  const applyTerms = () => {
    const terms = parseTerms(termsInput.value);
    if (terms.join('\n') === host.terms().join('\n')) return;
    host.setTerms(terms);
    try {
      redetect(doc, { customTerms: terms });
      termsError.textContent = '';
      changed();
      announce(`${plural(hiddenCount(), 'item', 'items')} will be hidden.`);
    } catch (e) {
      termsError.textContent = `Couldn’t search for those terms: ${errorMessage(e)}`;
    }
  };
  const applyTermsSoon = debounce(applyTerms, 600);
  termsInput.addEventListener('input', () => applyTermsSoon());
  const applyNow = () => {
    applyTermsSoon.cancel();
    applyTerms();
  };
  termsInput.addEventListener('change', applyNow);
  termsInput.addEventListener('keydown', (e) => e.key === 'Enter' && applyNow());

  const panel = h(
    'div',
    { class: 'panel', id: 'review-panel', role: 'region', 'aria-label': 'What will be hidden', hidden: true },
    h('p', { class: 'panel__tip' }, coarse ? 'Tap a box on the page to keep it visible.' : 'Click a box on the page to keep it visible.'),
    findingsEl,
    h(
      'div',
      { class: 'field terms' },
      h('label', { for: 'terms', class: 'field__label' }, 'Always hide…'),
      termsInput,
      h('p', { class: 'field__hint', id: 'terms-hint' }, 'Names, company, project — separated by commas. Forgotten when you close this tab.'),
      termsError,
    ),
  );

  // ---- action bar --------------------------------------------------------------------------

  const toggle = h('button', {
    type: 'button',
    class: 'disclosure',
    'aria-expanded': 'false',
    'aria-controls': 'review-panel',
    onclick: () => setOpen(!st.open),
  });
  const status = h('p', { class: 'actions__status', role: 'status', 'aria-live': 'polite' });
  const primary = h('button', { type: 'button', class: 'btn btn--primary btn--outcome', onclick: () => act(primaryVia) });
  const secondary = h('div', { class: 'actions__more' });
  const doneEl = h('div', { class: 'done', role: 'status', hidden: true });
  const actions = h(
    'div',
    { class: 'actions' },
    doneEl,
    h('div', { class: 'actions__row' }, toggle, h('div', { class: 'actions__main' }, secondary, primary)),
    status,
  );

  const root = h(
    'section',
    { class: `screen review review--${doc.type}`, 'aria-labelledby': 'review-title' },
    bar,
    h('div', { class: 'review__body' }, stage, panel),
    actions,
  );

  // ---- view state --------------------------------------------------------------------------

  function setFinal(v: boolean, silent = false): void {
    if (st.final === v) return;
    st.final = v;
    st.selected = null;
    root.classList.toggle('is-final', v);
    finalBtn.setAttribute('aria-pressed', String(v));
    if (v && st.drawMode) setDraw(false);
    for (const p of views) p.refresh();
    if (!silent) announce(v ? 'Showing the result exactly as it will be shared.' : 'Back to editing.');
  }
  function setZoom(v: boolean): void {
    st.zoomed = v;
    root.classList.toggle('is-zoomed', v);
    zoomBtn.setAttribute('aria-pressed', String(v));
    zoomBtn.textContent = v ? 'Fit to screen' : 'Enlarge';
  }
  function setDraw(v: boolean): void {
    st.drawMode = v;
    drawBtn?.setAttribute('aria-pressed', String(v));
    if (v) setFinal(false, true);
    for (const p of views) p.updateSurfaceMode();
    renderHint();
  }
  function setOpen(open: boolean): void {
    st.open = open;
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    renderToggle();
  }

  // ---- rendering ---------------------------------------------------------------------------

  function renderHint(): void {
    const detected = placed().filter((x) => x.region.kind !== 'manual');
    const found = new Set(detected.map((x) => `${x.page}:${x.region.findingId ?? x.region.id}`)).size;
    // Both manual actions are spelled out every time: people don't guess that boxes are clickable.
    const keep = coarse ? 'Tap a box to keep it visible' : 'Click a box to keep it visible';
    const add = coarse ? (st.drawMode ? 'drag to hide more' : 'tap Draw to hide more') : 'drag to hide more';
    // A page we couldn't read must never look like a clean page.
    const unread = doc.pages.filter((p) => p.warning);
    if (unread.length) {
      const where = doc.pages.length > 1 ? ` (page ${unread.map((p) => p.index + 1).join(', ')})` : '';
      hint.textContent = `⚠ ${unread[0].warning}${where}`;
      hint.classList.add('hint--warn');
      return;
    }
    if (found === 0) {
      const noText = doc.pages.every((p) => p.tokens.length === 0);
      hint.textContent = `Nothing sensitive found${noText ? ' (no readable text)' : ''}. ${coarse && !st.drawMode ? 'Tap Draw, then drag' : 'Drag'} over anything you want hidden.`;
    } else {
      hint.textContent = `Found ${plural(found, 'thing', 'things')} to hide. ${keep} · ${add}.`;
    }
  }

  function renderToggle(): void {
    toggle.replaceChildren('See list', h('span', { class: 'disclosure__caret', 'aria-hidden': 'true' }, st.open ? '▴' : '▾'));
  }

  const VERB: Record<Via, string> = { copy: 'Copy', share: 'Share', download: 'Download' };
  // After a successful export the button says so; any edit (changed()) resets it.
  const DONE_LABEL: Record<Via, string> = { copy: '✓ Copied', share: '✓ Shared', download: '✓ Downloaded' };

  function renderActions(): void {
    const n = hiddenCount();
    primary.textContent = st.done === primaryVia ? DONE_LABEL[primaryVia] : `${VERB[primaryVia]} · ${n} hidden`;
    primary.setAttribute('aria-label', `${VERB[primaryVia]} ${isPdf ? 'redacted PDF' : 'redacted image'}, ${plural(n, 'item', 'items')} hidden`);
    primary.disabled = st.busy;

    const links: HTMLElement[] = [];
    const link = (via: Via, label: string) =>
      h('button', { type: 'button', class: 'linkbtn', disabled: st.busy || undefined, onclick: () => act(via) }, st.done === via ? DONE_LABEL[via] : label);
    if (primaryVia !== 'download') links.push(link('download', isPdf ? 'Download' : 'Download PNG'));
    if (primaryVia !== 'copy' && canCopy) links.push(link('copy', 'Copy'));
    if (primaryVia !== 'share' && canShare) links.push(link('share', 'Share…'));
    const focused = secondary.contains(document.activeElement) ? document.activeElement?.textContent : null;
    secondary.replaceChildren(...links);
    if (focused) for (const b of secondary.querySelectorAll('button')) if (b.textContent === focused) b.focus();

    doneEl.hidden = !st.done;
    if (st.done) {
      // One line: what happened + what's next. Details (filename, metadata) live in "How it works".
      const what = st.done === 'copy' ? 'Now paste it anywhere.' : st.done === 'download' ? 'It’s in your Downloads folder.' : 'Sent.';
      doneEl.replaceChildren(
        h('p', { class: 'done__title' }, what, ' ', h('button', { type: 'button', class: 'linkbtn', onclick: () => host.startOver() }, 'New file')),
      );
    }
  }

  function refreshAll(): void {
    for (const v of views) v.refresh();
    renderHint();
    renderToggle();
    renderActions();
    renderFindings(findingsEl, groupRegions(placed()), { multiPage: doc.pages.length > 1, hotKey: st.hot }, {
      setItems(items, enabled) {
        for (const it of items)
          for (const id of it.regionIds) {
            const f = findRegion(id);
            if (f && f.region.kind !== 'manual') f.region.enabled = enabled;
          }
        changed();
      },
      reveal: (it) => reveal(it),
      hover: (key) => setHot(key),
      remove: (it) => it.regionIds.forEach((id) => pageHost.remove(id)),
    });
  }

  function reveal(it: FindingItem): void {
    if (matchMedia('(max-width: 899px)').matches) setOpen(false);
    views.find((v) => v.page.index === it.page)?.scrollToRegion(it.regionIds[0]);
    setHot(it.key);
    if (it.kind === 'manual') pageHost.select(it.regionIds[0]);
  }

  // ---- export ------------------------------------------------------------------------------

  type Entry = { version: number; promise: Promise<Blob>; blob?: Blob };
  let cache: Entry | null = null;

  function getExport(): Entry {
    if (cache && cache.version === st.version) return cache;
    const entry: Entry = {
      version: st.version,
      promise: Promise.resolve().then(() =>
        doc.exportBlob((f, msg) => {
          status.textContent = `${msg || 'Building PDF'} · ${Math.round(f * 100)}%`;
        }),
      ),
    };
    entry.promise.then(
      (b) => (entry.blob = b),
      () => cache === entry && (cache = null),
    );
    return (cache = entry);
  }

  async function act(via: Via): Promise<void> {
    if (st.busy) return;
    const e = getExport(); // start now: Safari needs the clipboard/share call inside the click
    const version = st.version;
    const wasFinal = st.final;
    setFinal(true, true); // this is the moment it becomes black
    st.busy = true;
    // Lock editing while the file is built: an edit now would not be in the file being exported.
    root.classList.add('is-busy');
    renderActions();
    status.textContent = isPdf ? 'Building your PDF…' : '';
    let ok = false;
    try {
      if (via === 'copy') {
        await copyPng(e.promise);
        ok = true;
      } else if (via === 'download') {
        const blob = await e.promise;
        if (version !== st.version) throw new Error('You changed something while it was being built. Click again to export the latest version.');
        downloadBlob(blob, filename);
        ok = true;
      } else {
        const outcome = await shareFile(e.blob ?? (await e.promise), filename);
        if (outcome === 'needs-gesture') status.textContent = 'Ready. Tap Share again to send it.';
        else if (outcome === 'failed') status.textContent = 'Sharing isn’t available here. Use Download instead.';
        else status.textContent = '';
        ok = outcome === 'shared';
      }
    } catch (err) {
      const exportFailed = await e.promise.then(
        () => false,
        () => true,
      );
      status.textContent = exportFailed
        ? `Couldn’t create the redacted file: ${errorMessage(err)}`
        : via === 'copy'
          ? 'Your browser didn’t allow copying the image. Use Download PNG instead.'
          : `That didn’t work: ${errorMessage(err)}`;
    } finally {
      st.busy = false;
      root.classList.remove('is-busy');
    }
    if (ok && version === st.version) {
      st.done = via;
      status.textContent = '';
      announce(doneMessage(hiddenCount(), doc.type));
    } else if (!wasFinal) {
      setFinal(false, true);
    }
    renderActions();
  }

  // ---- keyboard ----------------------------------------------------------------------------

  const onKey = (e: KeyboardEvent) => {
    if (isEditable(e.target) || st.busy) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.selected) {
      if (findRegion(st.selected)?.region.kind === 'manual') {
        e.preventDefault();
        pageHost.remove(st.selected);
      }
    } else if (e.key === 'Escape') {
      if (st.selected) pageHost.select(null);
      else if (st.open) setOpen(false);
    }
  };
  document.addEventListener('keydown', onKey);

  refreshAll();

  return {
    el: root,
    focus: () => title.focus({ preventScroll: true }),
    destroy() {
      document.removeEventListener('keydown', onKey);
      applyTermsSoon.cancel();
      for (const v of views) v.destroy();
      disposeDoc(doc);
    },
  };
}

/** Press-and-hold shows while held; a quick press (or keyboard) toggles. */
function bindHoldToggle(btn: HTMLButtonElement, set: (v: boolean) => void): void {
  let downAt = 0;
  let turnedOn = false;
  const pressed = () => btn.getAttribute('aria-pressed') === 'true';
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downAt = performance.now();
    turnedOn = !pressed();
    if (turnedOn) set(true);
  });
  const release = () => {
    if (!downAt) return;
    const held = performance.now() - downAt > 350;
    downAt = 0;
    if (turnedOn ? held : true) set(false);
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', () => downAt && release());
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) set(!pressed()); // keyboard activation
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch
}

function pdfNotice(doc: ReviewDoc): HTMLElement {
  const meta = metadataEntries(doc);
  return h(
    'div',
    { class: 'notice' },
    h('p', null, 'Exported pages become images, so hidden text can’t be recovered (text won’t be selectable).'),
    meta.length
      ? h(
          'details',
          { class: 'notice__meta' },
          h('summary', null, `Metadata that will be removed (${meta.length})`),
          h('dl', null, meta.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        )
      : h('p', { class: 'notice__sub' }, 'Metadata, annotations, attachments and form fields are removed too.'),
  );
}

