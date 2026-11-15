// One page in the review editor: a canvas with the original pixels plus a DOM overlay of regions.
// Overlays are positioned in % so zoom/resizing never needs coordinate math; pointer input goes to
// a single surface handler that hit-tests in source units (see geometry.ts).
import type { Rect } from '../core/types';
import type { ReviewPage } from './doc';
import { h, svg } from './dom';
import { itemKey } from './format';
import { canvasScale, clampRect, clientToSource, hitTest, needsRerender, rectFromPoints, rectToPercent } from './geometry';
import { shortLabel, toneOf } from './kinds';

export interface PageViewHost {
  state(): { preview: boolean; drawMode: boolean; selected: string | null; coarse: boolean };
  toggle(page: number, regionId: string): void;
  select(regionId: string | null): void;
  create(page: number, rect: Rect): void;
  remove(regionId: string): void;
  hover(key: string | null): void;
}

const TAP_SLOP = 6; // CSS px a pointer may move and still count as a tap
const MIN_BOX = 4; // CSS px; smaller drags are ignored

const CLOSE_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

interface Gesture {
  pointerId: number;
  type: string;
  startClient: { x: number; y: number };
  start: { x: number; y: number };
  drawing: boolean;
  moved: boolean;
}

export class PageView {
  readonly el: HTMLElement;
  private frame: HTMLElement;
  private surface: HTMLElement;
  private regionLayer: HTMLElement;
  private ghost: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private renderedWidth = 0;
  private visible: boolean;
  private destroyed = false;
  private queue: Promise<void> = Promise.resolve();
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private gesture: Gesture | null = null;
  private hoverKey: string | null = null;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;

  constructor(
    readonly page: ReviewPage,
    private host: PageViewHost,
    opts: { label?: string; lazy: boolean; maxWidth: number; scrollRoot?: Element },
  ) {
    this.visible = !opts.lazy;
    this.ghost = h('div', { class: 'ghost', hidden: true });
    this.regionLayer = h('div', { class: 'regions' });
    this.surface = h('div', { class: 'surface' }, this.regionLayer, this.ghost);
    this.frame = h(
      'div',
      {
        class: 'page__frame',
        style: { aspectRatio: `${page.width} / ${page.height}` },
      },
      h('div', { class: 'page__placeholder', 'aria-hidden': 'true' }, 'Loading page…'),
      this.surface,
    );
    this.el = h(
      'figure',
      { class: 'page' },
      this.frame,
      opts.label ? h('figcaption', { class: 'page__label' }, opts.label) : null,
    );
    // Custom properties need setProperty.
    this.el.style.setProperty('--maxw', `${opts.maxWidth}px`);
    this.el.style.setProperty('--aspect', String(page.width / page.height));

    this.bindPointer();

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleRender());
      this.ro.observe(this.frame);
    }
    if (opts.lazy && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            this.visible = e.isIntersecting;
            if (this.visible) this.scheduleRender(0);
            else this.releaseCanvas();
          }
        },
        // The scroll container must be the root, otherwise its clipping defeats rootMargin.
        { root: opts.scrollRoot ?? null, rootMargin: '1200px 0px' },
      );
      this.io.observe(this.frame);
    } else {
      this.visible = true;
    }
    this.refresh();
    this.scheduleRender(0);
  }

  // ---- rendering ---------------------------------------------------------------------------

  private scheduleRender(delay = 120): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.queue = this.queue.then(() => this.render()).catch(() => undefined);
    }, delay);
  }

  private async render(): Promise<void> {
    if (this.destroyed || !this.visible) return;
    const width = this.frame.clientWidth;
    if (!width || !needsRerender(this.canvas ? this.renderedWidth : 0, width)) return;
    const scale = canvasScale(width, window.devicePixelRatio || 1, this.page);
    const c = h('canvas', { class: 'page__canvas', 'aria-hidden': 'true' });
    try {
      await this.page.draw(c, scale);
    } catch {
      this.frame.classList.add('is-failed');
      const ph = this.frame.querySelector('.page__placeholder');
      if (ph) ph.textContent = 'This page couldn’t be shown.';
      return;
    }
    if (this.destroyed || !this.visible) {
      c.width = c.height = 0;
      return;
    }
    if (this.canvas) {
      this.canvas.replaceWith(c);
      this.canvas.width = this.canvas.height = 0;
    } else {
      this.frame.insertBefore(c, this.surface);
    }
    this.canvas = c;
    this.renderedWidth = width;
    this.frame.classList.add('is-rendered');
  }

  private releaseCanvas(): void {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.height = 0;
    this.canvas.remove();
    this.canvas = null;
    this.renderedWidth = 0;
    this.frame.classList.remove('is-rendered');
  }

  // ---- overlay -----------------------------------------------------------------------------

  /** Rebuild region overlays from page.regions + host state. Cheap; called after every change. */
  refresh(): void {
    const { selected, preview } = this.host.state();
    const focusedId = (document.activeElement?.closest('.region') as HTMLElement | null)?.dataset.rid;
    const seen = new Set<string>();
    const nodes: HTMLElement[] = [];
    const n = this.page.regions.length;
    this.page.regions.forEach((r, i) => {
      const key = itemKey(this.page.index, r);
      const firstOfItem = !seen.has(key);
      seen.add(key);
      const manual = r.kind === 'manual';
      const pct = rectToPercent(r.rect, this.page);
      const tone = toneOf(r.kind);
      const label = r.label || shortLabel(r.kind);
      const what = manual ? 'Box you drew' : `${label}${r.text ? `: ${r.text}` : ''}`;
      const hit = h('button', {
        type: 'button',
        class: 'region__hit',
        'aria-pressed': manual ? undefined : String(r.enabled),
        'aria-label': manual
          ? `${what}, will be hidden. Press Delete to remove.`
          : `${what}, ${r.enabled ? 'will be hidden' : 'will stay visible'}`,
        tabindex: preview ? '-1' : '0',
        onclick: () => (manual ? this.host.select(r.id) : this.host.toggle(this.page.index, r.id)),
        onkeydown: (e: KeyboardEvent) => {
          if (manual && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            this.host.remove(r.id);
          }
        },
        onfocus: () => this.host.hover(key),
        onblur: () => this.host.hover(null),
      });
      const el = h(
        'div',
        {
          class:
            `region tone-${tone}` +
            (r.enabled ? ' is-on' : ' is-off') +
            (manual ? ' is-manual' : '') +
            (selected === r.id ? ' is-selected' : '') +
            (r.rect.y / this.page.height < 0.04 ? ' chip-below' : ''),
          'data-rid': r.id,
          'data-item': key,
          style: { left: `${pct.left}%`, top: `${pct.top}%`, width: `${pct.width}%`, height: `${pct.height}%`, zIndex: String(n - i) },
        },
        hit,
        firstOfItem ? h('span', { class: 'region__chip', 'aria-hidden': 'true' }, manual ? 'Your box' : shortLabel(r.kind)) : null,
        manual
          ? h(
              'button',
              { type: 'button', class: 'region__del', 'aria-label': 'Delete this box', tabindex: '-1', onclick: () => this.host.remove(r.id) },
              svg(CLOSE_ICON),
            )
          : null,
      );
      nodes.push(el);
    });
    this.regionLayer.replaceChildren(...nodes);
    if (this.hoverKey) this.markHot(this.hoverKey);
    if (focusedId) (this.regionLayer.querySelector(`[data-rid="${CSS.escape(focusedId)}"] .region__hit`) as HTMLElement | null)?.focus();
    this.updateSurfaceMode();
  }

  updateSurfaceMode(): void {
    const { drawMode, coarse, preview } = this.host.state();
    this.surface.classList.toggle('is-drawing-enabled', !preview && (drawMode || !coarse));
    this.surface.classList.toggle('is-touch-draw', !preview && drawMode);
  }

  markHot(key: string | null): void {
    this.hoverKey = key;
    for (const el of this.regionLayer.querySelectorAll<HTMLElement>('.region')) el.classList.toggle('is-hot', el.dataset.item === key);
  }

  /**
   * Pin `el` (a small prompt) next to `rect` on this page: below it, or above when the box is near
   * the bottom; left-aligned, or right-aligned when the box is on the right half. It lives outside
   * the region layer, so refresh() leaves it alone. The caller removes it (el.remove()).
   */
  attachNear(el: HTMLElement, rect: Rect): void {
    const pct = rectToPercent(rect, this.page);
    const below = pct.top + pct.height <= 72;
    const right = pct.left + pct.width / 2 > 55;
    el.classList.add('is-anchored');
    Object.assign(el.style, {
      top: below ? `calc(${pct.top + pct.height}% + 8px)` : '',
      bottom: below ? '' : `calc(${100 - pct.top}% + 26px)`, // clear of the box's chip
      left: right ? '' : `${pct.left}%`,
      right: right ? `${100 - pct.left - pct.width}%` : '',
    });
    this.surface.append(el);
  }

  scrollToRegion(id: string): void {
    const el = this.regionLayer.querySelector<HTMLElement>(`[data-rid="${CSS.escape(id)}"]`);
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }

  // ---- pointer input -----------------------------------------------------------------------

  private toSource(e: PointerEvent) {
    return clientToSource(e.clientX, e.clientY, this.surface.getBoundingClientRect(), this.page);
  }

  /** Source units per CSS px at the current zoom. */
  private unitsPerPx(): number {
    const w = this.surface.getBoundingClientRect().width;
    return w > 0 ? this.page.width / w : 1;
  }

  private bindPointer(): void {
    const s = this.surface;

    s.addEventListener('pointerdown', (e) => {
      const st = this.host.state();
      if (this.gesture) {
        // A new primary pointer means every earlier pointer is up, so a gesture still recorded is
        // stale (its pointerup/pointercancel never arrived, which iOS does when scrolling or a
        // system gesture takes over). Without this, every later tap on the page would be ignored.
        // A second finger while one is down is a pinch/scroll, never a box: drop the gesture.
        this.cancelGesture();
        if (!e.isPrimary) return;
      }
      if (st.preview || e.button !== 0) return;
      if ((e.target as Element).closest('.region__del, .everywhere')) return;
      const canDraw = e.pointerType !== 'touch' || st.drawMode;
      this.gesture = {
        pointerId: e.pointerId,
        type: e.pointerType,
        startClient: { x: e.clientX, y: e.clientY },
        start: this.toSource(e),
        drawing: canDraw,
        moved: false,
      };
      if (canDraw) {
        e.preventDefault(); // no text selection / native drag while drawing
        try {
          s.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    });

    s.addEventListener('pointermove', (e) => {
      const g = this.gesture;
      if (!g) {
        if ((e.target as Element).closest('.everywhere')) {
          this.surface.classList.remove('is-over-region');
          this.setHover(null);
        } else if (e.pointerType === 'mouse' && !this.host.state().preview) this.updateHover(e);
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      const dist = Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y);
      if (dist > TAP_SLOP) g.moved = true;
      if (g.drawing && g.moved) {
        const r = rectFromPoints(g.start, this.toSource(e));
        const pct = rectToPercent(r, this.page);
        this.ghost.hidden = false;
        Object.assign(this.ghost.style, { left: `${pct.left}%`, top: `${pct.top}%`, width: `${pct.width}%`, height: `${pct.height}%` });
      }
    });

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const g = this.gesture;
      if (!g || e.pointerId !== g.pointerId) return;
      this.cancelGesture();
      if (cancelled) return;
      const end = this.toSource(e);
      if (!g.moved) {
        const tol = (g.type === 'mouse' ? 2 : 10) * this.unitsPerPx();
        const hit = hitTest(this.page.regions, g.start, tol);
        if (!hit) this.host.select(null);
        else if (hit.kind === 'manual') this.host.select(hit.id);
        else this.host.toggle(this.page.index, hit.id);
        return;
      }
      if (!g.drawing) return;
      const rect = clampRect(rectFromPoints(g.start, end), this.page);
      const minUnits = MIN_BOX * this.unitsPerPx();
      if (rect.w < minUnits || rect.h < minUnits) return;
      this.host.create(this.page.index, rect);
    };
    s.addEventListener('pointerup', (e) => finish(e, false));
    s.addEventListener('pointercancel', (e) => finish(e, true));
    // Capture lost without a pointerup (iOS when a scroll/zoom starts, or the element re-rendered).
    // After a normal pointerup the gesture is already gone, so this is a no-op then.
    s.addEventListener('lostpointercapture', (e) => finish(e, true));
    s.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.gesture) this.setHover(null);
    });
    window.addEventListener('blur', this.cancelGesture);
    document.addEventListener('visibilitychange', this.cancelGesture);
  }

  /** Forget the gesture in progress (no box, no tap) and release the pointer. Always safe to call. */
  private cancelGesture = (): void => {
    const g = this.gesture;
    this.gesture = null;
    this.ghost.hidden = true;
    if (!g) return;
    try {
      if (this.surface.hasPointerCapture(g.pointerId)) this.surface.releasePointerCapture(g.pointerId);
    } catch {
      /* ignore */
    }
  };

  /** Escape while dragging out a box (called from the review screen's key handler). */
  cancelDrawing(): boolean {
    if (!this.gesture) return false;
    this.cancelGesture();
    return true;
  }

  private updateHover(e: PointerEvent): void {
    const hit = hitTest(this.page.regions, this.toSource(e), 2 * this.unitsPerPx());
    this.surface.classList.toggle('is-over-region', !!hit);
    this.setHover(hit ? itemKey(this.page.index, hit) : null);
  }

  private setHover(key: string | null): void {
    if (key === this.hoverKey) return;
    this.host.hover(key);
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelGesture();
    window.removeEventListener('blur', this.cancelGesture);
    document.removeEventListener('visibilitychange', this.cancelGesture);
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.io?.disconnect();
    this.ro?.disconnect();
    this.releaseCanvas();
  }
}
