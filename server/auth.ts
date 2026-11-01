import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {Store,User} from './db';
const scrypt=promisify(scryptCallback);
export function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function passwordHash(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return salt+':'+key.toString('hex');}
export async function checkPassword(password:string,stored:string){const [salt,hex]=stored.split(':');const actual=await scrypt(password,salt,64) as Buffer;return timingSafeEqual(actual,Buffer.from(hex,'hex'));}
export function session(store:Store,userId:string){const token=randomBytes(32).toString('hex');store.run('INSERT INTO sessions VALUES(?,?,?)',hashToken(token),userId,Date.now()+7*86400000);return token;}
export function authenticate(store:Store,token:string|undefined):User{if(!token)fail(401,'请先登录');const user=store.one('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',hashToken(token),Date.now());if(!user)fail(401,'登录已过期，请重新登录');return user;}
export function teamAccess(store:Store,user:User,teamId:string,manage=false){
 const member=store.one('SELECT t.*,m.role FROM teams t JOIN team_members m ON m.team_id=t.id WHERE t.id=? AND m.user_id=?',teamId,user.id);
 if(!member)fail(404,'团队不存在或无权访问');if(manage&&member.role==='member')fail(403,'需要团队管理权限');return member;
}
export function membership(store:Store,user:User,projectId:string,write=false,owner=false){
 const project=store.one('SELECT * FROM projects WHERE id=?',projectId);if(!project)fail(404,'项目不存在或无权访问');
 const team=teamAccess(store,user,project.team_id),member=store.one('SELECT role FROM members WHERE project_id=? AND user_id=?',projectId,user.id);
 const role=team.role==='owner'||team.role==='admin'?'owner':member?.role;if(!role)fail(404,'项目不存在或无权访问');
 if((write&&role==='viewer')||(owner&&role!=='owner'))fail(403,'没有此操作权限');return role;
}
export function documentAccess(store:Store,user:User,id:string,write=false){const d=store.one('SELECT * FROM documents WHERE id=?',id);if(!d)fail(404,'文档不存在或无权访问');membership(store,user,d.project_id,write);return d;}
export function revisionAccess(store:Store,user:User,id:string){const r=store.one('SELECT * FROM revisions WHERE id=?',id);if(!r)fail(404,'记录不存在或无权访问');documentAccess(store,user,r.document_id);return r;}
