import {useMemo,useState,type ReactNode} from 'react';
import type {Layer,DocumentSource} from './sketch';
import {color} from './sketch';
import type {SceneCache} from './SceneCache';
import {Outline,Ruler,Drawing} from './Canvas';
import {inspectionTarget,measure,type Rect} from './interaction';

export function PageBoard({board,doc,cache,live,inspect,scale,selected,measurement,alt,enabled,onSelect,onLocate,onError,children}:{board:Layer;doc:DocumentSource;cache:SceneCache;live:boolean;inspect:boolean;scale:number;selected:Layer|null;measurement:Rect|null;alt:boolean;enabled:()=>boolean;onSelect:(layer:Layer)=>void;onLocate:()=>void;onError:(message:string)=>void;children:ReactNode}){
 const [hover,setHover]=useState<string|null>(null);
 const scene=useMemo(()=>{if(!inspect)return null;try{return cache.get(board);}catch{return null;}},[board,cache,inspect]);
 const index=useMemo(()=>scene?cache.index(scene.root):null,[scene,cache]);
 const chosen=selected&&index?.get(selected.do_objectID),hovered=hover&&index?.get(hover);
 const target=hovered||(alt&&index?.get(board.do_objectID));
 const distances=alt&&measurement&&target?measure(measurement,target.bounds):[];
 function hit(e:React.MouseEvent|React.PointerEvent){
  const entries=index||cache.index(cache.get(board).root);
  const element=e.target instanceof Element?e.target.closest('[data-layer]'):null;
  let id=element?.getAttribute('data-layer')||null;
  if(!id&&!live){
   const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)/scale,y=(e.clientY-rect.top)/scale;
   // The thumbnail has no layer DOM yet. Use saved geometry for its first selection.
   for(const entry of [...entries.values()].reverse()){
    const [a,b,c,d,tx,ty]=entry.matrix,det=a*d-b*c;if(!det||entry.layer.isVisible===false||entry.layer._hiddenSymbol)continue;
    const px=(d*(x-tx)-c*(y-ty))/det,py=(-b*(x-tx)+a*(y-ty))/det;
    if(px>=0&&py>=0&&px<=entry.layer.frame.width&&py<=entry.layer.frame.height){id=entry.layer.do_objectID;break;}
   }
  }
  return inspectionTarget(id,entries,e.shiftKey)?.layer||entries.get(board.do_objectID)!.layer;
 }
 return <div className="page-board-surface" onClickCapture={e=>{e.stopPropagation();if(!enabled()||alt)return;try{onSelect(hit(e));}catch(error){onError((error as Error).message);}}} onDoubleClick={e=>{e.stopPropagation();if(enabled())onLocate();}}
  onPointerMove={e=>{if(!enabled()||!scene){setHover(null);return;}try{const layer=hit(e);setHover(layer.do_objectID===board.do_objectID?null:layer.do_objectID);}catch{setHover(null);}}} onPointerLeave={()=>setHover(null)}>
  {!live&&children}
  {scene&&<svg className={live?'page-board-svg':'page-board-overlay'} width={board.frame.width} height={board.frame.height} viewBox={`0 0 ${board.frame.width} ${board.frame.height}`} style={{background:live?(board.hasBackgroundColor?color(board.backgroundColor):'#fff'):'transparent'}}>
   {live&&<Drawing root={scene.root} doc={doc}/>}
   <g pointerEvents="none">{chosen&&<Outline entry={chosen} scale={scale} kind="selected"/>}{hovered&&hovered!==chosen&&<Outline entry={hovered} scale={scale} kind="hover"/>}<g stroke="#f45a76" strokeWidth={1/scale}>{distances.map((distance,i)=><Ruler key={i} distance={distance} scale={scale}/>)}</g></g>
  </svg>}
 </div>;
}
