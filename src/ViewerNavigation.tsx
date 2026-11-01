import {useEffect,useState} from 'react';
import {ArrowLeft,FolderOpen,FileImage,LoaderCircle} from 'lucide-react';
import {api} from './api';
import {Dialog} from './Dialog';
import {Choice} from './Choice';
import {projectPath,revisionPath} from './routes';
export function ViewerNavigation({projectId}:{projectId?:string}){
 const [open,setOpen]=useState(false),[projects,setProjects]=useState<any[]>([]),[id,setId]=useState(projectId||''),[docs,setDocs]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;let alive=true;api<any[]>('/projects').then(p=>{if(alive){setProjects(p);if(!id)setId(p[0]?.id||'');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[open]);
 useEffect(()=>{if(!open||!id)return;let alive=true;setBusy(true);setError('');setDocs([]);api<any[]>(`/projects/${id}/documents`).then(d=>{if(alive)setDocs(d);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[open,id]);
 return <><a className="team-link viewer-back" href={projectId?projectPath(projectId):'/teams'}><ArrowLeft size={16}/>{projectId?'返回项目':'工作台'}</a><button className="viewer-switch" onClick={()=>setOpen(true)}><FolderOpen size={16}/>切换设计</button>{open&&<Dialog title="切换设计" onClose={()=>setOpen(false)}><div className="gd-switch-body"><Choice label="选择项目" value={id} options={projects.map(p=>({id:p.id,name:p.name}))} onChange={setId}/>{error?<p role="alert" className="team-error">{error}</p>:busy?<p role="status"><LoaderCircle size={18} className="wb-spin"/>正在读取设计…</p>:<div className="gd-switch-files">{docs.map(d=><a key={d.id} href={d.current_revision?revisionPath(d.project_id,d.id,d.current_revision):projectPath(id)}><FileImage size={18}/><span>{d.name}</span><small>{d.current_revision?'打开设计':'前往项目'}</small></a>)}{!docs.length&&<p>这个项目还没有设计文件。</p>}</div>}<a className="team-link" href="/teams">前往工作台</a></div></Dialog>}</>;
}
