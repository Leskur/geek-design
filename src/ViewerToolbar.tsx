import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';

export function ViewerToolbar({host,children}:{host?:HTMLElement|null;children:ReactNode}){
 const toolbar=<div className="canvas-bar" role="toolbar" aria-label="画布工具">{children}</div>;
 return host?createPortal(toolbar,host):toolbar;
}
