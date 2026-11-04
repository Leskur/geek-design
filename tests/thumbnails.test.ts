import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server/app';
import { THUMBNAIL_VERSION } from '../server/thumbnail-jobs';
function crc(data: Buffer) {
  let n = 0xffffffff;
  for (const b of data) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function redPNG() {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.from(type),
      out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length);
    head.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([head, data])), data.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('server thumbnails render text and images, enforce access, resume and reuse existing output', async () => {
  const root = await mkdtemp(path.resolve('.test-output/thumbnails-'));
  let server = await createApp({ dataDir: root, startJobs: false });
  const call = (url: string, cookie = '', method: any = 'GET', payload?: any) =>
    server.app.inject({
      url: '/api' + url,
      method,
      headers: { host: 'test.local', origin: 'http://test.local', cookie },
      payload,
    });
  const signup = async (name: string) => {
    const r = await call('/register', '', 'POST', { username: name, password: 'abc123' });
    assert.equal(r.statusCode, 200, r.body);
    return { ...r.json(), cookie: 'sp_session=' + r.cookies[0].value };
  };
  try {
    const owner = await signup('owner'),
      outsider = await signup('outsider'),
      viewer = await signup('viewer'),
      team = (await call('/teams', owner.cookie, 'POST', { name: 'Team' })).json(),
      project = (
        await call('/projects', owner.cookie, 'POST', { teamId: team.id, name: 'App' })
      ).json();
    server.store.run("INSERT INTO team_members VALUES(?,?,'member')", team.id, viewer.id);
    server.store.run("INSERT INTO members VALUES(?,?,'viewer')", project.id, viewer.id);
    const key = 'b'.repeat(64) + '-sketch-core-1',
      dir = server.storage.path('artifacts', key),
      image = redPNG(),
      hash = createHash('sha256').update(image).digest('hex');
    await mkdir(path.dirname(server.storage.object(hash)), { recursive: true });
    await writeFile(server.storage.object(hash), image);
    await mkdir(dir + '/pages', { recursive: true });
    const frame = { x: 0, y: 0, width: 100, height: 100 },
      shape = {
        _class: 'rectangle',
        do_objectID: 'green',
        name: 'Green',
        frame,
        style: {
          fills: [{ isEnabled: true, fillType: 0, color: { red: 0, green: 1, blue: 0, alpha: 1 } }],
        },
      },
      bitmap = {
        _class: 'bitmap',
        do_objectID: 'image',
        name: 'Red image',
        frame: { x: 20, y: 20, width: 20, height: 20 },
        image: { _ref: 'images/red' },
      },
      text = {
        _class: 'text',
        do_objectID: 'text',
        name: 'Hello',
        frame: { x: 5, y: 60, width: 90, height: 25 },
        attributedString: {
          string: 'Hello',
          attributes: [
            {
              location: 0,
              length: 5,
              attributes: {
                MSAttributedStringFontAttribute: { attributes: { name: 'Arial', size: 16 } },
                MSAttributedStringColorAttribute: { red: 0, green: 0, blue: 0, alpha: 1 },
              },
            },
          ],
        },
      };
    await writeFile(
      dir + '/pages/0.json',
      JSON.stringify({
        _class: 'page',
        do_objectID: 'page',
        name: 'Page',
        frame,
        layers: [
          {
            _class: 'artboard',
            do_objectID: 'board',
            name: 'Board',
            frame,
            layers: [shape, bitmap, text],
          },
          { _class: 'artboard', do_objectID: 'second', name: 'Second', frame, layers: [] },
          ...Array.from({ length: 24 }, (_, i) => ({
            _class: 'artboard',
            do_objectID: 'extra' + i,
            name: 'Extra ' + i,
            frame: { x: 0, y: 0, width: 10, height: 10 },
            layers: [],
          })),
        ],
      }),
    );
    await writeFile(
      dir + '/manifest.json',
      JSON.stringify({
        pageFiles: { page: 'pages/0.json' },
        assets: { 'images/red.png': { hash, mime: 'image/png' } },
      }),
    );
    await writeFile(dir + '/symbols.json', JSON.stringify({ symbols: [], styles: [] }));
    server.store.run(
      "INSERT INTO artifacts(key,hash,version,status,created) VALUES(?,?,?,'ready',1)",
      key,
      'b'.repeat(64),
      'sketch-core-1',
    );
    server.store.run("INSERT INTO documents VALUES('doc',?,'Doc','revision',1)", project.id);
    server.store.run(
      "INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,artifact_key,status,created) VALUES('revision','doc',1,?,1,'x.sketch','',?,?,'ready',1)",
      'b'.repeat(64),
      owner.id,
      key,
    );
    const endpoint = `/revisions/revision/thumbnails/${THUMBNAIL_VERSION}/page/board`;
    assert.equal((await call(endpoint)).statusCode, 401);
    assert.equal((await call(endpoint, outsider.cookie)).statusCode, 404);
    assert.equal((await call(endpoint, owner.cookie)).statusCode, 202);
    assert.equal(
      (await call('/revisions/revision/thumbnails/retry', viewer.cookie, 'POST', {})).statusCode,
      403,
    );
    const wait = async () => {
      for (let i = 0; i < 160; i++) {
        const r = await call('/revisions/revision/thumbnails', owner.cookie),
          state = r.json();
        assert.equal(r.statusCode, 200, r.body);
        if (state.status === 'ready') return state;
        if (state.status === 'failed') assert.fail(state.error);
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.fail('thumbnail job timed out');
    };
    server.thumbnails.start();
    const status = await wait();
    assert.equal(status.completed, 26);
    assert.equal(status.total, 26);
    assert.equal((await call('/documents/doc/cover')).statusCode, 401);
    assert.equal((await call('/documents/doc/cover', outsider.cookie)).statusCode, 404);
    const cover = await call('/documents/doc/cover', viewer.cookie);
    assert.equal(cover.statusCode, 200);
    assert.match(String(cover.headers['content-type']), /image\/webp/);
    const coverMeta = await sharp(cover.rawPayload).metadata();
    assert.ok(coverMeta.width! <= 192);
    assert.ok(coverMeta.height! <= 768);
    const ownerManifest = (await call('/revisions/revision/manifest', owner.cookie)).json(),
      viewerManifest = (await call('/revisions/revision/manifest', viewer.cookie)).json();
    assert.deepEqual(ownerManifest.fontLibrary, { teamId: team.id, canUpload: true });
    assert.deepEqual(viewerManifest.fontLibrary, { teamId: team.id, canUpload: false });
    const result = await call(endpoint, viewer.cookie);
    assert.equal(result.statusCode, 200, result.body);
    assert.match(String(result.headers['content-type']), /image\/svg\+xml/);
    assert.match(String(result.headers['content-security-policy']), /sandbox/);
    const small = await call(endpoint + '?size=small', viewer.cookie);
    assert.equal(small.statusCode, 200);
    assert.match(String(small.headers['content-type']), /image\/webp/);
    const meta = await sharp(small.rawPayload).metadata();
    assert.ok(meta.width! <= 192 && meta.height! <= 768);
    const svg = result.body;
    assert.match(svg, /<svg[^>]+width="100"[^>]+height="100"/);
    assert.match(svg, /fill="rgba?\(0[, ]+255[, ]+0/);
    assert.match(svg, /data:image\/webp;base64,/);
    assert.match(svg, /<foreignObject/);
    assert.match(svg, /xmlns="http:\/\/www.w3.org\/1999\/xhtml"/);
    assert.match(svg, />Hello<\/span>/);
    assert.doesNotMatch(svg, /<script|<iframe|https?:\/\/(?!www.w3.org)/);

    assert.equal((await call(endpoint.replace('/page/', '/other/'), owner.cookie)).statusCode, 404);
    assert.equal(
      (await call(endpoint.replace('/board', '/unknown'), owner.cookie)).statusCode,
      404,
    );
    const firstPath = path.join(dir, 'thumbnails', THUMBNAIL_VERSION, status.items.page.board),
      secondPath = path.join(dir, 'thumbnails', THUMBNAIL_VERSION, status.items.page.second),
      before = (await stat(firstPath)).mtimeMs;
    await unlink(secondPath);
    server.store.run("UPDATE thumbnail_jobs SET status='failed',error='preview test failure'");
    assert.equal((await call(endpoint.replace('/board', '/second'), owner.cookie)).statusCode, 503);
    assert.equal((await call('/revisions/revision', owner.cookie)).json().status, 'ready');
    assert.equal(
      (await call('/revisions/revision/thumbnails/retry', owner.cookie, 'POST', {})).statusCode,
      200,
    );
    server.store.run("UPDATE thumbnail_jobs SET status='running',completed=1");
    await server.app.close();
    server = await createApp({ dataDir: root, startJobs: false });
    server.thumbnails.start();
    await wait();
    assert.equal((await stat(firstPath)).mtimeMs, before);
    assert.ok((await stat(secondPath)).size > 8);
    assert.equal(server.store.all('SELECT * FROM thumbnail_jobs').length, 1);
    server.store.run("INSERT INTO documents VALUES('doc2',?,'Reused','revision2',1)", project.id);
    server.store.run(
      "INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,artifact_key,status,created) VALUES('revision2','doc2',1,?,1,'x.sketch','',?,?,'ready',1)",
      'b'.repeat(64),
      owner.id,
      key,
    );
    assert.equal(
      (await call(endpoint.replace('/revision/', '/revision2/'), owner.cookie)).statusCode,
      200,
    );
    assert.equal(server.store.all('SELECT * FROM thumbnail_jobs').length, 1);
  } finally {
    await server.app.close();
  }
});
