import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { acquireDataDirLock, DATA_DIR_IN_USE } from '../server/lock';

test('data directory lock survives leftover pid files and blocks a second instance', async () => {
  const root = await mkdtemp(path.resolve('.test-output/lock-'));
  try {
    await writeFile(path.join(root, 'server.lock'), String(process.pid));
    const first = acquireDataDirLock(root);
    assert.throws(() => acquireDataDirLock(root), { message: DATA_DIR_IN_USE });
    first.release();
    const second = acquireDataDirLock(root);
    second.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
