// The findings list: grouped by type, with counts and per-item checkboxes. Rendered from scratch on
// every change (lists are short); focus is restored by data-focus key so keyboard users don't lose
// their place.
import { h, svg } from './dom';
import type { FindingGroup, FindingItem } from './format';
import { toneOf } from './kinds';

export interface FindingsHandlers {
  setItems(items: FindingItem[], enabled: boolean): void;
  reveal(item: FindingItem): void;
  hover(key: string | null): void;
  remove(item: FindingItem): void;
  /** Stop hiding a custom term everywhere (removes the term, re-detects). */
  stopTerm?(term: string): void;
}

const TRASH =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function renderFindings(
  container: HTMLElement,
  groups: FindingGroup[],
  opts: { multiPage: boolean; hotKey: string | null },
  on: FindingsHandlers,
): void {
  const focusKey = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-focus]')?.dataset.focus;
  const focusRole = (document.activeElement as HTMLElement | null)?.dataset.role;

  const lists = groups.map((g) => {
    const on_ = g.items.filter((i) => i.enabled).length;
    const manual = g.kind === 'manual';
    const groupBox = manual
      ? null
      : h('input', {
          type: 'checkbox',
          class: 'check',
          // Checked only when ALL are hidden: a partly-hidden group's click then means "hide all",
          // never "reveal all".
          checked: on_ === g.items.length,
          'aria-label': g.term !== undefined ? `Hide every ${g.title}` : `Hide all ${g.title.toLowerCase()}`,
          'data-role': 'group',
          onchange: (e: Event) => on.setItems(g.items, (e.target as HTMLInputElement).checked),
        });
    if (groupBox) groupBox.indeterminate = on_ > 0 && on_ < g.items.length;

    return h(
      'section',
      { class: `fgroup tone-${toneOf(g.kind)}`, 'data-focus': `g:${g.key}` },
      h(
        'header',
        { class: 'fgroup__head' },
        groupBox,
        h('span', { class: 'fgroup__swatch', 'aria-hidden': 'true' }),
        h('h3', { class: 'fgroup__title' }, g.title),
        h('span', { class: 'fgroup__count', 'aria-label': `${on_} of ${g.items.length} hidden` }, manual ? g.items.length : `${on_}/${g.items.length}`),
      ),
      h(
        'ul',
        { class: 'fgroup__items' },
        g.items.map((it) => renderItem(it, opts, on)),
      ),
      g.term !== undefined && on.stopTerm
        ? h(
            'button',
            { type: 'button', class: 'linkbtn linkbtn--soft fgroup__stop', 'data-role': 'stop', onclick: () => on.stopTerm?.(g.term as string) },
            `Stop hiding ${g.title} everywhere`,
          )
        : null,
    );
  });

  container.replaceChildren(...lists);

  if (focusKey) {
    const host = container.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`);
    const target = host?.querySelector<HTMLElement>(focusRole ? `[data-role="${focusRole}"]` : 'input, button');
    target?.focus();
  }
}

function renderItem(it: FindingItem, opts: { multiPage: boolean; hotKey: string | null }, on: FindingsHandlers): HTMLElement {
  const manual = it.kind === 'manual';
  const text = manual ? 'Box you drew' : it.text || it.label;
  const page = opts.multiPage ? h('span', { class: 'fitem__page' }, `p. ${it.page + 1}`) : null;

  return h(
    'li',
    {
      class: `fitem${it.enabled ? '' : ' is-off'}${opts.hotKey === it.key ? ' is-hot' : ''}`,
      'data-item': it.key,
      'data-focus': `i:${it.key}`,
      onpointerenter: (e: PointerEvent) => e.pointerType === 'mouse' && on.hover(it.key),
      onpointerleave: (e: PointerEvent) => e.pointerType === 'mouse' && on.hover(null),
    },
    manual
      ? null
      : h('input', {
          type: 'checkbox',
          class: 'check',
          'aria-label': `Hide ${it.label}: ${text}`,
          checked: it.enabled,
          'data-role': 'check',
          onchange: (e: Event) => on.setItems([it], (e.target as HTMLInputElement).checked),
          onfocus: () => on.hover(it.key),
          onblur: () => on.hover(null),
        }),
    h(
      'button',
      {
        type: 'button',
        class: 'fitem__text',
        'data-role': 'reveal',
        title: manual ? 'Show this box' : `${it.label} — show on page`,
        onclick: () => on.reveal(it),
      },
      h('span', { class: 'fitem__value' }, text),
      // A custom group's title already names the term.
      manual || it.kind === 'custom' ? null : h('span', { class: 'fitem__label' }, it.label),
    ),
    page,
    manual
      ? h('button', { type: 'button', class: 'iconbtn', 'data-role': 'remove', 'aria-label': 'Delete this box', onclick: () => on.remove(it) }, svg(TRASH))
      : null,
  );
}
