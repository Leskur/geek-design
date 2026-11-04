import type { Layer } from '../shared/document';

export function thumbnailPixelScale(viewScale: number) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(1, Math.max(1 / 8, Math.ceil(Math.max(0, viewScale) * dpr * 8) / 8));
}

export function thumbnailSize(board: Layer, viewScale = 1) {
  const scale = thumbnailPixelScale(viewScale);
  return {
    width: Math.max(1, Math.round(board.frame.width * scale)),
    height: Math.max(1, Math.round(board.frame.height * scale)),
  };
}
