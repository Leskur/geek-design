export type Layer = {
  [key: string]: any;
  _class: string;
  do_objectID: string;
  name: string;
  frame: { x: number; y: number; width: number; height: number };
  layers?: Layer[];
};
export type PageInfo = { id: string; name: string; count: number };
export interface DocumentSource {
  file: { name: string; size: number };
  pages: PageInfo[];
  symbols: Map<string, Layer>;
  styles: Map<string, any>;
  source: 'local' | 'team';
  revisionId?: string;
  /** Stable id for Cache Storage. Same file or revision keeps the same image bytes. */
  assetKey?: string;
  fontLibrary?: { teamId: string; canUpload: boolean };
  matchedFont?(name: string): { family: string; weight: number; style: string; name: string } | undefined;
  fontLoadError?(name: string): string | undefined;
  retryFonts?(): Promise<void>;
  open(): Promise<void>;
  loadSymbols(): Promise<void>;
  page(id: string): Promise<Layer>;
  image(ref: string): Promise<string>;
  close(): Promise<void>;
}
export const PARSER_VERSION = 'sketch-core-1';
export function metadata(meta: any, doc: any) {
  const order = (doc.pages || []).map((p: any) => p._ref?.split('/').pop());
  const pages: PageInfo[] = Object.entries(meta.pagesAndArtboards || {}).map(
    ([id, p]: [string, any]) => ({
      id,
      name: p.name,
      count: Object.keys(p.artboards || {}).length,
    }),
  );
  pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const styles = new Map<string, any>();
  for (const c of [doc.layerStyles, doc.layerTextStyles])
    for (const s of c?.objects || []) styles.set(s.do_objectID, s.value);
  for (const s of [...(doc.foreignLayerStyles || []), ...(doc.foreignTextStyles || [])])
    if (s.localSharedStyle) styles.set(s.localSharedStyle.do_objectID, s.localSharedStyle.value);
  return { pages, styles };
}
export function registerSymbols(l: Layer, map: Map<string, Layer>) {
  const stack = [{ l, depth: 0 }];
  while (stack.length) {
    const { l, depth } = stack.pop()!;
    if (depth > 128) throw new Error('图层嵌套过深');
    if (l._class === 'symbolMaster' && l.symbolID) map.set(l.symbolID, l);
    for (const child of l.layers || []) stack.push({ l: child, depth: depth + 1 });
  }
}
export function color(c: any) {
  return c
    ? `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha ?? 1})`
    : 'transparent';
}
export function hex(c: any) {
  return c
    ? '#' +
        [c.red, c.green, c.blue]
          .map((x) =>
            Math.round(x * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
          .toUpperCase()
    : '';
}
export function point(s: string, w: number, h: number) {
  const a = (s || '{0,0}').replace(/[{}]/g, '').split(',').map(Number);
  return [a[0] * w, a[1] * h];
}
export function path(l: Layer) {
  const ps = l.points || [],
    { width: w, height: h } = l.frame;
  if (!ps.length) return '';
  let d = `M ${point(ps[0].point, w, h).join(' ')}`;
  for (let i = 1; i <= ps.length; i++) {
    if (i === ps.length && !l.isClosed) break;
    const a = ps[i - 1],
      b = ps[i % ps.length],
      end = point(b.point, w, h);
    d +=
      a.hasCurveFrom || b.hasCurveTo
        ? ` C ${point(a.hasCurveFrom ? a.curveFrom : a.point, w, h).join(' ')} ${point(b.hasCurveTo ? b.curveTo : b.point, w, h).join(' ')} ${end.join(' ')}`
        : ` L ${end.join(' ')}`;
  }
  return d + (l.isClosed ? ' Z' : '');
}
