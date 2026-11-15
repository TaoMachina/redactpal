// The review screen works on a ReviewDoc: one or more pages, each with its own regions, whether
// it came from an image or a PDF. Owns re-detection for custom terms ("hide everywhere") without re-running OCR.
import { buildLayout, findingsToRegions } from '../core/layout';
import type { DetectOptions, Finding, Progress, Region, Token } from '../core/types';
import { detect } from '../detect';
// Types only: the image/pdf modules are loaded on demand by app.ts and their exporters handed in,
// so this file (and the review screen) never pulls them into a bundle by itself.
import type { exportRedactedImage, ImageAnalysis } from '../image';
import type { exportRedactedPdf, PdfAnalysis } from '../pdf';
import { reconcileRegions } from './reconcile';

export interface ReviewPage {
  index: number;
  width: number;
  height: number;
  tokens: Token[];
  text: string;
  findings: Finding[];
  regions: Region[];
  scanned: boolean;
  /** Page could not be fully checked (e.g. OCR failed) — must be shown to the user. */
  warning?: string;
  /** Informational (e.g. a huge phone photo was shrunk to fit the device). Not a warning. */
  notice?: string;
  /** Draw the original page (no redactions) into `canvas` at `scale` canvas px per source unit. */
  draw(canvas: HTMLCanvasElement, scale: number): Promise<void>;
}

export interface ReviewDoc {
  type: 'image' | 'pdf';
  name: string;
  pages: ReviewPage[];
  metadata: Record<string, string>;
  image?: ImageAnalysis;
  pdf?: PdfAnalysis;
  /** Build the redacted file from the current enabled regions (always solid fill). */
  exportBlob(onProgress?: Progress): Promise<Blob>;
}

let counter = 0;
export const newRegionId = (prefix = 'd'): string => `${prefix}${++counter}`;

/** Give regions ids that are unique across pages and re-detections. */
const rekey = (regions: Region[]): Region[] => regions.map((r) => ({ ...r, id: newRegionId() }));

export function docFromImage(a: ImageAnalysis, name: string, exporter: typeof exportRedactedImage): ReviewDoc {
  const page: ReviewPage = {
    index: 0,
    width: a.width,
    height: a.height,
    tokens: a.tokens,
    text: a.text,
    findings: a.findings,
    regions: rekey(a.regions),
    scanned: true,
    warning: a.warning,
    notice: a.notice,
    async draw(canvas, scale) {
      canvas.width = Math.max(1, Math.round(a.width * scale));
      canvas.height = Math.max(1, Math.round(a.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(a.bitmap, 0, 0, canvas.width, canvas.height);
    },
  };
  return {
    type: 'image',
    name,
    pages: [page],
    metadata: {},
    image: a,
    exportBlob: () => exporter(a.bitmap, enabledRegions(page)),
  };
}

export function docFromPdf(a: PdfAnalysis, name: string, exporter: typeof exportRedactedPdf): ReviewDoc {
  const pages: ReviewPage[] = a.pages.map((p) => ({
    index: p.index,
    width: p.width,
    height: p.height,
    tokens: p.tokens,
    text: p.text,
    findings: p.findings,
    regions: rekey(p.regions),
    scanned: p.scanned,
    warning: p.warning,
    draw: (canvas, scale) => p.render(canvas, scale),
  }));
  return {
    type: 'pdf',
    name,
    pages,
    metadata: a.metadata ?? {},
    pdf: a,
    exportBlob: (onProgress) => exporter(a, pages.map(enabledRegions), { onProgress }),
  };
}

/** Re-run detection on the already-extracted tokens of every page (no OCR), keeping user choices. */
export function redetect(doc: ReviewDoc, opts: DetectOptions): void {
  for (const page of doc.pages) {
    const layout = buildLayout(page.tokens);
    const findings = detect(layout.text, opts);
    const regions = findingsToRegions(layout, page.tokens, findings, {
      bounds: { width: page.width, height: page.height },
    });
    page.text = layout.text;
    page.findings = findings;
    page.regions = reconcileRegions(page.regions, regions, () => newRegionId());
  }
}

export const enabledRegions = (page: ReviewPage): Region[] => page.regions.filter((r) => r.enabled);

export function disposeDoc(doc: ReviewDoc): void {
  try {
    doc.image?.bitmap.close();
  } catch {
    /* already closed */
  }
  try {
    doc.pdf?.dispose();
  } catch {
    /* ignore */
  }
}

/** Metadata entries worth listing (non-empty values). */
export function metadataEntries(doc: ReviewDoc): Array<[string, string]> {
  return Object.entries(doc.metadata).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
}
