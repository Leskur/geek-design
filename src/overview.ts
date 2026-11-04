import type { Layer } from './sketch';
import type { Camera, Rect, Point } from './interaction';
export function pageBounds(boards: Layer[]): Rect {
  const valid = boards.filter(
    (b) =>
      ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b.frame[k as keyof Rect])) &&
      b.frame.width > 0 &&
      b.frame.height > 0,
  );
  if (!valid.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...valid.map((b) => b.frame.x)),
    y = Math.min(...valid.map((b) => b.frame.y));
  return {
    x,
    y,
    width: Math.max(...valid.map((b) => b.frame.x + b.frame.width)) - x,
    height: Math.max(...valid.map((b) => b.frame.y + b.frame.height)) - y,
  };
}
export function fitPage(bounds: Rect, width: number, height: number): Camera {
  const scale = Math.max(
    0.001,
    Math.min(1, Math.max(1, width - 100) / bounds.width, Math.max(1, height - 100) / bounds.height),
  );
  return {
    scale,
    x: (width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}
export function zoomPage(camera: Camera, scale: number, anchor: Point): Camera {
  const next = Math.max(0.001, Math.min(4, scale)),
    ratio = next / camera.scale;
  return {
    scale: next,
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
  };
}
export function boardVisible(
  b: Layer,
  camera: Camera,
  width: number,
  height: number,
  margin = 100,
) {
  const f = b.frame;
  return (
    f.x * camera.scale + camera.x < width + margin &&
    (f.x + f.width) * camera.scale + camera.x > -margin &&
    f.y * camera.scale + camera.y < height + margin &&
    (f.y + f.height) * camera.scale + camera.y > -margin
  );
}
export function matchesLayer(layer: Layer, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return (
    layer.name.toLocaleLowerCase().includes(q) ||
    String(layer.attributedString?.string || '')
      .toLocaleLowerCase()
      .includes(q) ||
    (layer.overrideValues || []).some(
      (o: any) => typeof o.value === 'string' && o.value.toLocaleLowerCase().includes(q),
    ) ||
    !!layer.layers?.some((l) => matchesLayer(l, q))
  );
}

export function matchesBoardName(layer: Layer, query: string): boolean {
  return layer.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

// At overview scale, tiny boards need only their bounds. Bound expensive image
// paints even when a whole page fits in the viewport; selection always wins.
export function previewBoards(
  boards: Layer[],
  camera: Camera,
  width: number,
  height: number,
  selectedId?: string,
  limit = 64,
): Set<string> {
  const candidates = boards.filter(
    (b) =>
      b.do_objectID === selectedId ||
      (b.frame.width * camera.scale >= 24 && b.frame.height * camera.scale >= 16),
  );
  const distance = (b: Layer) =>
    Math.hypot(
      (b.frame.x + b.frame.width / 2) * camera.scale + camera.x - width / 2,
      (b.frame.y + b.frame.height / 2) * camera.scale + camera.y - height / 2,
    );
  candidates.sort((a, b) =>
    a.do_objectID === selectedId
      ? -1
      : b.do_objectID === selectedId
        ? 1
        : distance(a) - distance(b),
  );
  return new Set(candidates.slice(0, limit).map((b) => b.do_objectID));
}

// Use raster previews at small scales even for selected boards; geometry remains interactive.
export function pageRenderQuality(board: Layer, scale: number) {
  const screenSize = Math.max(board.frame.width, board.frame.height) * scale;
  return { small: scale < 0.15 || screenSize <= 96, live: scale >= 0.5 && screenSize > 160 };
}
