// Text mode, built like the image review: ONE box. Paste → the box shows your text with what will
// be hidden highlighted → click a highlight to keep it visible, select text to hide more → one
// button copies the safe version. Values become placeholders like [EMAIL_1], which read fine to a
// person and also let an AI's reply be turned back into your real details (offered after copying).
import type { Finding } from '../core/types';
import { applyPlaceholders, detect, restorePlaceholders } from '../detect';
import { announce, debounce, errorMessage, h } from './dom';
import { copyText } from './export';
import { plural } from './format';
import { activeFindings, buildHighlightHtml } from './highlight';
import { SAMPLE_TEXT } from './sample';

/** Detection + highlighting rerun on every edit; beyond this the page would stall. */
const MAX_TEXT = 2_000_000;

export interface TextHost {
  terms(): string[];
  setTerms(terms: string[]): void;
  back(): void;
}

export interface TextController {
  el: HTMLElement;
  focus(): void;
  setText(text: string): void;
}

export function createTextMode(host: TextHost, initial = ''): TextController {
  let findings: Finding[] = [];
  const kept = new Set<string>(); // values the user chose to keep visible
  let mapping: Record<string, string> = {};
  let safeText = '';
  let editing = !initial;
  let preview = false;
  let copied = false;

  // ---- the one box: a textarea while editing, the highlighted text otherwise ----------------
  const input = h('textarea', {
    id: 'text-in',
    class: 'textarea textbox__input',
    rows: '12',
    spellcheck: 'false',
    placeholder: 'Paste your text here (Ctrl+V) — an email, a message, a log, a config file…',
    'aria-label': 'Your text',
  });
  input.value = initial;
  const mirror = h('div', { class: 'mirror textbox__view', id: 'mirror', 'aria-live': 'off', 'aria-label': 'Your text with sensitive parts highlighted' });
  const editLink = h('button', { type: 'button', class: 'linkbtn textbox__edit', onclick: () => setEditing(true) }, 'Edit text');
  const box = h('div', { class: 'textbox' }, input, mirror, editLink);

  const hint = h('p', { class: 'hint', role: 'status' });
  const errorLine = h('p', { class: 'field__error', role: 'alert' });

  // ---- actions ---------------------------------------------------------------------------------
  const hideSel = h('button', { type: 'button', class: 'btn btn--tool', hidden: true, onclick: () => hideSelection() }, 'Hide selected');
  const previewBtn = h('button', { type: 'button', class: 'btn btn--tool btn--subtle', 'aria-pressed': 'false', title: 'See exactly what will be copied', onclick: () => setPreview(!preview) }, 'Preview');
  const copyBtn = h('button', { type: 'button', class: 'btn btn--primary btn--outcome', onclick: () => void copySafe() });
  const done = h('p', { class: 'done__title', hidden: true });

  // ---- after copying: optional "put your details back" for AI replies --------------------------
  const reply = h('textarea', { id: 'ai-reply', class: 'textarea', rows: '5', spellcheck: 'false', placeholder: 'Paste the AI’s reply here' });
  const restoredCopy = h('button', { type: 'button', class: 'btn btn--primary', disabled: true, onclick: () => void copyRestored() }, 'Copy with my details');
  const restore = h(
    'details',
    { class: 'restore', hidden: true },
    h('summary', null, 'Sent it to ChatGPT or another AI? Put your details back into its reply'),
    h('p', { class: 'field__hint' }, 'Paste the reply below. Placeholders like [EMAIL_1] are swapped back for your real details. This only works until you close this tab.'),
    reply,
    h('div', { class: 'row' }, restoredCopy),
  );

  // What `findings` was computed from: never apply findings to different text (offsets would be
  // wrong and parts of secrets could slip through).
  let analysedText: string | null = null;
  let analysedTerms = '';
  const termsKey = () => host.terms().join('\u0000');
  const isStale = () => input.value !== analysedText || termsKey() !== analysedTerms;
  function ensureFresh(): void {
    if (isStale()) analyse();
  }

  function analyse(): void {
    const text = input.value;
    analysedText = text;
    analysedTerms = termsKey();
    errorLine.textContent = '';
    if (text.length > MAX_TEXT) {
      findings = [];
      errorLine.textContent = `That’s too much text for this page (${Math.round(text.length / 1e6)} MB). Paste up to 2 MB at a time.`;
    } else {
      try {
        findings = text ? detect(text, { customTerms: host.terms() }) : [];
      } catch (e) {
        findings = [];
        errorLine.textContent = `Detection failed: ${errorMessage(e)}`;
      }
    }
    render();
  }

  function render(): void {
    if (isStale()) return analyse();
    const text = input.value;
    const active = activeFindings(findings, kept);
    try {
      const r = text ? applyPlaceholders(text, active) : { text: '', mapping: {} };
      safeText = r.text;
      mapping = r.mapping;
    } catch (e) {
      safeText = '';
      errorLine.textContent = `Couldn’t build the safe version: ${errorMessage(e)}`;
    }

    const showView = !!text && !editing;
    input.hidden = showView;
    mirror.hidden = !showView;
    editLink.hidden = !showView;
    if (showView) {
      if (preview) mirror.textContent = safeText;
      else mirror.innerHTML = buildHighlightHtml(text, findings, kept); // every piece is escaped
    }
    mirror.classList.toggle('is-preview', preview);

    if (!text) hint.textContent = '';
    else if (findings.length === 0) hint.textContent = 'Nothing sensitive found. Select any text to hide it.';
    else hint.textContent = `Found ${plural(findings.length, 'thing', 'things')} to hide. Click one to keep it visible · select text to hide more.`;

    previewBtn.hidden = !showView;
    previewBtn.setAttribute('aria-pressed', String(preview));
    copyBtn.disabled = !text;
    copyBtn.textContent = copied ? '✓ Copied' : text ? `Copy safe text · ${active.length} hidden` : 'Copy safe text';
    done.hidden = !copied;
    done.textContent = copied ? 'Now paste it anywhere.' : '';
    restore.hidden = !copied || Object.keys(mapping).length === 0;
  }

  function changed(): void {
    copied = false;
    render();
  }

  function setEditing(v: boolean): void {
    editing = v;
    preview = false;
    hideSel.hidden = true;
    render();
    if (v) input.focus();
  }

  function setPreview(v: boolean): void {
    preview = v;
    hideSel.hidden = true;
    render();
  }

  // ---- select text to hide it (every occurrence, like "Hide all" in the review screen) -------------------------
  function selectedInMirror(): string {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
    const r = sel.getRangeAt(0);
    if (!mirror.contains(r.commonAncestorContainer)) return '';
    return sel.toString().trim();
  }
  document.addEventListener('selectionchange', () => {
    if (!el.isConnected) return;
    const s = preview ? '' : selectedInMirror();
    hideSel.hidden = !s;
    if (s) hideSel.textContent = `Hide “${s.length > 24 ? `${s.slice(0, 22)}…` : s}”`;
  });
  function hideSelection(): void {
    const s = selectedInMirror();
    if (!s) return;
    const terms = host.terms();
    if (!terms.some((t) => t.toLowerCase() === s.toLowerCase())) host.setTerms([...terms, s]);
    kept.delete(s);
    document.getSelection()?.removeAllRanges();
    hideSel.hidden = true;
    announce(`“${s}” will be hidden everywhere in this text.`);
    analyse();
    copied = false;
    render();
  }

  // ---- copy ------------------------------------------------------------------------------------
  async function copySafe(): Promise<void> {
    ensureFresh();
    if (!safeText) return;
    const ok = await copyText(safeText);
    if (!ok) {
      errorLine.textContent = 'Your browser didn’t allow copying. Click Preview, then select and copy the text.';
      return;
    }
    copied = true;
    editing = false;
    announce('Copied. Now paste it anywhere.');
    render();
  }

  async function copyRestored(): Promise<void> {
    const out = restorePlaceholders(reply.value, mapping);
    const ok = await copyText(out);
    restoredCopy.textContent = ok ? '✓ Copied' : 'Copy failed';
    setTimeout(() => (restoredCopy.textContent = 'Copy with my details'), 1800);
  }

  // ---- events ------------------------------------------------------------------------------------
  const analyseSoon = debounce(() => {
    analyse();
  }, 150);
  input.addEventListener('input', () => {
    copied = false;
    analyseSoon();
  });
  // Pasting is the main way in: show the highlighted view straight away.
  input.addEventListener('paste', () =>
    setTimeout(() => {
      if (input.value) setEditing(false);
    }, 0),
  );
  input.addEventListener('blur', () => {
    if (input.value && editing) setEditing(false);
  });
  reply.addEventListener('input', () => (restoredCopy.disabled = !reply.value.trim()));
  mirror.addEventListener('click', (e) => {
    if (selectedInMirror()) return; // finishing a selection, not a toggle
    const b = (e.target as Element).closest<HTMLElement>('.hl');
    const key = b?.dataset.key;
    if (key === undefined) return;
    if (kept.has(key)) kept.delete(key);
    else kept.add(key);
    changed();
    mirror.querySelector<HTMLElement>(`.hl[data-key="${CSS.escape(key)}"]`)?.focus();
  });

  const title = h('h1', { class: 'sr-only', id: 'text-title', tabindex: '-1' }, 'Hide sensitive info in text');
  const el = h(
    'section',
    { class: 'screen textmode', 'aria-labelledby': 'text-title' },
    h(
      'div',
      { class: 'text__bar' },
      h('button', { type: 'button', class: 'btn btn--quiet btn--back', onclick: () => host.back() }, 'Back'),
      title,
      h('div', { class: 'review__tools' }, hideSel, previewBtn),
    ),
    h('div', { class: 'text__body' }, hint, box, errorLine),
    // Only the one row sticks to the bottom; the rest scrolls, so on a phone the pinned area is
    // never taller than one button (the "put your details back" box can be tall when open).
    h('div', { class: 'text__actions' }, h('div', { class: 'text__actions-row' }, done, copyBtn)),
    restore,
    h('p', { class: 'field__hint text__note' }, 'Stays on your device. Nothing is sent anywhere. ', h('button', { type: 'button', class: 'linkbtn', onclick: () => setText(SAMPLE_TEXT) }, 'Try sample text')),
  );

  function setText(text: string): void {
    input.value = text;
    kept.clear();
    copied = false;
    editing = !text;
    preview = false;
    analyse();
  }

  analyse();

  return {
    el,
    focus: () => (input.value ? title.focus({ preventScroll: true }) : input.focus()),
    setText,
  };
}
