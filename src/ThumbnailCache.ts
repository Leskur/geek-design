import type { Layer, DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
import { thumbnailPixelScale, thumbnailSize } from './thumbnail-size';

type Entry = { url: string; width: number; height: number };
type Job = {
  id: string;
  board: Layer;
  width: number;
  height: number;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
};

function thumbnailConcurrency() {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(2, cores - 2));
}

export class ThumbnailCache {
  private values = new Map<string, Entry>();
  private pending = new Map<string, Promise<string>>();
  private queue: Job[] = [];
  private active = 0;
  private disposed = false;
  private paused = false;
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private nextRequestId = 0;
  private workersEnabled = typeof Worker !== 'undefined';
  private api?: typeof import('./thumbnail-renderer');
  constructor(
    private doc: DocumentSource,
    private scenes: SceneCache,
    private concurrency = thumbnailConcurrency(),
  ) {}
  peek(id: string) {
    return this.values.get(id)?.url || '';
  }
  covers(board: Layer, viewScale: number) {
    const cached = this.values.get(board.do_objectID);
    if (!cached) return false;
    const { width, height } = thumbnailSize(board, viewScale);
    return cached.width >= width && cached.height >= height;
  }
  request(board: Layer, priority = false, viewScale = 1): Promise<string> {
    const id = board.do_objectID,
      { width, height } = thumbnailSize(board, viewScale),
      cached = this.values.get(id);
    if (cached && cached.width >= width && cached.height >= height) {
      this.values.delete(id);
      this.values.set(id, cached);
      return Promise.resolve(cached.url);
    }
    if (this.disposed) return Promise.reject(new Error('文档已关闭'));
    const existing = this.pending.get(id);
    if (existing) {
      const i = this.queue.findIndex((j) => j.id === id);
      if (i >= 0) {
        if (this.queue[i].width < width) {
          this.queue[i].width = width;
          this.queue[i].height = height;
        }
        if (priority) this.queue.unshift(this.queue.splice(i, 1)[0]);
      }
      return existing;
    }
    if (this.doc.thumbnail) {
      const remote = this.doc
        .thumbnail(board.do_objectID, thumbnailPixelScale(viewScale) < 0.5)
        .then((url) => {
          if (this.disposed) throw new Error('文档已关闭');
          this.values.set(id, { url, width, height });
          return url;
        })
        .finally(() => this.pending.delete(id));
      this.pending.set(id, remote);
      return remote;
    }
    const promise = new Promise<string>((resolve, reject) => {
      const job = { id, board, width, height, resolve, reject };
      priority ? this.queue.unshift(job) : this.queue.push(job);
    });
    this.pending.set(id, promise);
    void this.work();
    return promise;
  }
  private ensureWorkers() {
    if (!this.workersEnabled || this.workers.length || this.disposed) return;
    for (let i = 0; i < this.concurrency; i++) this.spawnWorker();
  }
  private spawnWorker() {
    const { createThumbnailWorker } = this.api!;
    const worker = createThumbnailWorker();
    worker.addEventListener('error', () => this.disableWorkers());
    this.workers.push(worker);
    this.idle.push(worker);
  }
  private disableWorkers() {
    this.workersEnabled = false;
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.idle = [];
  }
  private async work() {
    if (this.paused || this.disposed) return;
    this.api ??= await import('./thumbnail-renderer');
    this.ensureWorkers();
    if (!this.workersEnabled) {
      while (this.active < this.concurrency && this.queue.length && !this.paused && !this.disposed) {
        const job = this.queue.shift();
        if (!job) break;
        this.active++;
        void this.run(job, null);
      }
      return;
    }
    while (this.idle.length && this.queue.length && !this.paused && !this.disposed) {
      const job = this.queue.shift();
      const worker = this.idle.pop();
      if (!job || !worker) break;
      this.active++;
      void this.run(job, worker);
    }
  }
  private async run(job: Job, worker: Worker | null) {
    const api = this.api!;
    try {
      const blob = await this.render(job, worker, api);
      if (this.disposed) {
        job.reject(new Error('文档已关闭'));
        return;
      }
      const prev = this.values.get(job.id);
      if (prev && prev.width >= job.width && prev.height >= job.height) {
        job.resolve(prev.url);
        return;
      }
      const url = URL.createObjectURL(blob);
      if (prev && !this.doc.thumbnail) URL.revokeObjectURL(prev.url);
      this.values.set(job.id, { url, width: job.width, height: job.height });
      job.resolve(url);
    } catch (e) {
      job.reject(e);
    } finally {
      this.pending.delete(job.id);
      this.active--;
      if (!this.paused && !this.disposed) void this.work();
    }
  }
  private async render(
    job: Job,
    worker: Worker | null,
    api: typeof import('./thumbnail-renderer'),
  ) {
    const root = this.scenes.get(job.board).root,
      { width, height } = job,
      images = await api.collectThumbnailImages(root, this.doc);
    if (this.disposed) throw new Error('文档已关闭');
    if (!worker) return api.renderThumbnail(job.board, this.doc, this.scenes, width, height);
    let result: Awaited<ReturnType<typeof api.renderThumbnailInWorker>>;
    try {
      result = await api.renderThumbnailInWorker(worker, ++this.nextRequestId, {
        root,
        images,
        width,
        height,
      });
    } catch (error) {
      if (this.disposed) throw error;
      return api.renderThumbnail(job.board, this.doc, this.scenes, width, height);
    } finally {
      if (this.workers.includes(worker)) {
        this.idle.push(worker);
        if (!this.paused && !this.disposed) void this.work();
      }
    }
    if (result.markup) return api.thumbnailBlob(result.markup);
    if (result.buffer) return new Blob([result.buffer], { type: 'image/png' });
    throw new Error('无法生成缩略图');
  }
  dropQueued() {
    const leftover = this.queue;
    this.queue = [];
    for (const job of leftover) {
      this.pending.delete(job.id);
      job.reject(new Error('预览已取消'));
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) void this.work();
  }
  dispose() {
    this.disposed = true;
    this.disableWorkers();
    if (!this.doc.thumbnail) for (const entry of this.values.values()) URL.revokeObjectURL(entry.url);
    this.values.clear();
    for (const job of this.queue) job.reject(new Error('文档已关闭'));
    this.queue = [];
    this.pending.clear();
  }
}
