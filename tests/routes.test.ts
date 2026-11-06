import test from 'node:test';
import assert from 'node:assert/strict';
import { designPath, folderPath, routeFor, safeReturnPath, spacePath } from '../src/routes';

test('space, folder and design paths round trip', () => {
  assert.equal(folderPath('p'), '/folders/p');
  assert.deepEqual(routeFor(designPath('s', '设计 稿')), {
    kind: 'design',
    spaceId: 's',
    designId: '设计 稿',
  });
  assert.deepEqual(routeFor('/local'), { kind: 'local' });
  assert.deepEqual(routeFor(spacePath('t')), {
    kind: 'space',
    spaceId: 't',
    section: 'overview',
  });
  assert.equal(routeFor('/spaces/t/resources').section, 'resources');
  assert.deepEqual(routeFor('/register'), { kind: 'space', auth: 'register' });
  assert.equal(safeReturnPath('/invite/token'), '/invite/token');
  assert.equal(safeReturnPath('/login'), null);
  assert.equal(safeReturnPath('/spaces/s/designs/d'), '/spaces/s/designs/d');
});

test('retired addresses are missing', () => {
  for (const url of [
    '/teams/t',
    '/teams/t/members',
    '/projects/p',
    '/folders',
    '/folders/p/settings',
    '/folders/p/designs/d',
    '/folders/p/designs/d/revisions/r',
    '/folders/p/documents/d',
    '/spaces/t/workspace',
    '/spaces/t/fonts',
    '/spaces/t/settings',
    '/spaces/t/members',
    '/spaces/t/documents/d',
  ])
    assert.equal(routeFor(url).kind, 'missing', url);
  assert.equal(routeFor('/', '?design=d').kind, 'space');
  assert.equal(routeFor('/', '?design=d').designId, undefined);
});

test('unknown routes and external login returns are rejected', () => {
  for (const url of ['/folders/p/designs', '/folders/%2Fother', '/folders/%ZZ', '/unknown'])
    assert.equal(routeFor(url).kind, 'missing');
  for (const url of ['https://example.com', '//example.com', '/\\example.com', '/unknown', null])
    assert.equal(safeReturnPath(url), null);
});

test('root opens the space workspace while local viewing stays explicit', () => {
  assert.equal(routeFor('/').kind, 'space');
  assert.equal(routeFor('/local').kind, 'local');
});
