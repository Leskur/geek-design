import type { FastifyInstance } from 'fastify';
import type { Store, User } from './db';
import { canDeleteDesign, designAccess, fail, folderAccess, spaceAccess } from './auth';
import { collectDesignRefs, reclaimStorage } from './gc';

export function deletionRoutes(app: FastifyInstance, store: Store, user: (req: any) => User) {
  function assertIdle(designIds: string[]) {
    for (const id of designIds) {
      if (
        store.one(
          "SELECT id FROM uploads WHERE design_id=? AND status IN ('uploading','received','verifying')",
          id,
        ) ||
        store.one("SELECT id FROM designs WHERE id=? AND status='processing'", id)
      )
        fail(409, '有文件正在上传或处理，请完成后再删除');
    }
  }
  async function removeDesigns(ids: string[]) {
    assertIdle(ids);
    const refs = await collectDesignRefs(store, store.storage, ids);
    store.transaction(() => {
      for (const id of ids) {
        store.run('DELETE FROM uploads WHERE design_id=?', id);
        store.run('DELETE FROM designs WHERE id=?', id);
      }
    });
    await reclaimStorage(store, store.storage, refs);
  }
  app.delete('/api/designs/:id', async (req: any) => {
    const u = user(req),
      { design, space } = designAccess(store, u, req.params.id);
    if (!canDeleteDesign(space, design, u)) fail(403, '只能删除自己创建的设计');
    await removeDesigns([design.id]);
    return { ok: true };
  });
  function foldersLeafFirst(rows: { id: string; parent_id: string | null }[], rootId?: string) {
    const children = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parent_id) continue;
      const list = children.get(row.parent_id) || [];
      list.push(row.id);
      children.set(row.parent_id, list);
    }
    const ordered: string[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const child of children.get(id) || []) walk(child);
      ordered.push(id);
    };
    if (rootId) walk(rootId);
    else for (const row of rows) walk(row.id);
    return ordered;
  }
  app.delete('/api/folders/:id', async (req: any) => {
    const u = user(req),
      { folder, space } = folderAccess(store, u, req.params.id);
    if (space.role !== 'owner') fail(403, '只有空间拥有者可以删除文件夹');
    const folderIds = foldersLeafFirst(
      store.all('SELECT id, parent_id FROM folders WHERE space_id=?', space.id),
      folder.id,
    );
    const designIds = folderIds.flatMap((id) =>
      store.all('SELECT id FROM designs WHERE folder_id=?', id).map((d) => d.id),
    );
    assertIdle(designIds);
    const refs = await collectDesignRefs(store, store.storage, designIds);
    store.transaction(() => {
      for (const id of designIds) {
        store.run('DELETE FROM uploads WHERE design_id=?', id);
        store.run('DELETE FROM designs WHERE id=?', id);
      }
      for (const id of folderIds) store.run('DELETE FROM folders WHERE id=?', id);
    });
    await reclaimStorage(store, store.storage, refs);
    return { ok: true };
  });
  app.delete('/api/spaces/:id', async (req: any) => {
    const u = user(req),
      s = spaceAccess(store, u, req.params.id, true);
    if (s.kind === 'personal') fail(403, '个人空间不能删除');
    const folders = foldersLeafFirst(
      store.all('SELECT id, parent_id FROM folders WHERE space_id=?', s.id),
    );
    const designIds = store
      .all('SELECT id FROM designs WHERE space_id=?', s.id)
      .map((d) => d.id);
    assertIdle(designIds);
    const refs = await collectDesignRefs(store, store.storage, designIds);
    store.transaction(() => {
      for (const id of designIds) {
        store.run('DELETE FROM uploads WHERE design_id=?', id);
        store.run('DELETE FROM designs WHERE id=?', id);
      }
      for (const id of folders) store.run('DELETE FROM folders WHERE id=?', id);
      store.run('DELETE FROM space_fonts WHERE space_id=?', s.id);
      store.run('DELETE FROM invitations WHERE space_id=?', s.id);
      store.run('DELETE FROM space_members WHERE space_id=?', s.id);
      store.run('DELETE FROM spaces WHERE id=?', s.id);
    });
    await reclaimStorage(store, store.storage, refs);
    return { ok: true };
  });
}
