import type { Camera } from './interaction';

export function captureCanvas(source: HTMLCanvasElement, shot: HTMLCanvasElement) {
  shot.width = source.width;
  shot.height = source.height;
  const ctx = shot.getContext('2d');
  if (!ctx || !shot.width) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, shot.width, shot.height);
  ctx.drawImage(source, 0, 0);
}

/** Move the previous viewport bitmap with the camera. One blit, no layer redraw. */
export function drawCameraSnapshot(
  ctx: CanvasRenderingContext2D,
  shot: HTMLCanvasElement,
  from: Camera,
  to: Camera,
  dpr: number,
) {
  if (!from.scale || !shot.width) return;
  const ratio = to.scale / from.scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(
    shot,
    (-from.x / from.scale * to.scale + to.x) * dpr,
    (-from.y / from.scale * to.scale + to.y) * dpr,
    shot.width * ratio,
    shot.height * ratio,
  );
}
