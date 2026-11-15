// Text mode: paste text, see what's sensitive, copy a redacted or placeholder version, and restore
// an AI reply from the in-memory placeholder mapping.
import type { Finding } from '../core/types';
import { applyPlaceholders, detect, redactText, restorePlaceholders } from '../detect';
import { announce, debounce, errorMessage, h } from './dom';

/** Detection + highlighting rerun on every edit; beyond this the page would stall. */
const MAX_TEXT = 2_000_000;
import { copyText, downloadBlob } from './export';
import { parseTerms, plural } from './format';
import { activeFindings, buildHighlightHtml } from './highlight';
import { SAMPLE_TEXT } from './sample';

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

type Mode = 'redacted' | 'placeholders';

export function createTextMode(host: TextHost, initial = ''): TextController {
  let findings: Finding[] = [];
  const kept = new Set<string>(); // values the user chose to keep visible
  let mode: Mode = 'redacted';
  let mapping: Record<string, string> = {};

  const input = h('textarea', {
    id: 'text-in',
    class: 'textarea',
    rows: '10',
    spellcheck: 'false',
    placeholder: 'Paste or type text here — an email, a log, a config file, a chat message…',
    'aria-describedby': 'text-in-hint',
  });
  input.value = initial;

  const mirror = h('div', { class: 'mirror', id: 'mirror', 'aria-live': 'off' });
  const foundLine = h('p', { class: 'text__found', role: 'status' });
  const errorLine = h('p', { class: 'field__error', role: 'alert' });

  const terms = h('input', {
    type: 'text',
    id: 'text-terms',
    class: 'input',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'e.g. Jane Doe, Acme, Project Falcon',
    value: host.terms().join(', '),
    'aria-describedby': 'text-terms-hint',
  });

  const output = h('textarea', { id: 'text-out', class: 'textarea textarea--out', rows: '8', readonly: true, spellcheck: 'false' });
  const copyBtn = h('button', { type: 'button', class: 'btn btn--primary', onclick: () => { ensureFresh(); void copy(output.value, copyBtn, 'Copy'); } }, 'Copy');
  const modeExplain = h('p', { class: 'field__hint', id: 'mode-explain' });

  const radio = (value: Mode, label: string) =>
    h(
      'label',
      { class: 'seg__opt' },
      h('input', { type: 'radio', name: 'out-mode', value, checked: value === mode, onchange: () => setMode(value) }),
      h('span', null, label),
    );

  // Restore section (placeholders only)
  const reply = h('textarea', { id: 'ai-reply', class: 'textarea', rows: '6', spellcheck: 'false', placeholder: 'Paste the AI’s reply here' });
  const restored = h('textarea', { id: 'restored', class: 'textarea textarea--out', rows: '6', readonly: true });
  const restoreCopy = h('button', { type: 'button', class: 'btn', onclick: () => copy(restored.value, restoreCopy, 'Copy restored reply') }, 'Copy restored reply');
  const saveMapping = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--quiet',
      onclick: () => {
        const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'blot-placeholders.json');
      },
    },
    'Save mapping as file',
  );
  const restoreBox = h(
    'section',
    { class: 'restore', 'aria-labelledby': 'restore-title', hidden: true },
    h('h2', { class: 'text__h2', id: 'restore-title' }, 'Put your real values back'),
    h('label', { for: 'ai-reply', class: 'field__label' }, 'AI reply'),
    reply,
    h('label', { for: 'restored', class: 'field__label' }, 'With your real values'),
    restored,
    h('div', { class: 'row' }, restoreCopy, saveMapping),
    h('p', { class: 'field__hint' }, 'The mapping between placeholders and your values exists only in this tab. Closing it forgets them, unless you save the mapping.'),
  );

  // What `findings` was computed from. render() must never apply findings to different text
  // (offsets would point at the wrong characters and parts of secrets could slip through).
  let analysedText = '';
  let analysedTerms = '';
  const isStale = () => input.value !== analysedText || terms.value !== analysedTerms;
  /** Run detection now if the text or terms changed since the last run (debounce still pending). */
  function ensureFresh(): void {
    if (isStale()) analyse();
  }

  function analyse(): void {
    const text = input.value;
    analysedText = text;
    analysedTerms = terms.value;
    if (text.length > MAX_TEXT) {
      findings = [];
      output.value = '';
      errorLine.textContent = `That’s too much text for this page (${Math.round(text.length / 1e6)} MB). Paste up to 2 MB at a time.`;
      return;
    }
    try {
      findings = text ? detect(text, { customTerms: parseTerms(terms.value) }) : [];
      errorLine.textContent = '';
    } catch (e) {
      findings = [];
      errorLine.textContent = `Detection failed: ${errorMessage(e)}`;
    }
    render();
  }

  function render(): void {
    if (isStale()) return analyse(); // analyse() calls render() with fresh findings
    const text = input.value;
    mirror.innerHTML = buildHighlightHtml(text, findings, kept); // every piece is escaped in buildHighlightHtml
    mirror.classList.toggle('is-empty', !text);
    if (!text) mirror.textContent = 'Highlights appear here as you type.';

    const active = activeFindings(findings, kept);
    foundLine.textContent = !text
      ? ''
      : findings.length === 0
        ? 'We didn’t find anything sensitive. Add names or other words under “Always hide…”.'
        : `${plural(active.length, 'item', 'items')} will be hidden${findings.length > active.length ? ` · ${findings.length - active.length} kept visible` : ''}. Select a highlight to keep it visible.`;

    try {
      if (mode === 'redacted') {
        output.value = text ? redactText(text, active, 'label') : '';
        mapping = {};
      } else {
        const r = text ? applyPlaceholders(text, active) : { text: '', mapping: {} };
        output.value = r.text;
        mapping = r.mapping;
      }
    } catch (e) {
      output.value = '';
      errorLine.textContent = `Couldn’t build the output: ${errorMessage(e)}`;
    }
    restoreBox.hidden = mode !== 'placeholders';
    saveMapping.disabled = Object.keys(mapping).length === 0;
    modeExplain.textContent =
      mode === 'redacted'
        ? 'Sensitive values are replaced with labels like [REDACTED EMAIL]. They can’t be recovered.'
        : 'Send this to ChatGPT/Claude, then paste the reply below to put your real values back.';
    renderRestore();
  }

  function renderRestore(): void {
    try {
      restored.value = reply.value ? restorePlaceholders(reply.value, mapping) : '';
    } catch (e) {
      restored.value = '';
      errorLine.textContent = `Couldn’t restore: ${errorMessage(e)}`;
    }
  }

  function setMode(m: Mode): void {
    mode = m;
    render();
  }

  async function copy(text: string, btn: HTMLButtonElement, label: string): Promise<void> {
    if (!text) return;
    const ok = await copyText(text);
    btn.textContent = ok ? 'Copied' : 'Copy failed — select and copy manually';
    announce(ok ? 'Copied to clipboard.' : 'Copy failed.');
    setTimeout(() => (btn.textContent = label), 1800);
  }

  const analyseSoon = debounce(analyse, 150);
  input.addEventListener('input', () => analyseSoon());
  terms.addEventListener('input', debounce(() => {
    host.setTerms(parseTerms(terms.value));
    analyse();
  }, 400));
  reply.addEventListener('input', renderRestore);
  mirror.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.hl');
    const key = b?.dataset.key;
    if (key === undefined) return;
    if (kept.has(key)) kept.delete(key);
    else kept.add(key);
    render();
    mirror.querySelector<HTMLElement>(`.hl[data-key="${CSS.escape(key)}"]`)?.focus();
  });

  const title = h('h1', { class: 'text__title', id: 'text-title', tabindex: '-1' }, 'Redact text');

  const el = h(
    'section',
    { class: 'screen textmode', 'aria-labelledby': 'text-title' },
    h(
      'div',
      { class: 'text__bar' },
      h('button', { type: 'button', class: 'btn btn--quiet btn--back', onclick: () => host.back() }, 'Back'),
      title,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--quiet',
          onclick: () => {
            setText(SAMPLE_TEXT);
            input.focus();
          },
        },
        'Use sample text',
      ),
    ),
    h(
      'div',
      { class: 'text__grid' },
      h(
        'div',
        { class: 'text__col' },
        h('label', { for: 'text-in', class: 'field__label' }, 'Your text'),
        input,
        h('p', { class: 'field__hint', id: 'text-in-hint' }, 'Stays in this tab. Nothing is sent anywhere.'),
        h('div', { class: 'field' }, h('label', { for: 'text-terms', class: 'field__label' }, 'Always hide…'), terms, h('p', { class: 'field__hint', id: 'text-terms-hint' }, 'Names, company, project — separated by commas.')),
        h('h2', { class: 'text__h2' }, 'What we found'),
        foundLine,
        mirror,
        errorLine,
      ),
      h(
        'div',
        { class: 'text__col' },
        h(
          'fieldset',
          { class: 'seg' },
          h('legend', { class: 'field__label' }, 'Output'),
          h('div', { class: 'seg__opts' }, radio('redacted', 'Redacted'), radio('placeholders', 'Placeholders for AI chat')),
        ),
        modeExplain,
        h('label', { for: 'text-out', class: 'sr-only' }, 'Safe version'),
        output,
        h('div', { class: 'row' }, copyBtn),
        restoreBox,
      ),
    ),
  );

  function setText(text: string): void {
    input.value = text;
    kept.clear();
    analyse();
  }

  analyse();

  return {
    el,
    focus: () => (input.value ? title.focus({ preventScroll: true }) : input.focus()),
    setText,
  };
}
