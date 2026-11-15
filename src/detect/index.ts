// PUBLIC API of the detection engine. Pure TypeScript, no DOM, no network. Owner: detect agent.
import type { Confidence, DetectOptions, Finding, FindingKind } from '../core/types';
import { RULE_DEFS, type RuleDef } from './rules';
import { applyPlaceholders, placeholderPrefix, redactText, restorePlaceholders } from './placeholders';

export interface RuleInfo {
  id: string;
  label: string;
  kind: FindingKind;
  description: string;
}

const CUSTOM_RULE: RuleInfo = {
  id: 'custom',
  label: 'Custom term',
  kind: 'custom',
  description: 'User-provided words or phrases (names, company, codenames). Case-insensitive, whole-word where possible.',
};

/** All built-in rules (for settings UI / docs). */
export const RULES: RuleInfo[] = [
  ...RULE_DEFS.map(({ id, label, kind, description }) => ({ id, label, kind, description })),
  CUSTOM_RULE,
];

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

interface Candidate {
  start: number;
  end: number;
  kind: FindingKind;
  ruleId: string;
  label: string;
  confidence: Confidence;
  priority: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
// Scripts written without spaces between words: whole-word matching makes no sense there.
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Build the matcher for one custom term (exported for tests). */
export function customTermRegex(term: string): RegExp | null {
  const t = term.trim();
  if (!t) return null;
  const body = t
    .split(/\s+/)
    .map(escapeRegex)
    .join('\\s+'); // OCR / line wrapping may change the whitespace between words
  const chars = Array.from(t);
  const first = chars[0];
  const last = chars[chars.length - 1];
  const pre = WORD_CHAR.test(first) && !NO_SPACE_SCRIPT.test(first) ? '(?<![\\p{L}\\p{N}_])' : '';
  const post = WORD_CHAR.test(last) && !NO_SPACE_SCRIPT.test(last) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(pre + body + post, 'giu');
}

const EXTEND_KINDS = new Set<FindingKind>(['api_key', 'secret_generic', 'password', 'jwt']);
const WORD_STOP = /[\s"'`,;)\]}<>]/;

/** Find sensitive spans in `text`. Findings are sorted by start, non-overlapping (longest/highest-confidence wins). */
export function detect(text: string, opts: DetectOptions = {}): Finding[] {
  if (!text) return [];
  const disabled = new Set(opts.disabledRules ?? []);
  const minRank = RANK[opts.minConfidence ?? 'low'];
  const cands: Candidate[] = [];

  const push = (rule: RuleInfo, priority: number, start: number, end: number, confidence: Confidence, label: string) => {
    // never let a finding begin or end with whitespace
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end <= start || RANK[confidence] < minRank) return;
    // Secrets run to the end of their word. OCR often misreads one character inside a key
    // (0 -> @, 1 -> l), which would otherwise stop the match early and leave the tail visible.
    // Over-covering a few characters is always the safe side.
    if (EXTEND_KINDS.has(rule.kind)) while (end < text.length && !WORD_STOP.test(text[end])) end++;
    cands.push({ start, end, kind: rule.kind, ruleId: rule.id, label, confidence, priority });
  };

  RULE_DEFS.forEach((rule: RuleDef, priority) => {
    if (disabled.has(rule.id)) return;
    rule.scan(text, (start, end, confidence = rule.confidence, label = rule.label) =>
      push(rule, priority, start, end, confidence, label),
    );
  });

  if (!disabled.has('custom') && opts.customTerms?.length) {
    const seen = new Set<string>();
    for (const raw of opts.customTerms) {
      const term = (raw ?? '').trim();
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      const re = customTermRegex(term);
      if (!re) continue;
      for (const m of text.matchAll(re)) {
        if (!m[0]) continue;
        push(CUSTOM_RULE, RULE_DEFS.length, m.index, m.index + m[0].length, 'high', `Custom: ${term}`);
      }
    }
  }

  // Overlap resolution: higher confidence, then longer span, then rule order, then position.
  cands.sort(
    (a, b) =>
      RANK[b.confidence] - RANK[a.confidence] ||
      b.end - b.start - (a.end - a.start) ||
      a.priority - b.priority ||
      a.start - b.start,
  );
  // Custom terms are the user's explicit "always hide" — they must never lose an overlap. Resolve
  // the rule findings first, then fold every custom match together with anything it overlaps into
  // one custom finding covering the union (so neither the term nor the other finding shrinks).
  const isCustom = (c: Candidate) => c.ruleId === CUSTOM_RULE.id;
  const used = new Uint8Array(text.length);
  let accepted: Candidate[] = [];
  outer: for (const c of cands) {
    if (isCustom(c)) continue;
    for (let i = c.start; i < c.end; i++) if (used[i]) continue outer;
    used.fill(1, c.start, c.end);
    accepted.push(c);
  }
  for (const c of cands) {
    if (!isCustom(c)) continue;
    let merged: Candidate = { ...c };
    const rest: Candidate[] = [];
    for (const a of accepted) {
      if (a.end > merged.start && a.start < merged.end) {
        merged = { ...merged, start: Math.min(a.start, merged.start), end: Math.max(a.end, merged.end), label: isCustom(a) ? a.label : merged.label };
      } else rest.push(a);
    }
    // A widened span may now reach further findings; repeat until stable.
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        const a = rest[i];
        if (a.end > merged.start && a.start < merged.end) {
          merged = { ...merged, start: Math.min(a.start, merged.start), end: Math.max(a.end, merged.end) };
          rest.splice(i, 1);
          grew = true;
        }
      }
    }
    accepted = [...rest, merged];
  }
  accepted.sort((a, b) => a.start - b.start);
  return accepted.map((c, i) => ({
    id: `f${i}`,
    start: c.start,
    end: c.end,
    text: text.slice(c.start, c.end),
    kind: c.kind,
    ruleId: c.ruleId,
    label: c.label,
    confidence: c.confidence,
  }));
}

export { applyPlaceholders, restorePlaceholders, redactText, placeholderPrefix };
