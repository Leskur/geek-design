import paper from 'paper';
import { path, type Layer } from '../document';

const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));
const paths = new WeakMap<Layer, string>();
export function fillRule(l: Layer): 'nonzero' | 'evenodd' {
  return (l.windingRule ?? l.style?.windingRule) === 0 ? 'nonzero' : 'evenodd';
}
export function transform(l: Layer) {
  const { x, y, width: w, height: h } = l.frame;
  return `translate(${x} ${y}) rotate(${-l.rotation || 0} ${w / 2} ${h / 2})${l.isFlippedHorizontal ? ` translate(${w} 0) scale(-1 1)` : ''}${l.isFlippedVertical ? ` translate(0 ${h}) scale(1 -1)` : ''}`;
}
function applyTransform(item: paper.PathItem, l: Layer) {
  const { x, y, width: w, height: h } = l.frame;
  const matrix = new scope.Matrix();
  matrix.translate(x, y);
  matrix.translate(w / 2, h / 2);
  matrix.rotate(-l.rotation || 0, 0, 0);
  matrix.scale(l.isFlippedHorizontal ? -1 : 1, l.isFlippedVertical ? -1 : 1);
  matrix.translate(-w / 2, -h / 2);
  item.transform(matrix);
  return item;
}
function ownPath(l: Layer): paper.PathItem | null {
  const { width: w, height: h } = l.frame;
  if (l._class === 'shapeGroup') {
    let result: paper.PathItem | null = null;
    for (const child of l.layers || []) {
      if (child.isVisible === false) continue;
      const raw = ownPath(child);
      if (!raw) continue;
      const item = applyTransform(raw, child);
      if (!result) {
        result = item;
        continue;
      }
      // -1 means a compound contour, not a boolean union. Preserve orientation
      // so opposite-winding inner contours remain holes (e.g. search / globe).
      if (child.booleanOperation === -1 || child.booleanOperation === undefined) {
        result = new scope.CompoundPath({
          children: [result, item],
          insert: false,
          fillRule: fillRule(l),
        });
        continue;
      }
      const operation =
        ['unite', 'subtract', 'intersect', 'exclude'][child.booleanOperation] || 'unite';
      const next = result[operation as 'unite'](item, { insert: false });
      result.remove();
      item.remove();
      result = next;
    }
    if (result) result.fillRule = fillRule(l);
    return result;
  }
  if (l._class === 'oval')
    return new scope.Path.Ellipse({ rectangle: new scope.Rectangle(0, 0, w, h), insert: false });
  if (l._class === 'rectangle') {
    const points = l.points || [];
    const corners = points.map((p: any) => p.point.replace(/[{}]/g, '').split(',').map(Number));
    const standard =
      !points.length ||
      (points.length === 4 &&
        corners.every((p: number[]) =>
          p.every((v) => Math.abs(v) < 1e-7 || Math.abs(v - 1) < 1e-7),
        ));
    if (standard) {
      let r = [0, 0, 0, 0].map(() => Math.max(0, l.fixedRadius || 0));
      for (let i = 0; i < points.length; i++) {
        const [x, y] = corners[i];
        r[y > 0.5 ? (x > 0.5 ? 2 : 3) : x > 0.5 ? 1 : 0] = Math.max(
          0,
          l.fixedRadius || points[i].cornerRadius || 0,
        );
      }
      const scale = Math.min(
        1,
        w / (r[0] + r[1] || 1),
        h / (r[1] + r[2] || 1),
        w / (r[2] + r[3] || 1),
        h / (r[3] + r[0] || 1),
      );
      r = r.map((v) => v * scale);
      const arc = (radius: number, x: number, y: number) =>
        radius ? `A${radius},${radius} 0 0 1 ${x},${y}` : `L${x},${y}`;
      const d = `M${r[0]},0 H${w - r[1]} ${arc(r[1], w, r[1])} V${h - r[2]} ${arc(r[2], w - r[2], h)} H${r[3]} ${arc(r[3], 0, h - r[3])} V${r[0]} ${arc(r[0], r[0], 0)} Z`;
      return new scope.CompoundPath({ pathData: d, insert: false });
    }
  }
  const d = path(l);
  if (d) return new scope.CompoundPath({ pathData: d, insert: false, fillRule: fillRule(l) });
  return null;
}
export function geometry(l: Layer) {
  const cached = paths.get(l);
  if (cached !== undefined) return cached;
  const item = ownPath(l);
  const d = item?.pathData || '';
  item?.remove();
  paths.set(l, d);
  return d;
}
