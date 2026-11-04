import type { Layer, DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
import { collectImageRefs, thumbnailMarkup } from './thumbnail-markup';
import type { ThumbnailWorkerRequest, ThumbnailWorkerResponse } from './thumbnail-protocol';
export { thumbnailSize } from './thumbnail-size';

export function thumbnailBlob(markup: string) {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

async function dataUrl(src: string) {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function collectThumbnailImages(root: Layer, doc: DocumentSource) {
  const images: Record<string, string> = {};
  await Promise.all(
    [...collectImageRefs(root)].map(async (ref) => {
      try {
        const url = await doc.image(ref);
        if (url) images[ref] = await dataUrl(url);
      } catch {}
    }),
  );
  return images;
}

export function createThumbnailWorker() {
  return new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' });
}

export function renderThumbnailInWorker(
  worker: Worker,
  requestId: number,
  payload: Omit<ThumbnailWorkerRequest, 'requestId'>,
) {
  return new Promise<ThumbnailWorkerResponse>((resolve, reject) => {
    const onMessage = ({ data }: MessageEvent<ThumbnailWorkerResponse>) => {
      if (data.requestId !== requestId) return;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    const onError = (event: Event) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
      const failure = event as ErrorEvent;
      reject(failure.error || new Error(failure.message || '缩略图线程失败'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
    try {
      const message: ThumbnailWorkerRequest = { requestId, ...payload };
      worker.postMessage(message);
    } catch (error) {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
      reject(error);
    }
  });
}

export async function renderThumbnail(
  board: Layer,
  doc: DocumentSource,
  cache: SceneCache,
  width: number,
  height: number,
) {
  const root = cache.get(board).root,
    images = await collectThumbnailImages(root, doc);
  return thumbnailBlob(thumbnailMarkup(root, images, width, height));
}
