import type { DocumentSource } from './sketch';
import { readAsset, writeAsset } from './asset-cache';

const MINI_EDGE = 256;

function imageSize(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    const length = (bytes[i + 2] << 8) + bytes[i + 3];
    if (!length) break;
    i += 2 + length;
  }
  return null;
}

async function decodeMini(blob: Blob) {
  const header = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  const size = imageSize(header);
  const edge = size ? Math.max(size.width, size.height) : 0;
  if (size && edge > MINI_EDGE && edge < 20000) {
    const fit = MINI_EDGE / edge;
    return createImageBitmap(blob, {
      resizeWidth: Math.max(1, Math.round(size.width * fit)),
      resizeHeight: Math.max(1, Math.round(size.height * fit)),
      resizeQuality: 'low',
    });
  }
  const full = await createImageBitmap(blob);
  const decoded = Math.max(full.width, full.height) || 1;
  if (decoded <= MINI_EDGE) return full;
  const fit = MINI_EDGE / decoded;
  const mini = await createImageBitmap(full, {
    resizeWidth: Math.max(1, Math.round(full.width * fit)),
    resizeHeight: Math.max(1, Math.round(full.height * fit)),
    resizeQuality: 'low',
  });
  full.close();
  return mini;
}

function persistMini(bitmap: ImageBitmap, key: string, ref: string) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) void writeAsset(key, ref, 'mini', blob);
  }, 'image/webp', 0.8);
}

function closeAll(images: Map<string, CanvasImageSource>) {
  for (const image of images.values()) if (image instanceof ImageBitmap) image.close();
  images.clear();
}

/** Small images for zoomed-out boards. Original pixels load only when a board is shown sharp. */
export class ImageLod {
  private full = new Map<string, CanvasImageSource>();
  private mini = new Map<string, CanvasImageSource>();
  private miniTask = new Set<string>();
  private fullTask = new Set<string>();
  constructor(
    private doc: DocumentSource,
    private onReady: (ref: string) => void,
  ) {}
  clear() {
    closeAll(this.full);
    closeAll(this.mini);
    this.miniTask.clear();
    this.fullTask.clear();
  }
  image(ref: string, preferMini: boolean): CanvasImageSource | null {
    if (preferMini) {
      this.ensureMini(ref);
      return this.mini.get(ref) || null;
    }
    this.ensureFull(ref);
    return this.full.get(ref) || null;
  }
  private ensureMini(ref: string) {
    if (this.mini.has(ref) || this.miniTask.has(ref)) return;
    this.miniTask.add(ref);
    void this.loadMini(ref);
  }
  private ensureFull(ref: string) {
    if (this.full.has(ref) || this.fullTask.has(ref)) return;
    this.fullTask.add(ref);
    void this.loadFull(ref);
  }
  private async loadMini(ref: string) {
    const key = this.doc.assetKey;
    try {
      if (key) {
        const cached = await readAsset(key, ref, 'mini');
        if (cached) {
          const bitmap = await createImageBitmap(cached);
          if (!this.mini.has(ref)) {
            this.mini.set(ref, bitmap);
            this.onReady(ref);
          } else bitmap.close();
          return;
        }
      }
      const url = await this.doc.image(ref);
      if (!url || this.mini.has(ref)) return;
      const bitmap = await decodeMini(await (await fetch(url)).blob());
      if (this.mini.has(ref)) {
        bitmap.close();
        return;
      }
      this.mini.set(ref, bitmap);
      this.onReady(ref);
      if (key) persistMini(bitmap, key, ref);
    } catch {
      /* A missing or odd image stays blank. The board still paints. */
    }
  }
  private async loadFull(ref: string) {
    try {
      const url = await this.doc.image(ref);
      if (!url || this.full.has(ref)) return;
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      if (this.full.has(ref)) {
        bitmap.close();
        return;
      }
      this.full.set(ref, bitmap);
      this.onReady(ref);
    } catch {
      /* Sharp boards keep the mini until a full decode succeeds. */
    }
  }
}
