// Re-detection (e.g. after "Hide all" adds a custom term) produces brand-new regions. This keeps what the
// user already decided: manual boxes survive, and a detected region that is still found keeps its
// id and its on/off state. Pure.
import type { Region } from '../core/types';
import { iou } from './geometry';

const MATCH_IOU = 0.3;

export function reconcileRegions(prev: readonly Region[], next: readonly Region[], newId: () => string): Region[] {
  const manual = prev.filter((r) => r.kind === 'manual');
  const pool = prev.filter((r) => r.kind !== 'manual');
  const used = new Set<Region>();

  const detected = next.map((n) => {
    let best: Region | undefined;
    let bestScore = 0;
    for (const p of pool) {
      if (used.has(p) || p.kind !== n.kind || p.text !== n.text) continue;
      const s = iou(p.rect, n.rect);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    if (best && bestScore >= MATCH_IOU) {
      used.add(best);
      return { ...n, id: best.id, enabled: best.enabled };
    }
    return { ...n, id: newId(), enabled: true };
  });

  // Regions of one finding (wrapped over lines) must share one state: if any kept region of a
  // finding was off, the whole finding stays off.
  const offFindings = new Set(detected.filter((r) => !r.enabled && r.findingId).map((r) => r.findingId));
  for (const r of detected) if (r.findingId && offFindings.has(r.findingId)) r.enabled = false;

  return [...detected, ...manual];
}
