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
  assert.match(html,/正在打开设计/);assert.match(html,/页面/);assert.match(html,/role="status"/);
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
 const html=renderToStaticMarkup(<TeamOverview {...props}/>);assert.match(html,/团队项目/);assert.match(html,/href="\/projects\/p"/);assert.match(html,/href="\/teams\/t\/members"/);assert.match(html,/新建项目/);
 assert.doesNotMatch(renderToStaticMarkup(<TeamOverview {...props} team={{...props.team,role:'member'}}/>),/新建项目/);
});

test('viewer provides a project return without a redundant design switcher',()=>{const html=renderToStaticMarkup(<ViewerNavigation projectId="p"/>);assert.match(html,/href="\/projects\/p"/);assert.match(html,/返回项目/);assert.doesNotMatch(html,/切换设计/);});
