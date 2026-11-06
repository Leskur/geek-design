import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';

test('accounts, spaces and invitation lifecycle enforce separate identities and scopes', async () => {
  const root = await mkdtemp(path.resolve('.test-output/accounts-'));
  const { app, store } = await createApp({ dataDir: root, startJobs: false });
  const call = async (
    url: string,
    payload?: any,
    cookie = '',
    method: any = payload === undefined ? 'GET' : 'POST',
  ) =>
    app.inject({
      url: '/api' + url,
      method,
      headers: { host: 'test.local', origin: 'http://test.local', cookie },
      payload,
    });
  const ok = async (url: string, payload?: any, cookie = '', method?: any) => {
    const r = await call(url, payload, cookie, method);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const signup = async (username: string) => {
    const r = await call('/register', { username, password: 'abc123' });
    assert.equal(r.statusCode, 200, r.body);
    return { ...r.json(), cookie: r.cookies[0].name + '=' + r.cookies[0].value };
  };
  try {
    assert.equal(
      (await call('/register', { username: 'short', password: '12345' })).statusCode,
      400,
    );
    const owner = await signup('owner'),
      member = await signup('member'),
      outsider = await signup('outsider');
    assert.equal(
      (await call('/register', { username: 'OWNER', password: 'abc123' })).statusCode,
      409,
    );
    const memberSpaces = await ok('/spaces', undefined, member.cookie);
    assert.equal(memberSpaces.length, 1);
    assert.equal(memberSpaces[0].kind, 'personal');
    const a = await ok('/spaces', { name: 'Design' }, owner.cookie),
      b = await ok('/spaces', { name: 'Other' }, outsider.cookie);
    assert.equal(a.kind, 'shared');
    assert.equal((await call('/spaces/' + b.id, undefined, owner.cookie)).statusCode, 404);
    assert.equal(
      (await call('/spaces/' + b.id + '/designs', undefined, owner.cookie)).statusCode,
      404,
    );
    const personal = (await ok('/spaces', undefined, owner.cookie)).find(
      (s: any) => s.kind === 'personal',
    );
    assert.equal(
      (await call(`/spaces/${personal.id}/invitations`, { role: 'member' }, owner.cookie))
        .statusCode,
      403,
    );
    const invite = await ok(`/spaces/${a.id}/invitations`, {}, owner.cookie);
    assert.equal((await ok('/invitations/' + invite.token)).status, 'active');
    assert.equal((await call('/invitations/' + invite.token + '/accept', {})).statusCode, 401);
    await ok('/invitations/' + invite.token + '/accept', {}, member.cookie);
    await ok('/invitations/' + invite.token + '/accept', {}, member.cookie);
    assert.equal(
      (await call('/invitations/' + invite.token + '/accept', {}, outsider.cookie)).statusCode,
      409,
    );
    assert.equal((await ok('/spaces', undefined, member.cookie)).length, 2);
    const folder = await ok('/folders', { spaceId: a.id, name: 'App' }, member.cookie);
    assert.equal(folder.space_id, a.id);
    const designs = await ok('/spaces/' + a.id + '/designs', undefined, member.cookie);
    assert.deepEqual(designs, []);
    const folders = await ok('/spaces/' + a.id + '/folders', undefined, member.cookie);
    assert.equal(folders.length, 1);

    const revoked = await ok(`/spaces/${a.id}/invitations`, {}, owner.cookie);
    await ok(`/spaces/${a.id}/invitations/${revoked.id}/revoke`, {}, owner.cookie);
    assert.equal(
      (await call('/invitations/' + revoked.token + '/accept', {}, outsider.cookie)).statusCode,
      410,
    );
    const expired = await ok(`/spaces/${a.id}/invitations`, {}, owner.cookie);
    store.run('UPDATE invitations SET expires=? WHERE id=?', Date.now() - 1, expired.id);
    assert.equal((await ok('/invitations/' + expired.token)).status, 'expired');
    assert.equal(
      (await call('/invitations/' + expired.token + '/accept', {}, outsider.cookie)).statusCode,
      410,
    );
    assert.equal(
      (await call(`/spaces/${a.id}/invitations`, {}, member.cookie)).statusCode,
      403,
    );
    assert.equal(
      (await call(`/spaces/${a.id}/members/${owner.id}`, undefined, owner.cookie, 'DELETE'))
        .statusCode,
      403,
    );
    const delegated = await ok(`/spaces/${a.id}/invitations`, {}, owner.cookie);
    await ok(`/spaces/${a.id}/members/${member.id}`, undefined, owner.cookie, 'DELETE');
    assert.equal(
      (await call(`/spaces/${a.id}/folders`, undefined, member.cookie)).statusCode,
      404,
    );
    assert.equal(
      (await call('/invitations/' + invite.token + '/accept', {}, member.cookie)).statusCode,
      409,
    );
    assert.equal(
      (await call('/invitations/' + delegated.token + '/accept', {}, outsider.cookie)).statusCode,
      200,
    );
    const rejoin = await ok(`/spaces/${a.id}/invitations`, {}, owner.cookie);
    await ok('/invitations/' + rejoin.token + '/accept', {}, member.cookie);
    assert.equal((await ok('/spaces/' + a.id + '/folders', undefined, member.cookie)).length, 1);
    await ok('/spaces', { name: 'Another' }, member.cookie);
    assert.equal((await ok('/spaces', undefined, member.cookie)).length, 3);
    assert.equal((await ok('/spaces/' + a.id, undefined, member.cookie)).role, 'member');
    assert.equal((await call('/users', undefined, owner.cookie)).statusCode, 404);
    assert.equal((await call('/setup', {}, owner.cookie)).statusCode, 404);
  } finally {
    await app.close();
  }
});
