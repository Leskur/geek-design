import {coverRoutes} from './covers';
import {fontRoutes} from './fonts';
import {editingRoutes} from './editing';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Server as TusServer,EVENTS} from '@tus/server';
import {FileStore} from '@tus/file-store';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {LocalStorage} from './storage';
import {Store,type User} from './db';
import {authenticate,checkPassword,documentAccess,fail,hashToken,membership,passwordHash,revisionAccess,session} from './auth';
import {Jobs,artifactKey} from './jobs';
import {teamRoutes} from './teams';
import {publicIds} from './public-ids';
import {ThumbnailJobs,THUMBNAIL_VERSION} from './thumbnail-jobs';
import {deletionRoutes} from './deletion';

const text=(v:any,min=1,max=120)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)fail(400,'输入内容无效或过长');return v.trim();};
const password=(v:any)=>{if(typeof v!=='string'||v.length<6||v.length>200)fail(400,'密码需要 6 至 200 个字符');return v;};
const username=(v:any)=>{const s=text(v,2,50).toLowerCase();if(!/^[a-z0-9_.-]+$/.test(s))fail(400,'用户名仅支持英文、数字、点、横线和下划线');return s;};

export async function createApp(options:{dataDir:string;logger?:boolean;startJobs?:boolean;maxFileSize?:number;publicOrigin?:string;staticDir?:string}) {
 const storage=new LocalStorage(options.dataDir),store=new Store(storage),jobs=new Jobs(store),thumbnails=new ThumbnailJobs(store);
 const maxSize=options.maxFileSize??1024**3;
 const app=Fastify({logger:options.logger?{serializers:{req(req:any){return {method:req.method,url:req.url.replace(/(\/api\/invitations\/|\/invite\/)[a-f0-9]{64}/g,'$1[redacted]'),host:req.headers.host,remoteAddress:req.ip};}}}:false,bodyLimit:65536,requestTimeout:0});await app.register(cookie);
 publicIds(app,store);
 const user=(req:any):User=>authenticate(store,req.cookies.sp_session);
 const setSession=(reply:any,userId:string)=>reply.setCookie('sp_session',session(store,userId),{path:'/',httpOnly:true,sameSite:'strict',secure:options.publicOrigin?.startsWith('https:')??false,maxAge:7*86400});
 const attempts=new Map<string,{count:number;until:number}>();
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('X-Content-Type-Options','nosniff');
  reply.header('Referrer-Policy','no-referrer');
  if(req.url.startsWith('/api/')){
   reply.header('Cache-Control','no-store');
   if(!['GET','HEAD','OPTIONS'].includes(req.method)){
    const origin=req.headers.origin;
    const allowed=[`${req.protocol}://${req.headers.host}`,options.publicOrigin,'http://127.0.0.1:5173','http://localhost:5173'].filter(Boolean);
    if(!origin||!allowed.includes(origin))fail(403,'请求来源不受信任，请从应用页面操作');
   }
  }
 });
 app.setErrorHandler((error:any,req,reply)=>{const status=error.statusCode||500;if(status>=500)req.log.error(error);reply.code(status).send({error:status>=500?'服务暂时不可用，请检查服务日志后重试':error.message});});
 app.get('/api/status',async()=>({maxFileSize:maxSize}));
 app.post('/api/register',async(req,reply)=>{
  const key='register:'+req.ip,old=attempts.get(key);if(old&&old.until>Date.now()&&old.count>=10)fail(429,'注册尝试过多，请稍后再试');
  attempts.set(key,{count:old&&old.until>Date.now()?old.count+1:1,until:old&&old.until>Date.now()?old.until:Date.now()+15*60000});
  const b=req.body as any,name=username(b?.username),hash=await passwordHash(password(b?.password));
  const id=store.transaction(()=>{if(store.one('SELECT id FROM users WHERE username=?',name))fail(409,'用户名已被使用');const id=store.id();store.run('INSERT INTO users VALUES(?,?,?)',id,name,hash);return id;});setSession(reply,id);return {id,username:name};
 });
 app.post('/api/login',async(req,reply)=>{
  const b=req.body as any,name=username(b?.username),pw=password(b?.password),key=req.ip;
  let count=attempts.get(key);if(!count||count.until<Date.now()){count={count:0,until:Date.now()+15*60000};attempts.set(key,count);}if(count.count>=10)fail(429,'尝试次数过多，请稍后再试');count.count++;
  const found=store.one('SELECT * FROM users WHERE username=?',name);if(!found||!await checkPassword(pw,found.password))fail(401,'用户名或密码不正确');attempts.delete(key);setSession(reply,found.id);return {ok:true};
 });
 app.post('/api/logout',async(req,reply)=>{store.run('DELETE FROM sessions WHERE hash=?',hashToken(req.cookies.sp_session||''));reply.clearCookie('sp_session',{path:'/'});return {ok:true};});
 app.get('/api/me',async req=>user(req));
 teamRoutes(app,store,user);deletionRoutes(app,store,user);editingRoutes(app,store,user);fontRoutes(app,store,user);coverRoutes(app,store,thumbnails,user);
 app.get('/api/projects/:id/documents',async(req:any)=>{membership(store,user(req),req.params.id);return store.all('SELECT d.*,COALESCE(r.seq,latest.seq) AS seq,COALESCE(r.status,latest.status) AS status,a.step,latest.status AS latest_status,COALESCE(latest.created,d.created) AS updated FROM documents d LEFT JOIN revisions r ON r.id=d.current_revision LEFT JOIN revisions latest ON latest.id=(SELECT id FROM revisions WHERE document_id=d.id ORDER BY seq DESC LIMIT 1) LEFT JOIN artifacts a ON a.key=r.artifact_key WHERE d.project_id=? ORDER BY updated DESC',req.params.id);});
 app.get('/api/documents/:id',async(req:any)=>{const d=documentAccess(store,user(req),req.params.id);return {...d,revisions:store.all('SELECT r.*,u.username,a.step FROM revisions r JOIN users u ON u.id=r.created_by LEFT JOIN artifacts a ON a.key=r.artifact_key WHERE document_id=? ORDER BY seq DESC',d.id)};});
 app.post('/api/documents/:id/current',async(req:any)=>{const d=documentAccess(store,user(req),req.params.id,true),id=text((req.body as any)?.revisionId,1,60),r=store.one("SELECT * FROM revisions WHERE id=? AND document_id=? AND status='ready'",id,d.id);if(!r)fail(400,'只有该文档中可查看的记录可以设为当前稿');store.run('UPDATE documents SET current_revision=? WHERE id=?',id,d.id);return {ok:true};});
 app.get('/api/revisions/:id',async(req:any)=>{const r=revisionAccess(store,user(req),req.params.id),a=r.artifact_key?store.one('SELECT step FROM artifacts WHERE key=?',r.artifact_key):null;return {...r,step:a?.step||({uploading:'等待文件传输',failed:'处理失败'} as any)[r.status]||r.status};});
 async function ready(req:any){const r=revisionAccess(store,user(req),req.params.id);if(r.status!=='ready'||!r.artifact_key)fail(409,'文档尚未处理完成');const a=store.one("SELECT * FROM artifacts WHERE key=? AND status='ready'",r.artifact_key);if(!a)fail(409,'查看数据尚未就绪');const dir=storage.path('artifacts',r.artifact_key);const manifest=JSON.parse(await fsp.readFile(path.join(dir,'manifest.json'),'utf8'));return {r,dir,manifest};}
 app.get('/api/revisions/:id/manifest',async(req:any)=>{const {r,manifest}=await ready(req);const project=store.one('SELECT p.team_id FROM projects p JOIN documents d ON d.project_id=p.id WHERE d.id=?',r.document_id),teamRole=store.one('SELECT role FROM team_members WHERE team_id=? AND user_id=?',project.team_id,user(req).id)?.role;return {...manifest,fontLibrary:{teamId:store.publicId(project.team_id),canUpload:teamRole==='owner'||teamRole==='admin'},thumbnailVersion:THUMBNAIL_VERSION,canManagePreviews:membership(store,user(req),store.one('SELECT project_id FROM documents WHERE id=?',r.document_id).project_id)!=='viewer',viewerId:user(req).id,revisionId:r.id,documentId:r.document_id,projectId:store.one('SELECT project_id FROM documents WHERE id=?',r.document_id).project_id,file:{name:r.filename,size:r.size}};});
 async function thumbnailIndex(key:string){try{return JSON.parse(await fsp.readFile(storage.path('artifacts',key,'thumbnails',THUMBNAIL_VERSION,'index.json'),'utf8'));}catch{return {version:THUMBNAIL_VERSION,items:{}};}}
 app.get('/api/revisions/:id/thumbnails',async(req:any)=>{const {r}=await ready(req);const state=thumbnails.enqueue(r.artifact_key),index=await thumbnailIndex(r.artifact_key);return {version:THUMBNAIL_VERSION,status:state.status,completed:state.completed,total:state.total,error:state.error,items:index.items};});
 app.post('/api/revisions/:id/thumbnails/retry',async(req:any)=>{const {r}=await ready(req);documentAccess(store,user(req),r.document_id,true);return thumbnails.enqueue(r.artifact_key,true);});
 app.get('/api/revisions/:id/thumbnails/:version/:pageId/:boardId',async(req:any,reply)=>{
  const {r,manifest}=await ready(req);if(req.params.version!==THUMBNAIL_VERSION||typeof manifest.pageFiles[req.params.pageId]!=='string')fail(404,'预览不存在');
  const state=thumbnails.enqueue(r.artifact_key),index=await thumbnailIndex(r.artifact_key),file=index.items?.[req.params.pageId]?.[req.params.boardId];
  if(typeof file==='string'&&/^[a-f0-9]{64}\.svg$/.test(file)){const small=(req.query as any)?.size==='small',target=storage.path('artifacts',r.artifact_key,'thumbnails',THUMBNAIL_VERSION,small?file.replace(/\.svg$/,'.webp'):file);if(fs.existsSync(target))return reply.type(small?'image/webp':'image/svg+xml').header('Content-Security-Policy',"default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox").header('Cache-Control','private, max-age=3600').send(fs.createReadStream(target));if(state.status==='ready')thumbnails.enqueue(r.artifact_key,true);}
  if(state.status==='failed')return reply.code(503).send({error:state.error||'预览生成失败，请重试'});
  if(state.status==='ready'&&!file)fail(404,'画板预览不存在');
  return reply.code(202).header('Retry-After','1').send({status:'processing',completed:state.completed,total:state.total});
 });
 app.get('/api/revisions/:id/symbols',async(req:any)=>{const {dir}=await ready(req);return JSON.parse(await fsp.readFile(path.join(dir,'symbols.json'),'utf8'));});
 app.get('/api/revisions/:id/pages/:pageId',async(req:any)=>{const {dir,manifest}=await ready(req);const relative=manifest.pageFiles[req.params.pageId];if(typeof relative!=='string')fail(404,'页面不存在');return JSON.parse(await fsp.readFile(path.join(dir,relative),'utf8'));});
 app.get('/api/revisions/:id/assets/:hash',async(req:any,reply)=>{const {manifest}=await ready(req);const hash=req.params.hash,asset=Object.values(manifest.assets).find((a:any)=>a.hash===hash) as any;if(!asset)fail(404,'资源不属于此记录');reply.type(asset.mime).header('Content-Disposition','inline');if(asset.mime==='application/octet-stream')reply.header('Content-Disposition','attachment');return reply.send(fs.createReadStream(storage.object(hash)));});
 app.post('/api/revisions/:id/retry',async(req:any)=>{const r=revisionAccess(store,user(req),req.params.id);documentAccess(store,user(req),r.document_id,true);if(r.status==='ready')return {ok:true};if(!r.artifact_key||!store.one('SELECT hash FROM objects WHERE hash=?',r.hash))fail(409,'尚无校验通过的原文件，请重新选择文件上传');const key=jobs.enqueue(r.hash);store.transaction(()=>{store.run("UPDATE artifacts SET status='queued',error=NULL WHERE key=? AND status='failed'",key);store.run("UPDATE revisions SET status='processing',artifact_key=?,error=NULL WHERE id=?",key,r.id);});return {ok:true};});
 app.post('/api/uploads/preflight',async(req)=>{
  const u=user(req),b=req.body as any,projectId=text(b?.projectId,1,60);membership(store,u,projectId,true);
  const hash=b?.sha256,size=b?.size,name=text(b?.filename,1,240);if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(size)||size<1||size>maxSize||!name.toLowerCase().endsWith('.sketch'))fail(400,'请选择大小符合限制的 Sketch 文件');
  let d=b.documentId?documentAccess(store,u,text(b.documentId,1,60),true):null;if(d&&d.project_id!==projectId)fail(400,'目标文档与项目不一致');
  const reuse=store.one('SELECT r.id FROM revisions r JOIN documents d ON d.id=r.document_id JOIN objects o ON o.hash=r.hash WHERE d.project_id=? AND r.hash=? AND o.size=? AND r.artifact_key IS NOT NULL LIMIT 1',projectId,hash,size)&&fs.existsSync(storage.object(hash));
  return store.transaction(()=>{
   if(!d){const id=store.id();store.run('INSERT INTO documents VALUES(?,?,?,NULL,?)',id,projectId,text(b.documentName||name.replace(/\.sketch$/i,'')),Date.now());d=store.one('SELECT * FROM documents WHERE id=?',id);}
   let r=store.one('SELECT * FROM revisions WHERE document_id=? AND hash=?',d.id,hash);
   if(r?.status==='ready')return {kind:'duplicate',documentId:d.id,revision:r};
   const key=reuse?jobs.enqueue(hash):null;
   if(!r){const id=store.id(),seq=(store.one('SELECT MAX(seq) AS n FROM revisions WHERE document_id=?',d.id).n||0)+1;store.run('INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,base_revision,artifact_key,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,d.id,seq,hash,size,name,typeof b.note==='string'?b.note.slice(0,1000):'',u.id,d.current_revision,key,reuse?'processing':'uploading',Date.now());r=store.one('SELECT * FROM revisions WHERE id=?',id);}
   if(reuse){const a=store.one('SELECT * FROM artifacts WHERE key=?',key);store.run("UPDATE revisions SET artifact_key=?,status=?,error=NULL WHERE id=?",key,a.status==='ready'?'ready':'processing',r.id);if(a.status==='failed')store.run("UPDATE artifacts SET status='queued',error=NULL WHERE key=?",key);if(a.status==='ready')store.run('UPDATE documents SET current_revision=? WHERE id=? AND current_revision IS ?',r.id,d.id,r.base_revision);return {kind:'reused',documentId:d.id,revision:store.one('SELECT * FROM revisions WHERE id=?',r.id)};}
   const pending=store.one("SELECT * FROM uploads WHERE revision_id=? AND user_id=? AND status IN ('uploading','received','verifying') ORDER BY created DESC LIMIT 1",r.id,u.id);
   if(pending)return {kind:pending.status==='uploading'?'upload':'processing',documentId:d.id,revision:r,ticket:pending.id};
   const id=store.id();store.run("INSERT INTO uploads VALUES(?,?,?,?,'uploading',?)",id,r.id,u.id,size,Date.now());store.run("UPDATE revisions SET status='uploading',error=NULL WHERE id=?",r.id);return {kind:'upload',documentId:d.id,revision:r,ticket:id};
  });
 });
 const fileStore=new FileStore({directory:storage.path('uploads')});
 function tusUser(req:any){return authenticate(store,app.parseCookie(req.headers.get('cookie')||'').sp_session);}
 function ticket(req:any,id:string){const u=tusUser(req),t=store.one('SELECT t.*,r.document_id FROM uploads t JOIN revisions r ON r.id=t.revision_id WHERE t.id=?',id);if(!t||t.user_id!==u.id)fail(404,'上传会话不存在');documentAccess(store,u,t.document_id,true);return t;}
 const tus=new TusServer({path:'/api/tus',datastore:fileStore,maxSize,relativeLocation:true,allowedOrigins:[],disableTerminationForFinishedUploads:true,
  async namingFunction(req,meta){const id=meta?.ticket?store.resolveId(meta.ticket):undefined;if(!id)throw {status_code:400,body:'缺少上传会话'};ticket(req,id);try{await fileStore.getUpload(id);throw {status_code:409,body:'上传会话已存在，请从已接收位置继续'};}catch(e){if((e as any).status_code===409)throw e;}return id;},
  async onUploadCreate(req,upload){const t=ticket(req,upload.id);if(t.status!=='uploading'||upload.size!==t.size)throw {status_code:400,body:'上传长度或状态无效'};return {};},
  async onIncomingRequest(req,id){try{tusUser(req);if(id)ticket(req,id);}catch(e){throw {status_code:(e as any).statusCode||403,body:(e as Error).message};}},
  async onUploadFinish(_req,upload){store.run("UPDATE uploads SET status='received' WHERE id=? AND status='uploading'",upload.id);return {};}
 });
 tus.on(EVENTS.POST_TERMINATE,(_req,_res,id)=>store.run("UPDATE uploads SET status='cancelled' WHERE id=? AND status='uploading'",id));
 app.addContentTypeParser('application/offset+octet-stream',(_req,_payload,done)=>done(null));
 const tusHandler=async(req:any,reply:any)=>{user(req);if(!['POST','PATCH','HEAD','OPTIONS','DELETE'].includes(req.method))fail(405,'此接口不支持下载原文件');reply.hijack();await tus.handle(req.raw,reply.raw);};
 app.all('/api/tus',tusHandler);app.all('/api/tus/:id',tusHandler);
 app.get('/api/uploads/:id',async(req:any)=>{const u=user(req),t=store.one('SELECT * FROM uploads WHERE id=? AND user_id=?',req.params.id,u.id);if(!t)fail(404,'上传会话不存在');const r=revisionAccess(store,u,t.revision_id);documentAccess(store,u,r.document_id,true);let offset=0,exists=false;try{const upload=await fileStore.getUpload(t.id);offset=upload.offset;exists=true;}catch{}return {...t,offset,exists,url:`/api/tus/${t.id}`};});
 app.post('/api/uploads/:id/complete',async(req:any)=>{const u=user(req),t=store.one('SELECT * FROM uploads WHERE id=? AND user_id=?',req.params.id,u.id);if(!t)fail(404,'上传会话不存在');const r=revisionAccess(store,u,t.revision_id);documentAccess(store,u,r.document_id,true);const upload=await fileStore.getUpload(t.id);if(upload.offset!==t.size)fail(409,'文件尚未完整接收');store.run("UPDATE uploads SET status='received' WHERE id=? AND status='uploading'",t.id);return {ok:true};});
 for(const t of store.all("SELECT * FROM uploads WHERE status='uploading'")){try{const upload=await fileStore.getUpload(t.id);if(upload.offset===t.size)store.run("UPDATE uploads SET status='received' WHERE id=?",t.id);}catch{}}
 if(options.staticDir&&fs.existsSync(path.join(options.staticDir,'index.html'))){
  const root=path.resolve(options.staticDir);app.get('/assets/:name',async(req:any,reply)=>{const name=req.params.name;if(!/^[a-zA-Z0-9_.-]+$/.test(name)||name.includes('..'))fail(404,'文件不存在');const file=path.join(root,'assets',name);if(!fs.existsSync(file))fail(404,'文件不存在');reply.type(({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'} as any)[path.extname(name)]||'application/octet-stream');return reply.send(fs.createReadStream(file));});
  app.get('/*',async(req,reply)=>{if(req.url.startsWith('/api/'))fail(404,'接口不存在');return reply.type('text/html').send(fs.createReadStream(path.join(root,'index.html')));});
 }
 if(options.startJobs!==false){jobs.start();thumbnails.start();}
 app.addHook('onClose',async()=>{await Promise.all([jobs.stop(),thumbnails.stop()]);store.close();});
 return {app,store,jobs,storage,thumbnails};
}
