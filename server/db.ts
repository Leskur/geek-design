import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import type { LocalStorage } from './storage';

const cjk = /[\u3400-\u9fff\uf900-\ufaff]/;
/** Personal space title follows the username. Latin text keeps a space before the Chinese suffix. */
export function personalSpaceName(username: string) {
  const chars = Array.from(username);
  if (!chars.length) return '的空间';
  chars[0] = chars[0].toUpperCase();
  const last = chars[chars.length - 1];
  return `${chars.join('')}${cjk.test(last) ? '' : ' '}的空间`;
}
export type User = { id: string; username: string };
export class Store {
  db: Database.Database;
  constructor(public storage: LocalStorage) {
    this.db = new Database(storage.path('metadata.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_migrations VALUES(7);
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spaces(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('personal','shared')),
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS space_members(
  space_id TEXT NOT NULL REFERENCES spaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','member')),
  PRIMARY KEY(space_id, user_id)
);
CREATE TABLE IF NOT EXISTS invitations(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  token_hash TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  accepted_by TEXT REFERENCES users(id),
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS folders(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  parent_id TEXT REFERENCES folders(id),
  created_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS designs(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  folder_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  hash TEXT,
  size INTEGER,
  filename TEXT,
  artifact_key TEXT,
  status TEXT NOT NULL DEFAULT 'empty',
  error TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS objects(
  hash TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts(
  key TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  step TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  UNIQUE(hash, version)
);
CREATE TABLE IF NOT EXISTS uploads(
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  size INTEGER NOT NULL,
  hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS space_fonts(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  family TEXT NOT NULL,
  full_name TEXT NOT NULL,
  postscript_name TEXT NOT NULL COLLATE NOCASE,
  weight INTEGER NOT NULL,
  style TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created INTEGER NOT NULL,
  UNIQUE(space_id, hash),
  UNIQUE(space_id, postscript_name)
);
CREATE INDEX IF NOT EXISTS design_hash ON designs(hash);
CREATE INDEX IF NOT EXISTS pending_uploads ON uploads(status);
`);
    this.migrateDesignsToSpaceRoot();
    this.migrateFolderParents();
    this.migrateFolderCreatedBy();
    this.syncPersonalSpaceNames();
  }
  /** Existing databases predate nested folders. New rows use parent_id NULL as the space root. */
  private migrateFolderParents() {
    const cols = this.all('PRAGMA table_info(folders)') as { name: string }[];
    if (cols.length && !cols.some((c) => c.name === 'parent_id'))
      this.db.exec('ALTER TABLE folders ADD COLUMN parent_id TEXT REFERENCES folders(id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS folder_parent ON folders(parent_id)');
  }
  /** Existing folders had no owner; attribute them to the space owner. */
  private migrateFolderCreatedBy() {
    const cols = this.all('PRAGMA table_info(folders)') as { name: string }[];
    if (!cols.length) return;
    if (!cols.some((c) => c.name === 'created_by'))
      this.db.exec('ALTER TABLE folders ADD COLUMN created_by TEXT REFERENCES users(id)');
    this.db.exec(`
      UPDATE folders SET created_by = (
        SELECT m.user_id FROM space_members m
        WHERE m.space_id = folders.space_id AND m.role = 'owner'
        LIMIT 1
      ) WHERE created_by IS NULL
    `);
  }
  /** Personal space titles follow the owner username and are not edited directly. */
  private syncPersonalSpaceNames() {
    const rows = this.all(
      `SELECT s.id, u.username FROM spaces s
       JOIN space_members m ON m.space_id=s.id AND m.role='owner'
       JOIN users u ON u.id=m.user_id
       WHERE s.kind='personal'`,
    );
    const update = this.db.prepare('UPDATE spaces SET name=? WHERE id=?');
    this.transaction(() => {
      for (const row of rows) update.run(personalSpaceName(row.username), row.id);
    });
  }
  /** Old designs lacked space_id and required folder_id; CREATE IF NOT EXISTS does not alter. */
  private migrateDesignsToSpaceRoot() {
    const cols = this.all('PRAGMA table_info(designs)') as { name: string; notnull: number }[];
    if (!cols.length) return;
    const hasSpace = cols.some((c) => c.name === 'space_id');
    const folderRequired = cols.some((c) => c.name === 'folder_id' && c.notnull === 1);
    if (hasSpace && !folderRequired) return;
    this.db.exec('PRAGMA foreign_keys = OFF');
    this.transaction(() => {
      this.db.exec(`
CREATE TABLE designs_v7(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  folder_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  hash TEXT,
  size INTEGER,
  filename TEXT,
  artifact_key TEXT,
  status TEXT NOT NULL DEFAULT 'empty',
  error TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
INSERT INTO designs_v7(id,space_id,folder_id,name,created_by,hash,size,filename,artifact_key,status,error,created,updated)
SELECT d.id,f.space_id,d.folder_id,d.name,d.created_by,d.hash,d.size,d.filename,d.artifact_key,d.status,d.error,d.created,d.updated
FROM designs d JOIN folders f ON f.id=d.folder_id;
DROP TABLE designs;
ALTER TABLE designs_v7 RENAME TO designs;
CREATE INDEX IF NOT EXISTS design_hash ON designs(hash);
INSERT OR IGNORE INTO schema_migrations VALUES(7);
`);
    });
    this.db.exec('PRAGMA foreign_keys = ON');
  }
  one(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  id() {
    for (;;) {
      const id = randomBytes(9).toString('base64url');
      if (
        !['users', 'spaces', 'folders', 'designs', 'uploads', 'invitations', 'space_fonts'].some(
          (table) => this.one(`SELECT 1 FROM ${table} WHERE id=?`, id),
        )
      )
        return id;
    }
  }
  close() {
    this.db.close();
  }
}
