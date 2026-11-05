import type { Camera, Rect } from './interaction';

/** Visible fit/focus area inside the canvas. */
export function viewportArea(viewport: HTMLElement): Rect {
  const bounds = viewport.getBoundingClientRect();
  return {
    x: 0,
    y: 0,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
  };
}

/** Keep world content fixed on screen when the canvas origin moves after a panel commit. */
export function stabilizeCameraOnResize(
  camera: Camera,
  previous: { left: number; top: number } | null,
  next: { left: number; top: number },
): { camera: Camera; origin: { left: number; top: number } } {
  const origin = { left: next.left, top: next.top };
  if (!previous) return { camera, origin };
  const dx = next.left - previous.left,
    dy = next.top - previous.top;
  if (!dx && !dy) return { camera, origin };
  return { camera: { ...camera, x: camera.x - dx, y: camera.y - dy }, origin };
}
