// Tiny DOM helpers. No framework: h() builds elements, the rest are conveniences.

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, unknown>;

/**
 * h('button', { class: 'btn', onclick: fn, disabled: true }, 'Label')
 * - `on*` keys become event listeners, `class` sets className, `style` accepts an object,
 * - `value` / `checked` are set as properties, booleans toggle attributes, null/undefined/false are skipped.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'value' || k === 'checked') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Array<Child | Child[]>): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

/** Trusted, static SVG markup only (icons defined in this codebase). */
export function svg(markup: string): Element {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as Element;
}

let liveRegion: HTMLElement | null = null;

/** Announce a short message to screen readers. */
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = '';
  // Re-setting on the next frame makes repeated identical messages announce again.
  requestAnimationFrame(() => {
    if (liveRegion) liveRegion.textContent = message;
  });
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isCoarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const t = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(t);
  }
  return false;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => t && clearTimeout(t);
  return d;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Unknown error';
}
