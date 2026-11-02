import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocalStorage} from './storage';
import type {Layer,DocumentSource} from '../shared/document';
import {color} from '../shared/document';
import {resolveBoard} from '../src/scene';
import {Children,ThumbnailTextContext} from '../src/renderer';
const send=(message:any)=>{if(process.connected)process.send?.(message);};
let stopping=false;
process.once('disconnect',()=>{stopping=true;});
process.on('message',(m:any)=>{if(m?.type==='stop')stopping=true;});
async function atomicReplace(from:string,to:string){for(let attempt=0;;attempt++){try{await fs.rename(from,to);return;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code||'')||attempt>=15)throw error;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}}}
async function run(job:{root:string;key:string;version:string}){
 const storage=new LocalStorage(job.root),artifact=storage.path('artifacts',job.key),dir=storage.path('artifacts',job.key,'thumbnails',job.version),manifest=JSON.parse(await fs.readFile(artifact+'/manifest.json','utf8')),data=JSON.parse(await fs.readFile(artifact+'/symbols.json','utf8'));
 const symbols=new Map<string,Layer>(data.symbols),styles=new Map(data.styles),previewImages=new Map<string,string>();await fs.mkdir(dir,{recursive:true});
 sharp.cache({memory:16,files:0,items:20});sharp.concurrency(1);
 const imageCache=new Map<string,string>();let imageBytes=0;
 const assets=manifest.assets as Record<string,{hash:string;mime:string}>;
 async function prepareImages(root:Layer){previewImages.clear();const refs=new Set<string>();function visit(l:Layer){if(l.isVisible===false||l._hiddenSymbol)return;if(l.image?._ref)refs.add(l.image._ref);for(const p of l.style?.fills||[])if(p.isEnabled&&p.image?._ref)refs.add(p.image._ref);l.layers?.forEach(visit);}visit(root);for(const ref of refs){const asset=assets[ref]||Object.entries(assets).find(([name])=>name.startsWith(ref+'.'))?.[1];if(!asset||!['image/png','image/jpeg','image/webp','image/gif'].includes(asset.mime))continue;let embedded=imageCache.get(asset.hash);if(!embedded){const resized=await sharp(storage.object(asset.hash),{limitInputPixels:100000000,animated:false}).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:70}).toBuffer();embedded=`data:image/webp;base64,${resized.toString('base64')}`;if(embedded.length<16*1024**2){while(imageBytes+embedded.length>24*1024**2&&imageCache.size){const old=imageCache.keys().next().value!;imageBytes-=imageCache.get(old)!.length;imageCache.delete(old);}imageCache.set(asset.hash,embedded);imageBytes+=embedded.length;}}previewImages.set(ref,embedded);}}
 const source={symbols,styles,previewImages,image:async(ref:string)=>previewImages.get(ref)||[...previewImages].find(([name])=>name.startsWith(ref+'.'))?.[1]||''} as unknown as DocumentSource;
 // Bitmap's first render must already contain image data; no browser effect runs during SSR.
 const prepared=Object.assign(source,{previewImages:{get:(ref:string)=>previewImages.get(ref)||[...previewImages].find(([name])=>name.startsWith(ref+'.'))?.[1]||''}});
 const plans:{pageId:string;relative:string}[]=Object.entries(manifest.pageFiles).map(([pageId,relative])=>({pageId,relative:relative as string}));
 let total=0;for(const p of plans){const page=JSON.parse(await fs.readFile(storage.path('artifacts',job.key,p.relative),'utf8'));total+=(page.layers||[]).length;}
 let index:{version:string;items:Record<string,Record<string,string>>}={version:job.version,items:{}};try{const old=JSON.parse(await fs.readFile(dir+'/index.json','utf8'));if(old.version===job.version)index=old;}catch{}
 const publish=async()=>{await fs.writeFile(dir+'/index.partial',JSON.stringify(index));await atomicReplace(dir+'/index.partial',dir+'/index.json');};
 let completed=0;
 for(const p of plans){const pageData=JSON.parse(await fs.readFile(storage.path('artifacts',job.key,p.relative),'utf8'));index.items[p.pageId]??={};
  for(const board of pageData.layers||[] as Layer[]){if(stopping)throw new Error('任务已暂停');const filename=createHash('sha256').update(p.pageId+'\0'+board.do_objectID).digest('hex')+'.svg',target=dir+'/'+filename;let exists=false;try{const text=await fs.readFile(target,'utf8');await fs.access(target.replace(/\.svg$/,'.webp'));exists=text.startsWith('<svg')&&text.endsWith('</svg>');}catch{}
   if(!exists){const root=resolveBoard(board,source).root,scale=Math.min(1,384/Math.max(1,board.frame.width),1536/Math.max(1,board.frame.height)),width=Math.max(1,Math.round(board.frame.width*scale)),height=Math.max(1,Math.round(board.frame.height*scale));
    await prepareImages(root);const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${Math.max(1,root.frame.width)} ${Math.max(1,root.frame.height)}`}><rect width={root.frame.width} height={root.frame.height} fill={root.hasBackgroundColor?color(root.backgroundColor):'#fff'}/><Children layers={root.layers||[]} doc={prepared} choose={()=>{}} w={root.frame.width} h={root.frame.height} interactive={false}/></svg>);
    const smallSvg=renderToStaticMarkup(<ThumbnailTextContext.Provider value={true}><svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${Math.max(1,root.frame.width)} ${Math.max(1,root.frame.height)}`}><rect width={root.frame.width} height={root.frame.height} fill={root.hasBackgroundColor?color(root.backgroundColor):'#fff'}/><Children layers={root.layers||[]} doc={prepared} choose={()=>{}} w={root.frame.width} h={root.frame.height} interactive={false}/></svg></ThumbnailTextContext.Provider>);
    const smallTarget=target.replace(/\.svg$/,'.webp');await sharp(Buffer.from(smallSvg)).resize({width:96,height:384,fit:'inside',withoutEnlargement:true}).webp({quality:65}).toFile(smallTarget+'.partial');await atomicReplace(smallTarget+'.partial',smallTarget);
    await fs.writeFile(target+'.partial',svg);await atomicReplace(target+'.partial',target);

   }
   index.items[p.pageId][board.do_objectID]=filename;await publish();completed++;send({type:'progress',completed,total});
  }
 }
 send({type:'done',total});
}
process.once('message',async(job:any)=>{try{await run(job);process.exitCode=0;}catch(e){const message=e instanceof Error?e.message:'预览生成失败';send({type:'failed',error:message});process.exitCode=1;}finally{process.disconnect?.();}});
