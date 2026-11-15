// Review screen for images and PDFs. Deliberately small:
//   one hint line · the page(s) with semi-transparent boxes · one outcome button.
// The findings list lives in a collapsed disclosure. Drawing a box over text that appears elsewhere
// offers to hide it everywhere (see everywhere.ts). Boxes turn solid black at the moment of export
// (and on "Show final"); the exported file is always solid fill.
import type { Rect } from '../core/types';
import { disposeDoc, metadataEntries, newRegionId, redetect, type ReviewDoc } from './doc';
import { announce, errorMessage, h, isCoarsePointer, isEditable, svg } from './dom';
import { enableTermRegions, snapToWords, suggestEverywhere, withoutTerm, withTerm, type Suggestion } from './everywhere';
import { canCopyImage, canShareFiles, copyPng, downloadBlob, shareFile } from './export';
import { renderFindings } from './findings';
import { withTimeout } from './guards';
import { countHidden, doneMessage, groupRegions, plural, redactedFilename, type FindingItem, type PlacedRegion } from './format';
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

/** Writing the finished PNG to the clipboard is instant when it works; past this it failed. */
const CLIPBOARD_WRITE_TIMEOUT_MS = 10_000;

const LIST_ICON =
  '<svg class="disclosure__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="2.6" cy="4" r="1" fill="currentColor"/><circle cx="2.6" cy="8" r="1" fill="currentColor"/><circle cx="2.6" cy="12" r="1" fill="currentColor"/></svg>';
const DOWNLOAD_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 3v9.5M6 8.75l4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Ring that draws itself once, then a check mark (animated in CSS: .everywhere__ring). */
const DONE_RING =
  '<svg class="everywhere__ring" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">' +
  '<circle class="ring" cx="10" cy="10" r="8.25" pathLength="1"/>' +
  '<path class="tick" d="M6.2 10.4l2.5 2.4 5-5.3" pathLength="1"/></svg>';

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
    items: 0, // entries in the list (the count on the narrow-screen list button)
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
    create(pageIndex, drawn: Rect) {
      const page = pageOf(pageIndex);
      if (!page) return;
      const rect = snapToWords(page.tokens, drawn, page);
      const id = newRegionId('m');
      page.regions.push({ id, rect, kind: 'manual', label: 'Your box', text: '', enabled: true });
      st.selected = id;
      changed();
      const offer = offerEverywhere(pageIndex, rect, id);
      const added = coarse ? 'Box added.' : 'Box added. Press Delete to remove it.';
      announce(offer ? `${added} ${offerText(offer)} Hide all is ${every?.el.classList.contains('is-bar') ? 'above the page' : 'next to the box'}.` : added);
    },
    remove(id) {
      if (every?.regionId === id) dismissEvery();
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
  // Phones and tablets pinch-zoom the page natively (the stage allows pinch-zoom outside Draw mode),
  // so "Enlarge" is a mouse-and-keyboard tool only.
  const zoomBtn = coarse
    ? null
    : h('button', { type: 'button', class: 'btn btn--tool', 'aria-pressed': 'false', onclick: () => setZoom(!st.zoomed), title: 'See small text up close' }, 'Enlarge');
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

  // ---- disclosure: findings ----------------------------------------------------------------

  const findingsEl = h('div', { class: 'findings' });
  // Narrow screens: the action bar is one row (list · download · primary), so the other ways to
  // save live at the bottom of the list. Hidden by CSS on wider screens, where the bar has them.
  const panelSaveLinks = h('div', { class: 'panel__save-links', role: 'group', 'aria-labelledby': 'save-title' });
  const panelSave = h('div', { class: 'panel__save' }, h('p', { class: 'panel__save-title', id: 'save-title' }, 'More ways to save'), panelSaveLinks);

  const panel = h(
    'div',
    { class: 'panel', id: 'review-panel', role: 'region', 'aria-label': 'What will be hidden', hidden: true },
    h('p', { class: 'panel__tip' }, coarse ? 'Tap a box on the page to keep it visible.' : 'Click a box on the page to keep it visible.'),
    findingsEl,
    panelSave,
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
  // Narrow screens only (CSS): an always-visible Download next to the primary Share/Copy button.
  // Wider screens show the "Download PNG" link in `secondary` instead.
  const dlBtn = h('button', {
    type: 'button',
    class: 'btn btn--icon actions__dl',
    'aria-label': 'Download',
    title: isPdf ? 'Download' : 'Download PNG',
    hidden: primaryVia === 'download' || undefined,
    onclick: () => act('download'),
  });
  const doneEl = h('div', { class: 'done', role: 'status', hidden: true });
  const actions = h(
    'div',
    { class: 'actions' },
    doneEl,
    h('div', { class: 'actions__row' }, toggle, h('div', { class: 'actions__main' }, secondary, dlBtn, primary)),
    status,
  );

  const root = h(
    'section',
    { class: `screen review review--${doc.type}`, 'aria-labelledby': 'review-title' },
    bar,
    h('div', { class: 'review__body' }, stage, panel),
    actions,
  );

  // ---- "hide everywhere" prompt -------------------------------------------------------------
  // After a box is drawn over text that appears elsewhere: “Maria Lopez” appears 4 more times.
  // [Hide all] [×]. Next to the box with a mouse on a wide screen; on touch / narrow screens a bar
  // pinned to the top of the stage (beside a finger-drawn box it is easily covered or missed).

  let every: { el: HTMLElement; regionId: string; timer?: ReturnType<typeof setTimeout> } | null = null;

  const shorten = (s: string) => (s.length > 40 ? `${s.slice(0, 38).trimEnd()}…` : s);
  const offerText = (s: Suggestion) => `“${shorten(s.phrase)}” appears ${plural(s.count, 'more time', 'more times')}.`;

  function dismissEvery(): void {
    if (!every) return;
    if (every.timer) clearTimeout(every.timer);
    const hadFocus = every.el.contains(document.activeElement);
    every.el.remove();
    every = null;
    if (hadFocus) title.focus({ preventScroll: true });
  }

  const closeButton = (): HTMLElement =>
    h('button', { type: 'button', class: 'iconbtn everywhere__close', 'aria-label': 'Just this one', title: 'Just this one', onclick: () => dismissEvery() }, svg(CLOSE_ICON));

  function offerEverywhere(pageIndex: number, rect: Rect, regionId: string): Suggestion | null {
    dismissEvery();
    let found: Suggestion | null = null;
    try {
      found = suggestEverywhere(doc.pages, pageIndex, rect);
    } catch {
      found = null; // a convenience: it must never break drawing a box
    }
    const view = views.find((v) => v.page.index === pageIndex);
    if (!found || !view) return null;
    const offer = found;
    const el = h(
      'div',
      { class: 'everywhere', role: 'group', 'aria-label': 'Hide everywhere' },
      h('p', { class: 'everywhere__text' }, offerText(offer)),
      h('button', { type: 'button', class: 'btn btn--primary everywhere__go', onclick: () => hideEverywhere(offer) }, 'Hide all'),
      closeButton(),
    );
    every = { el, regionId };
    // Anchored only where it fits beside the box: mouse, wide window, page wide enough for it.
    if (!coarse && matchMedia('(min-width: 600px)').matches && view.el.clientWidth >= 360) {
      view.attachNear(el, rect);
      keepInView(el);
    } else {
      el.classList.add('is-bar');
      stage.insertBefore(el, stage.firstChild);
    }
    return offer;
  }

  function hideEverywhere(s: Suggestion): void {
    if (!every || st.busy) return;
    const terms = withTerm(host.terms(), s.phrase);
    try {
      redetect(doc, { customTerms: terms });
      enableTermRegions(doc.pages, s.phrase);
      dropRedundantManual(every.regionId);
    } catch (e) {
      every.el.replaceChildren(h('p', { class: 'everywhere__text everywhere__text--error' }, `Couldn’t hide those: ${errorMessage(e)}`), closeButton());
      return;
    }
    host.setTerms(terms);
    changed();
    const msg = `Hidden ${s.count} more.`;
    // The new boxes on the page are the real confirmation; this is just a brief, quiet "done":
    // a small pill whose ring draws itself around a check, then fades away on its own.
    const done = every;
    if (done.el.contains(document.activeElement)) title.focus({ preventScroll: true });
    done.el.classList.add('is-done');
    done.el.replaceChildren(svg(DONE_RING), h('span', { class: 'everywhere__text' }, `${s.count} more hidden`));
    done.timer = setTimeout(() => {
      done.el.classList.add('is-leaving');
      done.timer = setTimeout(() => dismissEvery(), 260);
    }, 1400);
    announce(`${msg} Every “${shorten(s.phrase)}” will be hidden. To undo, untick it in the list.`);
  }

  /** After "Hide all", the hand-drawn box that started it sits on top of a new custom region for the
   *  same word. Keeping both would count that word twice ("5 hidden" when 4 are visible), so drop the
   *  manual box when an enabled custom region covers the text under it. Never drops anything else. */
  function dropRedundantManual(regionId: string): void {
    for (const page of doc.pages) {
      const manual = page.regions.find((r) => r.id === regionId && r.kind === 'manual');
      if (!manual) continue;
      const m = manual.rect;
      const covered = page.regions.some((r) => {
        if (r === manual || !r.enabled || r.kind !== 'custom') return false;
        const ix = Math.max(0, Math.min(m.x + m.w, r.rect.x + r.rect.w) - Math.max(m.x, r.rect.x));
        const iy = Math.max(0, Math.min(m.y + m.h, r.rect.y + r.rect.h) - Math.max(m.y, r.rect.y));
        return ix * iy >= 0.5 * r.rect.w * r.rect.h; // the custom region sits inside the drawn box
      });
      if (covered) page.regions = page.regions.filter((r) => r !== manual);
    }
  }

  function stopHiding(term: string): void {
    const terms = withoutTerm(host.terms(), term);
    try {
      redetect(doc, { customTerms: terms });
    } catch (e) {
      announce(`That didn’t work: ${errorMessage(e)}`);
      return;
    }
    host.setTerms(terms);
    changed();
    announce(`“${shorten(term)}” will no longer be hidden everywhere.`);
  }

  /** Scroll the stage just enough that `el` is fully visible (never the document). */
  function keepInView(el: HTMLElement): void {
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const m = 12;
      if (r.bottom > s.bottom - m) stage.scrollTop += Math.min(r.bottom - s.bottom + m, r.top - s.top - m);
      else if (r.top < s.top + m) stage.scrollTop -= s.top - r.top + m;
      if (r.right > s.right - m) stage.scrollLeft += Math.min(r.right - s.right + m, r.left - s.left - m);
      else if (r.left < s.left + m) stage.scrollLeft -= s.left - r.left + m;
    });
  }

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
    if (!zoomBtn) return;
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
    const info = doc.pages.find((p) => p.notice)?.notice;
    const tail = info ? ` ${info}` : '';
    if (found === 0) {
      const noText = doc.pages.every((p) => p.tokens.length === 0);
      hint.textContent = `Nothing sensitive found${noText ? ' (no readable text)' : ''}. ${coarse && !st.drawMode ? 'Tap Draw, then drag' : 'Drag'} over anything you want hidden.${tail}`;
    } else {
      hint.textContent = `Found ${plural(found, 'thing', 'things')} to hide. ${keep} · ${add}.${tail}`;
    }
  }

  // Wide: "See list ▾". Narrow (CSS): a list icon and the number of entries, e.g. "≡ 6".
  function renderToggle(): void {
    toggle.setAttribute('aria-label', `See list, ${plural(st.items, 'item', 'items')}`);
    toggle.replaceChildren(
      svg(LIST_ICON),
      h('span', { class: 'disclosure__label' }, 'See list'),
      h('span', { class: 'disclosure__count', 'aria-hidden': 'true' }, String(st.items)),
      h('span', { class: 'disclosure__caret', 'aria-hidden': 'true' }, st.open ? '▴' : '▾'),
    );
  }

  const VERB: Record<Via, string> = { copy: 'Copy', share: 'Share', download: 'Download' };
  // After a successful export the button says so; any edit (changed()) resets it.
  const DONE_LABEL: Record<Via, string> = { copy: '✓ Copied', share: '✓ Shared', download: '✓ Downloaded' };

  function renderActions(): void {
    const n = hiddenCount();
    primary.textContent = st.done === primaryVia ? DONE_LABEL[primaryVia] : `${VERB[primaryVia]} · ${n} hidden`;
    primary.setAttribute('aria-label', `${VERB[primaryVia]} ${isPdf ? 'redacted PDF' : 'redacted image'}, ${plural(n, 'item', 'items')} hidden`);
    primary.disabled = st.busy;

    // The same secondary actions in the bar (wide screens) and at the bottom of the list (narrow).
    const fillLinks = (container: HTMLElement): number => {
      const links: HTMLElement[] = [];
      const link = (via: Via, label: string) =>
        h('button', { type: 'button', class: 'linkbtn', 'data-via': via, disabled: st.busy || undefined, onclick: () => act(via) }, st.done === via ? DONE_LABEL[via] : label);
      if (primaryVia !== 'download') links.push(link('download', isPdf ? 'Download' : 'Download PNG'));
      if (primaryVia !== 'copy' && canCopy) links.push(link('copy', 'Copy'));
      if (primaryVia !== 'share' && canShare) links.push(link('share', 'Share…'));
      const active = document.activeElement as HTMLElement | null;
      const focused = active && container.contains(active) ? active.dataset.via : undefined;
      container.replaceChildren(...links);
      if (focused) container.querySelector<HTMLElement>(`[data-via="${focused}"]`)?.focus();
      return links.length;
    };
    fillLinks(secondary);
    panelSave.hidden = fillLinks(panelSaveLinks) === 0;

    dlBtn.disabled = st.busy;
    const dlDone = st.done === 'download';
    dlBtn.replaceChildren(svg(dlDone ? CHECK_ICON : DOWNLOAD_ICON));
    dlBtn.setAttribute('aria-label', dlDone ? 'Downloaded' : 'Download');

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
    const groups = groupRegions(placed());
    st.items = groups.reduce((n, g) => n + g.items.length, 0);
    for (const v of views) v.refresh();
    renderHint();
    renderToggle();
    renderActions();
    renderFindings(findingsEl, groups, { multiPage: doc.pages.length > 1, hotKey: st.hot }, {
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
      stopTerm: (term) => stopHiding(term),
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
    // The lock is only for while the file is being built. Waiting on the system (share sheet,
    // clipboard) must never keep the page locked: iOS has left share() pending for good.
    const unlock = () => {
      if (!st.busy) return;
      st.busy = false;
      root.classList.remove('is-busy');
      renderActions();
    };
    try {
      if (via === 'copy') {
        const copying = copyPng(e.promise); // called inside the click (Safari), resolves after the write
        await e.promise.catch(() => undefined);
        await withTimeout(copying, CLIPBOARD_WRITE_TIMEOUT_MS);
        ok = true;
      } else if (via === 'download') {
        const blob = await e.promise;
        if (version !== st.version) throw new Error('You changed something while it was being built. Click again to export the latest version.');
        downloadBlob(blob, filename);
        ok = true;
      } else {
        const blob = e.blob ?? (await e.promise);
        unlock();
        const outcome = await shareFile(blob, filename);
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
      unlock();
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
      if (views.some((v) => v.cancelDrawing())) return;
      if (every) dismissEvery();
      else if (st.selected) pageHost.select(null);
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
      dismissEvery();
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

