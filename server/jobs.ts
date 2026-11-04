import { fork, type ChildProcess } from 'node:child_process';
import type { Store } from './db';
import { PARSER_VERSION } from '../shared/document';
export function artifactKey(hash: string) {
  return `${hash}-${PARSER_VERSION}`;
}
export class Jobs {
  private timer?: ReturnType<typeof setInterval>;
  private child?: ChildProcess;
  private stopping = false;
  constructor(private store: Store) {}
  start() {
    this.store.run("UPDATE uploads SET status='received' WHERE status='verifying'");
    this.store.run("UPDATE artifacts SET status='queued' WHERE status='running'");
    this.timer = setInterval(() => this.tick(), 300);
    this.timer.unref();
    this.tick();
  }
  enqueue(hash: string) {
    const key = artifactKey(hash);
    this.store.run(
      "INSERT OR IGNORE INTO artifacts(key,hash,version,status,created) VALUES(?,?,?,'queued',?)",
      key,
      hash,
      PARSER_VERSION,
      Date.now(),
    );
    return key;
  }
  private tick() {
    if (this.child || this.stopping) return;
    const upload = this.store.one(
      "SELECT u.*,r.hash FROM uploads u JOIN revisions r ON r.id=u.revision_id WHERE u.status='received' ORDER BY u.created LIMIT 1",
    );
    const artifact = upload
      ? null
      : this.store.one(
          "SELECT a.*,o.size FROM artifacts a JOIN objects o ON o.hash=a.hash WHERE a.status='queued' ORDER BY a.created LIMIT 1",
        );
    if (!upload && !artifact) return;
    const hash = upload?.hash || artifact.hash,
      key = this.enqueue(hash);
    if (upload) this.store.run("UPDATE uploads SET status='verifying' WHERE id=?", upload.id);
    this.store.run(
      "UPDATE artifacts SET status='running',step=?,error=NULL WHERE key=? AND status!='ready'",
      upload ? '校验完整文件' : '准备查看数据',
      key,
    );
    let settled = false,
      verified = !upload;
    const child = fork(new URL('./worker.mjs', import.meta.url), [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      execArgv: [],
    });
    this.child = child;
    const failed = (message: string) => {
      if (settled) return;
      settled = true;
      this.store.transaction(() => {
        if (upload) this.store.run("UPDATE uploads SET status='failed' WHERE id=?", upload.id);
        // A forged or damaged new upload must not invalidate an existing valid artifact.
        if (verified) {
          this.store.run(
            "UPDATE artifacts SET status='failed',error=?,step='处理失败' WHERE key=?",
            message,
            key,
          );
          this.store.run(
            "UPDATE revisions SET status='failed',error=? WHERE artifact_key=? AND status!='ready'",
            message,
            key,
          );
        } else {
          this.store.run(
            "UPDATE revisions SET status='failed',error=? WHERE id=? AND status!='ready'",
            message,
            upload.revision_id,
          );
          this.store.run(
            "UPDATE artifacts SET status='queued' WHERE key=? AND status='running'",
            key,
          );
        }
      });
    };
    child.on('message', (message: any) => {
      if (this.stopping) return;
      if (message.type === 'step')
        this.store.run(
          "UPDATE artifacts SET step=? WHERE key=? AND status!='ready'",
          message.step,
          key,
        );
      else if (message.type === 'verified') {
        verified = true;
        this.store.transaction(() => {
          this.store.run(
            'INSERT OR IGNORE INTO objects VALUES(?,?,?)',
            hash,
            upload.size,
            Date.now(),
          );
          this.store.run("UPDATE uploads SET status='verified' WHERE id=?", upload.id);
          this.store.run(
            "UPDATE revisions SET status='processing',artifact_key=?,error=NULL WHERE id=? AND status!='ready'",
            key,
            upload.revision_id,
          );
        });
      } else if (message.type === 'done') {
        settled = true;
        this.store.transaction(() => {
          this.store.run(
            "UPDATE artifacts SET status='ready',step='可查看',error=NULL WHERE key=?",
            key,
          );
          for (const r of this.store.all(
            "SELECT * FROM revisions WHERE artifact_key=? AND status!='ready'",
            key,
          )) {
            this.store.run("UPDATE revisions SET status='ready',error=NULL WHERE id=?", r.id);
            this.store.run(
              'UPDATE documents SET current_revision=? WHERE id=? AND current_revision IS ?',
              r.id,
              r.document_id,
              r.base_revision,
            );
          }
        });
      } else if (message.type === 'failed') failed(message.error);
    });
    child.on('error', (e) => failed(e.message));
    child.on('exit', () => {
      if (!this.stopping && !settled) failed('处理进程意外退出，可重新处理');
      this.child = undefined;
    });
    child.send({
      root: this.store.storage.root,
      hash,
      size: upload?.size || artifact.size,
      uploadId: upload?.id,
    });
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.child) {
      const child = this.child;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      });
    }
  }
}
