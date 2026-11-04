import type { Layer } from '../document';

export type Override = { overrideName: string; value: any };
export type Scene = {
  root: Layer;
  warnings: string[];
  stats: { instances: number; overrides: number; masks: number; shapes: number };
};
type Library = { symbols: Map<string, Layer>; styles?: Map<string, any> };

// Sketch stores flexible dimensions / edges as set bits (fixed constraints are inverted).
export function resizeFrame(
  frame: Layer['frame'],
  from: Layer['frame'],
  to: Layer['frame'],
  constraint = 63,
) {
  function axis(
    pos: number,
    size: number,
    old: number,
    next: number,
    start: number,
    fixed: number,
    end: number,
  ) {
    if (!old || old === next) return [pos, size];
    const a = !(constraint & start),
      b = !(constraint & end),
      keep = !(constraint & fixed),
      delta = next - old;
    if (a && b) return [pos, Math.max(0, size + delta)];
    const n = keep ? size : (size * next) / old;
    if (a) return [pos, n];
    if (b) return [pos + delta + size - n, n];
    return [((pos + size / 2) * next) / old - n / 2, n];
  }
  const [x, width] = axis(frame.x, frame.width, from.width, to.width, 1, 2, 4);
  const [y, height] = axis(frame.y, frame.height, from.height, to.height, 8, 16, 32);
  return { ...frame, x, y, width, height };
}

export function resolveBoard(board: Layer, library: Library): Scene {
  const warnings = new Set<string>();
  const stats = { instances: 0, overrides: 0, masks: 0, shapes: 0 };
  let budget = 0;
  function resolve(
    source: Layer,
    parentId: string,
    pending: Override[],
    chain: string[],
    from?: Layer['frame'],
    to?: Layer['frame'],
  ): Layer {
    if (++budget > 100000) throw new Error('当前画板展开后的图层超过十万，暂不支持');
    const sourceId = source.do_objectID;
    const l: Layer = {
      ...source,
      do_objectID: parentId ? `${parentId}/${sourceId}` : sourceId,
      _sourceID: sourceId,
      frame: { ...source.frame },
      style: structuredClone(source.style || {}),
    };
    if (from && to) l.frame = resizeFrame(l.frame, from, to, source.resizingConstraint ?? 63);
    if (l.attributedString) l.attributedString = structuredClone(l.attributedString);
    const direct = pending.filter((x) => x.overrideName.startsWith(sourceId + '_'));
    for (const o of direct) {
      const property = o.overrideName.slice(sourceId.length + 1);
      stats.overrides++;
      if (property === 'stringValue' && l.attributedString) {
        l.attributedString.string = String(o.value);
        l.attributedString.attributes = [
          {
            location: 0,
            length: String(o.value).length,
            attributes:
              l.attributedString.attributes?.[0]?.attributes ||
              l.style.textStyle?.encodedAttributes ||
              {},
          },
        ];
      } else if (property === 'symbolID') l.symbolID = o.value;
      else if (property === 'isVisible')
        l.isVisible = o.value !== false && o.value !== 0 && o.value !== '0';
      else if (property === 'image') l.image = o.value;
      else if (property === 'layerStyle' || property === 'textStyle') {
        const style = library.styles?.get(o.value);
        if (style) {
          l.style = structuredClone(style);
          if (property === 'textStyle')
            for (const run of l.attributedString?.attributes || [])
              run.attributes = {
                ...run.attributes,
                ...structuredClone(style.textStyle?.encodedAttributes || {}),
              };
        } else warnings.add('部分共享样式未包含在文件中');
      } else if (property === 'textSize' || property === 'textColor') {
        const runs = l.attributedString?.attributes || [];
        for (const run of runs) {
          if (property === 'textSize') {
            const f = run.attributes.MSAttributedStringFontAttribute;
            if (f) f.attributes.size = Number(o.value);
          } else run.attributes.MSAttributedStringColorAttribute = o.value;
        }
      } else {
        const paint = property.match(/^color:(fill|border)-(\d+)$/);
        if (paint) {
          const values = l.style[paint[1] === 'fill' ? 'fills' : 'borders'];
          if (values?.[Number(paint[2])]) values[Number(paint[2])].color = o.value;
        } else warnings.add(`尚未支持组件覆盖：${property}`);
      }
    }
    // Image overrides may target bitmap layers or image fills.
    if (direct.some((x) => x.overrideName.endsWith('_image')) && l._class !== 'bitmap') {
      const fill = l.style.fills?.find((f: any) => f.fillType === 4);
      if (fill) fill.image = l.image;
    }
    if (l.hasClippingMask) stats.masks++;
    if (l._class === 'shapeGroup') stats.shapes++;
    if (l._class === 'symbolInstance') {
      stats.instances++;
      if (l.symbolID === '') {
        l.layers = [];
        l._hiddenSymbol = true;
        return l;
      }
      const master = library.symbols.get(l.symbolID);
      if (!master) {
        warnings.add('部分组件主版未包含在文件中');
        l._missingSymbol = true;
        return l;
      }
      if (chain.includes(l.symbolID) || chain.length >= 32) {
        warnings.add('已停止展开循环引用的组件');
        l._missingSymbol = true;
        return l;
      }
      const inherited = pending
        .filter((x) => x.overrideName.startsWith(sourceId + '/'))
        .map((x) => ({ ...x, overrideName: x.overrideName.slice(sourceId.length + 1) }));
      const values = new Map<string, Override>();
      for (const o of [...(l.overrideValues || []), ...inherited]) values.set(o.overrideName, o);
      l._componentName = master.name;
      l._background =
        master.includeBackgroundColorInInstance && master.hasBackgroundColor
          ? master.backgroundColor
          : null;
      l.layers = (master.layers || []).map((x) =>
        resolve(
          x,
          l.do_objectID,
          [...values.values()],
          [...chain, l.symbolID],
          master.frame,
          l.frame,
        ),
      );
    } else {
      l.layers = source.layers?.map((x) =>
        resolve(x, l.do_objectID, pending, chain, source.frame, l.frame),
      );
    }
    if (l.style?.blur?.isEnabled) warnings.add('部分模糊效果仍为近似显示');
    if (l.style?.innerShadows?.some((x: any) => x.isEnabled)) warnings.add('内阴影尚未支持');
    if (l.groupLayout?._class && !/Freeform/.test(l.groupLayout._class))
      warnings.add('智能布局暂按保存时的位置显示');
    return l;
  }
  return { root: resolve(board, '', [], []), warnings: [...warnings], stats };
}

export function maskChains(layers: Layer[]) {
  let mask: Layer | null = null;
  return layers
    .filter((l) => l.isVisible !== false)
    .map((layer) => {
      if (layer.shouldBreakMaskChain) mask = null;
      const clip = mask;
      if (layer.hasClippingMask) mask = layer;
      return { layer, mask: clip };
    });
}

export function textRuns(l: Layer) {
  const text = String(l.attributedString?.string || '');
  const runs = l.attributedString?.attributes || [];
  const points = [
    ...new Set([
      0,
      text.length,
      ...runs.flatMap((r: any) => [
        Math.max(0, r.location),
        Math.min(text.length, r.location + r.length),
      ]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= text.length)
    .sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({
    text: text.slice(start, points[i + 1]),
    attributes: {
      ...l.style?.textStyle?.encodedAttributes,
      ...runs.find((r: any) => r.location <= start && r.location + r.length > start)?.attributes,
    },
  }));
}
