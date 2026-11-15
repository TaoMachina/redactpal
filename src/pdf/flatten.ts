// Output side of the PDF exporter: a brand-new pdf-lib document made only of full-page images.
// No DOM here (pixels in, PDF bytes out) so it runs in Node tests; loaded lazily by ./index.ts.
// The original PDF is never loaded into pdf-lib, so nothing (text, fonts, annotations, attachments,
// metadata, JavaScript, XMP) can be carried over.
import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { pngUpRows } from './encode';

/** Fresh document with minimal metadata: only /Producer (Blot). No Creator, Title, Author or dates. */
export async function createOutputDoc(): Promise<PDFDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer('Blot');
  return doc;
}

/** zlib (RFC 1950) deflate via the platform CompressionStream — what PDF /FlateDecode expects. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const canDeflate = (): boolean => typeof CompressionStream !== 'undefined';

/**
 * Add a page of `pageW`×`pageH` points showing RGBA pixels (w×h) losslessly: PNG-"Up"-predicted
 * Flate image XObject (1 channel when `gray`), written directly — no PNG encode/decode round trip.
 */
export async function addFlatePage(
  doc: PDFDocument,
  pageW: number,
  pageH: number,
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  gray: boolean,
): Promise<void> {
  const compressed = await deflate(pngUpRows(rgba, w, h, gray));
  const stream = doc.context.stream(compressed, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: w,
    Height: h,
    ColorSpace: gray ? 'DeviceGray' : 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
    DecodeParms: { Predictor: 15, Colors: gray ? 1 : 3, BitsPerComponent: 8, Columns: w },
  });
  const page = doc.addPage([pageW, pageH]);
  const name = page.node.newXObject('Im', doc.context.register(stream));
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(pageW, 0, 0, pageH, 0, 0), drawObject(name), popGraphicsState());
}

/** Add a page showing an already-encoded JPEG (pdf-lib only parses the header; no re-encode). */
export async function addJpegPage(doc: PDFDocument, pageW: number, pageH: number, jpeg: Uint8Array): Promise<void> {
  const img = await doc.embedJpg(jpeg);
  doc.addPage([pageW, pageH]).drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
}

/** Fallback for browsers without CompressionStream. */
export async function addPngPage(doc: PDFDocument, pageW: number, pageH: number, png: Uint8Array): Promise<void> {
  const img = await doc.embedPng(png);
  doc.addPage([pageW, pageH]).drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
}

export async function saveOutput(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
