import Database from 'better-sqlite3';
import {randomBytes} from 'node:crypto';
import type {LocalStorage} from './storage';
export type User={id:string;username:string};
export class Store {
 db:Database.Database;
 private aliases=new Map<string,string>();
 constructor(public storage:LocalStorage){
  this.db=new Database(storage.path('metadata.sqlite'));this.db.pragma('journal_mode = WAL');this.db.pragma('foreign_keys = ON');this.db.pragma('busy_timeout = 5000');
  this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);INSERT OR IGNORE INTO schema_migrations VALUES(2);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS team_members(team_id TEXT NOT NULL REFERENCES teams(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),PRIMARY KEY(team_id,user_id));
  CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,team_id TEXT NOT NULL REFERENCES teams(id),token_hash TEXT UNIQUE NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),created_by TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,accepted_by TEXT REFERENCES users(id),created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,team_id TEXT NOT NULL REFERENCES teams(id),name TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS members(project_id TEXT REFERENCES projects(id),user_id TEXT REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(project_id,user_id));
  CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),name TEXT NOT NULL,current_revision TEXT,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS objects(hash TEXT PRIMARY KEY,size INTEGER NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS artifacts(key TEXT PRIMARY KEY,hash TEXT NOT NULL,version TEXT NOT NULL,status TEXT NOT NULL,error TEXT,step TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,UNIQUE(hash,version));
  CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id),seq INTEGER NOT NULL,hash TEXT NOT NULL,size INTEGER NOT NULL,filename TEXT NOT NULL,note TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),base_revision TEXT,artifact_key TEXT,status TEXT NOT NULL,error TEXT,created INTEGER NOT NULL,UNIQUE(document_id,hash),UNIQUE(document_id,seq));
  CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,revision_id TEXT NOT NULL REFERENCES revisions(id),user_id TEXT NOT NULL REFERENCES users(id),size INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS public_ids(internal_id TEXT PRIMARY KEY,public_id TEXT UNIQUE NOT NULL);
  INSERT OR IGNORE INTO schema_migrations VALUES(3);
  CREATE INDEX IF NOT EXISTS revision_hash ON revisions(hash);CREATE INDEX IF NOT EXISTS pending_uploads ON uploads(status);`);
 }
 one(sql:string,...args:any[]):any{return this.db.prepare(sql).get(...args);}
 all(sql:string,...args:any[]):any[]{return this.db.prepare(sql).all(...args);}
 run(sql:string,...args:any[]){return this.db.prepare(sql).run(...args);}
 transaction<T>(fn:()=>T):T{return this.db.transaction(fn)();}
 id(){for(;;){const id=randomBytes(9).toString('base64url');if(!this.one('SELECT 1 FROM public_ids WHERE public_id=? OR internal_id=?',id,id)&&!['users','teams','projects','documents','revisions','uploads','invitations'].some(table=>this.one(`SELECT 1 FROM ${table} WHERE id=?`,id)))return id;}}
 publicId(id:string){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return id;
  const cached=this.aliases.get(id);if(cached)return cached;
  const found=this.one('SELECT public_id FROM public_ids WHERE internal_id=?',id);const value=found?.public_id||this.id();
  if(!found)this.run('INSERT INTO public_ids VALUES(?,?)',id,value);this.aliases.set(id,value);return value;
 }
 resolveId(id:string){return typeof id==='string'?this.one('SELECT internal_id FROM public_ids WHERE public_id=?',id)?.internal_id||id:id;}
 close(){this.db.close();}
}
