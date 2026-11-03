import {FontPanel} from '../src/FontPanel';
import {Inspector} from '../src/Inspector';
import {TeamTree} from '../src/TeamTree';
import {TeamPageHeader} from '../src/TeamPageHeader';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {App} from '../src/App';
import {DocumentOpening} from '../src/DocumentOpening';
import {ViewerNavigation} from '../src/ViewerNavigation';
import {TeamOverview} from '../src/TeamOverview';

test('a direct design URL renders the viewer loading shell on its very first render',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('http://test.local/projects/p/documents/d/revisions/r')});
  const html=renderToStaticMarkup(<App/>);
  assert.match(html,/正在打开设计/);assert.match(html,/opening-sidebar/);assert.match(html,/role="status"/);
  assert.doesNotMatch(html,/设计稿，打开就能看|将 .sketch 文件拖到这里|MADE FOR DEVELOPERS/);
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('http://test.local/local')});
  const local=renderToStaticMarkup(<App/>);assert.match(local,/打开本地 Sketch/);assert.doesNotMatch(local,/<header/);
 }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete (globalThis as any).location;}
});
test('failed design loading keeps a recoverable viewer state instead of the welcome screen',()=>{
 const html=renderToStaticMarkup(<DocumentOpening status="" error="记录不存在或无权访问" onRetry={()=>{}}/>);
 assert.match(html,/role="alert"/);assert.match(html,/记录不存在或无权访问/);assert.match(html,/重试/);assert.match(html,/返回工作台/);
 assert.doesNotMatch(html,/设计稿，打开就能看/);
});
test('team overview shows its projects and keeps project creation behind team roles',()=>{
 const props={team:{id:'t',name:'H5',member_count:2,role:'owner'},projects:[{id:'p',name:'Mobile'}],files:[{project_id:'p'}],onCreateProject:()=>{}};
 const html=renderToStaticMarkup(<TeamOverview {...props}/>);assert.match(html,/搜索项目/);assert.match(html,/href="\/projects\/p"/);assert.doesNotMatch(html,/>新建项目<\/button>/);
 assert.doesNotMatch(renderToStaticMarkup(<TeamOverview {...props} team={{...props.team,role:'member'}}/>),/新建项目/);
});

test('viewer provides a project return without a redundant design switcher',()=>{const html=renderToStaticMarkup(<ViewerNavigation projectId="p"/>);assert.match(html,/href="\/projects\/p"/);assert.match(html,/返回项目/);assert.doesNotMatch(html,/切换设计/);});

test('detail header returns to overview with an icon button and no project link',()=>{
 const html=renderToStaticMarkup(<ViewerNavigation projectId="p" detail onOverview={()=>{}}/>);
 assert.match(html,/<button/);assert.match(html,/aria-label="返回总览"/);assert.doesNotMatch(html,/href=|返回项目|fu-h5/);
});

test('opening keeps all visible copy in the center and uses indeterminate loading',()=>{
 const html=renderToStaticMarkup(<DocumentOpening status="读取组件和页面…" error="" onRetry={()=>{}}/>);
 assert.match(html,/opening-spinner/);assert.match(html,/aria-busy="true"/);
 assert.doesNotMatch(html,/role="progressbar"|设计检查|<h2/);
 assert.equal(html.replace(/<main[\s\S]*?<\/main>/,'').replace(/<[^>]*>/g,'').trim(),'');
});

test('team projects and members share a header and clear active navigation',()=>{
 const props={team:{id:'t',name:'Design',member_count:3,role:'owner'},projectCount:2,fileCount:8,onRename:()=>{},onDelete:()=>{},onInvite:()=>{},onCreateProject:()=>{}};
 const projects=renderToStaticMarkup(<TeamPageHeader {...props} members={false}/>),members=renderToStaticMarkup(<TeamPageHeader {...props} members/>);
 assert.match(projects,/href="\/teams\/t" aria-current="page"/);assert.match(members,/href="\/teams\/t\/members" aria-current="page"/);
 assert.match(projects,/设置/);assert.match(projects,/邀请成员/);assert.match(projects,/新建项目/);assert.match(members,/>Design<\/h1>/);
});

test('sidebar lists teams without repeating project creation and empty-project prompts',()=>{
 const html=renderToStaticMarkup(<TeamTree userId="u" teams={[{id:'a',name:'Alpha',role:'owner'},{id:'b',name:'Beta',role:'owner'}]} projects={[]} activeTeamId="a" overviewPage busy={false} onCreateTeam={()=>{}} onCreateProject={()=>{}} onDelete={()=>{}}/>);
 assert.match(html,/团队列表/);assert.match(html,/新增团队/);assert.doesNotMatch(html,/wb-tree-heading/);assert.match(html,/href="\/teams\/a" aria-current="page"/);
 assert.doesNotMatch(html,/新建项目|还没有项目|等待分配项目|aria-expanded|wb-tree-projects/);
});

test('empty project list provides creation in place only for team managers',()=>{
 const props={team:{id:'t',role:'owner'},projects:[],files:[],onCreateProject:()=>{}};
 assert.match(renderToStaticMarkup(<TeamOverview {...props}/>),/>新建项目<\/button>/);
 assert.doesNotMatch(renderToStaticMarkup(<TeamOverview {...props} team={{id:'t',role:'member'}}/>),/>新建项目<\/button>/);
});

test('sidebar auto-expands the active project without creation or empty prompts',()=>{
 const html=renderToStaticMarkup(<TeamTree userId="u" teams={[{id:'a',name:'Alpha',role:'owner'}]} projects={[{id:'p',name:'Project',team_id:'a'}]} activeTeamId="a" activeProjectId="p" overviewPage={false} busy={false} onCreateTeam={()=>{}} onCreateProject={()=>{}} onDelete={()=>{}}/>);
 assert.match(html,/aria-expanded="true"/);assert.match(html,/href="\/projects\/p" aria-current="page"/);assert.doesNotMatch(html,/href="\/teams\/a" aria-current="page"/);assert.doesNotMatch(html,/wb-tree-team current/);assert.doesNotMatch(html,/新建项目|还没有项目|等待分配项目/);
});

test('container inspector prioritizes own layout and CSS before export and ignores child text panels',()=>{
 const child:any={_class:'text',do_objectID:'child',frame:{x:0,y:0,width:20,height:20},attributedString:{string:'Nested copy',attributes:[]}};
 const group:any={_class:'group',do_objectID:'container',name:'Card',frame:{x:0,y:0,width:100,height:100},layers:[child]};
 const html=renderToStaticMarkup(<Inspector selected={group} root={group} doc={{} as any} onCopy={()=>{}} onLoadFont={()=>{}}/>);
 assert.ok(html.indexOf('>布局</h4>')<html.indexOf('>CSS</h4>'));
 assert.ok(html.indexOf('>CSS</h4>')<html.indexOf('aria-label="资源导出"'));
 assert.doesNotMatch(html,/developer-copy-content|developer-typography|developer-assets/);
 assert.ok(html.indexOf('复制 width')<html.indexOf('复制 x'));
});

test('font panel distinguishes local loading, team permissions and failed team loads',()=>{
 const render=(doc:any)=>renderToStaticMarkup(<FontPanel doc={doc} fonts={[{name:'DIN-Bold',available:false}]} status="" onClose={()=>{}} onLoad={()=>{}}/>);
 const local=render({source:'local'});assert.match(local,/不会上传|刷新/);assert.doesNotMatch(local,/字体库/);
 const owner=render({source:'team',fontLibrary:{teamId:'abc',canUpload:true}});assert.match(owner,/前往字体库上传/);assert.match(owner,/href="\/teams\/abc\/fonts"/);
 const viewer=render({source:'team',fontLibrary:{teamId:'abc',canUpload:false}});assert.match(viewer,/联系团队管理员/);assert.doesNotMatch(viewer,/前往字体库上传/);
 const failed=render({source:'team',fontLoadError:()=> 'Network failed',retryFonts:async()=>{}});assert.match(failed,/团队字体加载失败/);assert.match(failed,/重试加载/);assert.match(failed,/临时加载/);
});
