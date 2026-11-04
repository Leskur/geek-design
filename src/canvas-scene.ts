import type { Layer, DocumentSource } from './sketch';
import { color, point } from './sketch';
import { fillRule, geometry } from '../shared/rendering/geometry';
import { maskChains, textRuns } from '../shared/rendering/scene';
import { fontFamilies } from '../shared/fonts';

const SHAPES = new Set([
  'rectangle',
  'oval',
  'shapePath',
  'shapeGroup',
  'triangle',
  'star',
  'polygon',
]);

const BLENDS = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export type BitmapSource = (ref: string) => CanvasImageSource | null;

export type DrawLimits = {
  /** Skip a layer, and its children, when its longer edge is below this many points. */
  minPoint?: number;
};

function applyLayer(ctx: CanvasRenderingContext2D, l: Layer) {
  const { x, y, width: w, height: h } = l.frame;
  ctx.translate(x, y);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-(l.rotation || 0) * Math.PI) / 180);
  ctx.scale(l.isFlippedHorizontal ? -1 : 1, l.isFlippedVertical ? -1 : 1);
  ctx.translate(-w / 2, -h / 2);
}

function paintOf(p: any, w: number, h: number, ctx: CanvasRenderingContext2D) {
  if (p.fillType === 1 && p.gradient) {
    const g = p.gradient;
    const [x1, y1] = point(g.from, w, h);
    const [x2, y2] = point(g.to, w, h);
    const grad =
      g.gradientType === 1
        ? ctx.createRadialGradient(x1, y1, 0, x1, y1, Math.max(0.01, Math.hypot(x2 - x1, y2 - y1)))
        : ctx.createLinearGradient(x1, y1, x2, y2);
    for (const stop of g.stops || []) grad.addColorStop(stop.position ?? 0, color(stop.color));
    return grad;
  }
  return color(p.color);
}

function drawShape(ctx: CanvasRenderingContext2D, l: Layer, bitmap: BitmapSource) {
  const d = geometry(l);
  if (!d) return;
  const path = new Path2D(d);
  const rule = fillRule(l);
  const { width: w, height: h } = l.frame;
  const style = l.style || {};
  const fills = (style.fills || []).filter((p: any) => p.isEnabled);
  const borders = (style.borders || []).filter((p: any) => p.isEnabled);
  for (const p of fills) {
    ctx.save();
    ctx.globalAlpha *= p.contextSettings?.opacity ?? 1;
    if (p.fillType === 4 && p.image?._ref) {
      const img = bitmap(p.image._ref);
      ctx.clip(path, rule);
      if (img) drawFittedImage(ctx, img, w, h, imageFit(p.patternFillType), p.patternTileScale || 1);
    } else {
      ctx.fillStyle = paintOf(p, w, h, ctx);
      ctx.fill(path, rule);
    }
    ctx.restore();
  }
  for (const p of borders) {
    ctx.save();
    ctx.globalAlpha *= p.contextSettings?.opacity ?? 1;
    ctx.strokeStyle = paintOf(p, w, h, ctx);
    const inside = p.position === 1;
    const outside = p.position === 2;
    ctx.lineWidth = (p.thickness || 0) * (inside || outside ? 2 : 1);
    ctx.lineCap = (['butt', 'round', 'square'] as const)[style.borderOptions?.lineCapStyle || 0];
    ctx.lineJoin = (['miter', 'round', 'bevel'] as const)[style.borderOptions?.lineJoinStyle || 0];
    const dash = style.borderOptions?.dashPattern;
    ctx.setLineDash(Array.isArray(dash) ? dash : []);
    if (inside) ctx.clip(path, rule);
    ctx.stroke(path);
    ctx.restore();
  }
}

function fontString(attributes: any) {
  const f = attributes?.MSAttributedStringFontAttribute?.attributes || {};
  const name = f.name || 'Arial';
  const weight = /black|heavy/i.test(name)
    ? 900
    : /semibold|demibold/i.test(name)
      ? 600
      : /bold/i.test(name)
        ? 700
        : /medium/i.test(name)
          ? 500
          : /light|thin/i.test(name)
            ? 300
            : 400;
  const style = /italic|oblique/i.test(name) ? 'italic' : 'normal';
  const family = fontFamilies(name)
    .map((item) => `"${item.replace(/["\\]/g, '')}"`)
    .concat('"Microsoft YaHei"', 'sans-serif')
    .join(',');
  return `${style} ${weight} ${f.size || 14}px ${family}`;
}

function sourceSize(img: CanvasImageSource) {
  if (img instanceof HTMLImageElement)
    return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement)
    return { w: img.videoWidth, h: img.videoHeight };
  if ('width' in img && 'height' in img) {
    const w = Number(img.width);
    const h = Number(img.height);
    if (w > 0 && h > 0) return { w, h };
  }
  return { w: 0, h: 0 };
}

/** Sketch patternFillType: 0 tile, 1 fill, 2 stretch, 3 fit. */
function imageFit(type: number): 'tile' | 'cover' | 'stretch' | 'contain' {
  if (type === 0) return 'tile';
  if (type === 2) return 'stretch';
  if (type === 3) return 'contain';
  return 'cover';
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  fit: 'tile' | 'cover' | 'stretch' | 'contain',
  tileScale = 1,
) {
  const size = sourceSize(img);
  if (fit === 'stretch' || size.w <= 0 || size.h <= 0) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }
  if (fit === 'tile') {
    const pattern = ctx.createPattern(img, 'repeat');
    if (!pattern) return;
    const scale = tileScale || 1;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w / scale, h / scale);
    ctx.restore();
    return;
  }
  const scale = fit === 'cover' ? Math.max(w / size.w, h / size.h) : Math.min(w / size.w, h / size.h);
  const dw = size.w * scale;
  const dh = size.h * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function parseUnitRect(value: unknown) {
  if (typeof value !== 'string') return null;
  const n = value.replace(/[{}]/g, '').split(',').map(Number);
  if (n.length < 4 || n.some((part) => !Number.isFinite(part))) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

function drawBitmap(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  crop: unknown,
) {
  const size = sourceSize(img);
  const unit = parseUnitRect(crop);
  const full =
    !unit ||
    size.w <= 0 ||
    (Math.abs(unit.x) < 0.001 &&
      Math.abs(unit.y) < 0.001 &&
      Math.abs(unit.w - 1) < 0.001 &&
      Math.abs(unit.h - 1) < 0.001);
  if (full) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }
  ctx.drawImage(
    img,
    unit.x * size.w,
    unit.y * size.h,
    Math.max(1, unit.w * size.w),
    Math.max(1, unit.h * size.h),
    0,
    0,
    w,
    h,
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: { text: string; end: boolean }[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const parts: string[] = [];
    if (!paragraph || ctx.measureText(paragraph).width <= maxWidth) parts.push(paragraph);
    else {
      const chars = Array.from(paragraph);
      let start = 0;
      while (start < chars.length) {
        let low = start + 1;
        let high = chars.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (ctx.measureText(chars.slice(start, mid).join('')).width <= maxWidth) low = mid;
          else high = mid - 1;
        }
        const cut = Math.max(start + 1, low);
        parts.push(chars.slice(start, cut).join(''));
        start = cut;
      }
    }
    parts.forEach((line, i) => lines.push({ text: line, end: i === parts.length - 1 }));
  }
  return lines;
}

function fillJustified(ctx: CanvasRenderingContext2D, line: string, y: number, width: number) {
  const chars = Array.from(line);
  if (chars.length <= 1) {
    ctx.fillText(line, 0, y);
    return;
  }
  const extra = (width - ctx.measureText(line).width) / (chars.length - 1);
  let x = 0;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + extra;
  }
}

function glyphTop(value: unknown) {
  if (typeof value !== 'string') return 0;
  const y = Number(value.replace(/[{}]/g, '').split(',')[1]);
  return Number.isFinite(y) ? y : 0;
}

function drawText(ctx: CanvasRenderingContext2D, l: Layer) {
  const runs = textRuns(l);
  const first = runs[0]?.attributes || {};
  const paragraph = first.paragraphStyle || {};
  const size = first.MSAttributedStringFontAttribute?.attributes?.size || 14;
  const explicit = paragraph.maximumLineHeight || paragraph.minimumLineHeight || 0;
  const lineHeight = explicit || size * 1.2;
  const align = paragraph.alignment;
  const vertical = l.style?.textStyle?.verticalAlignment || 0;
  const wrap = l.textBehaviour !== 0;
  ctx.font = fontString(first);
  ctx.fillStyle = first.MSAttributedStringColorAttribute
    ? color(first.MSAttributedStringColorAttribute)
    : '#000';
  ctx.textAlign = align === 2 ? 'center' : align === 1 ? 'right' : 'left';
  const x = align === 2 ? l.frame.width / 2 : align === 1 ? l.frame.width : 0;
  const content = runs.map((run) => run.text).join('');
  const lines = wrap
    ? wrapText(ctx, content, Math.max(1, l.frame.width))
    : content.split(/\r?\n/).map((text) => ({ text, end: true }));
  const block = lines.length * lineHeight;
  const blockTop =
    vertical === 1 ? (l.frame.height - block) / 2 : vertical === 2 ? l.frame.height - block : 0;
  // Canvas "top" is the em box. Explicit line height centers that box in the line.
  // Without a line height, Sketch stores the glyph top in glyphBounds.
  const linePad = explicit ? (lineHeight - size) / 2 : glyphTop(l.glyphBounds);
  ctx.textBaseline = 'top';
  if (wrap) {
    ctx.beginPath();
    ctx.rect(0, 0, l.frame.width, l.frame.height);
    ctx.clip();
  }
  const justify = align === 3 && wrap;
  lines.forEach((line, i) => {
    const y = blockTop + linePad + i * lineHeight;
    if (justify && !line.end && line.text) fillJustified(ctx, line.text, y, l.frame.width);
    else ctx.fillText(line.text, x, y);
  });
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  l: Layer,
  doc: DocumentSource,
  bitmap: BitmapSource,
  limits?: DrawLimits,
) {
  if (l.isVisible === false || l._hiddenSymbol || l._class === 'slice') return;
  if (
    limits?.minPoint &&
    Math.max(l.frame.width, l.frame.height) < limits.minPoint &&
    l._class !== 'artboard'
  )
    return;
  ctx.save();
  const opacity = l.style?.contextSettings?.opacity ?? 1;
  ctx.globalAlpha *= opacity;
  const blend = BLENDS[l.style?.contextSettings?.blendMode || 0];
  if (blend) ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
  applyLayer(ctx, l);
  const { width: w, height: h } = l.frame;
  if (SHAPES.has(l._class)) drawShape(ctx, l, bitmap);
  else if (l._class === 'text') drawText(ctx, l);
  else if (l._class === 'bitmap') {
    const img = l.image?._ref ? bitmap(l.image._ref) : null;
    if (img) drawBitmap(ctx, img, w, h, l.clippingMask);
  } else {
    if (l._background) {
      ctx.fillStyle = color(l._background);
      ctx.fillRect(0, 0, w, h);
    }
    if (l.layers?.length) drawChildren(ctx, l.layers, doc, bitmap, limits);
  }
  ctx.restore();
}

function drawChildren(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  doc: DocumentSource,
  bitmap: BitmapSource,
  limits?: DrawLimits,
) {
  for (const { layer, mask } of maskChains(layers)) {
    ctx.save();
    if (mask) {
      const parent = ctx.getTransform();
      applyLayer(ctx, mask);
      const d = geometry(mask);
      if (d) ctx.clip(new Path2D(d), fillRule(mask));
      ctx.setTransform(parent);
    }
    drawNode(ctx, layer, doc, bitmap, limits);
    ctx.restore();
  }
}

/** Draw the artboard in its own coordinates. The caller sets the viewport transform. */
export function drawArtboard(
  ctx: CanvasRenderingContext2D,
  root: Layer,
  _doc: DocumentSource,
  bitmap: BitmapSource,
  limits?: DrawLimits,
) {
  ctx.save();
  ctx.fillStyle = root.hasBackgroundColor ? color(root.backgroundColor) : '#fff';
  ctx.fillRect(0, 0, root.frame.width, root.frame.height);
  ctx.beginPath();
  ctx.rect(0, 0, root.frame.width, root.frame.height);
  ctx.clip();
  drawChildren(ctx, root.layers || [], _doc, bitmap, limits);
  ctx.restore();
}
