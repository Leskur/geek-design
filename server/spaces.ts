import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Store, User } from './db';
import { fail, folderAccess, hashToken, spaceAccess } from './auth';

export function spaceRoutes(app: FastifyInstance, store: Store, user: (req: any) => User) {
  const name = (value: any) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 120)
      fail(400, '名称需要 1 至 120 个字符');
    return value.trim();
  };
  app.get('/api/spaces', async (req) =>
    store.all(
      'SELECT s.*,m.role,(SELECT COUNT(*) FROM space_members WHERE space_id=s.id) AS member_count FROM spaces s JOIN space_members m ON m.space_id=s.id WHERE m.user_id=? ORDER BY CASE s.kind WHEN \'personal\' THEN 0 ELSE 1 END, s.created DESC',
      user(req).id,
    ),
  );
  app.post('/api/spaces', async (req) => {
    const u = user(req),
      id = store.id(),
      value = name((req.body as any)?.name);
    store.transaction(() => {
      store.run('INSERT INTO spaces VALUES(?,?,?,?)', id, value, 'shared', Date.now());
      store.run("INSERT INTO space_members VALUES(?,?,'owner')", id, u.id);
    });
    return { id, name: value, kind: 'shared', role: 'owner' };
  });
  app.get('/api/spaces/:id', async (req: any) => spaceAccess(store, user(req), req.params.id));
  app.get('/api/spaces/:id/members', async (req: any) => {
    spaceAccess(store, user(req), req.params.id);
    return store.all(
      'SELECT m.user_id,m.role,u.username FROM space_members m JOIN users u ON u.id=m.user_id WHERE m.space_id=? ORDER BY m.role,u.username',
      req.params.id,
    );
  });
  app.delete('/api/spaces/:id/members/:userId', async (req: any) => {
    const actor = spaceAccess(store, user(req), req.params.id, true),
      target = store.one(
        'SELECT * FROM space_members WHERE space_id=? AND user_id=?',
        actor.id,
        req.params.userId,
      );
    if (!target) fail(404, '成员不存在');
    if (target.role === 'owner') fail(403, '不能移除拥有者');
    if (actor.kind === 'personal') fail(403, '个人空间不能管理成员');
    store.transaction(() => {
      store.run(
        'DELETE FROM space_members WHERE space_id=? AND user_id=?',
        actor.id,
        target.user_id,
      );
      store.run(
        'UPDATE invitations SET revoked=1 WHERE space_id=? AND created_by=? AND accepted_by IS NULL',
        actor.id,
        target.user_id,
      );
    });
    return { ok: true };
  });
  app.get('/api/spaces/:id/invitations', async (req: any) => {
    const s = spaceAccess(store, user(req), req.params.id, true);
    if (s.kind === 'personal') fail(403, '个人空间不能邀请成员');
    return store.all(
      'SELECT i.id,i.expires,i.revoked,i.accepted_by,i.created,u.username AS created_by FROM invitations i JOIN users u ON u.id=i.created_by WHERE i.space_id=? ORDER BY i.created DESC',
      s.id,
    );
  });
  app.post('/api/spaces/:id/invitations', async (req: any) => {
    const u = user(req),
      s = spaceAccess(store, u, req.params.id, true);
    if (s.kind === 'personal') fail(403, '个人空间不能邀请成员');
    const token = randomBytes(32).toString('hex'),
      id = store.id(),
      now = Date.now(),
      expires = now + 7 * 86400000;
    store.run(
      'INSERT INTO invitations(id,space_id,token_hash,created_by,expires,created) VALUES(?,?,?,?,?,?)',
      id,
      s.id,
      hashToken(token),
      u.id,
      expires,
      now,
    );
    return { id, token, expires };
  });
  app.post('/api/spaces/:id/invitations/:inviteId/revoke', async (req: any) => {
    const s = spaceAccess(store, user(req), req.params.id, true);
    if (s.kind === 'personal') fail(403, '个人空间不能邀请成员');
    const result = store.run(
      'UPDATE invitations SET revoked=1 WHERE id=? AND space_id=?',
      req.params.inviteId,
      s.id,
    );
    if (!result.changes) fail(404, '邀请不存在');
    return { ok: true };
  });
  function invitation(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) fail(404, '邀请不存在');
    const i = store.one(
      'SELECT i.*,s.name AS space_name,s.kind FROM invitations i JOIN spaces s ON s.id=i.space_id WHERE token_hash=?',
      hashToken(token),
    );
    if (!i) fail(404, '邀请不存在');
    return i;
  }
  app.get('/api/invitations/:token', async (req: any) => {
    const i = invitation(req.params.token);
    return {
      spaceName: i.space_name,
      expires: i.expires,
      status: i.revoked
        ? 'revoked'
        : i.expires <= Date.now()
          ? 'expired'
          : i.accepted_by
            ? 'accepted'
            : 'active',
    };
  });
  app.post('/api/invitations/:token/accept', async (req: any) => {
    const u = user(req);
    return store.transaction(() => {
      const i = invitation(req.params.token);
      if (i.kind === 'personal') fail(400, '个人空间不能通过邀请加入');
      if (i.revoked || i.expires <= Date.now())
        fail(410, '邀请已撤销或过期，请向空间拥有者索取新链接');
      if (i.accepted_by && i.accepted_by !== u.id) fail(409, '邀请已被使用，请索取新链接');
      if (
        i.accepted_by &&
        !store.one(
          'SELECT user_id FROM space_members WHERE space_id=? AND user_id=?',
          i.space_id,
          u.id,
        )
      )
        fail(409, '邀请已被使用，请索取新链接');
      store.run("INSERT OR IGNORE INTO space_members VALUES(?,?,'member')", i.space_id, u.id);
      store.run('UPDATE invitations SET accepted_by=? WHERE id=?', u.id, i.id);
      return { spaceId: i.space_id };
    });
  });
  app.get('/api/spaces/:id/folders', async (req: any) => {
    spaceAccess(store, user(req), req.params.id);
    return store.all(
      'SELECT * FROM folders WHERE space_id=? ORDER BY created DESC',
      req.params.id,
    );
  });
  app.get('/api/spaces/:id/designs', async (req: any) => {
    spaceAccess(store, user(req), req.params.id);
    return store.all(
      'SELECT d.*,f.name AS folder_name,u.username AS created_by_name,a.step FROM designs d LEFT JOIN folders f ON f.id=d.folder_id JOIN users u ON u.id=d.created_by LEFT JOIN artifacts a ON a.key=d.artifact_key WHERE d.space_id=? ORDER BY d.updated DESC',
      req.params.id,
    );
  });
  app.post('/api/folders', async (req) => {
    const u = user(req),
      b = req.body as any,
      s = spaceAccess(store, u, b?.spaceId),
      id = store.id(),
      value = name(b?.name);
    let parentId: string | null = null;
    if (b?.parentId) {
      const { folder, space } = folderAccess(store, u, b.parentId);
      if (space.id !== s.id) fail(400, '文件夹不属于当前空间');
      parentId = folder.id;
    }
    store.run(
      'INSERT INTO folders(id,space_id,name,created,parent_id) VALUES(?,?,?,?,?)',
      id,
      s.id,
      value,
      Date.now(),
      parentId,
    );
    return { id, space_id: s.id, name: value, parent_id: parentId };
  });
}
