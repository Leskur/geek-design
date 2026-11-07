import { fontNames } from '../shared/fonts';
import { hasFont } from '../src/fonts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';
import { exactSpaceFont, matchingSpaceFonts } from '../src/space-fonts';

async function sampleFont() {
  for (const filename of [
    process.env.TEST_FONT_PATH,
    'C:/Windows/Fonts/AGENCYR.TTF',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  ]) {
    if (filename)
      try {
        return await readFile(filename);
      } catch {}
  }
}
test('space font library validates uploads, deduplicates and isolates space access', async (t) => {
  const root = await mkdtemp(path.resolve('.test-output/font-')),
    { app, store } = await createApp({ dataDir: root, startJobs: false });
  const call = (
    url: string,
    cookie = '',
    method: any = 'GET',
    payload?: any,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      url: '/api' + url,
      method,
      headers: { host: 'test.local', origin: 'http://test.local', cookie, ...extra },
      payload,
    });
  const signup = async (username: string) => {
    const r = await call('/register', '', 'POST', { username, password: 'abc123' });
    return { ...r.json(), cookie: 'sp_session=' + r.cookies[0].value };
  };
  const binary = { 'content-type': 'application/octet-stream', 'x-font-filename': 'sample.ttf' };
  try {
    const owner = await signup('owner'),
      member = await signup('member'),
      outsider = await signup('outsider'),
      space = (await call('/spaces', owner.cookie, 'POST', { name: 'Fonts' })).json(),
      other = (await call('/spaces', owner.cookie, 'POST', { name: 'Other' })).json();
    store.run("INSERT INTO space_members VALUES(?,?,'member')", space.id, member.id);
    assert.equal((await call(`/spaces/${space.id}/fonts`)).statusCode, 401);
    assert.equal((await call(`/spaces/${space.id}/fonts`, outsider.cookie)).statusCode, 404);
    assert.equal(
      (await call(`/spaces/${space.id}/fonts`, outsider.cookie, 'POST', Buffer.alloc(20), binary))
        .statusCode,
      404,
    );
    assert.equal(
      (await call(`/spaces/${space.id}/fonts`, member.cookie, 'POST', Buffer.alloc(20), binary))
        .statusCode,
      400,
    );
    assert.equal(
      (await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', Buffer.alloc(20), binary))
        .statusCode,
      400,
    );
    const malformed = Buffer.alloc(32);
    malformed.writeUInt32BE(0x10000);
    assert.equal(
      (await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', malformed, binary)).statusCode,
      400,
    );
    assert.equal(
      (
        await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', Buffer.alloc(20), {
          ...binary,
          'x-font-filename': '..%2Ffont.ttf',
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(
          `/spaces/${space.id}/fonts`,
          owner.cookie,
          'POST',
          Buffer.alloc(20 * 1024 ** 2 + 1),
          binary,
        )
      ).statusCode,
      413,
    );
    const bytes = await sampleFont();
    if (!bytes) {
      t.diagnostic('Valid font round-trip skipped: set TEST_FONT_PATH to exercise it');
      return;
    }
    const upload = await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', bytes, binary);
    assert.equal(upload.statusCode, 201, upload.body);
    const font = upload.json().font;
    assert.equal(font.created_by, owner.id);
    assert.ok(font.family);
    assert.ok(font.postscript_name);
    assert.ok(font.weight >= 1);
    const duplicate = await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', bytes, binary);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().duplicate, true);
    assert.equal(duplicate.json().font.id, font.id);
    assert.equal(
      (
        await call(
          `/spaces/${space.id}/fonts`,
          owner.cookie,
          'POST',
          Buffer.concat([bytes, Buffer.from([0])]),
          binary,
        )
      ).statusCode,
      409,
    );
    assert.equal((await call(`/spaces/${space.id}/fonts`, member.cookie)).json().length, 1);
    assert.equal((await call(`/spaces/${other.id}/fonts`, owner.cookie)).json().length, 0);
    const download = await app.inject({ url: font.url, headers: { cookie: member.cookie } });
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, bytes);
    assert.match(
      String(download.headers['content-disposition']),
      /attachment; filename="sample\.ttf"; filename\*=UTF-8''sample\.ttf/,
    );
    assert.equal(
      (await app.inject({ url: font.url, headers: { cookie: outsider.cookie } })).statusCode,
      404,
    );
    assert.equal(
      (await call(`/spaces/${other.id}/fonts/${font.id}`, owner.cookie)).statusCode,
      404,
    );
    const denied = await call(`/spaces/${space.id}/fonts/${font.id}`, member.cookie, 'DELETE');
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, '只能删除自己上传的字体');
    const folder = (
      await call('/folders', owner.cookie, 'POST', { spaceId: space.id, name: 'Folder' })
    ).json();
    store.run(
      "INSERT INTO designs(id,space_id,folder_id,name,created_by,status,created,updated) VALUES('d',?,?,'Design',?,'ready',1,1)",
      space.id,
      folder.id,
      owner.id,
    );
    assert.equal((await call('/designs/d/fonts', owner.cookie)).json().length, 1);
    assert.equal((await call('/designs/d/fonts', member.cookie)).json().length, 1);
    assert.equal((await call('/designs/d/fonts', outsider.cookie)).statusCode, 404);
    assert.equal(
      (await call(`/spaces/${space.id}/fonts/${font.id}`, owner.cookie, 'DELETE')).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: font.url, headers: { cookie: owner.cookie } })).statusCode,
      404,
    );
    const memberUpload = await call(
      `/spaces/${space.id}/fonts`,
      member.cookie,
      'POST',
      bytes,
      binary,
    );
    assert.equal(memberUpload.statusCode, 201, memberUpload.body);
    const memberFont = memberUpload.json().font;
    assert.equal(memberFont.created_by, member.id);
    assert.equal(
      (await call(`/spaces/${space.id}/fonts/${memberFont.id}`, member.cookie, 'DELETE'))
        .statusCode,
      200,
    );
    const ownedByMember = await call(
      `/spaces/${space.id}/fonts`,
      member.cookie,
      'POST',
      bytes,
      binary,
    );
    assert.equal(ownedByMember.statusCode, 201, ownedByMember.body);
    assert.equal(
      (
        await call(
          `/spaces/${space.id}/fonts/${ownedByMember.json().font.id}`,
          owner.cookie,
          'DELETE',
        )
      ).statusCode,
      200,
    );
    await call(`/spaces/${space.id}/fonts`, owner.cookie, 'POST', bytes, binary);
    assert.equal((await call(`/spaces/${space.id}`, owner.cookie, 'DELETE')).statusCode, 200);
    assert.equal(store.all('SELECT * FROM space_fonts').length, 0);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('font matching prefers an exact PostScript face and falls back to family aliases', () => {
  const regular = {
      id: 'r',
      family: 'Demo',
      full_name: 'Demo Regular',
      postscript_name: 'Demo-Regular',
    },
    bold = { id: 'b', family: 'Demo', full_name: 'Demo Bold', postscript_name: 'Demo-Bold' };
  const fonts = [regular, bold] as any;
  assert.deepEqual(
    matchingSpaceFonts(fonts, ['Demo-Bold']).map((f) => f.id),
    ['b'],
  );
  assert.deepEqual(
    matchingSpaceFonts(fonts, ['Demo']).map((f) => f.id),
    ['r', 'b'],
  );
  assert.deepEqual(matchingSpaceFonts(fonts, ['Missing']), []);
  assert.equal(exactSpaceFont(fonts, 'DIN-Bold'), undefined);
  assert.equal(exactSpaceFont(fonts, 'Demo-Bold')?.id, 'b');
  assert.equal(exactSpaceFont(fonts, 'Demo'), undefined);
});

test('loaded PostScript bold faces are recognized without normal-weight canvas probing', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: new Set([{ family: '"DIN-Bold"', weight: '700', status: 'loaded' }]),
        createElement: () => ({ getContext: () => null }),
      },
    });
    assert.equal(hasFont('DIN-Bold'), true);
    assert.equal(hasFont('DINCond-Bold'), false);
    assert.equal(hasFont('DIN-Regular'), false);
    (document.fonts as any).clear();
    (document.fonts as any).add({ family: 'DIN-Bold', status: 'error' });
    assert.equal(hasFont('DIN-Bold'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as any).document;
  }
});

test('page font discovery follows shared components once without expanding instances', () => {
  const font = (name: string) => ({ MSAttributedStringFontAttribute: { attributes: { name } } });
  const master: any = {
    _class: 'symbolMaster',
    style: { textStyle: { encodedAttributes: font('DIN-Bold') } },
    layers: [{ _class: 'symbolInstance', symbolID: 'shared' }],
  };
  const page: any = {
    layers: Array.from({ length: 100001 }, () => ({
      _class: 'symbolInstance',
      symbolID: 'shared',
    })),
  };
  assert.deepEqual(fontNames(page, { symbols: new Map([['shared', master]]) }), ['DIN-Bold']);
});
