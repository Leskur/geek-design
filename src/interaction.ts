import type {Layer} from './sketch';

export type Point={x:number;y:number};
export type Rect=Point&{width:number;height:number};
export type Camera=Point&{scale:number};
export type Matrix=[number,number,number,number,number,number];
export type IndexedLayer={layer:Layer;parent:string|null;matrix:Matrix;corners:Point[];bounds:Rect};
const identity:Matrix=[1,0,0,1,0,0];

export function multiply(a:Matrix,b:Matrix):Matrix {
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function position(l:Layer):Matrix {
 const f=l.frame,r=-(l.rotation||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),sx=l.isFlippedHorizontal?-1:1,sy=l.isFlippedVertical?-1:1;
 const a=c*sx,b=s*sx,d=c*sy,e=-s*sy;
 return [a,b,e,d,f.x+f.width/2-a*f.width/2-e*f.height/2,f.y+f.height/2-b*f.width/2-d*f.height/2];
}
export function apply(matrix:Matrix,p:Point):Point {return {x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]};}
export function indexLayers(root:Layer) {
 const index=new Map<string,IndexedLayer>();
 function visit(l:Layer,parent:string|null,m:Matrix){
  const matrix=parent?multiply(m,position(l)):identity;
  const corners=[{x:0,y:0},{x:l.frame.width,y:0},{x:l.frame.width,y:l.frame.height},{x:0,y:l.frame.height}].map(p=>apply(matrix,p));
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
  index.set(l.do_objectID,{layer:l,parent,matrix,corners,bounds:{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y}});
  l.layers?.forEach(child=>visit(child,l.do_objectID,matrix));
 }
 visit(root,null,identity);return index;
}
export function branchInScope(id:string,scope:string,index:Map<string,IndexedLayer>):string|null {
 if(id===scope)return null;
 let current=index.get(id);
 while(current?.parent){if(current.parent===scope)return current.layer.do_objectID;current=index.get(current.parent);}
 return null;
}
// Inspection starts at the painted layer, independent of the current selection.
// Compound vector paths remain one icon instead of exposing invisible geometry markers.
export function inspectionTarget(id:string|null,index:Map<string,IndexedLayer>,parent=false):IndexedLayer|null {
 let entry=id?index.get(id):undefined;if(!entry)return null;
 let ancestor=entry.parent?index.get(entry.parent):undefined;
 while(ancestor){if(ancestor.layer._class==='shapeGroup')entry=ancestor;ancestor=ancestor.parent?index.get(ancestor.parent):undefined;}
 if(parent&&entry.parent)entry=index.get(entry.parent);
 return entry||null;
}
export function zoomAt(camera:Camera,scale:number,anchor:Point):Camera {
 const next=Math.max(.1,Math.min(4,scale)),ratio=next/camera.scale;
 return {x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio,scale:next};
}
export function panBy(camera:Camera,dx:number,dy:number):Camera {return {...camera,x:camera.x+dx,y:camera.y+dy};}
export function isEditingTarget(target:EventTarget|null):boolean {
 if(!(target instanceof Element))return false;
 return !!target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],.font-panel,.compat-panel');
}

export type Distance={axis:'x'|'y';from:Point;to:Point;value:number;guides:{from:Point;to:Point}[]};
export function measure(a:Rect,b:Rect):Distance[] {
 const out:Distance[]=[],ar=a.x+a.width,ab=a.y+a.height,br=b.x+b.width,bb=b.y+b.height;
 const xOverlap=Math.min(ar,br)-Math.max(a.x,b.x),yOverlap=Math.min(ab,bb)-Math.max(a.y,b.y);
 const midX=xOverlap>=0?(Math.max(a.x,b.x)+Math.min(ar,br))/2:a.x+a.width/2;
 const midY=yOverlap>=0?(Math.max(a.y,b.y)+Math.min(ab,bb))/2:a.y+a.height/2;
 function x(from:number,to:number,ya:number,yb:number){out.push({axis:'x',from:{x:from,y:midY},to:{x:to,y:midY},value:Math.abs(to-from),guides:[{from:{x:from,y:ya},to:{x:from,y:midY}},{from:{x:to,y:yb},to:{x:to,y:midY}}]});}
 function y(from:number,to:number,xa:number,xb:number){out.push({axis:'y',from:{x:midX,y:from},to:{x:midX,y:to},value:Math.abs(to-from),guides:[{from:{x:xa,y:from},to:{x:midX,y:from}},{from:{x:xb,y:to},to:{x:midX,y:to}}]});}
 if(ar<=b.x)x(ar,b.x,a.y+a.height/2,b.y+b.height/2);
 else if(br<=a.x)x(a.x,br,a.y+a.height/2,b.y+b.height/2);
 else {if(Math.abs(a.x-b.x)>.01)x(a.x,b.x,midY,midY);if(Math.abs(ar-br)>.01)x(ar,br,midY,midY);}
 if(ab<=b.y)y(ab,b.y,a.x+a.width/2,b.x+b.width/2);
 else if(bb<=a.y)y(a.y,bb,a.x+a.width/2,b.x+b.width/2);
 else {if(Math.abs(a.y-b.y)>.01)y(a.y,b.y,midX,midX);if(Math.abs(ab-bb)>.01)y(ab,bb,midX,midX);}
 return out;
}
