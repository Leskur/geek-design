import type { FastifyInstance } from 'fastify';
import type { Store, User } from './db';
import { canDeleteOwned, designAccess, fail, folderAccess, spaceAccess } from './auth';

export function editingRoutes(app: FastifyInstance, store: Store, user: (req: any) => User) {
  const name = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 120)
      fail(400, '名称需要 1 至 120 个字符');
    return value.trim();
  };
  app.patch('/api/spaces/:id', async (req: any) => {
    const s = spaceAccess(store, user(req), req.params.id, true),
      value = name(req.body?.name);
    if (s.kind === 'personal') fail(403, '个人空间名称跟随用户名');
    store.run('UPDATE spaces SET name=? WHERE id=?', value, s.id);
    return { id: s.id, name: value };
  });
  app.patch('/api/folders/:id', async (req: any) => {
    const u = user(req),
      { folder, space } = folderAccess(store, u, req.params.id);
    if (!canDeleteOwned(space, folder, u)) fail(403, '只能重命名自己创建的文件夹');
    const value = name(req.body?.name);
    store.run('UPDATE folders SET name=? WHERE id=?', value, req.params.id);
    return { id: req.params.id, name: value };
  });
  app.patch('/api/designs/:id', async (req: any) => {
    const u = user(req),
      { design, space } = designAccess(store, u, req.params.id);
    if (design.created_by !== u.id && space.role !== 'owner') fail(403, '只能重命名自己创建的设计');
    const value = name(req.body?.name);
    store.run('UPDATE designs SET name=?,updated=? WHERE id=?', value, Date.now(), design.id);
    return { id: design.id, name: value };
  });
  app.post('/api/designs/:id/move', async (req: any) => {
    const u = user(req),
      { design, space } = designAccess(store, u, req.params.id),
      folderId = req.body?.folderId;
    if (design.created_by !== u.id && space.role !== 'owner') fail(403, '只能移动自己创建的设计');
    let targetFolderId: string | null;
    if (folderId === null) targetFolderId = null;
    else if (typeof folderId === 'string' && folderId) {
      const target = folderAccess(store, u, folderId);
      if (target.folder.space_id !== space.id) fail(400, '只能移动到同一空间的文件夹');
      targetFolderId = folderId;
    } else fail(400, '请选择目标文件夹');
    if (
      store.one(
        "SELECT id FROM uploads WHERE design_id=? AND status IN ('uploading','received','verifying')",
        design.id,
      ) ||
      design.status === 'processing'
    )
      fail(409, '设计正在上传或处理，请完成后再移动');
    store.run(
      'UPDATE designs SET folder_id=?,updated=? WHERE id=?',
      targetFolderId,
      Date.now(),
      design.id,
    );
    return { id: design.id, folderId: targetFolderId, name: design.name };
  });
}
