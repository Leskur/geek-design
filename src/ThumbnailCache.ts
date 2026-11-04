import type { Layer, DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
import { previewPixelScale, previewSize, type PreviewMode } from './thumbnail-size';
import type { RasterView } from './thumbnail-markup';

type Entry = { url: string; width: number; height: number; blob: boolean };
type ViewEntry = Entry & { sig: string };
type Job = {
  key: string;
  board: Layer;
  mode: PreviewMode;
  width: number;
  height: number;
  view?: RasterView;
  sig?: string;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
};

function thumbnailConcurrency() {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(2, cores - 2));
}

function cacheKey(boardId: string, mode: PreviewMode) {
  return `${boardId}:${mode}`;
}

/**
 * One preview pipeline for local and team:
 * client-side SVG markup is the reliable path; doc.thumbnail is an optional fast path.
 * Overview mini and detail 原图分 key 缓存，避免互相盖住导致「放大不重绘」。
 */
export class ThumbnailCache {
  private values = new Map<string, Entry>();
  private views = new Map<string, ViewEntry>();
  private viewWanted = new Map<string, { view: RasterView; width: number; height: number; sig: string }>();
  private pending = new Map<string, Promise<string>>();
  private wanted = new Map<string, { width: number; height: number }>();
  private queue: Job[] = [];
  private active = 0;
  private disposed = false;
  private paused = false;
  private api?: typeof import('./thumbnail-renderer');
  constructor(
    private doc: DocumentSource,
    private scenes: SceneCache,
    private concurrency = thumbnailConcurrency(),
  ) {}
  peek(id: string, mode: PreviewMode = 'overview') {
    return this.values.get(cacheKey(id, mode))?.url || this.values.get(cacheKey(id, 'detail'))?.url || '';
  }
  entry(id: string, mode: PreviewMode = 'overview') {
    return this.values.get(cacheKey(id, mode)) || null;
  }
  covers(board: Layer, viewScale: number, mode: PreviewMode = 'overview') {
    const cached = this.values.get(cacheKey(board.do_objectID, mode));
    if (!cached) return false;
    const { width, height } = previewSize(board, viewScale, mode);
    return cached.width >= width && cached.height >= height;
  }
  request(
    board: Layer,
    priority = false,
    viewScale = 1,
    mode: PreviewMode = 'overview',
  ): Promise<string> {
    const key = cacheKey(board.do_objectID, mode),
      { width, height } = previewSize(board, viewScale, mode),
      cached = this.values.get(key);
    if (cached && cached.width >= width && cached.height >= height) {
      this.values.delete(key);
      this.values.set(key, cached);
      return Promise.resolve(cached.url);
    }
    if (this.disposed) return Promise.reject(new Error('文档已关闭'));
    this.wanted.set(key, { width, height });
    const existing = this.pending.get(key);
    if (existing) {
      const i = this.queue.findIndex((j) => j.key === key);
      if (i >= 0) {
        if (this.queue[i].width < width) {
          this.queue[i].width = width;
          this.queue[i].height = height;
        }
        if (priority) this.queue.unshift(this.queue.splice(i, 1)[0]);
      }
      // 已在渲染中：等当前完成后再按 wanted 补更大一档
      return existing;
    }
    const run =
      this.doc.thumbnail && mode === 'overview'
        ? this.doc
            .thumbnail(board.do_objectID, previewPixelScale(viewScale, mode) < 0.5)
            .then((url) => {
              if (this.disposed) throw new Error('文档已关闭');
              this.remember(key, url, width, height, false);
              return url;
            })
            .catch(() => this.enqueue(board, mode, width, height, priority))
        : this.enqueue(board, mode, width, height, priority);
    const promise = run
      .then((url) => this.ensureWanted(board, mode, url))
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  /** Detail: raster only the visible window into a viewport-sized bitmap. Canvas stays screen-sized. */
  requestViewport(board: Layer, view: RasterView, width: number, height: number): Promise<string> {
    const id = board.do_objectID,
      sig = `${width}x${height}@${view.x.toFixed(1)},${view.y.toFixed(1)},${view.width.toFixed(1)},${view.height.toFixed(1)}`,
      key = `${id}:view`,
      cached = this.views.get(id);
    this.viewWanted.set(id, { view, width, height, sig });
    if (cached?.sig === sig) return Promise.resolve(cached.url);
    if (this.disposed) return Promise.reject(new Error('文档已关闭'));
    const existing = this.pending.get(key);
    if (existing) return existing.then(() => this.finishViewport(board));
    const promise = this.enqueue(board, 'detail', width, height, true, view, sig)
      .then(() => this.finishViewport(board))
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  private finishViewport(board: Layer): Promise<string> {
    const id = board.do_objectID,
      want = this.viewWanted.get(id),
      cached = this.views.get(id);
    if (!want) return Promise.resolve(cached?.url || '');
    if (cached?.sig === want.sig) return Promise.resolve(cached.url);
    return this.enqueue(board, 'detail', want.width, want.height, true, want.view, want.sig).then(
      () => this.finishViewport(board),
    );
  }
  private ensureWanted(board: Layer, mode: PreviewMode, url: string): Promise<string> {
    const key = cacheKey(board.do_objectID, mode),
      need = this.wanted.get(key),
      cached = this.values.get(key);
    if (!need || !cached) return Promise.resolve(url);
    if (cached.width >= need.width && cached.height >= need.height) return Promise.resolve(cached.url);
    return this.enqueue(board, mode, need.width, need.height, true);
  }
  private enqueue(
    board: Layer,
    mode: PreviewMode,
    width: number,
    height: number,
    priority: boolean,
    view?: RasterView,
    sig?: string,
  ) {
    const key = view ? `${board.do_objectID}:view` : cacheKey(board.do_objectID, mode);
    return new Promise<string>((resolve, reject) => {
      const job = { key, board, mode, width, height, view, sig, resolve, reject };
      priority ? this.queue.unshift(job) : this.queue.push(job);
      void this.work();
    });
  }
  private remember(key: string, url: string, width: number, height: number, blob: boolean) {
    const prev = this.values.get(key);
    if (prev?.blob && prev.url !== url) URL.revokeObjectURL(prev.url);
    this.values.set(key, { url, width, height, blob });
  }
  private async work() {
    if (this.paused || this.disposed) return;
    this.api ??= await import('./thumbnail-renderer');
    while (this.active < this.concurrency && this.queue.length && !this.paused && !this.disposed) {
      const job = this.queue.shift();
      if (!job) break;
      this.active++;
      void this.run(job);
    }
  }
  private async run(job: Job) {
    const api = this.api!;
    try {
      const viewWant = job.view ? this.viewWanted.get(job.board.do_objectID) : undefined;
      const boardNeed = job.view ? undefined : this.wanted.get(job.key);
      const width = viewWant?.width || Math.max(job.width, boardNeed?.width || 0),
        height = viewWant?.height || Math.max(job.height, boardNeed?.height || 0),
        view = viewWant?.view || job.view,
        sig = viewWant?.sig || job.sig;
      const blob = await api.renderThumbnail(
        job.board,
        this.doc,
        this.scenes,
        width,
        height,
        view,
      );
      if (this.disposed) {
        job.reject(new Error('文档已关闭'));
        return;
      }
      if (view && sig) {
        const latest = this.viewWanted.get(job.board.do_objectID);
        if (latest && latest.sig !== sig) {
          job.resolve('');
          return;
        }
        const url = URL.createObjectURL(blob);
        const prev = this.views.get(job.board.do_objectID);
        if (prev?.blob && prev.url !== url) URL.revokeObjectURL(prev.url);
        this.views.set(job.board.do_objectID, { url, width, height, blob: true, sig });
        job.resolve(url);
        return;
      }
      const prev = this.values.get(job.key);
      if (prev && prev.width >= width && prev.height >= height) {
        job.resolve(prev.url);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.remember(job.key, url, width, height, true);
      job.resolve(url);
    } catch (e) {
      job.reject(e);
    } finally {
      this.active--;
      if (!this.paused && !this.disposed) void this.work();
    }
  }
  dropQueued() {
    const leftover = this.queue;
    this.queue = [];
    for (const job of leftover) {
      this.pending.delete(job.key);
      job.reject(new Error('预览已取消'));
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) void this.work();
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.values.values()) if (entry.blob) URL.revokeObjectURL(entry.url);
    for (const entry of this.views.values()) if (entry.blob) URL.revokeObjectURL(entry.url);
    this.values.clear();
    this.views.clear();
    this.viewWanted.clear();
    this.wanted.clear();
    for (const job of this.queue) job.reject(new Error('文档已关闭'));
    this.queue = [];
    this.pending.clear();
  }
}
