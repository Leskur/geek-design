import test from 'node:test';
import assert from 'node:assert/strict';
import {pageBounds,fitPage,zoomPage,boardVisible,matchesLayer} from '../src/overview';
import {SceneCache} from '../src/SceneCache';
import type {Layer,DocumentSource} from '../src/sketch';
const board=(id:string,x:number,y:number,w=414,h=1000):Layer=>({_class:'artboard',do_objectID:id,name:id,frame:{x,y,width:w,height:h},layers:[]});
test('overview fits original negative coordinates and far-apart boards without a minimum 10% zoom',()=>{
 const boards=[board('a',-1000,-500),board('b',20000,10000)];const bounds=pageBounds(boards);assert.deepEqual(bounds,{x:-1000,y:-500,width:21414,height:11500});const camera=fitPage(bounds,800,600);assert.ok(camera.scale<.1);for(const b of boards)assert.ok(boardVisible(b,camera,800,600,0));assert.deepEqual(pageBounds([]),{x:0,y:0,width:1,height:1});
});
test('overview zoom preserves the point under the pointer and culls offscreen boards',()=>{
 const old={x:30,y:20,scale:.01},anchor={x:350,y:210},next=zoomPage(old,.2,anchor);assert.ok(Math.abs((anchor.x-old.x)/old.scale-(anchor.x-next.x)/next.scale)<1e-8);assert.equal(boardVisible(board('far',100000,0),next,800,600),false);assert.equal(zoomPage(old,100,anchor).scale,4);
});
test('unified search finds board names, nested text and component override content',()=>{
 const b=board('Opening',0,0);b.layers=[{_class:'text',do_objectID:'t',name:'标题',frame:{x:0,y:0,width:50,height:20},attributedString:{string:'开发协作'}}];assert.equal(matchesLayer(b,'opening'),true);assert.equal(matchesLayer(b,'协作'),true);assert.equal(matchesLayer(b,'unknown'),false);b.layers.push({...b.layers[0],attributedString:undefined,overrideValues:[{value:'发票抬头'}]});assert.equal(matchesLayer(b,'发票'),true);
});
test('resolved preview scenes reuse a bounded cache without modifying source boards',()=>{
 const cache=new SceneCache({symbols:new Map(),styles:new Map()} as DocumentSource,2),a=board('a',0,0),before=JSON.stringify(a);const first=cache.get(a);assert.equal(cache.get(a),first);cache.get(board('b',0,0));cache.get(board('c',0,0));assert.notEqual(cache.get(a),first);assert.equal(JSON.stringify(a),before);
});
