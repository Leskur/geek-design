const CACHE_ENABLED = false;
const CACHE_NAME = 'geek-design-images-v1';

function requestFor(docKey: string, ref: string, kind: 'full' | 'mini') {
  return new Request(
    `https://assets.geek-design.local/${encodeURIComponent(docKey)}/${kind}/${encodeURIComponent(ref)}`,
  );
}

async function openCache() {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function readAsset(docKey: string, ref: string, kind: 'full' | 'mini') {
  if (!CACHE_ENABLED) return null;
  const cache = await openCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(requestFor(docKey, ref, kind));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

export async function writeAsset(docKey: string, ref: string, kind: 'full' | 'mini', blob: Blob) {
  if (!CACHE_ENABLED) return;
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(
      requestFor(docKey, ref, kind),
      new Response(blob, {
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      }),
    );
  } catch {
    // Quota or private mode: keep the in-memory copy.
  }
}
