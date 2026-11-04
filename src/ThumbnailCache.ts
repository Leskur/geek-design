import type { Layer, DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
export class ThumbnailCache {
  private values = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private queue: {
    id: string;
    small: boolean;
    board: Layer;
    resolve: (url: string) => void;
    reject: (e: unknown) => void;
  }[] = [];
  private running = false;
  private disposed = false;
  private paused = false;
  constructor(
    private doc: DocumentSource,
    private scenes: SceneCache,
    private limit = 48,
  ) {}
  peek(id: string, small = false) {
    return this.values.get(small ? id + ':small' : id) || '';
  }
  request(board: Layer, priority = false, small = false): Promise<string> {
    const id = small ? board.do_objectID + ':small' : board.do_objectID;
    const cached = this.values.get(id);
    if (cached) {
      this.values.delete(id);
      this.values.set(id, cached);
      return Promise.resolve(cached);
    }
    if (this.disposed) return Promise.reject(new Error('文档已关闭'));
    const existing = this.pending.get(id);
    if (existing) {
      if (priority) {
        const i = this.queue.findIndex((j) => j.id === id);
        if (i >= 0) this.queue.unshift(this.queue.splice(i, 1)[0]);
      }
      return existing;
    }
    if (this.doc.thumbnail) {
      const remote = this.doc
        .thumbnail(board.do_objectID, small)
        .then((url) => {
          if (this.disposed) throw new Error('文档已关闭');
          this.values.set(id, url);
          return url;
        })
        .finally(() => this.pending.delete(id));
      this.pending.set(id, remote);
      return remote;
    }
    const promise = new Promise<string>((resolve, reject) => {
      const job = { id, small, board, resolve, reject };
      priority ? this.queue.unshift(job) : this.queue.push(job);
    });
    this.pending.set(id, promise);
    void this.work();
    return promise;
  }
  private async work() {
    if (this.running || this.paused || this.disposed) return;
    this.running = true;
    while (this.queue.length && !this.disposed && !this.paused) {
      await new Promise((r) => setTimeout(r, 24));
      if (this.paused || this.disposed) break;
      const job = this.queue.shift();
      if (!job) break;
      try {
        const { renderThumbnail } = await import('./thumbnail-renderer');
        const blob = await renderThumbnail(job.board, this.doc, this.scenes, job.small);
        if (this.disposed) {
          job.reject(new Error('文档已关闭'));
          continue;
        }
        const url = URL.createObjectURL(blob);
        this.values.set(job.id, url);
        while (this.values.size > this.limit) {
          const id = this.values.keys().next().value!;
          URL.revokeObjectURL(this.values.get(id)!);
          this.values.delete(id);
        }
        job.resolve(url);
      } catch (e) {
        job.reject(e);
      } finally {
        this.pending.delete(job.id);
      }
    }
    this.running = false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) void this.work();
  }
  dispose() {
    this.disposed = true;
    if (!this.doc.thumbnail) for (const url of this.values.values()) URL.revokeObjectURL(url);
    this.values.clear();
    for (const job of this.queue) job.reject(new Error('文档已关闭'));
    this.queue = [];
    this.pending.clear();
  }
}
