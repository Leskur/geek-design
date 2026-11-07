import { orderSpaces, moveSpace, savedSpaceOrder, rememberSpaceOrder } from '../src/workbench';
import { sortDesigns, workspaceView, rememberWorkspaceView } from '../src/workbench';
import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredSpace, recentDocuments, rememberDocument, rememberSpace } from '../src/workbench';
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
  rememberSpace('alice', 'space-b');
  assert.equal(preferredSpace('alice', [{ id: 'space-a' }, { id: 'space-b' }]), 'space-b');
  assert.equal(preferredSpace('bob', [{ id: 'space-a' }, { id: 'space-b' }]), 'space-a');
  assert.equal(preferredSpace('alice', [{ id: 'space-a' }]), 'space-a');
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
  assert.equal(preferredSpace('alice', [{ id: 'space-a' }]), 'space-a');
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

test('space reordering handles both directions and new or removed spaces', () => {
  const spaces = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveSpace(['a', 'b', 'c'], 'a', 'c', true), ['b', 'c', 'a']);
  assert.deepEqual(moveSpace(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(
    orderSpaces(spaces, ['deleted', 'b', 'a']).map((t) => t.id),
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
    rememberSpaceOrder('alice', ['c', 'a', 'b']);
    assert.deepEqual(savedSpaceOrder('alice'), ['c', 'a', 'b']);
    assert.deepEqual(savedSpaceOrder('bob'), []);
    memory.set('sketchpeek:space-order:bob', 'bad json');
    assert.deepEqual(savedSpaceOrder('bob'), []);
    memory.set('sketchpeek:team-order:carol', '["z"]');
    assert.deepEqual(savedSpaceOrder('carol'), ['z']);
  } finally {
    delete (globalThis as any).localStorage;
  }
});
