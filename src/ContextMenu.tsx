import {useEffect,useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export type MenuPosition={x:number;y:number};
export function ContextMenu({position,onClose,children}:{position:MenuPosition;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=ref.current!,r=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(position.x,innerWidth-r.width-8))+'px';el.style.top=Math.max(8,Math.min(position.y,innerHeight-r.height-8))+'px';el.querySelector<HTMLElement>('a,button')?.focus();},[position]);
 useEffect(()=>{const close=(e:Event)=>{if(!ref.current?.contains(e.target as Node))onClose();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('a,button:not(:disabled)')||[]);let i=items.indexOf(document.activeElement as HTMLElement);i=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[i]?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);window.addEventListener('resize',onClose);window.addEventListener('scroll',onClose,true);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);window.removeEventListener('resize',onClose);window.removeEventListener('scroll',onClose,true);};},[onClose]);
 return createPortal(<div ref={ref} className="gd-context-menu" aria-label="快捷操作" style={{left:position.x,top:position.y}} onClick={onClose}>{children}</div>,document.body);
}
