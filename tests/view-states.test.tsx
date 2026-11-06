import { FontPanel } from '../src/FontPanel';
import { Inspector } from '../src/Inspector';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';
import { DocumentOpening } from '../src/DocumentOpening';
import { ViewerNavigation } from '../src/ViewerNavigation';
import { TeamOverview } from '../src/TeamOverview';

test('a direct design URL renders the viewer loading shell on its very first render', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('http://test.local/spaces/s/designs/d'),
    });
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /正在打开设计/);
    assert.match(html, /opening-sidebar/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /设计稿，打开就能看|将 .sketch 文件拖到这里|MADE FOR DEVELOPERS/);
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('http://test.local/local'),
    });
    const local = renderToStaticMarkup(<App />);
    assert.match(local, /打开本地 Sketch/);
    assert.doesNotMatch(local, /<header/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete (globalThis as any).location;
  }
});
test('failed design loading keeps a recoverable viewer state instead of the welcome screen', () => {
  const html = renderToStaticMarkup(
    <DocumentOpening status="" error="记录不存在或无权访问" onRetry={() => {}} />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /记录不存在或无权访问/);
  assert.match(html, /重试/);
  assert.match(html, /返回工作台/);
  assert.doesNotMatch(html, /设计稿，打开就能看/);
});
test('space overview shows its folders and keeps folder creation available', () => {
  const props = {
    team: { id: 't', name: 'H5', member_count: 2, role: 'owner', kind: 'shared' },
    folders: [{ id: 'p', name: 'Mobile' }],
    files: [{ folder_id: 'p' }],
    onCreateFolder: () => {},
  };
  const html = renderToStaticMarkup(<TeamOverview {...props} />);
  assert.doesNotMatch(html, /搜索文件夹/);
  assert.match(html, /href="\/folders\/p"/);
  assert.doesNotMatch(html, />新建文件夹<\/button>/);
});

test('viewer provides a folder return without a redundant design switcher', () => {
  const html = renderToStaticMarkup(<ViewerNavigation folderId="p" />);
  assert.match(html, /href="\/folders\/p"/);
  assert.match(html, /返回文件夹/);
  assert.doesNotMatch(html, /切换设计/);
});

test('viewer falls back to space when folder is absent', () => {
  const html = renderToStaticMarkup(<ViewerNavigation spaceId="s" />);
  assert.match(html, /href="\/spaces\/s"/);
  assert.match(html, /返回空间/);
});

test('detail header returns to overview with an icon button and no folder link', () => {
  const html = renderToStaticMarkup(
    <ViewerNavigation folderId="p" detail onOverview={() => {}} />,
  );
  assert.match(html, /<button/);
  assert.match(html, /aria-label="返回总览"/);
  assert.doesNotMatch(html, /href=|返回文件夹|fu-h5/);
});

test('opening keeps all visible copy in the center and uses indeterminate loading', () => {
  const html = renderToStaticMarkup(
    <DocumentOpening status="读取组件和页面…" error="" onRetry={() => {}} />,
  );
  assert.match(html, /opening-spinner/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /role="progressbar"|设计检查|<h2/);
  assert.equal(
    html
      .replace(/<main[\s\S]*?<\/main>/, '')
      .replace(/<[^>]*>/g, '')
      .trim(),
    '',
  );
});

test('container inspector prioritizes own layout and CSS before export and ignores child text panels', () => {
  const child: any = {
    _class: 'text',
    do_objectID: 'child',
    frame: { x: 0, y: 0, width: 20, height: 20 },
    attributedString: { string: 'Nested copy', attributes: [] },
  };
  const group: any = {
    _class: 'group',
    do_objectID: 'container',
    name: 'Card',
    frame: { x: 0, y: 0, width: 100, height: 100 },
    layers: [child],
  };
  const html = renderToStaticMarkup(
    <Inspector
      selected={group}
      root={group}
      doc={{} as any}
      onCopy={() => {}}
      onLoadFont={() => {}}
    />,
  );
  assert.ok(html.indexOf('>布局</h4>') < html.indexOf('>CSS</h4>'));
  assert.ok(html.indexOf('>CSS</h4>') < html.indexOf('aria-label="导出设置"'));
  assert.doesNotMatch(html, /developer-copy-content|developer-typography|developer-assets/);
  assert.ok(html.indexOf('复制 width') < html.indexOf('复制 x'));
});

test('font panel distinguishes local loading, space permissions and failed space loads', () => {
  const render = (doc: any) =>
    renderToStaticMarkup(
      <FontPanel
        doc={doc}
        fonts={[{ name: 'DIN-Bold', available: false }]}
        status=""
        onClose={() => {}}
        onLoad={() => {}}
      />,
    );
  const local = render({ source: 'local' });
  assert.match(local, /不会上传|刷新/);
  assert.doesNotMatch(local, /字体库/);
  const owner = render({ source: 'team', fontLibrary: { spaceId: 'abc', canUpload: true } });
  assert.match(owner, /前往字体库上传/);
  assert.match(owner, /href="\/spaces\/abc\/resources"/);
  const viewer = render({ source: 'team', fontLibrary: { spaceId: 'abc', canUpload: false } });
  assert.match(viewer, /联系空间拥有者/);
  assert.doesNotMatch(viewer, /前往字体库上传/);
  const failed = render({
    source: 'team',
    fontLoadError: () => 'Network failed',
    retryFonts: async () => {},
  });
  assert.match(failed, /空间字体加载失败/);
  assert.match(failed, /重试加载/);
  assert.match(failed, /临时加载/);
});
