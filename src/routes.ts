export type Route={kind:'local'|'team'|'revision'|'missing';projectId?:string;documentId?:string;revisionId?:string;teamId?:string;section?:'members'|'overview';auth?:'login'|'register';inviteToken?:string};
const part=(id:string)=>encodeURIComponent(id);
export const projectPath=(projectId:string)=>`/projects/${part(projectId)}`;
export const documentPath=(projectId:string,documentId:string)=>`${projectPath(projectId)}/documents/${part(documentId)}`;
export const revisionPath=(projectId:string,documentId:string,revisionId:string)=>`${documentPath(projectId,documentId)}/revisions/${part(revisionId)}`;
export function routeFor(pathname:string,search=''):Route{
 const q=new URLSearchParams(search);
 if(pathname==='/'){
  if(q.get('revision'))return {kind:'revision',revisionId:q.get('revision')!};
  if(q.has('team'))return {kind:'team',projectId:q.get('project')||undefined,documentId:q.get('document')||undefined};
  return {kind:'team'};
 }
 const parts=pathname.replace(/\/$/,'').split('/').slice(1);
 try{for(let i=0;i<parts.length;i++){parts[i]=decodeURIComponent(parts[i]);if(!parts[i]||/[\\/]/.test(parts[i]))return {kind:'missing'};}}catch{return {kind:'missing'};}
 if(parts.length===1&&parts[0]==='local')return {kind:'local'};
 if(parts.length===1&&['login','register'].includes(parts[0]))return {kind:'team',auth:parts[0] as 'login'|'register'};
 if(parts[0]==='invite'&&parts.length===2)return {kind:'team',inviteToken:parts[1]};
 if(parts[0]==='teams'){
  if(parts.length===1)return {kind:'team'};
  if(parts.length===2)return {kind:'team',teamId:parts[1],section:'overview'};
  if(parts.length===3&&parts[2]==='workspace')return {kind:'team',teamId:parts[1]};
  if(parts.length===3&&parts[2]==='members')return {kind:'team',teamId:parts[1],section:'members'};
 }
 if(parts[0]==='projects'){
  if(parts.length===1)return {kind:'team'};
  if(parts.length===2)return {kind:'team',projectId:parts[1]};
  if(parts[2]==='documents'){
   if(parts.length===4)return {kind:'team',projectId:parts[1],documentId:parts[3]};
   if(parts.length===6&&parts[4]==='revisions')return {kind:'revision',projectId:parts[1],documentId:parts[3],revisionId:parts[5]};
  }
 }
 return {kind:'missing'};
}
export function safeReturnPath(next:string|null){if(!next||next==='/'||!next.startsWith('/')||next.startsWith('//'))return null;const url=new URL(next,'http://local');if(url.origin!=='http://local')return null;const r=routeFor(url.pathname,url.search);return r.kind==='revision'||(r.kind==='team'&&!r.auth)?url.pathname+url.search:null;}

export const teamPath=(teamId:string)=>`/teams/${part(teamId)}`;
export const workspacePath=(teamId:string)=>`${teamPath(teamId)}/workspace`;
export const matchesId=(id:string|undefined,entity:{id:string;legacy_id?:string})=>id===entity.id||!!id&&id===entity.legacy_id;
