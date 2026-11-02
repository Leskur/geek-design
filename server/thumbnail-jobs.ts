import {fork,type ChildProcess} from 'node:child_process';
import type {Store} from './db';
export const THUMBNAIL_VERSION='thumb-svg-3';
export class ThumbnailJobs{
 private timer?:ReturnType<typeof setInterval>;private child?:ChildProcess;private stopping=false;
 constructor(private store:Store){}
 start(){this.store.run("UPDATE thumbnail_jobs SET status='queued' WHERE status='running'");this.timer=setInterval(()=>this.tick(),750);this.timer.unref();this.tick();}
 enqueue(key:string,retry=false){const existing=this.store.one('SELECT * FROM thumbnail_jobs WHERE artifact_key=?',key);if(!existing)this.store.run("INSERT INTO thumbnail_jobs(artifact_key,version,status,updated) VALUES(?,?,'queued',?)",key,THUMBNAIL_VERSION,Date.now());else if(existing.version!==THUMBNAIL_VERSION||retry&&existing.status!=='running')this.store.run("UPDATE thumbnail_jobs SET version=?,status='queued',error=NULL,completed=0,updated=? WHERE artifact_key=?",THUMBNAIL_VERSION,Date.now(),key);return this.store.one('SELECT * FROM thumbnail_jobs WHERE artifact_key=?',key);}
 private tick(){if(this.child||this.stopping)return;
  for(const a of this.store.all("SELECT a.key FROM artifacts a WHERE a.status='ready' AND EXISTS(SELECT 1 FROM revisions r WHERE r.artifact_key=a.key AND r.status='ready') AND NOT EXISTS(SELECT 1 FROM thumbnail_jobs t WHERE t.artifact_key=a.key AND t.version=?)",THUMBNAIL_VERSION))this.enqueue(a.key);
  const job=this.store.one("SELECT t.* FROM thumbnail_jobs t JOIN artifacts a ON a.key=t.artifact_key WHERE t.status='queued' AND a.status='ready' AND EXISTS(SELECT 1 FROM revisions r WHERE r.artifact_key=a.key AND r.status='ready') ORDER BY t.updated LIMIT 1");if(!job)return;
  this.store.run("UPDATE thumbnail_jobs SET status='running',error=NULL,updated=? WHERE artifact_key=?",Date.now(),job.artifact_key);
  const child=fork(new URL('./thumbnail-worker.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],execArgv:[]});this.child=child;let settled=false;
  const failed=(message:string)=>{if(settled||this.stopping)return;settled=true;this.store.run("UPDATE thumbnail_jobs SET status='failed',error=?,updated=? WHERE artifact_key=?",message,Date.now(),job.artifact_key);};
  child.on('message',(m:any)=>{if(this.stopping)return;if(m.type==='progress')this.store.run('UPDATE thumbnail_jobs SET completed=?,total=?,updated=? WHERE artifact_key=?',m.completed,m.total,Date.now(),job.artifact_key);else if(m.type==='done'){settled=true;this.store.run("UPDATE thumbnail_jobs SET status='ready',completed=?,total=?,error=NULL,updated=? WHERE artifact_key=?",m.total,m.total,Date.now(),job.artifact_key);}else if(m.type==='failed')failed(m.error);});
  child.on('error',e=>failed(e.message));child.on('exit',()=>{if(!settled)failed('预览进程意外退出，可以重试');this.child=undefined;});
  child.send({root:this.store.storage.root,key:job.artifact_key,version:THUMBNAIL_VERSION});
 }
 async stop(){this.stopping=true;if(this.timer)clearInterval(this.timer);if(this.child){const child=this.child;await new Promise<void>(resolve=>{const timeout=setTimeout(()=>child.kill(),5000);child.once('exit',()=>{clearTimeout(timeout);resolve();});if(child.connected)child.send({type:'stop'});else child.kill();});}}
}
