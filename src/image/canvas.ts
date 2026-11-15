// Small canvas abstraction: OffscreenCanvas when available (no DOM needed, works in workers),
// otherwise a detached <canvas>.

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  let canvas: AnyCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } else {
    throw new Error('This browser cannot process images (no canvas support).');
  }
  // willReadFrequently: we read pixels back once; avoids a GPU round-trip on some browsers.
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) {
    throw new Error('This image is too large for your browser to process. Try a smaller or cropped image.');
  }
  return { canvas, ctx };
}

export async function canvasToPng(canvas: AnyCanvas): Promise<Blob> {
  let blob: Blob | null;
  if ('convertToBlob' in canvas) {
    blob = await canvas.convertToBlob({ type: 'image/png' }).catch(() => null);
  } else {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  if (!blob) {
    throw new Error('Your browser could not encode this image (it may be too large for this device).');
  }
  return blob;
}

/** Free the backing store early (matters on mobile Safari, which has a global canvas memory budget). */
export function releaseCanvas(canvas: AnyCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}
