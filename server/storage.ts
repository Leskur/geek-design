import fs from 'node:fs';
import path from 'node:path';
export class LocalStorage {
  root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
    for (const dir of ['objects', 'uploads', 'artifacts', 'staging'])
      fs.mkdirSync(this.path(dir), { recursive: true });
  }
  path(...parts: string[]) {
    const target = path.resolve(this.root, ...parts);
    if (target !== this.root && !target.startsWith(this.root + path.sep))
      throw new Error('无效存储路径');
    return target;
  }
  object(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('无效对象标识');
    return this.path('objects', hash.slice(0, 2), hash);
  }
}
