import type { Layer } from './sketch';
import { pageRenderQuality } from './overview';

/** Above this, mount a preview image instead of the live layer tree. */
export const LIVE_LAYER_LIMIT = 48;

/** Shared viewer rule: few layers + zoomed in + idle → live SVG; otherwise → image. */
export function preferLiveDrawing(
  layerCount: number,
  board: Layer,
  viewScale: number,
  interacting: boolean,
) {
  if (interacting) return false;
  if (layerCount >= LIVE_LAYER_LIMIT) return false;
  return pageRenderQuality(board, viewScale).live;
}
