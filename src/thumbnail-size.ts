import type { Layer } from '../shared/document';

export type PreviewMode = 'overview' | 'detail';

/** @deprecated Prefer previewSize(); kept for older call sites. */
export function thumbnailPixelScale(viewScale: number) {
  return previewPixelScale(viewScale, 'overview');
}

export function previewPixelScale(viewScale: number, mode: PreviewMode = 'overview') {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  if (mode === 'detail') {
    // Floor: Sketch frame × dpr；放大时再按 scale 升高清，最高约 3×。
    const needed = Math.max(dpr, viewScale * dpr);
    return Math.min(3, Math.ceil(needed * 8) / 8);
  }
  return Math.min(1, Math.max(1 / 8, Math.ceil(Math.max(0, viewScale) * dpr * 8) / 8));
}

export function previewSize(board: Layer, viewScale = 1, mode: PreviewMode = 'overview') {
  // Overview mini is fixed. Zooming must not ask for another bitmap.
  if (mode === 'overview') {
    const edge = Math.max(board.frame.width, board.frame.height) || 1;
    const fit = Math.min(1, 480 / edge);
    return {
      width: Math.max(1, Math.round(board.frame.width * fit)),
      height: Math.max(1, Math.round(board.frame.height * fit)),
    };
  }
  const scale = previewPixelScale(viewScale, mode);
  let width = Math.max(1, board.frame.width * scale);
  let height = Math.max(1, board.frame.height * scale);
  const maxEdge = 12288;
  const edge = Math.max(width, height);
  if (edge > maxEdge) {
    const fit = maxEdge / edge;
    width *= fit;
    height *= fit;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** @deprecated Prefer previewSize(). */
export function thumbnailSize(board: Layer, viewScale = 1) {
  return previewSize(board, viewScale, 'overview');
}
