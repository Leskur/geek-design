import { BlobReader, BlobWriter, TextWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
import { readAsset, writeAsset } from './asset-cache';
import { metadata, registerSymbols, type Layer, type DocumentSource } from '../shared/document';
export { color, hex, point, path } from '../shared/document';
export type { Layer, DocumentSource } from '../shared/document';
export class SketchDocument implements DocumentSource {
  source = 'local' as const;
  reader: ZipReader<Blob>;
  entries = new Map<string, FileEntry>();
  pages: { id: string; name: string; count: number }[] = [];
  symbols = new Map<string, Layer>();
  styles = new Map<string, any>();
  urls = new Map<string, string>();
  cache = new Map<string, Layer>();
  private parser?: Worker;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private imageRequests = new Map<string, Promise<string>>();
  private closed = false;
  assetKey: string;
  constructor(public file: File) {
    this.assetKey = `local:${file.name}:${file.size}:${file.lastModified}`;
    this.reader = new ZipReader(new BlobReader(file));
    if (typeof Worker !== 'undefined') {
      this.parser = new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' });
      this.parser.onmessage = ({ data }) => {
        const request = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) request?.reject(new Error(data.error));
        else request?.resolve(data.value);
      };
      this.parser.onerror = () => {
        for (const request of this.pending.values())
          request.reject(new Error('后台文件解析失败，请重新打开文件'));
        this.pending.clear();
        this.parser?.terminate();
        this.parser = undefined;
      };
    }
  }
  async json(path: string) {
    const e = this.entries.get(path);
    if (!e) throw new Error(`文件缺少 ${path}`);
    if (e.uncompressedSize > 150 * 1024 * 1024) throw new Error('单页数据过大，暂不支持');
    const text = await e.getData(new TextWriter());
    if (!this.parser) return JSON.parse(text);
    return new Promise<any>((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.parser!.postMessage({ id, text });
    });
  }
  async open() {
    for (const e of await this.reader.getEntries())
      if (!e.directory) this.entries.set(e.filename, e as FileEntry);
    const meta = await this.json('meta.json');
    const doc = await this.json('document.json');
    const info = metadata(meta, doc);
    this.pages = info.pages;
    this.styles = info.styles;
    if (!this.pages.length) throw new Error('没有找到可读取的页面');
    for (const x of doc.foreignSymbols || []) if (x.symbolMaster) this.register(x.symbolMaster);
  }
  register(l: Layer) {
    registerSymbols(l, this.symbols);
  }
  async page(id: string) {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const p = await this.json(`pages/${id}.json`);
    this.register(p);
    this.cache.set(id, p);
    return p as Layer;
  }
  async loadSymbols() {
    // Components can live on any page, including pages with arbitrary names.
    // Scan one page at a time and retain only masters; normal pages remain lazy.
    for (const p of this.pages) {
      const page = await this.json(`pages/${p.id}.json`);
      this.register(page);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  async image(ref: string): Promise<string> {
    if (this.closed) return '';
    if (this.urls.has(ref)) return this.urls.get(ref)!;
    const pending = this.imageRequests.get(ref);
    if (pending) return pending;
    const request = (async () => {
      const e =
        this.entries.get(ref) ||
        [...this.entries.values()].find((x) => x.filename.startsWith(ref + '.'));
      if (!e || e.uncompressedSize > 80 * 1024 * 1024) return '';
      const cached = await readAsset(this.assetKey, ref, 'full');
      const blob = cached || (await e.getData(new BlobWriter()));
      if (!cached) void writeAsset(this.assetKey, ref, 'full', blob);
      if (this.closed) return '';
      const url = URL.createObjectURL(blob);
      this.urls.set(ref, url);
      return url;
    })();
    this.imageRequests.set(ref, request);
    try {
      return await request;
    } finally {
      this.imageRequests.delete(ref);
    }
  }
  async close() {
    this.closed = true;
    this.parser?.terminate();
    for (const request of this.pending.values()) request.reject(new Error('文档已关闭'));
    this.pending.clear();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.cache.clear();
    this.symbols.clear();
    await this.reader.close();
  }
}
