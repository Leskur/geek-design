import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';

test('rename and move preserve design identity, validate input and enforce space access', async () => {
  const root = await mkdtemp(path.resolve('.test-output/editing-')),
    { app, store, storage } = await createApp({ dataDir: root, startJobs: false });
  const call = (url: string, cookie = '', method: any = 'GET', payload?: any) =>
    app.inject({
      url: '/api' + url,
      method,
      headers: { host: 'test.local', origin: 'http://test.local', cookie },
      payload,
    });
  const signup = async (username: string) => {
    const r = await call('/register', '', 'POST', { username, password: 'abc123' });
    assert.equal(r.statusCode, 200, r.body);
    return { ...r.json(), cookie: 'sp_session=' + r.cookies[0].value };
  };
  try {
    const owner = await signup('owner'),
      member = await signup('member'),
      outsider = await signup('outsider');
    const space = (await call('/spaces', owner.cookie, 'POST', { name: 'Team' })).json(),
      other = (await call('/spaces', owner.cookie, 'POST', { name: 'Other' })).json();
    store.run("INSERT INTO space_members VALUES(?,?,'member')", space.id, member.id);
    const folder = async (spaceId: string, name: string) =>
      (await call('/folders', owner.cookie, 'POST', { spaceId, name })).json();
    const source = await folder(space.id, 'Source'),
      target = await folder(space.id, 'Target'),
      external = await folder(other.id, 'External');
    const key = 'artifact',
      dir = storage.path('artifacts', key);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ pages: [], pageFiles: {}, assets: {} }),
    );
    store.run(
      "INSERT INTO artifacts(key,hash,version,status,created) VALUES(?,'hash','v','ready',1)",
      key,
    );
    store.run(
      "INSERT INTO designs(id,space_id,folder_id,name,created_by,hash,size,filename,artifact_key,status,created,updated) VALUES('design',?,?,'Design',?,'hash1',1,'original.sketch',?,'ready',1,1)",
      space.id,
      source.id,
      member.id,
      key,
    );
    assert.equal((await call('/spaces/' + space.id, '', 'PATCH', { name: 'New' })).statusCode, 401);
    assert.equal(
      (await call('/spaces/' + space.id, outsider.cookie, 'PATCH', { name: 'New' })).statusCode,
      404,
    );
    assert.equal(
      (await call('/spaces/' + space.id, member.cookie, 'PATCH', { name: 'New' })).statusCode,
      403,
    );
    assert.equal(
      (await call('/spaces/' + space.id, owner.cookie, 'PATCH', { name: ' New Space ' }))
        .statusCode,
      200,
    );
    assert.equal(store.one('SELECT name FROM spaces WHERE id=?', space.id).name, 'New Space');
    const personal = (await call('/spaces', owner.cookie))
      .json()
      .find((s: any) => s.kind === 'personal');
    assert.equal(
      (await call('/spaces/' + personal.id, owner.cookie, 'PATCH', { name: 'X' })).statusCode,
      403,
    );
    assert.equal(
      (await call('/folders/' + source.id, member.cookie, 'PATCH', { name: 'New Folder' }))
        .statusCode,
      403,
    );
    assert.equal(store.one('SELECT name FROM folders WHERE id=?', source.id).name, 'Source');
    const memberFolder = (
      await call('/folders', member.cookie, 'POST', { spaceId: space.id, name: 'Mine' })
    ).json();
    assert.equal(memberFolder.created_by, member.id);
    assert.equal(
      (await call('/folders/' + memberFolder.id, member.cookie, 'PATCH', { name: 'Renamed' }))
        .statusCode,
      200,
    );
    assert.equal(
      (await call('/folders/' + memberFolder.id, owner.cookie, 'PATCH', { name: 'OwnerEdit' }))
        .statusCode,
      200,
    );
    for (const name of ['', '  ', 'a'.repeat(121), null, 5])
      assert.equal(
        (await call('/designs/design', owner.cookie, 'PATCH', { name })).statusCode,
        400,
      );
    assert.equal(
      (await call('/designs/design', outsider.cookie, 'PATCH', { name: 'New' })).statusCode,
      404,
    );
    assert.equal(
      (await call('/designs/design', member.cookie, 'PATCH', { name: ' New Design ' })).statusCode,
      200,
    );
    assert.equal((await call('/designs/design', owner.cookie)).json().name, 'New Design');
    assert.equal(
      (await call('/designs/design/move', outsider.cookie, 'POST', { folderId: target.id }))
        .statusCode,
      404,
    );
    assert.equal(
      (await call('/designs/design/move', owner.cookie, 'POST', { folderId: external.id }))
        .statusCode,
      400,
    );
    assert.equal((await call('/designs/design/move', owner.cookie, 'POST', {})).statusCode, 400);
    store.run("UPDATE designs SET status='processing' WHERE id='design'");
    assert.equal(
      (await call('/designs/design/move', member.cookie, 'POST', { folderId: target.id }))
        .statusCode,
      409,
    );
    assert.equal(store.one("SELECT folder_id FROM designs WHERE id='design'").folder_id, source.id);
    store.run("UPDATE designs SET status='ready' WHERE id='design'");
    store.run(
      "INSERT INTO uploads VALUES('upload','design',?,1,?,?, 'uploading',1)",
      member.id,
      'hash1',
      'x.sketch',
    );
    assert.equal(
      (await call('/designs/design/move', member.cookie, 'POST', { folderId: target.id }))
        .statusCode,
      409,
    );
    store.run("UPDATE uploads SET status='failed' WHERE id='upload'");
    assert.equal(
      (await call('/designs/design/move', member.cookie, 'POST', { folderId: target.id }))
        .statusCode,
      200,
    );
    const moved = (await call('/designs/design', owner.cookie)).json();
    assert.equal(moved.id, 'design');
    assert.equal(moved.folder_id, target.id);
    assert.equal((await call('/folders/' + source.id + '/designs', owner.cookie)).json().length, 0);
    assert.equal((await call('/folders/' + target.id + '/designs', owner.cookie)).json().length, 1);
    assert.equal(
      (await call('/designs/design/move', member.cookie, 'POST', { folderId: target.id }))
        .statusCode,
      200,
    );
    assert.equal(
      (await call('/designs/design/manifest', member.cookie)).json().folderId,
      target.id,
    );
    assert.equal(
      (await call('/designs/design/move', member.cookie, 'POST', { folderId: null })).statusCode,
      200,
    );
    const atRoot = (await call('/designs/design', owner.cookie)).json();
    assert.equal(atRoot.folder_id, null);
    assert.equal(atRoot.space_id, space.id);
    assert.equal((await call('/designs/design/manifest', member.cookie)).json().folderId, null);
    assert.equal((await call('/designs/design/manifest', member.cookie)).json().spaceId, space.id);
  } finally {
    await app.close();
  }
});
