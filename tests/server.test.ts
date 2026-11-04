import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { createApp } from '../server/app';

test('team upload: resume, verification, deduplication, permissions and fixed revisions', async () => {
  const root = await mkdtemp(path.resolve('.test-output/team-'));
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
  const json = async (url: string, body?: any) => {
    const r = await request(url, body);
    assert.equal(r.status, 200, await r.clone().text());
    return r.json() as Promise<any>;
  };
  const fixture = async (name: string) => {
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
    return Buffer.from(await (await zip.close()).arrayBuffer());
  };
  const preflight = async (
    bytes: Buffer,
    projectId: string,
    documentId?: string,
    hash = createHash('sha256').update(bytes).digest('hex'),
  ) =>
    json('/uploads/preflight', {
      projectId,
      documentId,
      filename: 'example.sketch',
      sha256: hash,
      size: bytes.length,
    });
  const patch = async (ticket: string, bytes: Buffer, offset: number) => {
    const r = await fetch(base + '/api/tus/' + ticket, {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        Origin: base,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: bytes,
    });
    assert.equal(r.status, 204, await r.text());
  };
  const create = async (ticket: string, length: number) => {
    const r = await fetch(base + '/api/tus', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: base,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(length),
        'Upload-Metadata': 'ticket ' + Buffer.from(ticket).toString('base64'),
      },
    });
    assert.equal(r.status, 201, await r.text());
  };
  const wait = async (id: string, status = 'ready') => {
    for (let i = 0; i < 150; i++) {
      const r = await json('/revisions/' + id);
      if (r.status === status) return r;
      if (r.status === 'failed') assert.fail(r.error);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail('processing timed out');
  };
  try {
    assert.equal((await request('/projects')).status, 401);
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
    const team = await json('/teams', { name: 'Team' });
    const project = await json('/projects', { teamId: team.id, name: 'Design' }),
      other = await json('/projects', { teamId: team.id, name: 'Other' }),
      bytes = await fixture('First');
    const first = await preflight(bytes, project.id);
    assert.equal(first.kind, 'upload');
    await create(first.ticket, bytes.length);
    const split = Math.floor(bytes.length / 2);
    await patch(first.ticket, bytes.subarray(0, split), 0);
    assert.equal((await json('/uploads/' + first.ticket)).offset, split);
    await server.app.close();
    server = await createApp({ dataDir: root });
    base = await server.app.listen({ port: 0, host: '127.0.0.1' });
    assert.equal((await preflight(bytes, project.id, first.documentId)).ticket, first.ticket);
    await patch(first.ticket, bytes.subarray(split), split);
    await wait(first.revision.id);
    const manifest = await json('/revisions/' + first.revision.id + '/manifest');
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.projectId, project.id);
    assert.equal(manifest.documentId, first.documentId);
    assert.equal(
      (await json('/revisions/' + first.revision.id + '/pages/page')).layers[0].name,
      'First',
    );
    assert.equal((await request('/tus/' + first.ticket)).status, 405);
    const files = await json('/teams/' + team.id + '/files');
    assert.equal(files[0].id, first.documentId);
    assert.equal(files[0].project_name, 'Design');
    const duplicate = await preflight(bytes, project.id, first.documentId);
    assert.equal(duplicate.kind, 'duplicate');
    assert.equal(duplicate.revision.id, first.revision.id);
    assert.equal((await json('/documents/' + first.documentId)).revisions.length, 1);
    const reused = await preflight(bytes, project.id);
    assert.equal(reused.kind, 'reused');
    assert.equal(reused.revision.status, 'ready');
    const cross = await preflight(bytes, other.id);
    assert.equal(cross.kind, 'upload');
    assert.equal((await request('/revisions/' + cross.revision.id + '/retry', {})).status, 409);
    assert.equal((await preflight(bytes, other.id, cross.documentId)).kind, 'upload');
    // Claiming the known hash without the actual bytes must never grant access.
    await create(cross.ticket, bytes.length);
    await patch(cross.ticket, Buffer.alloc(bytes.length), 0);
    const failed = await wait(cross.revision.id, 'failed');
    assert.match(failed.error, /校验/);
    assert.equal((await request('/revisions/' + cross.revision.id + '/manifest')).status, 409);
    assert.equal((await json('/revisions/' + first.revision.id)).status, 'ready');
    const secondBytes = await fixture('Second'),
      second = await preflight(secondBytes, project.id, first.documentId);
    await create(second.ticket, secondBytes.length);
    await patch(second.ticket, secondBytes, 0);
    await wait(second.revision.id);
    assert.equal(
      (await json('/documents/' + first.documentId)).current_revision,
      second.revision.id,
    );
    await preflight(bytes, project.id, first.documentId);
    assert.equal(
      (await json('/documents/' + first.documentId)).current_revision,
      second.revision.id,
    );
    assert.equal(
      (await json('/revisions/' + first.revision.id + '/pages/page')).layers[0].name,
      'First',
    );
    const invitation = await json('/teams/' + team.id + '/invitations', { role: 'member' });
    const signup = await request('/register', { username: 'viewer', password: 'view12' });
    const viewer = (await signup.json()) as any;
    const signupCookie = signup.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await request('/invitations/' + invitation.token + '/accept', {}, 'POST', signupCookie))
        .status,
      200,
    );
    await json('/projects/' + project.id + '/members', { userId: viewer.id, role: 'viewer' });
    const login = await request('/login', { username: 'viewer', password: 'view12' });
    const viewerCookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (
        await request(
          '/revisions/' + first.revision.id + '/manifest',
          undefined,
          'GET',
          viewerCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/projects/' + other.id + '/documents', undefined, 'GET', viewerCookie))
        .status,
      404,
    );
    const visibleFiles = await request(
      '/teams/' + team.id + '/files',
      undefined,
      'GET',
      viewerCookie,
    );
    assert.equal(visibleFiles.status, 200);
    assert.ok(((await visibleFiles.json()) as any[]).every((d) => d.project_id === project.id));
    assert.equal(
      (
        await request(
          '/uploads/preflight',
          { projectId: project.id, filename: 'x.sketch', sha256: 'a'.repeat(64), size: 1 },
          'POST',
          viewerCookie,
        )
      ).status,
      403,
    );
  } finally {
    await server.app.close();
  }
});
