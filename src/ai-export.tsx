import {renderToStaticMarkup} from 'react-dom/server';
import {BlobReader,BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js';
import type {DocumentSource,Layer} from './sketch';
import {color} from './sketch';
import {Node,Children} from './renderer';
import {fontNames} from './fonts';

export type ExportOptions={preview:boolean;structure:boolean;assets:boolean;instructions:boolean;html:boolean};
export const defaultExportOptions:ExportOptions={preview:true,structure:true,assets:true,instructions:true,html:false};
export function safeName(name:string){return name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,80)||'design';}
export function exportRoot(layer:Layer):Layer{return {...layer,frame:{...layer.frame,x:0,y:0}};}
export function resourceRefs(layer:Layer){const refs=new Set<string>();function visit(l:Layer){if(l.image?._ref)refs.add(l.image._ref);for(const p of [...l.style?.fills||[],...l.style?.borders||[]])if(p.image?._ref)refs.add(p.image._ref);l.layers?.forEach(visit);}visit(layer);return [...refs];}
export function layerCount(l:Layer):number{return 1+(l.layers||[]).reduce((n,c)=>n+layerCount(c),0);}
const dataURL=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('无法读取图片资源'));r.readAsDataURL(blob);});
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif'};
export async function createAIPackage(doc:DocumentSource,layer:Layer,options:ExportOptions,context:{board:string;page:string;warnings:string[]},progress:(s:string)=>void){
 if(!Object.values(options).some(Boolean))throw new Error('请至少选择一种导出内容');
 const root=exportRoot(layer),writer=new ZipWriter(new BlobWriter('application/zip')),files:string[]=[],images=new Map<string,string>(),resources:{ref:string;path:string;included:boolean}[]=[];
 const add=async(path:string,content:string|Blob)=>{await writer.add(path,typeof content==='string'?new TextReader(content):new BlobReader(content));files.push(path);};
 const needImages=options.assets||options.preview||options.html;
 try{
 const refs=resourceRefs(root);
 for(const [i,ref] of refs.entries()){
  progress(`准备资源 ${i+1} / ${refs.length}`);
  let path='';
  if(needImages){const url=await doc.image(ref);if(!url)throw new Error(`图片资源缺失：${ref}`);const response=await fetch(url);if(!response.ok)throw new Error(`读取图片失败：${ref}`);const blob=await response.blob();if(!blob.size)throw new Error(`图片资源为空：${ref}`);path=`assets/image-${String(i+1).padStart(3,'0')}.${extensions[blob.type.split(';')[0]]||'bin'}`;if(options.assets)await add(path,blob);if(options.preview||options.html||options.assets)images.set(ref,await dataURL(blob));}
  resources.push({ref,path,included:options.assets});
 }
 const source=Object.assign(Object.create(doc),{previewImages:images,image:async(ref:string)=>images.get(ref)||''}) as DocumentSource;
 function svg(l:Layer,board=false){const n=exportRoot(l),w=Math.max(1,n.frame.width),h=Math.max(1,n.frame.height);return renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><title>{l.name}</title>{board?<>{n.hasBackgroundColor&&<rect width={w} height={h} fill={color(n.backgroundColor)}/>}<Children layers={n.layers||[]} doc={source} choose={()=>{}} w={w} h={h} interactive={false}/></>:<Node l={n} doc={source} choose={()=>{}} interactive={false}/>}</svg>).replace(/(<foreignObject[^>]*>)<div/g,'$1<div xmlns="http://www.w3.org/1999/xhtml"');}
 progress('生成交付文件…');
 const isBoard=['artboard','symbolMaster'].includes(root._class),markup=options.preview||options.html?svg(root,isBoard):'';
 if(options.preview)await add('preview.svg',markup);
 const vectors:{layerId:string;name:string;path:string}[]=[];
 if(options.assets){let count=0;async function visit(l:Layer):Promise<void>{if(l.isVisible===false||l._hiddenSymbol)return;if(['shapeGroup','shapePath','rectangle','oval','triangle','star','polygon'].includes(l._class)){const path=`assets/vector-${String(++count).padStart(3,'0')}.svg`;await add(path,svg(l));vectors.push({layerId:l.do_objectID,name:l.name,path});return;}for(const child of l.layers||[])await visit(child);}await visit(root);await add('assets/index.json',JSON.stringify({images:resources,vectors},null,2));}
 const fonts=fontNames(root);
 if(options.structure)await add('design.json',JSON.stringify({format:'geekdesign-ai-1',document:doc.file.name,page:context.page,board:context.board,scope:{id:layer.do_objectID,name:layer.name,originalFrame:layer.frame,coordinates:'选中区域左上角为原点，子图层坐标相对父级'},fonts,images:resources,vectors,warnings:context.warnings,root},null,2));
 if(options.html)await add('index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design reference</title><style>body{margin:0;padding:32px;background:#eceef3}main{width:max-content;margin:auto;background:white;box-shadow:0 2px 16px #0001}svg{display:block}</style><main>${markup}</main></html>`);
 if(options.instructions)await add('README.md',`# ${layer.name} · AI 实现说明\n\n来源：${doc.file.name} / ${context.page} / ${context.board}\n范围：${layer.name}（${layer.frame.width} × ${layer.frame.height}）\n\n## 实现要求\n请按照本包设计实现所选页面或模块，先检查文件清单。使用实际文字及提供的资源，保留层级、间距、颜色和字号。使用可维护的语义 HTML、Flex/Grid 和组件，固定坐标是测量参考。技术栈由使用者补充；未指定时请先确认。\n\n## 文件清单\n${files.map(f=>'- '+f).join('\n')}\n\n${!options.assets?'未包含独立资源文件；如需实现请向使用者索取资源。\n':''}${!options.structure?'未包含结构数据，请结合预览确认尺寸。\n':''}\n## 还原限制\nSVG/HTML 是 GeekDesign 渲染参考，复杂效果和字体排版可能与原稿有差异。SVG 含真实文本，建议使用浏览器打开。选区自身的旋转/翻转被保留，超出选区的阴影与父级蒙版效果可能被裁切或未包含。未打包字体，请根据授权自行安装。\n字体：${fonts.join('、')||'无'}\n${context.warnings.map(w=>'- '+w).join('\n')}\n`);
 await add('manifest.json',JSON.stringify({version:1,scope:{id:layer.do_objectID,name:layer.name},options,files:[...files,'manifest.json'],createdAt:new Date().toISOString()},null,2));
 return await writer.close();
 }catch(e){await writer.close().catch(()=>{});throw e;}
}
