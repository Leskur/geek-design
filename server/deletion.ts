import type {FastifyInstance} from 'fastify';
import type {Store,User} from './db';
import {documentAccess,fail,membership,teamAccess} from './auth';

export function deletionRoutes(app:FastifyInstance,store:Store,user:(req:any)=>User){
 function removeDocuments(ids:string[]){
  for(const id of ids){
   if(store.one("SELECT u.id FROM uploads u JOIN revisions r ON r.id=u.revision_id WHERE r.document_id=? AND u.status IN ('uploading','received','verifying')",id)||store.one("SELECT id FROM revisions WHERE document_id=? AND status='processing'",id))fail(409,'有文件正在上传或处理，请完成后再删除');
  }
  for(const id of ids){
   store.run('DELETE FROM uploads WHERE revision_id IN (SELECT id FROM revisions WHERE document_id=?)',id);
   store.run('DELETE FROM revisions WHERE document_id=?',id);
   store.run('DELETE FROM documents WHERE id=?',id);
  }
 }
 function removeProject(id:string){
  removeDocuments(store.all('SELECT id FROM documents WHERE project_id=?',id).map(d=>d.id));
  store.run('DELETE FROM members WHERE project_id=?',id);store.run('DELETE FROM projects WHERE id=?',id);
 }
 app.delete('/api/documents/:id',async(req:any)=>{const d=documentAccess(store,user(req),req.params.id,true);store.transaction(()=>removeDocuments([d.id]));return {ok:true};});
 app.delete('/api/projects/:id',async(req:any)=>{membership(store,user(req),req.params.id,false,true);store.transaction(()=>removeProject(req.params.id));return {ok:true};});
 app.delete('/api/teams/:id',async(req:any)=>{
  const t=teamAccess(store,user(req),req.params.id);if(t.role!=='owner')fail(403,'只有团队拥有者可以删除团队');
  store.transaction(()=>{for(const p of store.all('SELECT id FROM projects WHERE team_id=?',t.id))removeProject(p.id);store.run('DELETE FROM invitations WHERE team_id=?',t.id);store.run('DELETE FROM team_members WHERE team_id=?',t.id);store.run('DELETE FROM teams WHERE id=?',t.id);});return {ok:true};
 });
}
