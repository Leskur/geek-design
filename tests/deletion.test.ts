import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';

test('deletion enforces roles, removes descendants atomically and reclaims unused storage', async () => {
  const root = await mkdtemp(path.resolve('.test-output/delete-')),
    { app, store, storage } = await createApp({ dataDir: root, startJobs: false });
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
  const exists = async (file: string) => {
    try {
      await access(file);
      return true;
    } catch {
      return false;
    }
  };
  try {
    const owner = await signup('owner'),
      member = await signup('member'),
      outside = await signup('outside');
    const space = (await call('/spaces', owner.cookie, 'POST', { name: 'Test' })).json();
    store.run("INSERT INTO space_members VALUES(?,?,'member')", space.id, member.id);
    const folder = (
      await call('/folders', owner.cookie, 'POST', { spaceId: space.id, name: 'App' })
    ).json();
    const hash = 'a'.repeat(64),
      assetHash = 'b'.repeat(64),
      coverHash = 'c'.repeat(64),
      artifactKey = `${hash}-sketch-core-2`;
    store.run('INSERT INTO objects VALUES(?,?,?)', hash, 10, 1);
    store.run('INSERT INTO objects VALUES(?,?,?)', assetHash, 4, 1);
    store.run('INSERT INTO objects VALUES(?,?,?)', coverHash, 4, 1);
    for (const objectHash of [hash, assetHash, coverHash])
      await mkdir(path.dirname(storage.object(objectHash)), { recursive: true });
    await writeFile(storage.object(hash), 'sketch');
    await writeFile(storage.object(assetHash), 'img');
    await writeFile(storage.object(coverHash), 'cover');
    await mkdir(storage.path('artifacts', artifactKey), { recursive: true });
    await writeFile(
      storage.path('artifacts', artifactKey, 'manifest.json'),
      JSON.stringify({
        assets: { 'images/x.png': { hash: assetHash, mime: 'image/png', size: 4 } },
        cover: { hash: coverHash, mime: 'image/png', size: 4 },
      }),
    );
    store.run(
      "INSERT INTO artifacts(key,hash,version,status,created) VALUES(?,?,?,'ready',?)",
      artifactKey,
      hash,
      'sketch-core-2',
      1,
    );
    function design(
      id: string,
      createdBy: string,
      status = 'ready',
      withArtifact = true,
      folderId: string | null = folder.id,
    ) {
      store.run(
        'INSERT INTO designs(id,space_id,folder_id,name,created_by,hash,size,filename,artifact_key,status,created,updated) VALUES(?,?,?,?,?,?,10,?,?,?,?,1)',
        id,
        space.id,
        folderId,
        id,
        createdBy,
        hash,
        'test.sketch',
        withArtifact ? artifactKey : null,
        status,
        1,
      );
    }
    design('first', member.id);
    design('second', owner.id);
    assert.equal((await call('/designs/first', outside.cookie, 'DELETE')).statusCode, 404);
    assert.equal((await call('/designs/first', owner.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.one('SELECT id FROM designs WHERE id=?', 'first'), undefined);
    assert.ok(store.one('SELECT id FROM designs WHERE id=?', 'second'));
    assert.ok(store.one('SELECT hash FROM objects WHERE hash=?', hash));
    assert.ok(store.one('SELECT hash FROM objects WHERE hash=?', assetHash));
    assert.ok(store.one('SELECT hash FROM objects WHERE hash=?', coverHash));
    assert.ok(store.one('SELECT key FROM artifacts WHERE key=?', artifactKey));
    assert.equal(await exists(storage.object(hash)), true);
    assert.equal(await exists(storage.path('artifacts', artifactKey, 'manifest.json')), true);

    design('third', owner.id);
    assert.equal((await call('/designs/third', member.cookie, 'DELETE')).statusCode, 403);
    assert.equal((await call('/folders/' + folder.id, member.cookie, 'DELETE')).statusCode, 403);
    const ownFolder = (
      await call('/folders', member.cookie, 'POST', { spaceId: space.id, name: 'Mine' })
    ).json();
    assert.equal((await call('/folders/' + ownFolder.id, member.cookie, 'DELETE')).statusCode, 200);
    const occupied = (
      await call('/folders', member.cookie, 'POST', { spaceId: space.id, name: 'Occupied' })
    ).json();
    design('foreign-in-member', owner.id, 'ready', false, occupied.id);
    assert.equal((await call('/folders/' + occupied.id, member.cookie, 'DELETE')).statusCode, 403);
    assert.ok(store.one('SELECT id FROM folders WHERE id=?', occupied.id));
    store.run("DELETE FROM designs WHERE id='foreign-in-member'");
    assert.equal((await call('/folders/' + occupied.id, member.cookie, 'DELETE')).statusCode, 200);
    assert.equal((await call('/spaces/' + space.id, member.cookie, 'DELETE')).statusCode, 403);

    const personal = (await call('/spaces', owner.cookie))
      .json()
      .find((s: any) => s.kind === 'personal');
    assert.equal((await call('/spaces/' + personal.id, owner.cookie, 'DELETE')).statusCode, 403);

    design('blocked', owner.id, 'processing', false);
    assert.equal((await call('/spaces/' + space.id, owner.cookie, 'DELETE')).statusCode, 409);
    assert.ok(store.one('SELECT id FROM designs WHERE id=?', 'second'));
    assert.ok(store.one('SELECT id FROM folders WHERE id=?', folder.id));
    store.run("UPDATE designs SET status='ready' WHERE id='blocked'");
    store.run(
      "INSERT INTO uploads VALUES('upload','blocked',?,10,?,?, 'uploading',1)",
      owner.id,
      hash,
      'partial.sketch',
    );
    await writeFile(storage.path('uploads', 'upload'), 'partial');
    assert.equal((await call('/folders/' + folder.id, owner.cookie, 'DELETE')).statusCode, 409);
    store.run("UPDATE uploads SET status='failed'");
    const nested = (
      await call('/folders', owner.cookie, 'POST', {
        spaceId: space.id,
        name: 'Nested',
        parentId: folder.id,
      })
    ).json();
    assert.equal(nested.parent_id, folder.id);
    const otherSpace = (await call('/spaces', owner.cookie, 'POST', { name: 'Elsewhere' })).json();
    assert.equal(
      (
        await call('/folders', owner.cookie, 'POST', {
          spaceId: otherSpace.id,
          name: 'Rejected',
          parentId: folder.id,
        })
      ).statusCode,
      400,
    );
    design('nested-design', owner.id, 'ready', false, nested.id);
    assert.equal((await call('/folders/' + folder.id, owner.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.one('SELECT id FROM folders WHERE id=?', nested.id), undefined);
    assert.equal(store.one("SELECT id FROM designs WHERE id='nested-design'"), undefined);
    assert.equal((await call('/designs/second', owner.cookie)).statusCode, 404);
    assert.equal(store.all('SELECT * FROM uploads').length, 0);
    assert.equal(store.one('SELECT hash FROM objects WHERE hash=?', hash), undefined);
    assert.equal(store.one('SELECT hash FROM objects WHERE hash=?', assetHash), undefined);
    assert.equal(store.one('SELECT hash FROM objects WHERE hash=?', coverHash), undefined);
    assert.equal(store.one('SELECT key FROM artifacts WHERE key=?', artifactKey), undefined);
    assert.equal(await exists(storage.object(hash)), false);
    assert.equal(await exists(storage.object(assetHash)), false);
    assert.equal(await exists(storage.object(coverHash)), false);
    assert.equal(await exists(storage.path('artifacts', artifactKey, 'manifest.json')), false);
    assert.equal(await exists(storage.path('uploads', 'upload')), false);
    design('root-only', owner.id, 'ready', false, null);
    assert.ok(store.one("SELECT id FROM designs WHERE id='root-only' AND folder_id IS NULL"));
    assert.equal((await call('/spaces/' + space.id, owner.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.one("SELECT id FROM designs WHERE id='root-only'"), undefined);
    assert.equal(store.all('SELECT * FROM space_members WHERE space_id=?', space.id).length, 0);
    assert.equal((await call('/spaces/' + space.id, owner.cookie, 'DELETE')).statusCode, 404);
  } finally {
    await app.close();
  }
});
