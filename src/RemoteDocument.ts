import type {DocumentSource,Layer,PageInfo} from '../shared/document';
import {api} from './api';
import {rememberDocument} from './workbench';
import {routeFor,revisionPath} from './routes';
export class RemoteDocument implements DocumentSource {
 source='team' as const;file={name:'团队文档',size:0};pages:PageInfo[]=[];symbols=new Map<string,Layer>();styles=new Map<string,any>();
 private manifest:any;private cache=new Map<string,Layer>();private urls=new Map<string,string>();private pending=new Map<string,Promise<string>>();private abort=new AbortController();
 constructor(public revisionId:string){}
 async open(){this.manifest=await api(`/revisions/${encodeURIComponent(this.revisionId)}/manifest`,{signal:this.abort.signal});const route=routeFor(location.pathname,location.search);if((route.projectId&&![this.manifest.projectId,this.manifest.legacyProjectId].includes(route.projectId))||(route.documentId&&![this.manifest.documentId,this.manifest.legacyDocumentId].includes(route.documentId)))throw new Error('稿件不属于此项目或文档，请检查链接');this.revisionId=this.manifest.revisionId;history.replaceState(null,'',revisionPath(this.manifest.projectId,this.manifest.documentId,this.revisionId)+location.search.replace(/([?&])revision=[^&]*&?/, '$1').replace(/[?&]$/,''));this.file=this.manifest.file;this.pages=this.manifest.pages;if(this.manifest.viewerId)rememberDocument(this.manifest.viewerId,this.manifest.documentId,this.manifest.legacyDocumentId);}
 async loadSymbols(){const data=await api(`/revisions/${encodeURIComponent(this.revisionId)}/symbols`,{signal:this.abort.signal});this.symbols=new Map(data.symbols);this.styles=new Map(data.styles);}
 async page(id:string){const cached=this.cache.get(id);if(cached)return cached;const page=await api<Layer>(`/revisions/${encodeURIComponent(this.revisionId)}/pages/${encodeURIComponent(id)}`,{signal:this.abort.signal});this.cache.set(id,page);return page;}
 async image(ref:string):Promise<string>{
  if(this.urls.has(ref))return this.urls.get(ref)!;if(this.pending.has(ref))return this.pending.get(ref)!;
  const assets=this.manifest.assets;const entry=assets[ref]||Object.entries(assets).find(([name])=>name.startsWith(ref+'.'))?.[1] as any;if(!entry)return '';
  const task=(async()=>{const response=await fetch(`/api/revisions/${encodeURIComponent(this.revisionId)}/assets/${entry.hash}`,{credentials:'same-origin',signal:this.abort.signal});if(!response.ok)throw new Error('资源读取失败');const blob=await response.blob();if(this.abort.signal.aborted)return '';const url=URL.createObjectURL(blob);this.urls.set(ref,url);return url;})();this.pending.set(ref,task);try{return await task;}finally{this.pending.delete(ref);}
 }
 async close(){this.abort.abort();for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.cache.clear();this.symbols.clear();}
}
