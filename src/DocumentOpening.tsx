import {Logo} from './Logo';
import {ViewerNavigation} from './ViewerNavigation';
import {LoaderCircle,FileWarning,RotateCw} from 'lucide-react';
export function DocumentOpening({status,error,onRetry,projectId}:{status:string;error:string;onRetry:()=>void;projectId?:string}){
 return <div className="app document-opening">
  <header className="viewer-header"><a className="brand brand-link viewer-brand" href="/teams" aria-label="GeekDesign 工作台"><Logo size={30}/></a><div className="viewer-document-nav"><ViewerNavigation projectId={projectId}/></div></header>
  <div className="workspace viewer-workspace">
   <aside className="left opening-sidebar" aria-hidden="true"><div className="opening-placeholder opening-select"/>{Array.from({length:7},(_,i)=><div className="opening-row" key={i}><div className="opening-placeholder opening-square"/><div><div className="opening-placeholder"/><div className="opening-placeholder opening-short"/></div></div>)}</aside>
   <main className="center opening-center" aria-busy={!error}><div className="opening-canvas"><div className="opening-message" role={error?'alert':'status'} aria-live="polite" aria-atomic="true">
    {error?<FileWarning size={30} strokeWidth={1.5} aria-hidden="true"/>:<LoaderCircle size={28} className="opening-spinner" aria-hidden="true"/>}
    <h1>{error?'设计暂时无法打开':'正在打开设计'}</h1><p>{error||status||'正在连接设计文件…'}</p>
    {error&&<div className="opening-actions"><button onClick={onRetry}><RotateCw size={14}/>重试</button><a href="/teams">返回工作台</a></div>}
   </div></div></main>
  </div>
 </div>;
}
