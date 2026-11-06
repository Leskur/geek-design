import { fontRoutes } from './fonts';
import { editingRoutes } from './editing';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { Server as TusServer, EVENTS } from '@tus/server';
import { FileStore } from '@tus/file-store';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { LocalStorage } from './storage';
import { personalSpaceName, Store, type User } from './db';
import {
  authenticate,
  canDeleteOwned,
  checkPassword,
  designAccess,
  fail,
  folderAccess,
  hashToken,
  passwordHash,
  session,
  spaceAccess,
} from './auth';
import { Jobs, artifactKey } from './jobs';
import { spaceRoutes } from './spaces';
import { deletionRoutes } from './deletion';
import { collectDesignRefs, reclaimStorage } from './gc';

const text = (v: any, min = 1, max = 120) => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max)
    fail(400, '输入内容无效或过长');
  return v.trim();
};
const password = (v: any) => {
  if (typeof v !== 'string' || v.length < 6 || v.length > 200)
    fail(400, '密码需要 6 至 200 个字符');
  return v;
};
const username = (v: any) => {
  const s = text(v, 2, 50).toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(s)) fail(400, '用户名仅支持英文、数字、点、横线和下划线');
  return s;
};

export async function createApp(options: {
  dataDir: string;
  logger?: boolean;
  startJobs?: boolean;
  maxFileSize?: number;
  publicOrigin?: string;
  staticDir?: string;
}) {
  const storage = new LocalStorage(options.dataDir),
    store = new Store(storage),
    jobs = new Jobs(store);
  const maxSize = options.maxFileSize;
  const app = Fastify({
    logger: options.logger
      ? {
          serializers: {
            req(req: any) {
              return {
                method: req.method,
                url: req.url.replace(
                  /(\/api\/invitations\/|\/invite\/)[a-f0-9]{64}/g,
                  '$1[redacted]',
                ),
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
          },
        }
      : false,
    bodyLimit: 65536,
    requestTimeout: 0,
  });
  await app.register(cookie);
  const user = (req: any): User => authenticate(store, req.cookies.sp_session);
  const setSession = (reply: any, userId: string) =>
    reply.setCookie('sp_session', session(store, userId), {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: options.publicOrigin?.startsWith('https:') ?? false,
      maxAge: 7 * 86400,
    });
  const attempts = new Map<string, { count: number; until: number }>();
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.origin;
        const allowed = [
          `${req.protocol}://${req.headers.host}`,
          options.publicOrigin,
          'http://127.0.0.1:5173',
          'http://localhost:5173',
        ].filter(Boolean);
        if (!origin || !allowed.includes(origin)) fail(403, '请求来源不受信任，请从应用页面操作');
      }
    }
  });
  app.setErrorHandler((error: any, req, reply) => {
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error(error);
    reply
      .code(status)
      .send({ error: status >= 500 ? '服务暂时不可用，请检查服务日志后重试' : error.message });
  });
  app.get('/api/status', async () => ({ maxFileSize: maxSize }));
  app.post('/api/register', async (req, reply) => {
    const key = 'register:' + req.ip,
      old = attempts.get(key);
    if (old && old.until > Date.now() && old.count >= 10) fail(429, '注册尝试过多，请稍后再试');
    attempts.set(key, {
      count: old && old.until > Date.now() ? old.count + 1 : 1,
      until: old && old.until > Date.now() ? old.until : Date.now() + 15 * 60000,
    });
    const b = req.body as any,
      name = username(b?.username),
      hash = await passwordHash(password(b?.password));
    const id = store.transaction(() => {
      if (store.one('SELECT id FROM users WHERE username=?', name)) fail(409, '用户名已被使用');
      const id = store.id(),
        spaceId = store.id(),
        now = Date.now();
      store.run('INSERT INTO users VALUES(?,?,?)', id, name, hash);
      store.run(
        'INSERT INTO spaces VALUES(?,?,?,?)',
        spaceId,
        personalSpaceName(name),
        'personal',
        now,
      );
      store.run("INSERT INTO space_members VALUES(?,?,'owner')", spaceId, id);
      return id;
    });
    setSession(reply, id);
    return { id, username: name };
  });
  app.post('/api/login', async (req, reply) => {
    const b = req.body as any,
      name = username(b?.username),
      pw = password(b?.password),
      key = req.ip;
    let count = attempts.get(key);
    if (!count || count.until < Date.now()) {
      count = { count: 0, until: Date.now() + 15 * 60000 };
      attempts.set(key, count);
    }
    if (count.count >= 10) fail(429, '尝试次数过多，请稍后再试');
    count.count++;
    const found = store.one('SELECT * FROM users WHERE username=?', name);
    if (!found || !(await checkPassword(pw, found.password))) fail(401, '用户名或密码不正确');
    attempts.delete(key);
    setSession(reply, found.id);
    return { ok: true };
  });
  app.post('/api/logout', async (req, reply) => {
    store.run('DELETE FROM sessions WHERE hash=?', hashToken(req.cookies.sp_session || ''));
    reply.clearCookie('sp_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/me', async (req) => user(req));
  spaceRoutes(app, store, user);
  deletionRoutes(app, store, user);
  editingRoutes(app, store, user);
  fontRoutes(app, store, user);

  app.get('/api/folders/:id/designs', async (req: any) => {
    folderAccess(store, user(req), req.params.id);
    return store.all(
      'SELECT d.*,u.username AS created_by_name,a.step FROM designs d JOIN users u ON u.id=d.created_by LEFT JOIN artifacts a ON a.key=d.artifact_key WHERE d.folder_id=? ORDER BY d.updated DESC',
      req.params.id,
    );
  });
  app.get('/api/designs/:id', async (req: any) => {
    const { design, folder, space } = designAccess(store, user(req), req.params.id);
    const a = design.artifact_key
      ? store.one('SELECT step FROM artifacts WHERE key=?', design.artifact_key)
      : null;
    return {
      ...design,
      folder_id: folder?.id ?? null,
      space_id: space.id,
      step:
        a?.step ||
        ({ uploading: '等待文件传输', failed: '处理失败', empty: '等待上传' } as any)[
          design.status
        ] ||
        design.status,
    };
  });
  async function ready(req: any) {
    const { design, folder, space } = designAccess(store, user(req), req.params.id);
    if (design.status !== 'ready' || !design.artifact_key) fail(409, '设计尚未处理完成');
    const a = store.one(
      "SELECT * FROM artifacts WHERE key=? AND status='ready'",
      design.artifact_key,
    );
    if (!a) fail(409, '查看数据尚未就绪');
    const dir = storage.path('artifacts', design.artifact_key);
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    return { design, folder, space, dir, manifest };
  }
  function folderChain(folder: { id: string; name: string; parent_id: string | null } | null) {
    const chain: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let current = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift({ id: current.id, name: current.name });
      current = current.parent_id
        ? store.one('SELECT id,name,parent_id FROM folders WHERE id=?', current.parent_id)
        : null;
    }
    return chain;
  }
  app.get('/api/designs/:id/manifest', async (req: any) => {
    const { design, folder, space, manifest } = await ready(req);
    return {
      ...manifest,
      fontLibrary: {
        spaceId: space.id,
        canUpload: true,
      },
      viewerId: user(req).id,
      designId: design.id,
      folderId: folder?.id ?? null,
      spaceId: space.id,
      place: {
        space: { id: space.id, name: space.name },
        folders: folderChain(folder),
        name: design.name,
      },
      file: { name: design.filename, size: design.size },
    };
  });
  app.get('/api/designs/:id/symbols', async (req: any) => {
    const { dir } = await ready(req);
    return JSON.parse(await fsp.readFile(path.join(dir, 'symbols.json'), 'utf8'));
  });
  app.get('/api/designs/:id/pages/:pageId', async (req: any) => {
    const { dir, manifest } = await ready(req);
    const relative = manifest.pageFiles[req.params.pageId];
    if (typeof relative !== 'string') fail(404, '页面不存在');
    return JSON.parse(await fsp.readFile(path.join(dir, relative), 'utf8'));
  });
  app.get('/api/designs/:id/assets/:hash', async (req: any, reply) => {
    const { manifest } = await ready(req);
    const hash = req.params.hash,
      asset = Object.values(manifest.assets || {}).find((a: any) => a.hash === hash) as any;
    if (!asset) fail(404, '资源不属于此记录');
    reply.type(asset.mime).header('Content-Disposition', 'inline');
    if (asset.mime === 'application/octet-stream')
      reply.header('Content-Disposition', 'attachment');
    return reply.send(fs.createReadStream(storage.object(hash)));
  });
  app.get('/api/designs/:id/cover', async (req: any, reply) => {
    const { manifest } = await ready(req);
    const cover = manifest.cover as { hash?: string; mime?: string } | undefined;
    if (!cover?.hash || cover.mime !== 'image/png') fail(404, '没有可用封面');
    reply.type('image/png').header('Content-Disposition', 'inline');
    return reply.send(fs.createReadStream(storage.object(cover.hash)));
  });
  app.post('/api/designs/:id/retry', async (req: any) => {
    const { design } = designAccess(store, user(req), req.params.id);
    if (design.status === 'ready') return { ok: true };
    if (!design.hash || !store.one('SELECT hash FROM objects WHERE hash=?', design.hash))
      fail(409, '尚无校验通过的原文件，请重新选择文件上传');
    const key = jobs.enqueue(design.hash);
    store.transaction(() => {
      store.run(
        "UPDATE artifacts SET status='queued',error=NULL WHERE key=? AND status='failed'",
        key,
      );
      store.run(
        "UPDATE designs SET status='processing',artifact_key=?,error=NULL,updated=? WHERE id=?",
        key,
        Date.now(),
        design.id,
      );
    });
    return { ok: true };
  });

  app.post('/api/uploads/preflight', async (req) => {
    const u = user(req),
      b = req.body as any,
      spaceId = text(b?.spaceId, 1, 60);
    let folderId: string | null = null,
      space;
    if (b?.folderId != null && b.folderId !== '') {
      folderId = text(b.folderId, 1, 60);
      const access = folderAccess(store, u, folderId);
      if (access.folder.space_id !== spaceId) fail(400, '文件夹不属于该空间');
      space = access.space;
    } else {
      space = spaceAccess(store, u, spaceId);
    }
    const hash = b?.sha256,
      size = b?.size,
      filename = text(b?.filename, 1, 240);
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      (maxSize != null && size > maxSize) ||
      !filename.toLowerCase().endsWith('.sketch')
    )
      fail(400, maxSize != null ? '请选择大小符合限制的 Sketch 文件' : '请选择 Sketch 文件');
    let design = b.designId ? designAccess(store, u, text(b.designId, 1, 60)).design : null;
    if (design) {
      if (design.space_id !== space.id) fail(400, '目标设计与空间不一致');
      if ((design.folder_id || null) !== folderId) fail(400, '目标设计与文件夹不一致');
      if (!canDeleteOwned(space, design, u)) fail(403, '只能覆盖自己创建的设计');
    }
    const reuse =
      store.one(
        'SELECT id FROM designs WHERE space_id=? AND hash=? AND size=? AND artifact_key IS NOT NULL LIMIT 1',
        space.id,
        hash,
        size,
      ) && fs.existsSync(storage.object(hash));
    const previous =
      design && design.hash
        ? await collectDesignRefs(store, storage, [design.id])
        : { objectHashes: [], artifactKeys: [], uploadIds: [] };
    const result = store.transaction(() => {
      if (!design) {
        const id = store.id(),
          now = Date.now();
        store.run(
          "INSERT INTO designs(id,space_id,folder_id,name,created_by,status,created,updated) VALUES(?,?,?,?,?,'empty',?,?)",
          id,
          space.id,
          folderId,
          text(b.designName || filename.replace(/\.sketch$/i, '')),
          u.id,
          now,
          now,
        );
        design = store.one('SELECT * FROM designs WHERE id=?', id);
      }
      if (design.hash === hash && design.status === 'ready') return { kind: 'duplicate', design };
      const key = reuse ? jobs.enqueue(hash) : null;
      if (reuse) {
        const a = store.one('SELECT * FROM artifacts WHERE key=?', key);
        store.run(
          'UPDATE designs SET hash=?,size=?,filename=?,artifact_key=?,status=?,error=NULL,updated=? WHERE id=?',
          hash,
          size,
          filename,
          key,
          a.status === 'ready' ? 'ready' : 'processing',
          Date.now(),
          design.id,
        );
        if (a.status === 'failed')
          store.run("UPDATE artifacts SET status='queued',error=NULL WHERE key=?", key);
        return {
          kind: 'reused',
          design: store.one('SELECT * FROM designs WHERE id=?', design.id),
        };
      }
      const pending = store.one(
        "SELECT * FROM uploads WHERE design_id=? AND user_id=? AND status IN ('uploading','received','verifying') ORDER BY created DESC LIMIT 1",
        design.id,
        u.id,
      );
      if (pending)
        return {
          kind: pending.status === 'uploading' ? 'upload' : 'processing',
          design,
          ticket: pending.id,
        };
      const id = store.id();
      store.run(
        "INSERT INTO uploads(id,design_id,user_id,size,hash,filename,status,created) VALUES(?,?,?,?,?,?,'uploading',?)",
        id,
        design.id,
        u.id,
        size,
        hash,
        filename,
        Date.now(),
      );
      store.run(
        "UPDATE designs SET status='uploading',filename=?,size=?,error=NULL,updated=? WHERE id=?",
        filename,
        size,
        Date.now(),
        design.id,
      );
      return {
        kind: 'upload',
        design: store.one('SELECT * FROM designs WHERE id=?', design.id),
        ticket: id,
      };
    });
    if ((result.kind === 'reused' || result.kind === 'duplicate') && previous.objectHashes.length) {
      const next = store.one('SELECT hash,artifact_key FROM designs WHERE id=?', result.design.id);
      await reclaimStorage(store, storage, {
        objectHashes: previous.objectHashes.filter((h) => h !== next.hash),
        artifactKeys: previous.artifactKeys.filter((k) => k !== next.artifact_key),
        uploadIds: previous.uploadIds,
      });
    }
    return result;
  });

  const fileStore = new FileStore({ directory: storage.path('uploads') });
  function tusUser(req: any) {
    return authenticate(store, app.parseCookie(req.headers.get('cookie') || '').sp_session);
  }
  function ticket(req: any, id: string) {
    const u = tusUser(req),
      t = store.one('SELECT * FROM uploads WHERE id=?', id);
    if (!t || t.user_id !== u.id) fail(404, '上传会话不存在');
    designAccess(store, u, t.design_id);
    return t;
  }
  const tus = new TusServer({
    path: '/api/tus',
    datastore: fileStore,
    maxSize: maxSize ?? Number.MAX_SAFE_INTEGER,
    relativeLocation: true,
    allowedOrigins: [],
    disableTerminationForFinishedUploads: true,
    async namingFunction(req, meta) {
      const id = meta?.ticket || undefined;
      if (!id) throw { status_code: 400, body: '缺少上传会话' };
      ticket(req, id);
      try {
        await fileStore.getUpload(id);
        throw { status_code: 409, body: '上传会话已存在，请从已接收位置继续' };
      } catch (e) {
        if ((e as any).status_code === 409) throw e;
      }
      return id;
    },
    async onUploadCreate(req, upload) {
      const t = ticket(req, upload.id);
      if (t.status !== 'uploading' || upload.size !== t.size)
        throw { status_code: 400, body: '上传长度或状态无效' };
      return {};
    },
    async onIncomingRequest(req, id) {
      try {
        tusUser(req);
        if (id) ticket(req, id);
      } catch (e) {
        throw { status_code: (e as any).statusCode || 403, body: (e as Error).message };
      }
    },
    async onUploadFinish(_req, upload) {
      store.run(
        "UPDATE uploads SET status='received' WHERE id=? AND status='uploading'",
        upload.id,
      );
      return {};
    },
  });
  tus.on(EVENTS.POST_TERMINATE, (_req, _res, id) =>
    store.run("UPDATE uploads SET status='cancelled' WHERE id=? AND status='uploading'", id),
  );
  app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => done(null));
  const tusHandler = async (req: any, reply: any) => {
    user(req);
    if (!['POST', 'PATCH', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method))
      fail(405, '此接口不支持下载原文件');
    reply.hijack();
    await tus.handle(req.raw, reply.raw);
  };
  app.all('/api/tus', tusHandler);
  app.all('/api/tus/:id', tusHandler);
  app.get('/api/uploads/:id', async (req: any) => {
    const u = user(req),
      t = store.one('SELECT * FROM uploads WHERE id=? AND user_id=?', req.params.id, u.id);
    if (!t) fail(404, '上传会话不存在');
    designAccess(store, u, t.design_id);
    let offset = 0,
      exists = false;
    try {
      const upload = await fileStore.getUpload(t.id);
      offset = upload.offset;
      exists = true;
    } catch {}
    return { ...t, offset, exists, url: `/api/tus/${t.id}` };
  });
  app.post('/api/uploads/:id/complete', async (req: any) => {
    const u = user(req),
      t = store.one('SELECT * FROM uploads WHERE id=? AND user_id=?', req.params.id, u.id);
    if (!t) fail(404, '上传会话不存在');
    designAccess(store, u, t.design_id);
    const upload = await fileStore.getUpload(t.id);
    if (upload.offset !== t.size) fail(409, '文件尚未完整接收');
    store.run("UPDATE uploads SET status='received' WHERE id=? AND status='uploading'", t.id);
    return { ok: true };
  });
  for (const t of store.all("SELECT * FROM uploads WHERE status='uploading'")) {
    try {
      const upload = await fileStore.getUpload(t.id);
      if (upload.offset === t.size)
        store.run("UPDATE uploads SET status='received' WHERE id=?", t.id);
    } catch {}
  }
  if (options.staticDir && fs.existsSync(path.join(options.staticDir, 'index.html'))) {
    const root = path.resolve(options.staticDir);
    app.get('/assets/:name', async (req: any, reply) => {
      const name = req.params.name;
      if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) fail(404, '文件不存在');
      const file = path.join(root, 'assets', name);
      if (!fs.existsSync(file)) fail(404, '文件不存在');
      reply.type(
        (
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.wasm': 'application/wasm',
          } as any
        )[path.extname(name)] || 'application/octet-stream',
      );
      return reply.send(fs.createReadStream(file));
    });
    app.get('/*', async (req, reply) => {
      if (req.url.startsWith('/api/')) fail(404, '接口不存在');
      return reply.type('text/html').send(fs.createReadStream(path.join(root, 'index.html')));
    });
  }
  if (options.startJobs !== false) jobs.start();
  app.addHook('onClose', async () => {
    await jobs.stop();
    store.close();
  });
  return { app, store, jobs, storage };
}
