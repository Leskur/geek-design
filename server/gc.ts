import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Store } from './db';
import type { LocalStorage } from './storage';

export type CollectedRefs = {
  objectHashes: string[];
  artifactKeys: string[];
  uploadIds: string[];
};

function manifestHashes(manifest: any, into: Set<string>) {
  for (const asset of Object.values(manifest?.assets || {}) as { hash?: string }[])
    if (typeof asset?.hash === 'string') into.add(asset.hash);
  if (typeof manifest?.cover?.hash === 'string') into.add(manifest.cover.hash);
}

async function readManifest(storage: LocalStorage, key: string) {
  try {
    return JSON.parse(
      await fsp.readFile(storage.path('artifacts', key, 'manifest.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

export async function collectDesignRefs(
  store: Store,
  storage: LocalStorage,
  designIds: string[],
): Promise<CollectedRefs> {
  const objectHashes = new Set<string>(),
    artifactKeys = new Set<string>(),
    uploadIds = new Set<string>();
  for (const designId of designIds) {
    const d = store.one('SELECT hash,artifact_key FROM designs WHERE id=?', designId);
    if (typeof d?.hash === 'string') objectHashes.add(d.hash);
    if (typeof d?.artifact_key === 'string') artifactKeys.add(d.artifact_key);
    for (const u of store.all('SELECT id FROM uploads WHERE design_id=?', designId))
      uploadIds.add(u.id);
  }
  for (const key of artifactKeys) {
    const manifest = await readManifest(storage, key);
    if (manifest) manifestHashes(manifest, objectHashes);
  }
  return {
    objectHashes: [...objectHashes],
    artifactKeys: [...artifactKeys],
    uploadIds: [...uploadIds],
  };
}

export async function purgeUploadFiles(storage: LocalStorage, uploadIds: string[]) {
  for (const id of uploadIds) {
    for (const name of [id, `${id}.json`]) {
      try {
        await fsp.unlink(storage.path('uploads', name));
      } catch {}
    }
  }
}

export async function purgeArtifacts(store: Store, storage: LocalStorage, keys: string[]) {
  for (const key of keys) {
    if (store.one('SELECT 1 FROM designs WHERE artifact_key=?', key)) continue;
    store.run('DELETE FROM artifacts WHERE key=?', key);
    try {
      await fsp.rm(storage.path('artifacts', key), { recursive: true, force: true });
    } catch {}
  }
}

export async function purgeObjects(store: Store, storage: LocalStorage, hashes: string[]) {
  if (!hashes.length) return;
  const referenced = new Set<string>();
  for (const r of store.all('SELECT DISTINCT hash FROM designs WHERE hash IS NOT NULL'))
    referenced.add(r.hash);
  for (const a of store.all('SELECT key FROM artifacts')) {
    const manifest = await readManifest(storage, a.key);
    if (manifest) manifestHashes(manifest, referenced);
  }
  for (const hash of hashes) {
    if (referenced.has(hash)) continue;
    store.run('DELETE FROM objects WHERE hash=?', hash);
    try {
      if (fs.existsSync(storage.object(hash))) await fsp.unlink(storage.object(hash));
    } catch {}
  }
}

export async function reclaimStorage(
  store: Store,
  storage: LocalStorage,
  refs: CollectedRefs,
) {
  await purgeUploadFiles(storage, refs.uploadIds);
  await purgeArtifacts(store, storage, refs.artifactKeys);
  await purgeObjects(store, storage, refs.objectHashes);
}
