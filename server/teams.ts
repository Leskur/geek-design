import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Store, User } from './db';
import { fail, hashToken, teamAccess, membership } from './auth';

export function teamRoutes(app: FastifyInstance, store: Store, user: (req: any) => User) {
  const name = (value: any) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 120)
      fail(400, '名称需要 1 至 120 个字符');
    return value.trim();
  };
  app.get('/api/teams', async (req) =>
    store.all(
      'SELECT t.*,m.role,(SELECT COUNT(*) FROM team_members WHERE team_id=t.id) AS member_count FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=? ORDER BY t.created DESC',
      user(req).id,
    ),
  );
  app.post('/api/teams', async (req) => {
    const u = user(req),
      id = store.id(),
      value = name((req.body as any)?.name);
    store.transaction(() => {
      store.run('INSERT INTO teams VALUES(?,?,?)', id, value, Date.now());
      store.run("INSERT INTO team_members VALUES(?,?,'owner')", id, u.id);
    });
    return { id, name: value, role: 'owner' };
  });
  app.get('/api/teams/:id', async (req: any) => teamAccess(store, user(req), req.params.id));
  app.get('/api/teams/:id/members', async (req: any) => {
    teamAccess(store, user(req), req.params.id);
    return store.all(
      'SELECT m.user_id,m.role,u.username FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=? ORDER BY m.role,u.username',
      req.params.id,
    );
  });
  app.post('/api/teams/:id/members/:userId', async (req: any) => {
    const actor = teamAccess(store, user(req), req.params.id, true),
      role = req.body?.role,
      target = store.one(
        'SELECT * FROM team_members WHERE team_id=? AND user_id=?',
        actor.id,
        req.params.userId,
      );
    if (!target) fail(404, '成员不存在');
    if (actor.role !== 'owner' || target.role === 'owner') fail(403, '仅拥有者可调整其他成员角色');
    if (!['admin', 'member'].includes(role)) fail(400, '角色无效');
    store.run(
      'UPDATE team_members SET role=? WHERE team_id=? AND user_id=?',
      role,
      actor.id,
      target.user_id,
    );
    return { ok: true };
  });
  app.delete('/api/teams/:id/members/:userId', async (req: any) => {
    const actor = teamAccess(store, user(req), req.params.id, true),
      target = store.one(
        'SELECT * FROM team_members WHERE team_id=? AND user_id=?',
        actor.id,
        req.params.userId,
      );
    if (!target) fail(404, '成员不存在');
    if (target.role === 'owner' || (actor.role === 'admin' && target.role !== 'member'))
      fail(403, '不能移除此成员');
    store.transaction(() => {
      store.run(
        'DELETE FROM members WHERE user_id=? AND project_id IN (SELECT id FROM projects WHERE team_id=?)',
        target.user_id,
        actor.id,
      );
      store.run('DELETE FROM team_members WHERE team_id=? AND user_id=?', actor.id, target.user_id);
      store.run(
        'UPDATE invitations SET revoked=1 WHERE team_id=? AND created_by=? AND accepted_by IS NULL',
        actor.id,
        target.user_id,
      );
    });
    return { ok: true };
  });
  app.get('/api/teams/:id/invitations', async (req: any) => {
    teamAccess(store, user(req), req.params.id, true);
    return store.all(
      'SELECT i.id,i.role,i.expires,i.revoked,i.accepted_by,i.created,u.username AS created_by FROM invitations i JOIN users u ON u.id=i.created_by WHERE i.team_id=? ORDER BY i.created DESC',
      req.params.id,
    );
  });
  app.post('/api/teams/:id/invitations', async (req: any) => {
    const u = user(req),
      t = teamAccess(store, u, req.params.id, true),
      role = req.body?.role || 'member';
    if (!['admin', 'member'].includes(role) || (role === 'admin' && t.role !== 'owner'))
      fail(403, '无权邀请此角色');
    const token = randomBytes(32).toString('hex'),
      id = store.id(),
      now = Date.now(),
      expires = now + 7 * 86400000;
    store.run(
      'INSERT INTO invitations(id,team_id,token_hash,role,created_by,expires,created) VALUES(?,?,?,?,?,?,?)',
      id,
      t.id,
      hashToken(token),
      role,
      u.id,
      expires,
      now,
    );
    return { id, token, expires, role };
  });
  app.post('/api/teams/:id/invitations/:inviteId/revoke', async (req: any) => {
    teamAccess(store, user(req), req.params.id, true);
    const result = store.run(
      'UPDATE invitations SET revoked=1 WHERE id=? AND team_id=?',
      req.params.inviteId,
      req.params.id,
    );
    if (!result.changes) fail(404, '邀请不存在');
    return { ok: true };
  });
  function invitation(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) fail(404, '邀请不存在');
    const i = store.one(
      'SELECT i.*,t.name AS team_name FROM invitations i JOIN teams t ON t.id=i.team_id WHERE token_hash=?',
      hashToken(token),
    );
    if (!i) fail(404, '邀请不存在');
    return i;
  }
  app.get('/api/invitations/:token', async (req: any) => {
    const i = invitation(req.params.token);
    return {
      teamName: i.team_name,
      role: i.role,
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
      if (i.revoked || i.expires <= Date.now())
        fail(410, '邀请已撤销或过期，请向团队管理者索取新链接');
      if (i.accepted_by && i.accepted_by !== u.id) fail(409, '邀请已被使用，请索取新链接');
      if (
        i.accepted_by &&
        !store.one(
          'SELECT user_id FROM team_members WHERE team_id=? AND user_id=?',
          i.team_id,
          u.id,
        )
      )
        fail(409, '邀请已被使用，请索取新链接');
      // Joining a team never changes an existing member's role.
      store.run('INSERT OR IGNORE INTO team_members VALUES(?,?,?)', i.team_id, u.id, i.role);
      store.run('UPDATE invitations SET accepted_by=? WHERE id=?', u.id, i.id);
      return { teamId: i.team_id };
    });
  });
  app.get('/api/projects', async (req) => {
    const u = user(req);
    return store.all(
      "SELECT p.*,CASE WHEN tm.role IN ('owner','admin') THEN 'owner' ELSE m.role END AS role FROM projects p JOIN team_members tm ON tm.team_id=p.team_id AND tm.user_id=? LEFT JOIN members m ON m.project_id=p.id AND m.user_id=? WHERE tm.role IN ('owner','admin') OR m.role IS NOT NULL ORDER BY p.created DESC",
      u.id,
      u.id,
    );
  });
  app.get('/api/teams/:id/projects', async (req: any) => {
    const u = user(req),
      t = teamAccess(store, u, req.params.id);
    return store.all(
      "SELECT p.*,CASE WHEN ? IN ('owner','admin') THEN 'owner' ELSE m.role END AS role FROM projects p LEFT JOIN members m ON m.project_id=p.id AND m.user_id=? WHERE p.team_id=? AND (? IN ('owner','admin') OR m.role IS NOT NULL) ORDER BY p.created DESC",
      t.role,
      u.id,
      t.id,
      t.role,
    );
  });
  app.get('/api/teams/:id/files', async (req: any) => {
    const u = user(req),
      t = teamAccess(store, u, req.params.id);
    return store.all(
      "SELECT d.*,p.name AS project_name,r.seq,r.status,r.created AS updated FROM documents d JOIN projects p ON p.id=d.project_id LEFT JOIN members m ON m.project_id=p.id AND m.user_id=? LEFT JOIN revisions r ON r.id=COALESCE(d.current_revision,(SELECT id FROM revisions WHERE document_id=d.id ORDER BY seq DESC LIMIT 1)) WHERE p.team_id=? AND (? IN ('owner','admin') OR m.role IS NOT NULL) ORDER BY COALESCE(r.created,d.created) DESC",
      u.id,
      t.id,
      t.role,
    );
  });
  app.post('/api/projects', async (req) => {
    const u = user(req),
      b = req.body as any,
      t = teamAccess(store, u, b?.teamId, true),
      id = store.id(),
      value = name(b?.name);
    store.run('INSERT INTO projects VALUES(?,?,?,?)', id, t.id, value, Date.now());
    return { id, team_id: t.id, name: value, role: 'owner' };
  });
  app.get('/api/projects/:id/members', async (req: any) => {
    membership(store, user(req), req.params.id, false, true);
    return store.all(
      'SELECT m.user_id,m.role,u.username FROM members m JOIN users u ON u.id=m.user_id WHERE project_id=?',
      req.params.id,
    );
  });
  app.post('/api/projects/:id/members', async (req: any) => {
    membership(store, user(req), req.params.id, false, true);
    const b = req.body as any,
      p = store.one('SELECT * FROM projects WHERE id=?', req.params.id);
    if (
      !['designer', 'viewer'].includes(b?.role) ||
      !store.one(
        'SELECT user_id FROM team_members WHERE team_id=? AND user_id=?',
        p.team_id,
        b?.userId || '',
      )
    )
      fail(400, '只能添加本团队成员，角色为可上传或可查看');
    store.run(
      'INSERT INTO members VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role',
      p.id,
      b.userId,
      b.role,
    );
    return { ok: true };
  });
  app.delete('/api/projects/:id/members/:userId', async (req: any) => {
    membership(store, user(req), req.params.id, false, true);
    store.run(
      'DELETE FROM members WHERE project_id=? AND user_id=?',
      req.params.id,
      req.params.userId,
    );
    return { ok: true };
  });
}
