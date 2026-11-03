import {useEffect,useRef} from 'react';
import {isEditingTarget} from './interaction';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';

export function ViewerToolbar({host,children}:{host?:HTMLElement|null;children:ReactNode}){
 const toolbar=<div className="canvas-bar" role="toolbar" aria-label="画布工具">{children}</div>;
 return host?createPortal(toolbar,host):toolbar;
}

// Keep the listener stable while actions follow the latest camera and selection.
export function useViewerShortcuts(onZoom:(factor:number)=>void,onReset:()=>void,onActualSize:()=>void){
 const actions=useRef({onZoom,onReset,onActualSize});actions.current={onZoom,onReset,onActualSize};
 useEffect(()=>{const down=(e:KeyboardEvent)=>{
  if(isEditingTarget(e.target)||!(e.ctrlKey||e.metaKey)||e.altKey)return;
  if(['+','=','-','_','0','1'].includes(e.key)){
   e.preventDefault();
   if(e.key==='0')actions.current.onReset();else if(e.key==='1')actions.current.onActualSize();else actions.current.onZoom(e.key==='-'||e.key==='_'?1/1.2:1.2);
  }
 };window.addEventListener('keydown',down);return()=>window.removeEventListener('keydown',down);},[]);
}
