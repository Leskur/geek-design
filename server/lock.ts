import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR_IN_USE = '此数据目录已有服务运行，请勿重复启动';
const STALE_PID_LOCK = 'server.lock';
const INSTANCE_LOCK = 'instance.lock';

export function acquireDataDirLock(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, INSTANCE_LOCK);
  const db = new Database(file);
  db.pragma('busy_timeout = 0');
  try {
    db.pragma('locking_mode = EXCLUSIVE');
    db.exec(
      'CREATE TABLE IF NOT EXISTS lock (id INTEGER PRIMARY KEY); INSERT OR IGNORE INTO lock VALUES (1);',
    );
  } catch (e) {
    try {
      db.close();
    } catch {
      /* The lock file may already be held. */
    }
    if (/busy|locked/i.test((e as Error).message || '')) throw new Error(DATA_DIR_IN_USE);
    throw e;
  }
  try {
    fs.unlinkSync(path.join(dataDir, STALE_PID_LOCK));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return {
    release() {
      try {
        db.close();
      } catch {
        /* Already closed on shutdown. */
      }
    },
  };
}
