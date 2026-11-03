import {exportSize,exportBounds,visiblePixelBounds} from '../src/selection-export';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BlobReader,TextWriter,ZipReader} from '@zip.js/zip.js';
import {createAIPackage,defaultExportOptions,exportRoot,resourceRefs,safeName} from '../src/ai-export';
import type {Layer,DocumentSource} from '../src/sketch';
const child:Layer={_class:'rectangle',do_objectID:'icon',name:'Icon',frame:{x:12,y:8,width:20,height:20},style:{fills:[{isEnabled:true,fillType:0,color:{red:1,green:0,blue:0,alpha:1}}]}};
const root:Layer={_class:'group',do_objectID:'module',name:'模块',frame:{x:100,y:200,width:100,height:80},layers:[child]};
const doc={file:{name:'test.sketch'},image:async()=>{throw new Error('unexpected image');}} as unknown as DocumentSource;
async function entries(blob:Blob){const reader=new ZipReader(new BlobReader(blob));const result=new Map<string,string>();for(const entry of await reader.getEntries())if(!entry.directory)result.set(entry.filename,await entry.getData(new TextWriter()));await reader.close();return result;}
test('partial package normalizes only root and includes selected content without siblings',async()=>{const files=await entries(await createAIPackage(doc,root,{...defaultExportOptions,html:true},{board:'Page',page:'UI',warnings:[]},()=>{}));const design=JSON.parse(files.get('design.json')!);assert.equal(design.root.frame.x,0);assert.equal(design.root.frame.y,0);assert.equal(design.root.layers[0].frame.x,12);assert.equal(design.scope.originalFrame.x,100);assert.equal(root.frame.x,100);assert.match(files.get('preview.svg')!,/translate\(12 8\)/);assert.match(files.get('index.html')!,/<!doctype html>/);assert.ok(files.has('assets/vector-001.svg'));assert.match(files.get('README.md')!,/模块/);const manifest=JSON.parse(files.get('manifest.json')!);assert.deepEqual(manifest.files.sort(),[...files.keys()].sort());});
test('content switches omit unchecked files and reject empty selection',async()=>{const options={preview:false,structure:true,assets:false,instructions:false,html:false};const files=await entries(await createAIPackage(doc,root,options,{board:'Page',page:'UI',warnings:[]},()=>{}));assert.deepEqual([...files.keys()],['design.json','manifest.json']);await assert.rejects(()=>createAIPackage(doc,root,{...options,structure:false},{board:'',page:'',warnings:[]},()=>{}));});
test('resource refs deduplicate bitmap and fills; filenames cannot escape ZIP root',()=>{assert.deepEqual(resourceRefs({...root,image:{_ref:'images/a'},style:{fills:[{image:{_ref:'images/a'}},{image:{_ref:'images/b'}}]}}),['images/a','images/b']);assert.equal(exportRoot(root).frame.y,0);assert.ok(!safeName('../a/b').includes('/'));});

test('selection exports size rotated layers and reject oversized canvases',()=>{
 const layer:any={frame:{x:30,y:40,width:120,height:20},rotation:90};
 assert.deepEqual(exportSize(layer,2),{width:40,height:240});
 assert.ok(Math.abs(exportBounds(layer).x-50)<.0001);
 assert.throws(()=>exportSize({...layer,frame:{width:20000,height:20000}},3),/尺寸/);
 assert.throws(()=>exportSize({...layer,frame:{width:0,height:0}},2),/尺寸/);
});

test('selection crop trims transparent margins and retains translucent edge pixels',()=>{
 const data=new Uint8ClampedArray(10*8*4);data[(2*10+3)*4+3]=255;data[(5*10+7)*4+3]=1;
 assert.deepEqual(visiblePixelBounds(data,10,8),{x:3,y:2,width:5,height:4});
 assert.equal(visiblePixelBounds(new Uint8ClampedArray(4*4*4),4,4),null);
});
