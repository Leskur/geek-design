import { orderTeams, moveTeam, savedTeamOrder, rememberTeamOrder } from '../src/workbench';
import { sortDesigns, workspaceView, rememberWorkspaceView } from '../src/workbench';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preferredTeam,
  recentDocuments,
  rememberDocument,
  rememberTeam,
  migratePreferences,
} from '../src/workbench';
test('recent designs and remembered workspace stay isolated between accounts', () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  rememberDocument('alice', 'design-a');
  rememberDocument('alice', 'design-b');
  rememberDocument('alice', 'design-a');
  rememberDocument('bob', 'design-c');
  assert.deepEqual(
    recentDocuments('alice').map((r) => r.id),
    ['design-a', 'design-b'],
  );
  assert.deepEqual(
    recentDocuments('bob').map((r) => r.id),
    ['design-c'],
  );
  rememberTeam('alice', 'team-b');
  assert.equal(preferredTeam('alice', [{ id: 'team-a' }, { id: 'team-b' }]), 'team-b');
  assert.equal(preferredTeam('bob', [{ id: 'team-a' }, { id: 'team-b' }]), 'team-a');
  assert.equal(preferredTeam('alice', [{ id: 'team-a' }]), 'team-a');
  memory.set('sketchpeek:recent:legacy', '[{"id":"old-document","time":1}]');
  memory.set('sketchpeek:team:legacy', 'old-team');
  migratePreferences('short-user', 'legacy');
  assert.equal(recentDocuments('short-user')[0].id, 'old-document');
  assert.equal(
    preferredTeam('short-user', [{ id: 'short-team', legacy_id: 'old-team' }]),
    'short-team',
  );
  rememberDocument('short-user', 'short-document', 'old-document');
  assert.deepEqual(
    recentDocuments('short-user').map((r) => r.id),
    ['short-document'],
  );
  memory.set('sketchpeek:recent:alice', 'broken json');
  assert.deepEqual(recentDocuments('alice'), []);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() {
        throw Error('blocked');
      },
      setItem() {
        throw Error('blocked');
      },
    },
  });
  assert.doesNotThrow(() => rememberDocument('alice', 'design-a'));
  assert.equal(preferredTeam('alice', [{ id: 'team-a' }]), 'team-a');
  delete (globalThis as any).localStorage;
});

test('design ordering keeps source data unchanged and workspace view preferences are account scoped', () => {
  const designs = [
    { id: 'b', name: 'Beta', created: 100, updated: 200 },
    { id: 'a', name: 'Alpha', created: 300 },
    { id: 'c', name: 'Gamma', created: 100 },
  ];
  assert.deepEqual(
    sortDesigns(designs, 'updated').map((d) => d.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    sortDesigns(designs, 'name').map((d) => d.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    designs.map((d) => d.id),
    ['b', 'a', 'c'],
  );
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) || null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  try {
    rememberWorkspaceView('a', true, 'name');
    assert.deepEqual(workspaceView('a'), { list: true, sort: 'name' });
    assert.deepEqual(workspaceView('b'), { list: false, sort: 'updated' });
    memory.set('sketchpeek:view:b', 'null');
    assert.deepEqual(workspaceView('b'), { list: false, sort: 'updated' });
    memory.set('sketchpeek:view:b', 'broken');
    assert.deepEqual(workspaceView('b'), { list: false, sort: 'updated' });
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test('team reordering handles both directions, legacy IDs and new or removed teams', () => {
  const teams = [{ id: 'a' }, { id: 'b', legacy_id: 'old-b' }, { id: 'c' }];
  assert.deepEqual(moveTeam(['a', 'b', 'c'], 'a', 'c', true), ['b', 'c', 'a']);
  assert.deepEqual(moveTeam(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(
    orderTeams(teams, ['deleted', 'old-b', 'b', 'a']).map((t) => t.id),
    ['b', 'a', 'c'],
  );
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) || null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  try {
    rememberTeamOrder('alice', ['c', 'a', 'b']);
    assert.deepEqual(savedTeamOrder('alice'), ['c', 'a', 'b']);
    assert.deepEqual(savedTeamOrder('bob'), []);
    memory.set('sketchpeek:team-order:bob', 'bad json');
    assert.deepEqual(savedTeamOrder('bob'), []);
  } finally {
    delete (globalThis as any).localStorage;
  }
});
