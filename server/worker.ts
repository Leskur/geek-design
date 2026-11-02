import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {BlobReader,TextWriter,Uint8ArrayWriter,ZipReader,type FileEntry} from '@zip.js/zip.js';
import {metadata,registerSymbols,PARSER_VERSION,type Layer} from '../shared/document';
import {LocalStorage} from './storage';

export type Job={root:string;hash:string;size:number;uploadId?:string};
const send=(message:any)=>process.send?.(message);
function mime(b:Uint8Array){if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'image/png';if(b[0]===255&&b[1]===216)return 'image/jpeg';if(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';if(String.fromCharCode(...b.slice(0,3))==='GIF')return 'image/gif';return 'application/octet-stream';}
async function object(storage:LocalStorage,hash:string,data:Uint8Array){
 const target=storage.object(hash);await fsp.mkdir(storage.path('objects',hash.slice(0,2)),{recursive:true});
 if(fs.existsSync(target)){const old=await fsp.readFile(target);if(createHash('sha256').update(old).digest('hex')!==hash)throw new Error('已存资源完整性校验失败');return;}
 const temporary=storage.path('objects',hash.slice(0,2),randomUUID()+'.partial');await fsp.writeFile(temporary,data);await fsp.rename(temporary,target);
}
function validatePage(page:Layer){const stack=[{node:page,depth:0}],ids=new Set<string>();let count=0;while(stack.length){const {node,depth}=stack.pop()!;if(++count>100000||depth>128)throw new Error('页面图层数量或嵌套超过当前限制');if(typeof node.do_objectID!=='string'||!node.do_objectID||ids.has(node.do_objectID)||typeof node.name!=='string'||typeof node._class!=='string'||!node.frame||!['x','y','width','height'].every(k=>typeof node.frame[k as keyof Layer['frame']]==='number'&&Number.isFinite(node.frame[k as keyof Layer['frame']])))throw new Error('文档包含无效或重复的图层数据');ids.add(node.do_objectID);if(node.layers!==undefined&&!Array.isArray(node.layers))throw new Error('图层结构无效');for(const child of node.layers||[])stack.push({node:child,depth:depth+1});}}
async function run(job:Job){
 const maxJsonSize=Number(process.env.SKETCHPEEK_MAX_JSON_SIZE||512*1024**2);if(!Number.isSafeInteger(maxJsonSize)||maxJsonSize<1)throw new Error('SKETCHPEEK_MAX_JSON_SIZE 必须是正整数字节数');
 const storage=new LocalStorage(job.root),key=`${job.hash}-${PARSER_VERSION}`,source=storage.object(job.hash);
 if(job.uploadId){
  send({type:'step',step:'校验完整文件'});const input=storage.path('uploads',job.uploadId),stat=await fsp.stat(input);if(stat.size!==job.size)throw new Error('文件长度不一致，请重新上传');
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(input))hash.update(chunk);
  if(hash.digest('hex')!==job.hash)throw new Error('文件内容校验失败，请重新选择文件上传');
  await fsp.mkdir(storage.path('objects',job.hash.slice(0,2)),{recursive:true});
  try{await fsp.link(input,source);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'){try{await fsp.copyFile(input,source,fs.constants.COPYFILE_EXCL);}catch(copy){if((copy as NodeJS.ErrnoException).code!=='EEXIST')throw copy;}}}
  send({type:'verified'});
 }
 const target=storage.path('artifacts',key);
 try{const cached=JSON.parse(await fsp.readFile(storage.path('artifacts',key,'manifest.json'),'utf8'));if(cached.hash===job.hash&&cached.parserVersion===PARSER_VERSION){send({type:'done',manifest:cached});return;}}catch{}
 send({type:'step',step:'读取页面与组件'});
 const zip=new ZipReader(new BlobReader(await openAsBlob(source))),entries=new Map<string,FileEntry>();
 const staging=storage.path('staging',randomUUID());await fsp.mkdir(staging,{recursive:true});
 try{
  const all=await zip.getEntries();if(all.length>30000||all.reduce((n,e)=>n+e.uncompressedSize,0)>2*1024**3)throw new Error('文档展开体积或条目数超过当前限制');
  for(const e of all){if(e.directory)continue;if(e.filename.includes('\\')||e.filename.split('/').some(p=>p==='..'||p==='.')||e.filename.startsWith('/')||e.filename.includes(':')||entries.has(e.filename))throw new Error('压缩包包含无效或重复的资源路径');entries.set(e.filename,e as FileEntry);}
  async function json(name:string){const e=entries.get(name);if(!e)throw new Error(`文件缺少 ${name}`);if(e.uncompressedSize>maxJsonSize)throw new Error(`文件「${name}」解压后为 ${(e.uncompressedSize/1024**2).toFixed(1)} MiB，超过 JSON 解析上限 ${(maxJsonSize/1024**2).toFixed(1)} MiB`);return JSON.parse(await e.getData(new TextWriter()));}
  const meta=await json('meta.json'),doc=await json('document.json'),info=metadata(meta,doc),symbols=new Map<string,Layer>(),pageFiles:Record<string,string>={},assets:Record<string,{hash:string;mime:string;size:number}>={},issues:string[]=[];
  if(!info.pages.length)throw new Error('没有找到可读取的页面');
  for(const foreign of doc.foreignSymbols||[])if(foreign.symbolMaster)registerSymbols(foreign.symbolMaster,symbols);
  await fsp.mkdir(staging+'/pages');
  for(let i=0;i<info.pages.length;i++){
   const p=info.pages[i];send({type:'step',step:`索引页面 ${i+1} / ${info.pages.length}`});
   const page=await json(`pages/${p.id}.json`);if(page.do_objectID!==p.id||!Array.isArray(page.layers))throw new Error('页面索引与内容不一致');validatePage(page);registerSymbols(page,symbols);pageFiles[p.id]=`pages/${i}.json`;await fsp.writeFile(`${staging}/pages/${i}.json`,JSON.stringify(page));
  }
  send({type:'step',step:'提取图片资源'});
  for(const [name,e] of entries){if(!name.startsWith('images/'))continue;if(e.uncompressedSize>80*1024**2){issues.push(`图片超过当前单资源限制：${name}`);continue;}const bytes=await e.getData(new Uint8ArrayWriter());const hash=createHash('sha256').update(bytes).digest('hex');await object(storage,hash,bytes);assets[name]={hash,mime:mime(bytes),size:bytes.length};}
  const manifest={schemaVersion:1,parserVersion:PARSER_VERSION,hash:job.hash,pages:info.pages,pageFiles,assets,issues};
  await fsp.writeFile(staging+'/symbols.json',JSON.stringify({symbols:[...symbols],styles:[...info.styles]}));
  // Publish the manifest last. Interrupted copies are never exposed as ready.
  await fsp.mkdir(target+'/pages',{recursive:true});
  for(const relative of Object.values(pageFiles))await fsp.copyFile(staging+'/'+relative,target+'/'+relative);
  await fsp.copyFile(staging+'/symbols.json',target+'/symbols.json');
  await fsp.writeFile(target+'/manifest.json',JSON.stringify(manifest));send({type:'done',manifest});
 }finally{
  await zip.close();
  // Only remove files inside this job's server-generated staging directory.
  try{for(const name of await fsp.readdir(staging+'/pages'))await fsp.unlink(staging+'/pages/'+name);await fsp.rmdir(staging+'/pages');}catch{}
  try{await fsp.unlink(staging+'/symbols.json');}catch{}
  try{await fsp.rmdir(staging);}catch{}
 }
}
process.once('message',async job=>{try{await run(job as Job);process.exitCode=0;}catch(error){send({type:'failed',error:error instanceof Error?error.message:'文件处理失败'});process.exitCode=1;}finally{process.disconnect?.();}});
