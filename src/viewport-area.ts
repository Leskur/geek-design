import type { Rect } from './interaction';

// Overlay panels do not resize the canvas. Read their actual bounds only when
// explicitly fitting/focusing content, never to move an existing camera.
export function viewportArea(viewport: HTMLElement): Rect {
  const bounds = viewport.getBoundingClientRect(),
    workspace = viewport.closest('.viewer-workspace');
  let left = 0,
    right = bounds.width;
  if (workspace)
    for (const side of ['left', 'right']) {
      const panel = workspace.querySelector<HTMLElement>(`:scope > .${side}`);
      if (!panel || !panel.getClientRects().length) continue;
      const box = panel.getBoundingClientRect();
      if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
      if (side === 'left') left = Math.max(left, box.right - bounds.left);
      else right = Math.min(right, box.left - bounds.left);
    }
  return {
    x: Math.max(0, left),
    y: 0,
    width: Math.max(1, right - left),
    height: Math.max(1, bounds.height),
  };
}
