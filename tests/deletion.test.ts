import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';

test('deletion enforces roles, removes descendants atomically and preserves shared assets', async () => {
  const root = await mkdtemp(path.resolve('.test-output/delete-')),
    { app, store } = await createApp({ dataDir: root, startJobs: false });
  const call = (url: string, cookie: string, method: any = 'GET', payload?: any) =>
    app.inject({
      url: '/api' + url,
      method,
      headers: { host: 'test.local', origin: 'http://test.local', cookie },
      payload,
    });
  const signup = async (name: string) => {
    const r = await call('/register', '', 'POST', { username: name, password: 'abc123' });
    return { ...r.json(), cookie: 'sp_session=' + r.cookies[0].value };
  };
  try {
    const owner = await signup('owner'),
      admin = await signup('admin'),
      viewer = await signup('viewer'),
      designer = await signup('designer'),
      outside = await signup('outside');
    const team = (await call('/teams', owner.cookie, 'POST', { name: 'Test' })).json();
    for (const [u, role] of [
      [admin, 'admin'],
      [viewer, 'member'],
      [designer, 'member'],
    ] as const)
      store.run('INSERT INTO team_members VALUES(?,?,?)', team.id, u.id, role);
    const project = (
      await call('/projects', owner.cookie, 'POST', { teamId: team.id, name: 'App' })
    ).json();
    for (const [u, role] of [
      [viewer, 'viewer'],
      [designer, 'designer'],
    ] as const)
      store.run('INSERT INTO members VALUES(?,?,?)', project.id, u.id, role);
    const hash = 'a'.repeat(64);
    store.run('INSERT INTO objects VALUES(?,?,?)', hash, 10, 1);
    function document(id: string, status = 'ready') {
      store.run('INSERT INTO documents VALUES(?,?,?,NULL,?)', id, project.id, id, 1);
      store.run(
        'INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,status,created) VALUES(?,?,1,?,10,?,?,?, ?,1)',
        id + 'rev',
        id,
        hash,
        'test.sketch',
        '',
        owner.id,
        status,
      );
    }
    document('first');
    document('second');
    assert.equal((await call('/documents/first', outside.cookie, 'DELETE')).statusCode, 404);
    assert.equal((await call('/documents/first', viewer.cookie, 'DELETE')).statusCode, 403);
    assert.equal(
      (await call('/projects/' + project.id, designer.cookie, 'DELETE')).statusCode,
      403,
    );
    assert.equal((await call('/teams/' + team.id, admin.cookie, 'DELETE')).statusCode, 403);
    assert.equal((await call('/documents/first', designer.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.one('SELECT id FROM revisions WHERE document_id=?', 'first'), undefined);
    assert.ok(store.one('SELECT id FROM documents WHERE id=?', 'second'));
    assert.ok(store.one('SELECT hash FROM objects WHERE hash=?', hash));
    document('blocked', 'processing');
    assert.equal((await call('/teams/' + team.id, owner.cookie, 'DELETE')).statusCode, 409);
    assert.ok(store.one('SELECT id FROM documents WHERE id=?', 'second'));
    assert.ok(store.one('SELECT id FROM projects WHERE id=?', project.id));
    store.run("UPDATE revisions SET status='ready' WHERE document_id='blocked'");
    store.run("INSERT INTO uploads VALUES('upload','blockedrev',?,10,'uploading',1)", owner.id);
    assert.equal((await call('/projects/' + project.id, admin.cookie, 'DELETE')).statusCode, 409);
    store.run("UPDATE uploads SET status='failed'");
    assert.equal((await call('/projects/' + project.id, admin.cookie, 'DELETE')).statusCode, 200);
    assert.equal((await call('/revisions/secondrev', owner.cookie)).statusCode, 404);
    assert.equal(store.all('SELECT * FROM uploads').length, 0);
    assert.equal(store.all('SELECT * FROM members').length, 0);
    assert.equal((await call('/teams/' + team.id, owner.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.all('SELECT * FROM team_members').length, 0);
    assert.ok(store.one('SELECT hash FROM objects WHERE hash=?', hash));
    assert.equal((await call('/teams/' + team.id, owner.cookie, 'DELETE')).statusCode, 404);
  } finally {
    await app.close();
  }
});
