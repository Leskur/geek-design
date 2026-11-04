import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignList, type DesignSummary } from '../src/workspace/DesignList';

const design: DesignSummary = {
  id: 'design',
  project_id: 'project',
  name: 'Example',
  current_revision: 'revision',
  status: 'ready',
  created: 1,
};
function render(
  files: DesignSummary[],
  manager = false,
  project: { id: string } | null = { id: 'project' },
) {
  return renderToStaticMarkup(
    <DesignList
      project={project}
      emptyProject={!files.length}
      documentsLoaded={true}
      visibleFiles={files}
      search=""
      setSearch={() => {}}
      sort="updated"
      changeSort={() => {}}
      listView={false}
      changeView={() => {}}
      mayUpload={manager}
      active={false}
      beginUpload={() => {}}
      setFileMenu={() => {}}
      loadDocument={async () => {}}
      copyLink={async () => {}}
      canDeleteFile={() => manager}
      canMoveFile={() => manager}
      requestEdit={() => {}}
      requestDelete={() => {}}
    />,
  );
}
test('project designs keep immutable revision links and restrict write actions to editors', () => {
  const viewer = render([design]);
  assert.match(viewer, /href="\/projects\/project\/documents\/design\/revisions\/revision"/);
  assert.match(viewer, /上传记录/);
  assert.match(viewer, /复制链接/);
  assert.doesNotMatch(viewer, /上传新稿|重命名设计|移动到项目|删除设计/);
  const editor = render([design], true);
  for (const label of ['上传新稿', '重命名设计', '移动到项目', '删除设计'])
    assert.ok(editor.includes(label));
});
test('failed designs remain accessible through their document and recent designs link to their project', () => {
  const failed = render([{ ...design, current_revision: undefined, status: 'failed' }]);
  assert.match(failed, /href="\/projects\/project\/documents\/design"/);
  assert.match(failed, /失败/);
  assert.doesNotMatch(failed, /aria-label="复制链接"/);
  const recent = render([design], false, null);
  assert.match(recent, /href="\/projects\/project"/);
  assert.match(recent, /前往项目/);
  assert.doesNotMatch(recent, /上传记录/);
});
test('empty projects offer upload only to editors', () => {
  assert.match(render([]), /等待伙伴上传即可/);
  assert.doesNotMatch(render([]), /上传 Sketch<\/button>/);
  assert.match(render([], true), /上传 Sketch<\/button>/);
});
