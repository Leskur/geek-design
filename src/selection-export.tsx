import { renderToStaticMarkup } from 'react-dom/server';
import type { Layer, DocumentSource } from './sketch';
import { Node } from '../shared/rendering/renderer';
import { color } from './sketch';
import { exportRoot, resourceRefs, safeName } from './ai-export';

export type ImageFormat = 'png' | 'jpg' | 'svg';
export function visiblePixelBounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
export function exportBounds(layer: Layer) {
  const angle = ((layer.rotation || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle)),
    w = layer.frame.width,
    h = layer.frame.height;
  const width = w * c + h * s,
    height = w * s + h * c;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}
export function exportSize(layer: Layer, scale: number) {
  const bounds = exportBounds(layer),
    width = Math.ceil(Number((bounds.width * scale).toFixed(6))),
    height = Math.ceil(Number((bounds.height * scale).toFixed(6)));
  if (
    !Number.isFinite(width + height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 32_000_000
  )
    throw Error('导出尺寸过大或无效，请降低倍率');
  return { width, height };
}
const asDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error('读取资源失败'));
    r.readAsDataURL(blob);
  });

// Flatten browser-laid-out text so downloaded images need no fonts or foreignObject support.
function flattenText(svg: SVGSVGElement, scale: number) {
  for (const foreign of svg.querySelectorAll('foreignObject')) {
    const w = Number(foreign.getAttribute('width')),
      h = Number(foreign.getAttribute('height'));
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
    for (const child of foreign.children) host.append(child.cloneNode(true));
    document.body.append(host);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w * scale));
      canvas.height = Math.max(1, Math.ceil(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('无法创建导出画布');
      ctx.scale(scale, scale);
      const origin = host.getBoundingClientRect(),
        walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let node: globalThis.Node | null;
      while ((node = walker.nextNode())) {
        const style = getComputedStyle(node.parentElement!),
          text = node.textContent || '';
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        const metrics = ctx.measureText('Mg');
        ctx.textBaseline = 'alphabetic';
        let offset = 0;
        for (const char of text) {
          const range = document.createRange();
          range.setStart(node, offset);
          offset += char.length;
          range.setEnd(node, offset);
          const rect = range.getBoundingClientRect();
          if (!rect.width || char === '\n' || char === '\r') continue;
          const y = rect.bottom - origin.top - (metrics.fontBoundingBoxDescent || 0);
          ctx.fillText(char, rect.left - origin.left, y);
          if (style.textDecorationLine.includes('underline'))
            ctx.fillRect(
              rect.left - origin.left,
              y + 1,
              rect.width,
              Math.max(1, parseFloat(style.fontSize) / 16),
            );
          if (style.textDecorationLine.includes('line-through'))
            ctx.fillRect(
              rect.left - origin.left,
              y - parseFloat(style.fontSize) * 0.3,
              rect.width,
              Math.max(1, parseFloat(style.fontSize) / 16),
            );
        }
      }
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('width', String(w));
      image.setAttribute('height', String(h));
      image.setAttribute('href', canvas.toDataURL('image/png'));
      foreign.replaceWith(image);
    } finally {
      host.remove();
    }
  }
}
export async function exportSelection(
  layer: Layer,
  doc: DocumentSource,
  format: ImageFormat,
  scale: number,
) {
  const { width, height } = exportSize(layer, scale),
    images = new Map<string, string>();
  for (const ref of resourceRefs(layer)) {
    const url = await doc.image(ref);
    if (!url) throw Error('选中项的图片资源缺失');
    const response = await fetch(url);
    if (!response.ok) throw Error('图片资源读取失败');
    images.set(ref, await asDataURL(await response.blob()));
  }
  await document.fonts.ready;
  const source = Object.assign(Object.create(doc), { previewImages: images }) as DocumentSource,
    root = exportRoot(layer);
  // Export in the layer's own coordinates; ancestor clipping is outside this selection.
  const bounds = exportBounds(layer);
  const markup = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
    >
      {root._class === 'artboard' && root.hasBackgroundColor && (
        <rect
          width={root.frame.width}
          height={root.frame.height}
          fill={color(root.backgroundColor)}
        />
      )}
      <Node l={root} doc={source} choose={() => {}} interactive={false} />
    </svg>,
  );
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw Error('导出内容生成失败');
  flattenText(parsed.documentElement as unknown as SVGSVGElement, scale);
  const svg = new Blob([new XMLSerializer().serializeToString(parsed)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svg);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error('导出图像渲染失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('无法创建导出画布');
    ctx.drawImage(image, 0, 0, width, height);
    const crop = visiblePixelBounds(ctx.getImageData(0, 0, width, height).data, width, height);
    if (!crop) throw Error('所选元素没有可见内容');
    if (format === 'svg') {
      const svgRoot = parsed.documentElement;
      svgRoot.setAttribute(
        'viewBox',
        `${bounds.x + (crop.x * bounds.width) / width} ${bounds.y + (crop.y * bounds.height) / height} ${(crop.width * bounds.width) / width} ${(crop.height * bounds.height) / height}`,
      );
      svgRoot.setAttribute('width', String(crop.width));
      svgRoot.setAttribute('height', String(crop.height));
      return new Blob([new XMLSerializer().serializeToString(parsed)], {
        type: 'image/svg+xml;charset=utf-8',
      });
    }
    const output = document.createElement('canvas');
    output.width = crop.width;
    output.height = crop.height;
    const target = output.getContext('2d');
    if (!target) throw Error('无法创建导出画布');
    if (format === 'jpg') {
      target.fillStyle = '#fff';
      target.fillRect(0, 0, crop.width, crop.height);
    }
    target.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    return await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error('生成图片失败'))),
        format === 'jpg' ? 'image/jpeg' : 'image/png',
        0.95,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function downloadSelection(
  layer: Layer,
  doc: DocumentSource,
  format: ImageFormat,
  scale: number,
) {
  const blob = await exportSelection(layer, doc, format, scale),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(layer.name)}@${scale}x.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
