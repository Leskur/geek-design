import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignList, type DesignSummary } from '../src/workspace/DesignList';

const design: DesignSummary = {
  id: 'design',
  space_id: 'space',
  folder_id: 'folder',
  name: 'Example',
  status: 'ready',
  created: 1,
};
function render(
  files: DesignSummary[],
  manager = false,
  folder: { id: string } | null = { id: 'folder' },
) {
  return renderToStaticMarkup(
    <DesignList
      spaceId="space"
      folder={folder}
      emptyFolder={!files.length}
      designsLoaded={true}
      visibleFiles={files}
      listView={false}
      mayUpload={manager}
      active={false}
      beginUpload={() => {}}
      setFileMenu={() => {}}
      copyLink={async () => {}}
      canDeleteFile={() => manager}
      canOverwriteFile={() => manager}
      canMoveFile={() => manager}
      requestEdit={() => {}}
      requestDelete={() => {}}
    />,
  );
}
test('folder designs open space design paths and restrict write actions to editors', () => {
  const viewer = render([design]);
  assert.match(viewer, /href="\/spaces\/space\/designs\/design"/);
  assert.match(viewer, /复制链接/);
  assert.doesNotMatch(viewer, /覆盖上传|重命名设计|移动到文件夹|删除设计/);
  const editor = render([design], true);
  for (const label of ['覆盖上传', '重命名设计', '移动到文件夹', '删除设计'])
    assert.ok(editor.includes(label));
});
test('failed designs remain accessible through their folder and root designs use space path', () => {
  const failed = render([{ ...design, status: 'failed' }]);
  assert.match(failed, /href="\/folders\/folder"/);
  assert.match(failed, /失败/);
  assert.doesNotMatch(failed, /aria-label="复制链接"/);
  const root = render([{ ...design, folder_id: null }], true, null);
  assert.match(root, /href="\/spaces\/space\/designs\/design"/);
  assert.match(root, /覆盖上传/);
});
test("members can upload but cannot overwrite someone else's design", () => {
  const html = renderToStaticMarkup(
    <DesignList
      spaceId="space"
      folder={{ id: 'folder' }}
      emptyFolder={false}
      designsLoaded={true}
      visibleFiles={[{ ...design, created_by: 'other' }]}
      listView={false}
      mayUpload={true}
      active={false}
      beginUpload={() => {}}
      setFileMenu={() => {}}
      copyLink={async () => {}}
      canDeleteFile={(d) => d.created_by === 'me'}
      canOverwriteFile={(d) => d.created_by === 'me'}
      canMoveFile={() => true}
      requestEdit={() => {}}
      requestDelete={() => {}}
    />,
  );
  assert.match(html, /复制链接/);
  assert.doesNotMatch(html, /覆盖上传|重命名设计|移动到文件夹|删除设计/);
});
test('empty folders offer upload only to editors', () => {
  assert.match(render([]), /等待伙伴上传即可/);
  assert.doesNotMatch(render([]), /上传 Sketch<\/button>/);
  assert.match(render([], true), /上传 Sketch<\/button>/);
});
