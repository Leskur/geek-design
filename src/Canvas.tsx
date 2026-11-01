import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import type {Layer,DocumentSource} from './sketch';
import {color} from './sketch';
import type {Scene} from './scene';
import {Children} from './renderer';
import {branchInScope,indexLayers,isEditingTarget,measure,panBy,zoomAt,type Camera,type Distance,type IndexedLayer} from './interaction';

const ignore=()=>{};
const Drawing=memo(function Drawing({root,doc}:{root:Layer;doc:DocumentSource}){return <Children layers={root.layers||[]} doc={doc} choose={ignore} w={root.frame.width} h={root.frame.height}/>;});
function Outline({entry,scale,kind}:{entry:IndexedLayer;scale:number;kind:'selected'|'hover'}) {
 return <polygon data-testid={`${kind}-outline`} points={entry.corners.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={kind==='selected'?'#7656e8':'#9c84e3'} strokeWidth={(kind==='selected'?1.5:1)/scale} strokeDasharray={kind==='hover'?`${3/scale} ${2/scale}`:undefined}/>;
}
function Ruler({distance:d,scale}:{distance:Distance;scale:number}) {
 const x=(d.from.x+d.to.x)/2,y=(d.from.y+d.to.y)/2,label=`${Number(d.value.toFixed(1))}`,width=(label.length*6+12)/scale,height=17/scale;
 const lx=d.axis==='x'?x-width/2:x+7/scale,ly=d.axis==='x'?y-23/scale:y-height/2;
 return <g className="distance" data-distance={Number(d.value.toFixed(3))}>
  {d.guides.map((g,i)=><line key={i} x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} strokeDasharray={`${3/scale} ${3/scale}`} opacity=".6"/>)}
  <line x1={d.from.x} y1={d.from.y} x2={d.to.x} y2={d.to.y}/>
  {[d.from,d.to].map((p,i)=><line key={i} x1={p.x-(d.axis==='y'?3/scale:0)} y1={p.y-(d.axis==='x'?3/scale:0)} x2={p.x+(d.axis==='y'?3/scale:0)} y2={p.y+(d.axis==='x'?3/scale:0)}/>)}
  <rect x={lx} y={ly} width={width} height={height} rx={3/scale} fill="#f45a76" stroke="none"/>
  <text data-testid="measurement-label" x={lx+width/2} y={ly+height/2} dominantBaseline="central" textAnchor="middle" fontSize={10/scale} fill="white" stroke="none">{label}</text>
 </g>;
}

export function Canvas({doc,scene,pageName,selected,onSelect,onWarnings}:{doc:DocumentSource;scene:Scene;pageName:string;selected:Layer|null;onSelect:(l:Layer|null)=>void;onWarnings:()=>void}) {
 const root=scene.root,viewport=useRef<HTMLDivElement>(null),index=useMemo(()=>indexLayers(root),[root]);
 const [camera,setCamera]=useState<Camera>({x:60,y:50,scale:.7}),[space,setSpace]=useState(false),[dragging,setDragging]=useState(false),[alt,setAlt]=useState(false),[inside,setInside]=useState(false),[hoverId,setHoverId]=useState<string|null>(null),[scopeId,setScopeId]=useState(root.do_objectID);
 const [panTool,setPanTool]=useState(false);
 const keys=useRef({space:false,alt:false}),drag=useRef<{id:number;x:number;y:number}|null>(null),suppress=useRef(false);
 const selectedEntry=selected?index.get(selected.do_objectID):null,hovered=hoverId?index.get(hoverId):null;
 const target=alt&&inside&&selectedEntry&&!hovered?index.get(root.do_objectID):hovered;
 const distances=alt&&selectedEntry&&target&&selectedEntry!==target&&!space&&!panTool&&!dragging?measure(selectedEntry.bounds,target.bounds):[];
 function fit(widthOnly=false){const v=viewport.current;if(!v)return;const scale=Math.max(.1,Math.min(widthOnly?4:1,(v.clientWidth-120)/Math.max(1,root.frame.width),widthOnly?Infinity:(v.clientHeight-100)/Math.max(1,Math.min(root.frame.height,1000))));setCamera({scale,x:(v.clientWidth-root.frame.width*scale)/2,y:50});}
 useEffect(()=>{setScopeId(root.do_objectID);setHoverId(null);fit();},[root]);
 useEffect(()=>{
  const v=viewport.current;if(!v)return;
  const resize=new ResizeObserver(()=>setCamera(c=>({...c,x:Math.min(Math.max(c.x,60-root.frame.width*c.scale),v.clientWidth-60)})));resize.observe(v);
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();const factor=e.deltaMode===1?16:e.deltaMode===2?v.clientHeight:1;
   const bounds=v.getBoundingClientRect();setHoverId(null);
   if(e.ctrlKey||e.metaKey)setCamera(c=>zoomAt(c,c.scale*Math.exp(-e.deltaY*.002),{x:e.clientX-bounds.x,y:e.clientY-bounds.y}));
   else setCamera(c=>panBy(c,-(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*factor,-(e.shiftKey&&!e.deltaX?0:e.deltaY)*factor));
  };
  v.addEventListener('wheel',wheel,{passive:false});return()=>{resize.disconnect();v.removeEventListener('wheel',wheel)};
 },[root]);
 useEffect(()=>{
  function reset(){keys.current={space:false,alt:false};setSpace(false);setAlt(false);setDragging(false);setHoverId(null);drag.current=null;}
  function down(e:KeyboardEvent){
   if(isEditingTarget(e.target)||e.ctrlKey||e.metaKey)return;
   if(e.code==='Space'){e.preventDefault();keys.current.space=true;setSpace(true);setHoverId(null);}
   if(e.key==='Alt'){e.preventDefault();keys.current.alt=true;setAlt(true);}
   if(e.key==='Escape'){e.preventDefault();setHoverId(null);const scope=index.get(scopeId);if(scope?.parent){onSelect(scope.layer);setScopeId(scope.parent);}else onSelect(null);}
  }
  function up(e:KeyboardEvent){if(e.code==='Space'){e.preventDefault();keys.current.space=false;setSpace(false);}if(e.key==='Alt'){keys.current.alt=false;setAlt(false);}}
  function hidden(){if(document.hidden)reset();}
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden)};
 },[index,scopeId,onSelect]);
 function rawId(target:EventTarget|null){return target instanceof Element?target.closest('[data-layer]')?.getAttribute('data-layer')||null:null;}
 function hit(target:EventTarget|null,deep=false){const id=rawId(target);if(!id)return null;if(deep)return id;return branchInScope(id,scopeId,index)||branchInScope(id,root.do_objectID,index)||id;}
 function end(e:React.PointerEvent<HTMLDivElement>){if(drag.current?.id!==e.pointerId)return;drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function click(e:React.MouseEvent<SVGSVGElement>){
  e.stopPropagation();e.preventDefault();if(suppress.current||keys.current.space||panTool||keys.current.alt||e.altKey)return;
  const id=hit(e.target,e.ctrlKey||e.metaKey);if(!id){onSelect(null);setScopeId(root.do_objectID);return;}
  if(!branchInScope(id,scopeId,index))setScopeId(root.do_objectID);onSelect(index.get(id)!.layer);
 }
 function drill(e:React.MouseEvent<SVGSVGElement>){
  e.stopPropagation();e.preventDefault();if(keys.current.space||panTool||keys.current.alt||suppress.current)return;
  const raw=rawId(e.target),id=hit(e.target);if(!id||!raw)return;
  const entry=index.get(id);if(!entry?.layer.layers?.length)return;
  setScopeId(id);const child=branchInScope(raw,id,index);onSelect(index.get(child||id)!.layer);
 }
 function zoom(factor:number){const v=viewport.current;if(v)setCamera(c=>zoomAt(c,c.scale*factor,{x:v.clientWidth/2,y:v.clientHeight/2}));}
 const isRotated=selectedEntry&&Math.abs(selectedEntry.matrix[1])+Math.abs(selectedEntry.matrix[2])>.00001;
 return <main className="center">
  <div className="canvas-bar"><span>{pageName}<i>/</i><b>{root.name}</b></span><div><button aria-label="手形工具" aria-pressed={panTool} title="手形工具；也可临时按住空格" onClick={()=>{setPanTool(v=>!v);setHoverId(null);}}>手形</button><button aria-label="缩小" onClick={()=>zoom(1/1.2)}>−</button><span>{Math.round(camera.scale*100)}%</span><button aria-label="放大" onClick={()=>zoom(1.2)}>＋</button><button onClick={()=>fit(true)}>适宽</button><button title="回到初始查看位置" onClick={()=>fit()}>复位</button></div></div>
  <div ref={viewport} className={`viewport interactive-canvas${space||panTool?' is-space':''}${dragging?' is-dragging':''}`} tabIndex={0} aria-label="设计画布，按住空格拖动，按住 Alt 测量间距" data-space={space} data-dragging={dragging} data-camera-x={camera.x.toFixed(2)} data-camera-y={camera.y.toFixed(2)}
   onPointerDown={e=>{suppress.current=false;if(e.button!==0&&e.button!==1)return;e.currentTarget.focus({preventScroll:true});if(keys.current.space||panTool||e.button===1){e.preventDefault();suppress.current=true;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);setHoverId(null);}}}
   onPointerMove={e=>{const d=drag.current;if(d&&d.id===e.pointerId){const dx=e.clientX-d.x,dy=e.clientY-d.y;setCamera(c=>panBy(c,dx,dy));d.x=e.clientX;d.y=e.clientY;return;}if(keys.current.space||panTool)return;setHoverId(hit(e.target,e.ctrlKey||e.metaKey||keys.current.alt||e.altKey));}}
   onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}} onPointerEnter={()=>setInside(true)} onPointerLeave={()=>{setInside(false);if(!drag.current)setHoverId(null);}}
   onClickCapture={e=>{if(suppress.current||keys.current.space||panTool||keys.current.alt){e.stopPropagation();e.preventDefault();}}}>
   <div className="paper-wrap" style={{position:'absolute',margin:0,left:camera.x,top:camera.y,width:root.frame.width*camera.scale}}><div className="board-label">{root.name}</div>
    <svg className="design-svg" width={root.frame.width*camera.scale} height={root.frame.height*camera.scale} viewBox={`0 0 ${root.frame.width} ${root.frame.height}`} style={{background:root.hasBackgroundColor?color(root.backgroundColor):'#fff',overflow:'visible'}} onClickCapture={click} onDoubleClickCapture={drill}>
     <Drawing root={root} doc={doc}/>
     <g className="inspection-overlay" pointerEvents="none">{selectedEntry&&<Outline entry={selectedEntry} scale={camera.scale} kind="selected"/>}{hovered&&hovered!==selectedEntry&&!space&&!panTool&&!dragging&&<Outline entry={hovered} scale={camera.scale} kind="hover"/>}<g stroke="#f45a76" strokeWidth={1/camera.scale}>{distances.map((d,i)=><Ruler key={i} distance={d} scale={camera.scale}/>)}</g></g>
    </svg>
   </div>
   <div className="canvas-mode" aria-live="polite">{dragging?'拖动画布':space||panTool?'按住鼠标拖动':alt&&selectedEntry?(isRotated?'测量：画板像素 · 旋转图层按外接框':'测量：画板像素，不随缩放改变'):scopeId!==root.do_objectID?`内部图层 · Esc 返回上级`:''}</div>
  </div>
  <div className="canvas-foot"><button className="compatibility" onClick={onWarnings}>兼容提示 {scene.warnings.length} · 组件 {scene.stats.instances} / 蒙版 {scene.stats.masks}</button><span>空格拖动 · Alt 测距 · 双击进入 · Ctrl 点选内部</span></div>
 </main>;
}
