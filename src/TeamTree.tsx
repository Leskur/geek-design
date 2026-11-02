import {savedTeamOrder,orderTeams,moveTeam,rememberTeamOrder} from './workbench';
import {useEffect,useId,useRef,useState} from 'react';
import {Ellipsis,Plus,Trash2,Pencil,ArrowUpRight} from 'lucide-react';
import {teamPath} from './routes';
import {ContextMenu,type MenuPosition} from './ContextMenu';

type Team={id:string;legacy_id?:string;name:string;role:string};
type Project={id:string;team_id:string;name:string;role?:string};
type Props={userId:string;teams:Team[];projects:Project[];activeTeamId?:string;activeProjectId?:string;overviewPage:boolean;busy:boolean;onCreateTeam:()=>void;onCreateProject:(teamId:string)=>void;onRename?:(kind:'team'|'project',item:Team|Project)=>void;onDelete:(kind:'team'|'project',item:Team|Project)=>void};
export function TeamTree({userId,teams,activeTeamId,busy,onCreateTeam,onDelete,onRename}:Props){
 const [menu,setMenu]=useState<(MenuPosition&{item:Team})|null>(null);
 const [order,setOrder]=useState(()=>savedTeamOrder(userId)),[drop,setDrop]=useState<{id:string;after:boolean}|null>(null);
 const suppressClick=useRef(false),dragged=useRef<string|null>(null),helpId=useId(),sorted=orderTeams(teams,order);
 useEffect(()=>{setOrder(savedTeamOrder(userId));},[userId]);
 function reorder(from:string,to:string,after:boolean){const next=moveTeam(sorted.map(t=>t.id),from,to,after);setOrder(next);rememberTeamOrder(userId,next);}
 function stopDrag(){dragged.current=null;setDrop(null);}
 function show(e:React.MouseEvent,item:Team){e.preventDefault();setMenu({x:e.clientX,y:e.clientY,item});}
 return <nav className="wb-team-tree management-team-list" aria-label="团队列表">

  <p id={helpId} className="sr-only">拖动调整团队顺序，也可聚焦团队名称后按 Alt 加上下方向键调整。</p><ul>{sorted.map((t,index)=><li key={t.id} data-team-id={t.id} className={`wb-tree-team${t.id===activeTeamId?' current':''}${drop?.id===t.id?(drop.after?' drop-after':' drop-before'):''}`} onDragOver={e=>{if(!dragged.current||busy)return;e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect();setDrop({id:t.id,after:e.clientY>rect.top+rect.height/2});}} onDrop={e=>{if(!dragged.current||busy)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();reorder(dragged.current,t.id,e.clientY>rect.top+rect.height/2);stopDrag();}}><div className="wb-tree-team-row" onContextMenu={e=>show(e,t)}><a draggable={!busy&&sorted.length>1} aria-describedby={helpId} onPointerDown={()=>{suppressClick.current=false;}} onClick={e=>{if(e.detail>0&&suppressClick.current){e.preventDefault();suppressClick.current=false;}}} onDragStart={e=>{suppressClick.current=true;dragged.current=t.id;setMenu(null);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);}} onDragEnd={stopDrag} onKeyDown={e=>{if(!e.altKey||busy||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const target=sorted[index+(e.key==='ArrowUp'?-1:1)];if(target)reorder(t.id,target.id,e.key==='ArrowDown');}} className="wb-tree-team-name" href={teamPath(t.id)} aria-current={t.id===activeTeamId?'page':undefined} title={t.name}><span className="management-team-mark" aria-hidden="true">{Array.from(t.name)[0]}</span><span>{t.name}</span></a><button className="wb-icon-button gd-tree-more" aria-label={`${t.name}的团队操作`} onClick={e=>show(e,t)}><Ellipsis size={16}/></button></div></li>)}</ul>
  <button className="management-add-team" disabled={busy} onClick={onCreateTeam}><Plus size={15}/>新增团队</button>
  {!teams.length&&<p className="wb-tree-no-teams">创建或加入团队后，会显示在这里。</p>}
  {menu&&<ContextMenu position={menu} onClose={()=>setMenu(null)}><a href={teamPath(menu.item.id)}><ArrowUpRight size={16}/>打开团队</a>{menu.item.role!=='member'&&onRename&&<button disabled={busy} onClick={()=>onRename('team',menu.item)}><Pencil size={16}/>重命名团队</button>}{menu.item.role==='owner'&&<button className="danger" disabled={busy} onClick={()=>onDelete('team',menu.item)}><Trash2 size={16}/>删除团队</button>}</ContextMenu>}
 </nav>;
}
