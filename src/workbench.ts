type Recent={id:string;time:number};
const recentKey=(userId:string)=>`sketchpeek:recent:${userId}`;
export function recentDocuments(userId:string):Recent[]{
 try{const value=JSON.parse(localStorage.getItem(recentKey(userId))||'[]');return Array.isArray(value)?value.filter(r=>typeof r?.id==='string'&&typeof r?.time==='number').slice(0,30):[];}catch{return [];}
}
export function rememberDocument(userId:string,id:string,legacyId?:string){try{const entries=recentDocuments(userId).filter(r=>r.id!==id&&r.id!==legacyId);localStorage.setItem(recentKey(userId),JSON.stringify([{id,time:Date.now()},...entries].slice(0,30)));}catch{}}
export function preferredTeam(userId:string,teams:{id:string;legacy_id?:string}[]){try{const saved=localStorage.getItem(`sketchpeek:team:${userId}`);const found=teams.find(t=>t.id===saved||t.legacy_id===saved);if(found)return found.id;}catch{}return teams[0]?.id;}
export function rememberTeam(userId:string,id:string){try{localStorage.setItem(`sketchpeek:team:${userId}`,id);}catch{}}
export function migratePreferences(userId:string,legacyId?:string){if(!legacyId)return;try{for(const category of ['recent','team','team-tree']){const next=`sketchpeek:${category}:${userId}`,old=localStorage.getItem(`sketchpeek:${category}:${legacyId}`);if(localStorage.getItem(next)===null&&old!==null)localStorage.setItem(next,old);}}catch{}}
