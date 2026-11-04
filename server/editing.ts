import type { FastifyInstance } from 'fastify';
import type { Store, User } from './db';
import { documentAccess, fail, membership, teamAccess } from './auth';

export function editingRoutes(app: FastifyInstance, store: Store, user: (req: any) => User) {
  const name = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 120)
      fail(400, '名称需要 1 至 120 个字符');
    return value.trim();
  };
  app.patch('/api/teams/:id', async (req: any) => {
    const t = teamAccess(store, user(req), req.params.id, true),
      value = name(req.body?.name);
    store.run('UPDATE teams SET name=? WHERE id=?', value, t.id);
    return { id: t.id, name: value };
  });
  app.patch('/api/projects/:id', async (req: any) => {
    membership(store, user(req), req.params.id, false, true);
    const value = name(req.body?.name);
    store.run('UPDATE projects SET name=? WHERE id=?', value, req.params.id);
    return { id: req.params.id, name: value };
  });
  app.patch('/api/documents/:id', async (req: any) => {
    const d = documentAccess(store, user(req), req.params.id, true),
      value = name(req.body?.name);
    store.run('UPDATE documents SET name=? WHERE id=?', value, d.id);
    return { id: d.id, name: value };
  });
  app.post('/api/documents/:id/move', async (req: any) => {
    const u = user(req),
      d = documentAccess(store, u, req.params.id, true),
      projectId = req.body?.projectId;
    if (typeof projectId !== 'string' || !projectId) fail(400, '请选择目标项目');
    membership(store, u, projectId, true);
    const source = store.one('SELECT team_id FROM projects WHERE id=?', d.project_id),
      target = store.one('SELECT team_id FROM projects WHERE id=?', projectId);
    if (source.team_id !== target.team_id) fail(400, '只能移动到同一团队的项目');
    return store.transaction(() => {
      if (d.project_id !== projectId) {
        if (
          store.one(
            "SELECT u.id FROM uploads u JOIN revisions r ON r.id=u.revision_id WHERE r.document_id=? AND u.status IN ('uploading','received','verifying')",
            d.id,
          ) ||
          store.one(
            "SELECT id FROM revisions WHERE document_id=? AND status IN ('uploading','processing')",
            d.id,
          )
        )
          fail(409, '设计正在上传或处理，请完成后再移动');
        store.run('UPDATE documents SET project_id=? WHERE id=?', projectId, d.id);
      }
      return { id: d.id, projectId, name: d.name };
    });
  });
}
