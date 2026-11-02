import type {FastifyInstance} from 'fastify';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type {Store,User} from './db';
import type {ThumbnailJobs} from './thumbnail-jobs';
import {THUMBNAIL_VERSION} from './thumbnail-jobs';
import {documentAccess} from './auth';
export function coverRoutes(app:FastifyInstance,store:Store,thumbnails:ThumbnailJobs,user:(req:any)=>User){
 app.get('/api/documents/:id/cover',async(req:any,reply)=>{
  const d=documentAccess(store,user(req),req.params.id),r=d.current_revision?store.one("SELECT artifact_key FROM revisions WHERE id=? AND document_id=? AND status='ready'",d.current_revision,d.id):null;
  if(!r?.artifact_key)return reply.code(202).header('Retry-After','2').send({status:'processing'});
  const state=thumbnails.enqueue(r.artifact_key);
  let items:Record<string,Record<string,string>>={};try{items=JSON.parse(await fsp.readFile(store.storage.path('artifacts',r.artifact_key,'thumbnails',THUMBNAIL_VERSION,'index.json'),'utf8')).items||{};}catch{}
  for(const boards of Object.values(items))for(const filename of Object.values(boards))if(typeof filename==='string'&&/^[a-f0-9]{64}\.svg$/.test(filename)){
   const file=store.storage.path('artifacts',r.artifact_key,'thumbnails',THUMBNAIL_VERSION,filename.replace(/\.svg$/,'.webp'));
   if(fs.existsSync(file))return reply.type('image/webp').send(fs.createReadStream(file));
  }
  if(state.status==='failed')return reply.code(503).send({error:'封面暂不可用'});
  if(state.status==='ready')return reply.code(204).send();
  return reply.code(202).header('Retry-After','2').send({status:'processing'});
 });
}
