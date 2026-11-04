import type { Layer } from '../shared/document';

export type ThumbnailWorkerRequest = {
  requestId: number;
  root: Layer;
  images: Record<string, string>;
  width: number;
  height: number;
};

export type ThumbnailWorkerResponse = {
  requestId: number;
  buffer?: ArrayBuffer;
  markup?: string;
  error?: string;
};
