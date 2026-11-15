// HTML building for the text-mode mirror. Everything user-provided goes through escapeHtml. Pure.
import type { Finding } from '../core/types';
import { shortLabel, toneOf } from './kinds';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'));
}

/** Findings are toggled by value: switching off "jane@x.com" keeps every occurrence visible. */
export const findingKey = (f: Pick<Finding, 'text'>): string => f.text;

export function activeFindings<F extends Pick<Finding, 'text'>>(findings: readonly F[], kept: ReadonlySet<string>): F[] {
  return findings.filter((f) => !kept.has(findingKey(f)));
}

/**
 * Text with each finding wrapped in a toggle button. `kept` = keys the user chose to keep visible.
 * Overlapping findings (shouldn't happen, detect() promises non-overlap) are skipped defensively.
 */
export function buildHighlightHtml(text: string, findings: readonly Finding[], kept: ReadonlySet<string> = new Set()): string {
  const sorted = [...findings].filter((f) => f.end > f.start).sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const f of sorted) {
    if (f.start < pos || f.end > text.length) continue;
    out += escapeHtml(text.slice(pos, f.start));
    const value = text.slice(f.start, f.end);
    const key = findingKey(f);
    const off = kept.has(key);
    const state = off ? 'kept visible, press to hide' : 'will be hidden, press to keep visible';
    out +=
      `<button type="button" class="hl tone-${toneOf(f.kind)}${off ? ' is-off' : ''}" data-key="${escapeHtml(key)}"` +
      ` aria-pressed="${off ? 'false' : 'true'}" aria-label="${escapeHtml(`${f.label || shortLabel(f.kind)}: ${value}, ${state}`)}"` +
      ` title="${escapeHtml(f.label || shortLabel(f.kind))}">${escapeHtml(value)}</button>`;
    pos = f.end;
  }
  out += escapeHtml(text.slice(pos));
  // A trailing newline in pre-wrap needs something after it to take up a line.
  if (text.endsWith('\n')) out += '​';
  return out;
}
