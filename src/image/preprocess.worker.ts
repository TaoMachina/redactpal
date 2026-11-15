// Preprocessing Web Worker (module worker, same origin — allowed by CSP `worker-src 'self'`).
// Receives a (transferred) ImageBitmap, returns the PNG Tesseract should read. All pixel loops and
// the PNG encode happen here, so the page stays responsive while a big photo is prepared.
import { preprocessImage, type PreprocessReply, type PreprocessRequest } from './pipeline';
import { syncSlicer } from './steps';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PreprocessRequest>) => void) | null;
  postMessage(message: PreprocessReply): void;
};

function canDraw(): boolean {
  try {
    return typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    return false;
  }
}

scope.onmessage = async (e) => {
  const { id, bitmap, budget } = e.data;
  try {
    if (!canDraw()) {
      scope.postMessage({ id, ok: false, unsupported: true, message: 'OffscreenCanvas 2D is not available in workers' });
      return;
    }
    const result = await preprocessImage(bitmap, budget, syncSlicer);
    scope.postMessage({ id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id, ok: false, unsupported: false, message: err instanceof Error ? err.message : String(err) });
  } finally {
    bitmap.close();
  }
};

scope.postMessage({ id: 0, ok: true, ready: true });
