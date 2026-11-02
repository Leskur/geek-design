import {useLayoutEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useLayoutEffect(()=>{const dialog=ref.current!;dialog.showModal();dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]:not(:disabled)')?.focus({preventScroll:true});return()=>dialog.close();},[]);
 return <dialog ref={ref} className={`wb-dialog${wide?' wide':''}`} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><div className="wb-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="wb-icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={18}/></button></div>{children}</dialog>;
}
