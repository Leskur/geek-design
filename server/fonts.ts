import type {FastifyInstance} from 'fastify';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {create} from 'fontkit';
import type {Store,User} from './db';
import {teamAccess,revisionAccess,fail} from './auth';
export const MAX_FONT_SIZE=20*1024**2;
export function fontRoutes(app:FastifyInstance,store:Store,user:(req:any)=>User){
 const list=(teamId:string)=>store.all('SELECT id,filename,family,full_name,postscript_name,weight,style,size,created FROM team_fonts WHERE team_id=? ORDER BY family COLLATE NOCASE,weight,style',teamId).map(f=>({...f,url:`/api/teams/${store.publicId(teamId)}/fonts/${f.id}`}));
 app.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
 app.get('/api/teams/:id/fonts',async(req:any)=>{teamAccess(store,user(req),req.params.id);return list(req.params.id);});
 app.get('/api/revisions/:id/fonts',async(req:any)=>{const r=revisionAccess(store,user(req),req.params.id),p=store.one('SELECT p.team_id FROM projects p JOIN documents d ON d.project_id=p.id WHERE d.id=?',r.document_id);return list(p.team_id);});
 app.post('/api/teams/:id/fonts',{bodyLimit:MAX_FONT_SIZE},async(req:any,reply)=>{
  const actor=user(req),t=teamAccess(store,actor,req.params.id,true),bytes=req.body;
  if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX_FONT_SIZE)fail(400,'请选择有效字体文件，单个文件不超过 20 MB');
  let filename:string;try{filename=decodeURIComponent(String(req.headers['x-font-filename']||''));}catch{fail(400,'字体文件名无效');}
  if(!filename||filename.length>240||/[\\/\x00-\x1f]/.test(filename)||!/[.](ttf|otf|woff|woff2)$/i.test(filename))fail(400,'支持 TTF、OTF、WOFF 和 WOFF2 字体文件');
  const magic=bytes.toString('ascii',0,4);if(!['OTTO','true','wOFF','wOF2'].includes(magic)&&bytes.readUInt32BE(0)!==0x10000)fail(400,'字体格式无效，不支持字体集合');
  if((magic==='wOFF'||magic==='wOF2')&&(bytes.length<20||bytes.readUInt32BE(16)>64*1024**2))fail(400,'字体解压后超过大小限制');
  let meta:{family:string;fullName:string;postscript:string;weight:number;style:string};
  try{const font=create(bytes);if('fonts' in font)throw Error('collection');const family=font.familyName,fullName=font.fullName,postscript=font.postscriptName;if(!family||!postscript||[family,fullName,postscript].some(n=>!n||n.length>240||/[\x00-\x1f]/.test(n)))throw Error('names');const weight=Number((font as any)['OS/2']?.usWeightClass)||400;meta={family,fullName,postscript,weight:Math.max(1,Math.min(1000,weight)),style:font.italicAngle?'italic':'normal'};}catch{fail(400,'无法读取字体，请上传有效的单字体文件');}
  const hash=createHash('sha256').update(bytes).digest('hex'),old=store.one('SELECT id FROM team_fonts WHERE team_id=? AND hash=?',t.id,hash);
  if(old)return {font:list(t.id).find(f=>f.id===old.id),duplicate:true};
  if(store.one('SELECT id FROM team_fonts WHERE team_id=? AND postscript_name=?',t.id,meta.postscript))fail(409,'团队中已有同名字体，请先删除旧版本再上传');
  await fsp.mkdir(store.storage.path('fonts'),{recursive:true});try{await fsp.writeFile(store.storage.path('fonts',hash),bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  const saved=store.transaction(()=>{teamAccess(store,actor,t.id,true);const duplicate=store.one('SELECT id FROM team_fonts WHERE team_id=? AND hash=?',t.id,hash);if(duplicate)return {id:duplicate.id,duplicate:true};if(store.one('SELECT id FROM team_fonts WHERE team_id=? AND postscript_name=?',t.id,meta.postscript))fail(409,'团队中已有同名字体');const id=store.id();store.run('INSERT INTO team_fonts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,t.id,hash,filename,meta.family,meta.fullName,meta.postscript,meta.weight,meta.style,bytes.length,actor.id,Date.now());return {id,duplicate:false};});
  reply.code(saved.duplicate?200:201);return {font:list(t.id).find(f=>f.id===saved.id),duplicate:saved.duplicate};
 });
 app.get('/api/teams/:id/fonts/:fontId',async(req:any,reply)=>{teamAccess(store,user(req),req.params.id);const f=store.one('SELECT * FROM team_fonts WHERE id=? AND team_id=?',req.params.fontId,req.params.id);if(!f)fail(404,'字体不存在');return reply.type('application/octet-stream').header('Cache-Control','private, no-store').send(fs.createReadStream(store.storage.path('fonts',f.hash)));});
 app.delete('/api/teams/:id/fonts/:fontId',async(req:any)=>{teamAccess(store,user(req),req.params.id,true);const result=store.run('DELETE FROM team_fonts WHERE id=? AND team_id=?',req.params.fontId,req.params.id);if(!result.changes)fail(404,'字体不存在');return {ok:true};});
}
