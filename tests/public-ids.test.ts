import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';
import { passwordHash, session } from '../server/auth';

test('short IDs preserve existing records, authorize requests and leave Sketch IDs untouched', async () => {
  const root = await mkdtemp(path.resolve('.test-output/short-ids-'));
  const { app, store, storage } = await createApp({ dataDir: root, startJobs: false });
  const ids = {
    user: '11111111-1111-4111-8111-111111111111',
    team: '22222222-2222-4222-8222-222222222222',
    project: '33333333-3333-4333-8333-333333333333',
    document: '44444444-4444-4444-8444-444444444444',
    revision: '55555555-5555-4555-8555-555555555555',
  };
  const hash = 'a'.repeat(64),
    key = hash + '-sketch-core-1';
  const request = (url: string, payload?: any, cookie = 'sp_session=' + token) =>
    app.inject({
      url: '/api' + url,
      method: payload === undefined ? 'GET' : 'POST',
      headers: { host: 'test.local', origin: 'http://test.local', cookie },
      payload,
    });
  let token = '';
  try {
    store.run('INSERT INTO users VALUES(?,?,?)', ids.user, 'legacy', await passwordHash('abc123'));
    token = session(store, ids.user);
    store.run('INSERT INTO teams VALUES(?,?,?)', ids.team, 'Existing team', Date.now());
    store.run("INSERT INTO team_members VALUES(?,?,'owner')", ids.team, ids.user);
    store.run(
      'INSERT INTO projects VALUES(?,?,?,?)',
      ids.project,
      ids.team,
      'Existing project',
      Date.now(),
    );
    store.run(
      'INSERT INTO documents VALUES(?,?,?,?,?)',
      ids.document,
      ids.project,
      'Existing design',
      ids.revision,
      Date.now(),
    );
    store.run(
      "INSERT INTO artifacts(key,hash,version,status,created) VALUES(?,?,?,'ready',?)",
      key,
      hash,
      'sketch-core-1',
      Date.now(),
    );
    store.run(
      "INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,artifact_key,status,created) VALUES(?,?,1,?,1,'design.sketch','',?,?,'ready',?)",
      ids.revision,
      ids.document,
      hash,
      ids.user,
      key,
      Date.now(),
    );
    await mkdir(storage.path('artifacts', key, 'pages'), { recursive: true });
    await writeFile(
      storage.path('artifacts', key, 'manifest.json'),
      JSON.stringify({
        pages: [{ id: ids.project, name: 'Sketch page', count: 0 }],
        pageFiles: { [ids.project]: 'pages/0.json' },
        assets: {},
      }),
    );
    await writeFile(
      storage.path('artifacts', key, 'pages', '0.json'),
      JSON.stringify({
        _class: 'page',
        do_objectID: ids.project,
        name: 'Sketch page',
        frame: { x: 0, y: 0, width: 0, height: 0 },
        layers: [],
      }),
    );
    await writeFile(
      storage.path('artifacts', key, 'symbols.json'),
      JSON.stringify({
        symbols: [[ids.user, { id: ids.project, do_objectID: ids.user }]],
        styles: [],
      }),
    );
    const me = (await request('/me')).json();
    assert.match(me.id, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(me.legacy_id, ids.user);
    const team = (await request('/teams')).json()[0],
      project = (await request('/projects')).json()[0];
    for (const record of [team, project]) assert.match(record.id, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(project.team_id, team.id);
    assert.equal(project.legacy_id, ids.project);
    assert.equal((await request('/teams/' + team.id)).statusCode, 200);
    assert.equal((await request('/teams/' + ids.team)).json().id, team.id);
    const document = (await request(`/projects/${project.id}/documents`)).json()[0];
    assert.match(document.id, /^[A-Za-z0-9_-]{12}$/);
    assert.match(document.current_revision, /^[A-Za-z0-9_-]{12}$/);
    const manifest = (await request(`/revisions/${document.current_revision}/manifest`)).json();
    assert.equal(manifest.projectId, project.id);
    assert.equal(manifest.documentId, document.id);
    assert.equal(manifest.revisionId, document.current_revision);
    assert.equal(manifest.legacyProjectId, ids.project);
    assert.equal(manifest.pages[0].id, ids.project);
    assert.equal(
      (await request(`/revisions/${document.current_revision}/pages/${ids.project}`)).json()
        .do_objectID,
      ids.project,
    );
    assert.equal(
      (await request(`/revisions/${document.current_revision}/symbols`)).json().symbols[0][1].id,
      ids.project,
    );
    assert.equal(
      (
        await request(`/documents/${document.id}/current`, {
          revisionId: document.current_revision,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      store.one('SELECT current_revision FROM documents WHERE id=?', ids.document).current_revision,
      ids.revision,
    );
    assert.equal(
      (await request(`/revisions/${document.current_revision}/manifest`, undefined, '')).statusCode,
      401,
    );
    const signup = await request('/register', { username: 'outsider', password: 'abc123' }, '');
    const outsideCookie = 'sp_session=' + signup.cookies[0].value;
    assert.equal(
      (await request(`/projects/${project.id}/documents`, undefined, outsideCookie)).statusCode,
      404,
    );
    const created = (
      await request('/projects', { teamId: team.id, name: 'New short project' })
    ).json();
    assert.match(created.id, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(
      store.one('SELECT team_id FROM projects WHERE id=?', created.id).team_id,
      ids.team,
    );
    const short = store.publicId(ids.project);
    assert.equal(store.resolveId(short), ids.project);
    assert.equal(short, project.id);
    assert.equal(
      store.one('SELECT name FROM documents WHERE id=?', ids.document).name,
      'Existing design',
    );
  } finally {
    await app.close();
  }
});
