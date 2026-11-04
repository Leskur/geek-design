import type { Layer, DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
import { collectImageRefs, thumbnailMarkup, type RasterView } from './thumbnail-markup';
export { thumbnailSize } from './thumbnail-size';

export function thumbnailBlob(markup: string) {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

/** SVG-as-image cannot load external blob: refs; embed original Sketch bytes as data URL (no resize). */
async function embedOriginalBlob(src: string) {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const embeddedImages = new WeakMap<DocumentSource, Map<string, Promise<string>>>();

function embedOnce(doc: DocumentSource, ref: string, src: string) {
  let cache = embeddedImages.get(doc);
  if (!cache) {
    cache = new Map();
    embeddedImages.set(doc, cache);
  }
  const hit = cache.get(ref);
  if (hit) return hit;
  const pending = embedOriginalBlob(src).catch((error) => {
    cache!.delete(ref);
    throw error;
  });
  cache.set(ref, pending);
  return pending;
}

/** Resolve Sketch image refs once. Later zooms reuse the data URL and do not fetch the blob again. */
export async function collectThumbnailImages(root: Layer, doc: DocumentSource) {
  const images: Record<string, string> = {};
  await Promise.all(
    [...collectImageRefs(root)].map(async (ref) => {
      try {
        const url = await doc.image(ref);
        if (url) images[ref] = await embedOnce(doc, ref, url);
      } catch {}
    }),
  );
  return images;
}

/** Rasterize SVG markup to a compact bitmap (WebP, else PNG). Avoids multi‑MB SVG+base64 blobs. */
export async function rasterizeSvgMarkup(markup: string, width: number, height: number) {
  const svg = thumbnailBlob(markup);
  const url = URL.createObjectURL(svg);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('预览图渲染失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建预览画布');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82),
    );
    if (blob) return blob;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (next) => (next ? resolve(next) : reject(new Error('生成预览图失败'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderThumbnail(
  board: Layer,
  doc: DocumentSource,
  cache: SceneCache,
  width: number,
  height: number,
  view?: RasterView,
) {
  const root = cache.get(board).root,
    images = await collectThumbnailImages(root, doc),
    markup = thumbnailMarkup(root, images, width, height, view);
  return rasterizeSvgMarkup(markup, width, height);
}
