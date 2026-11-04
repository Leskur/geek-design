import type { ThumbnailWorkerRequest, ThumbnailWorkerResponse } from './thumbnail-protocol';

self.onmessage = async ({ data }: MessageEvent<ThumbnailWorkerRequest>) => {
  const { requestId, root, images, width, height } = data;
  try {
    const { thumbnailMarkup } = await import('./thumbnail-markup');
    const markup = thumbnailMarkup(root, images, width, height);
    const response: ThumbnailWorkerResponse = { requestId, markup };
    self.postMessage(response);
  } catch (error) {
    const response: ThumbnailWorkerResponse = {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
