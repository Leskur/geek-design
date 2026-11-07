import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { createApp } from '../server/app';

const PREVIEW_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('space upload: register personal space, resume, overwrite, shared visibility and delete rules', async () => {
  const root = await mkdtemp(path.resolve('.test-output/space-'));
  let server = await createApp({ dataDir: root }),
    base = await server.app.listen({ port: 0, host: '127.0.0.1' }),
    cookie = '';
  const request = async (
    url: string,
    body?: any,
    method = body === undefined ? 'GET' : 'POST',
    session = cookie,
  ) =>
    fetch(base + '/api' + url, {
      method,
      headers: {
        Origin: base,
        Cookie: session,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (url: string, body?: any, session = cookie) => {
    const r = await request(url, body, body === undefined ? 'GET' : 'POST', session);
    assert.equal(r.status, 200, await r.clone().text());
    return r.json() as Promise<any>;
  };
  const fixture = async (name: string, preview?: Buffer) => {
    const zip = new ZipWriter(new BlobWriter());
    for (const [file, data] of Object.entries({
      'meta.json': {
        pagesAndArtboards: { page: { name: 'Page', artboards: { board: { name } } } },
      },
      'document.json': { pages: [{ _ref: 'pages/page' }] },
      'pages/page.json': {
        _class: 'page',
        do_objectID: 'page',
        name: 'Page',
        frame: { x: 0, y: 0, width: 0, height: 0 },
        layers: [
          {
            _class: 'artboard',
            do_objectID: 'board',
            name,
            frame: { x: 0, y: 0, width: 100, height: 100 },
            layers: [],
          },
        ],
      },
    }))
      await zip.add(file, new TextReader(JSON.stringify(data)));
    if (preview) await zip.add('previews/preview.png', new Uint8ArrayReader(preview));
    return Buffer.from(await (await zip.close()).arrayBuffer());
  };
  const preflight = async (
    bytes: Buffer,
    spaceId: string,
    folderId?: string | null,
    designId?: string,
    hash = createHash('sha256').update(bytes).digest('hex'),
    session = cookie,
  ) =>
    json(
      '/uploads/preflight',
      {
        spaceId,
        ...(folderId ? { folderId } : {}),
        designId,
        filename: 'example.sketch',
        sha256: hash,
        size: bytes.length,
      },
      session,
    );
  const patch = async (ticket: string, bytes: Buffer, offset: number, session = cookie) => {
    const r = await fetch(base + '/api/tus/' + ticket, {
      method: 'PATCH',
      headers: {
        Cookie: session,
        Origin: base,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: bytes,
    });
    assert.equal(r.status, 204, await r.text());
  };
  const create = async (ticket: string, length: number, session = cookie) => {
    const r = await fetch(base + '/api/tus', {
      method: 'POST',
      headers: {
        Cookie: session,
        Origin: base,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(length),
        'Upload-Metadata': 'ticket ' + Buffer.from(ticket).toString('base64'),
      },
    });
    assert.equal(r.status, 201, await r.text());
  };
  const wait = async (id: string, status = 'ready', session = cookie) => {
    for (let i = 0; i < 150; i++) {
      const r = await json('/designs/' + id, undefined, session);
      if (r.status === status) return r;
      if (r.status === 'failed') assert.fail(r.error);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail('processing timed out');
  };
  try {
    assert.equal((await request('/spaces')).status, 401);
    assert.equal(
      (
        await fetch(base + '/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (await request('/register', { username: 'admin', password: '12345' })).status,
      400,
    );
    const setup = await request('/register', { username: 'admin', password: 'adm123' });
    assert.equal(setup.status, 200);
    cookie = setup.headers.get('set-cookie')!.split(';')[0];
    const spaces = await json('/spaces');
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].kind, 'personal');
    assert.equal(spaces[0].name, 'Admin 的空间');
    assert.equal(spaces[0].role, 'owner');
    assert.equal(
      (await request(`/spaces/${spaces[0].id}/invitations`, { role: 'member' })).status,
      403,
    );

    const shared = await json('/spaces', { name: 'Collab' });
    assert.equal(shared.kind, 'shared');
    const folder = await json('/folders', { spaceId: shared.id, name: 'Design' }),
      other = await json('/folders', { spaceId: shared.id, name: 'Other' }),
      bytes = await fixture('First', PREVIEW_PNG);
    const rootBytes = await fixture('Root'),
      rootUpload = await preflight(rootBytes, shared.id);
    assert.equal(rootUpload.kind, 'upload');
    assert.equal(rootUpload.design.folder_id, null);
    assert.equal(rootUpload.design.space_id, shared.id);
    await create(rootUpload.ticket, rootBytes.length);
    await patch(rootUpload.ticket, rootBytes, 0);
    await wait(rootUpload.design.id);
    assert.equal((await json('/designs/' + rootUpload.design.id + '/manifest')).folderId, null);
    assert.ok(
      (await json('/spaces/' + shared.id + '/designs')).some(
        (d: any) => d.id === rootUpload.design.id && d.folder_id == null,
      ),
    );

    const first = await preflight(bytes, shared.id, folder.id);
    assert.equal(first.kind, 'upload');
    assert.ok(first.design.id);
    await create(first.ticket, bytes.length);
    const split = Math.floor(bytes.length / 2);
    await patch(first.ticket, bytes.subarray(0, split), 0);
    assert.equal((await json('/uploads/' + first.ticket)).offset, split);
    await server.app.close();
    server = await createApp({ dataDir: root });
    base = await server.app.listen({ port: 0, host: '127.0.0.1' });
    assert.equal(
      (await preflight(bytes, shared.id, folder.id, first.design.id)).ticket,
      first.ticket,
    );
    await patch(first.ticket, bytes.subarray(split), split);
    await wait(first.design.id);
    const manifest = await json('/designs/' + first.design.id + '/manifest');
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.folderId, folder.id);
    assert.equal(manifest.spaceId, shared.id);
    assert.equal(manifest.designId, first.design.id);
    assert.equal(manifest.cover.mime, 'image/png');
    assert.equal(manifest.cover.size, PREVIEW_PNG.length);
    assert.equal(
      (await json('/designs/' + first.design.id + '/pages/page')).layers[0].name,
      'First',
    );
    const cover = await request('/designs/' + first.design.id + '/cover');
    assert.equal(cover.status, 200);
    assert.match(cover.headers.get('content-type') || '', /image\/png/);
    assert.deepEqual(Buffer.from(await cover.arrayBuffer()), PREVIEW_PNG);
    assert.equal(
      (await request('/designs/' + first.design.id + '/cover', undefined, 'GET', '')).status,
      401,
    );
    assert.equal((await request('/tus/' + first.ticket)).status, 405);
    const files = await json('/spaces/' + shared.id + '/designs');
    assert.equal(files[0].id, first.design.id);
    assert.equal(files[0].folder_name, 'Design');
    const duplicate = await preflight(bytes, shared.id, folder.id, first.design.id);
    assert.equal(duplicate.kind, 'duplicate');
    assert.equal(duplicate.design.id, first.design.id);
    const reused = await preflight(bytes, shared.id, folder.id);
    assert.equal(reused.kind, 'reused');
    assert.equal(reused.design.status, 'ready');
    assert.notEqual(reused.design.id, first.design.id);
    const crossReuse = await preflight(bytes, shared.id, other.id);
    assert.equal(crossReuse.kind, 'reused');
    assert.equal(crossReuse.design.status, 'ready');
    assert.notEqual(crossReuse.design.id, first.design.id);
    const poison = Buffer.alloc(bytes.length, 9),
      claimed = 'c'.repeat(64),
      cross = await preflight(poison, shared.id, other.id, undefined, claimed);
    assert.equal(cross.kind, 'upload');
    assert.equal((await request('/designs/' + cross.design.id + '/retry', {})).status, 409);
    assert.equal(
      (await preflight(poison, shared.id, other.id, cross.design.id, claimed)).kind,
      'upload',
    );
    await create(cross.ticket, poison.length);
    await patch(cross.ticket, poison, 0);
    const failed = await wait(cross.design.id, 'failed');
    assert.match(failed.error, /校验/);
    assert.equal((await request('/designs/' + cross.design.id + '/manifest')).status, 409);
    assert.equal((await json('/designs/' + first.design.id)).status, 'ready');

    const secondBytes = await fixture('Second'),
      overwrite = await preflight(secondBytes, shared.id, folder.id, first.design.id);
    assert.equal(overwrite.kind, 'upload');
    assert.equal(overwrite.design.id, first.design.id);
    await create(overwrite.ticket, secondBytes.length);
    await patch(overwrite.ticket, secondBytes, 0);
    await wait(first.design.id);
    const secondManifest = await json('/designs/' + first.design.id + '/manifest');
    assert.equal(secondManifest.cover, undefined);
    assert.equal((await request('/designs/' + first.design.id + '/cover')).status, 404);
    assert.equal(
      (await json('/designs/' + first.design.id + '/pages/page')).layers[0].name,
      'Second',
    );
    const sameAgain = await preflight(secondBytes, shared.id, folder.id, first.design.id);
    assert.equal(sameAgain.kind, 'duplicate');
    assert.equal(sameAgain.design.id, first.design.id);

    const invitation = await json('/spaces/' + shared.id + '/invitations', {});
    const signup = await request('/register', { username: 'viewer', password: 'view12' });
    assert.equal(signup.status, 200);
    const signupCookie = signup.headers.get('set-cookie')!.split(';')[0];
    const viewerSpaces = await json('/spaces', undefined, signupCookie);
    assert.equal(viewerSpaces.length, 1);
    assert.equal(viewerSpaces[0].kind, 'personal');
    assert.equal(
      (await request('/invitations/' + invitation.token + '/accept', {}, 'POST', signupCookie))
        .status,
      200,
    );
    const login = await request('/login', { username: 'viewer', password: 'view12' });
    const viewerCookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await request('/designs/' + first.design.id + '/manifest', undefined, 'GET', viewerCookie))
        .status,
      200,
    );
    const visibleFiles = await request(
      '/spaces/' + shared.id + '/designs',
      undefined,
      'GET',
      viewerCookie,
    );
    assert.equal(visibleFiles.status, 200);
    const listed = (await visibleFiles.json()) as any[];
    assert.ok(listed.some((d) => d.folder_id === folder.id));
    assert.ok(listed.some((d) => d.folder_id === other.id));
    assert.equal(
      (
        await request(
          '/uploads/preflight',
          {
            spaceId: shared.id,
            folderId: folder.id,
            filename: 'x.sketch',
            sha256: 'a'.repeat(64),
            size: 1,
          },
          'POST',
          viewerCookie,
        )
      ).status,
      200,
    );

    const memberBytes = await fixture('Member');
    const memberDesign = await preflight(
      memberBytes,
      shared.id,
      folder.id,
      undefined,
      undefined,
      viewerCookie,
    );
    assert.equal(memberDesign.kind, 'upload');
    await create(memberDesign.ticket, memberBytes.length, viewerCookie);
    await patch(memberDesign.ticket, memberBytes, 0, viewerCookie);
    await wait(memberDesign.design.id, 'ready', viewerCookie);

    const steal = await request(
      '/uploads/preflight',
      {
        spaceId: shared.id,
        folderId: folder.id,
        designId: first.design.id,
        filename: 'x.sketch',
        sha256: createHash('sha256').update(memberBytes).digest('hex'),
        size: memberBytes.length,
      },
      'POST',
      viewerCookie,
    );
    assert.equal(steal.status, 403);
    const ownOverwrite = await preflight(
      memberBytes,
      shared.id,
      folder.id,
      memberDesign.design.id,
      createHash('sha256').update(memberBytes).digest('hex'),
      viewerCookie,
    );
    assert.equal(ownOverwrite.kind, 'duplicate');
    assert.equal(ownOverwrite.design.id, memberDesign.design.id);

    assert.equal(
      (await request('/designs/' + first.design.id, undefined, 'DELETE', viewerCookie)).status,
      403,
    );
    assert.equal(
      (await request('/designs/' + memberDesign.design.id, undefined, 'DELETE', viewerCookie))
        .status,
      200,
    );
    assert.equal(
      (await request('/designs/' + first.design.id, undefined, 'DELETE', cookie)).status,
      200,
    );
  } finally {
    await server.app.close();
    await rm(root, { recursive: true, force: true });
  }
});
