import {api} from './api';
import {FontPanel} from './FontPanel';
import {UnifiedTree} from './UnifiedTree';
import {PageOverview} from './PageOverview';
import {SceneCache} from './SceneCache';
import {ThumbnailCache} from './ThumbnailCache';
import type {Camera} from './interaction';
import {Logo} from './Logo';
import {Plus,Frame,Download,Link,FileImage,SpellCheck2} from 'lucide-react';
import React, {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {SketchDocument,type Layer,type DocumentSource} from './sketch';
import {Canvas} from './Canvas';
import {RemoteDocument} from './RemoteDocument';
import {TeamHub} from './TeamHub';
import {ViewerNavigation} from './ViewerNavigation';
import {DocumentOpening} from './DocumentOpening';
import {routeFor,matchesId} from './routes';
import {PageSwitcher} from './PageSwitcher';
import {Inspector} from './Inspector';

import {fontNames,hasFont} from './fonts';
import './style.css';
import './view-states.css';
import './actions.css';
import './inspector.css';
import './overview.css';
import './cursor.css';

const AIExport=lazy(()=>import('./AIExport').then(m=>({default:m.AIExport})));
export function App(){
 const [zoomHost,setZoomHost]=useState<HTMLDivElement|null>(null);
 const [toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null);
 const [doc,setDoc]=useState<DocumentSource|null>(null),[page,setPage]=useState<Layer|null>(null),[board,setBoard]=useState<Layer|null>(null),[selected,setSelected]=useState<Layer|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[mode,setMode]=useState<'overview'|'detail'>('overview'),[toast,setToast]=useState('');
 const input=useRef<HTMLInputElement>(null);const loadId=useRef(0),pageId=useRef(0),current=useRef<DocumentSource|null>(null);
 const boards=page?.layers||[];
 const cache=useMemo(()=>doc?new SceneCache(doc):null,[doc]);
 const thumbnails=useMemo(()=>doc&&cache?new ThumbnailCache(doc,cache):null,[doc,cache]);
 useEffect(()=>()=>thumbnails?.dispose(),[thumbnails]);
 const scene=useMemo(()=>board&&cache?cache.get(board):null,[board,cache]);
 const overviewSelection=useRef<{pageId:string;board:Layer|null;selected:Layer|null}|null>(null);
 const cameras=useRef(new Map<string,Camera>());
 const [focus,setFocus]=useState<{id:string;serial:number}|null>(null),[detailFocus,setDetailFocus]=useState<{id:string;serial:number}|null>(null);
 const [showWarnings,setShowWarnings]=useState(false),[showExport,setShowExport]=useState(false);
 const [showFonts,setShowFonts]=useState(false),[fontEpoch,setFontEpoch]=useState(0),[fontTarget,setFontTarget]=useState(''),[fontStatus,setFontStatus]=useState('');
 const fontInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  if(!doc||doc.source!=='team'||doc.fontLibrary)return;
  const controller=new AbortController(),projectId=routeFor(location.pathname,location.search).projectId;
  if(!projectId)return;
  void (async()=>{try{
   const projects=await api<{id:string;legacy_id?:string;team_id:string}[]>('/projects',{signal:controller.signal});
   const project=projects.find(p=>matchesId(projectId,p));if(!project)return;
   const team=await api<{id:string;role:string}>(`/teams/${project.team_id}`,{signal:controller.signal});
   if(controller.signal.aborted)return;doc.fontLibrary={teamId:team.id,canUpload:['owner','admin'].includes(team.role)};setFontEpoch(v=>v+1);
  }catch{/* Keep the font details available if team metadata cannot be fetched. */}})();
  return()=>controller.abort();
 },[doc]);

 useEffect(()=>{const refresh=()=>setFontEpoch(v=>v+1);document.fonts.addEventListener('loadingdone',refresh);window.addEventListener('viewer-fonts-changed',refresh);return()=>{document.fonts.removeEventListener('loadingdone',refresh);window.removeEventListener('viewer-fonts-changed',refresh);};},[]);
 const pageFonts=useMemo(()=>fontNames(page,doc||undefined),[page,doc]);
 const fonts=useMemo(()=>pageFonts.map(name=>({name,available:hasFont(name)})),[pageFonts,fontEpoch]);
 const missingFonts=fonts.filter(f=>!f.available).length;
 async function loadFont(file:File){try{setFontStatus('正在加载字体…');const face=await new FontFace(fontTarget,await file.arrayBuffer()).load();document.fonts.add(face);setFontEpoch(v=>v+1);setFontStatus(`已加载 ${file.name} → ${fontTarget}，仅在当前浏览器会话生效`);}catch{setFontStatus('字体加载失败，请选择有效的 TTF、OTF 或 WOFF 字体文件');}}
 function pickFont(name:string){setFontTarget(name);fontInput.current?.click();}
 async function loadSource(next:DocumentSource){const token=++loadId.current;pageId.current++;setBusy(true);setError('');setStatus(next.source==='team'?'连接团队文档…':'读取文件目录…');try{await next.open();setStatus('读取组件和页面…');await next.loadSymbols();const requested=new URLSearchParams(location.search),first=next.pages.find(x=>x.id===requested.get('page'))||next.pages.find(x=>/UI\(H5\)/i.test(x.name))||next.pages[0];const p=await next.page(first.id);if(token!==loadId.current){await next.close();return;}const old=current.current;current.current=next;setDoc(next);setPage(p);setBoard(p.layers?.find(x=>x.do_objectID===requested.get('artboard'))||p.layers?.[0]||null);setSelected(null);setSearch('');cameras.current.clear();setFocus(null);setDetailFocus(null);setMode(requested.has('artboard')?'detail':'overview');setStatus(next.source==='team'?'团队文档 · 按需加载':'本地文件 · 未上传');if(old)await old.close();}catch(e){if(next.source==='team'&&(e as any).status===401){location.assign('/login?next='+encodeURIComponent(location.pathname+location.search));return;}if(next!==current.current)await next.close();if(token===loadId.current)setError((e as Error).message);}finally{if(token===loadId.current)setBusy(false);}}
 async function open(file:File){if(!file.name.toLowerCase().endsWith('.sketch')){setError('请选择 .sketch 文件');return;}history.replaceState(null,'','/local');await loadSource(new SketchDocument(file));}
 useEffect(()=>{const route=routeFor(location.pathname,location.search);const id=route.revisionId;if(id)void loadSource(new RemoteDocument(id));},[]);
 function viewerURL(pageId:string,boardId?:string){const url=new URL(location.href);url.searchParams.set('page',pageId);if(boardId)url.searchParams.set('artboard',boardId);else url.searchParams.delete('artboard');return url.pathname+url.search;}
 function recordBoard(b:Layer){if(!page)return;if(mode==='overview'){history.replaceState({...history.state,viewer:true},'',viewerURL(page.do_objectID));history.pushState({viewer:true,fromOverview:true},'',viewerURL(page.do_objectID,b.do_objectID));}else history.replaceState(history.state,'',viewerURL(page.do_objectID,b.do_objectID));}
 function returnOverview(){if(history.state?.fromOverview){history.back();return;}if(page)history.replaceState({viewer:true},'',viewerURL(page.do_objectID));setMode('overview');const saved=overviewSelection.current;if(saved&&saved.pageId===page?.do_objectID){setBoard(saved.board);setSelected(saved.selected);}else setSelected(board);setFocus(null);setDetailFocus(null);}
 useEffect(()=>{if(!doc)return;let disposed=false;async function restore(){const token=++pageId.current;const params=new URLSearchParams(location.search),id=params.get('page')||page?.do_objectID;if(!id)return;setShowExport(false);setShowFonts(false);try{const p=await doc!.page(id);if(disposed||token!==pageId.current)return;const b=p.layers?.find(x=>x.do_objectID===params.get('artboard'))||p.layers?.[0]||null;const saved=!params.get('artboard')&&overviewSelection.current?.pageId===p.do_objectID?overviewSelection.current:null;setPage(p);setBoard(saved?saved.board:b);setSelected(saved?saved.selected:null);setSearch('');setFocus(null);setDetailFocus(null);setMode(params.get('artboard')&&b?'detail':'overview');}catch(e){if(!disposed)setError((e as Error).message);}}const listener=()=>{void restore();};window.addEventListener('popstate',listener);return()=>{disposed=true;window.removeEventListener('popstate',listener);};},[doc,page?.do_objectID]);
 async function changePage(id:string){if(!doc)return;const token=++pageId.current;setBusy(true);try{const p=await doc.page(id);if(token!==pageId.current)return;history.replaceState({viewer:true},'',viewerURL(id));setPage(p);setBoard(p.layers?.[0]||null);setSelected(null);setSearch('');setMode('overview');setFocus(null);setDetailFocus(null);}catch(e){setError(String(e));}finally{if(token===pageId.current)setBusy(false);}}
 const choose=useCallback((l:Layer|null)=>setSelected(l),[]);
 function selectBoard(b:Layer|null){setBoard(b);setSelected(b);}
 function openBoard(b:Layer){if(mode==='overview'&&page)overviewSelection.current={pageId:page.do_objectID,board,selected};recordBoard(b);setFocus(null);setBoard(b);setSelected(null);setMode('detail');setDetailFocus(null);}
 function navigateBoard(b:Layer){selectBoard(b);if(mode==='overview')setFocus(old=>({id:b.do_objectID,serial:(old?.serial||0)+1}));else {recordBoard(b);setDetailFocus(old=>({id:b.do_objectID,serial:(old?.serial||0)+1}));}}
 function navigateLayer(b:Layer,l:Layer){if(mode==='overview'){setBoard(b);setSelected(l);setFocus(old=>({id:l.do_objectID,serial:(old?.serial||0)+1}));return;}recordBoard(b);setFocus(null);setBoard(b);setSelected(l);setMode('detail');setDetailFocus(old=>({id:l.do_objectID,serial:(old?.serial||0)+1}));}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setToast('已复制');setTimeout(()=>setToast(''),1500);}catch{setToast('复制失败，请手动选择文本');}}
 const route=routeFor(location.pathname,location.search);
 if(route.kind==='team')return <TeamHub/>;
 if(route.kind==='missing')return <main className="welcome missing-page"><h1>页面不存在</h1><a className="button-link" href="/teams">返回工作台</a></main>;
 if(route.kind==='revision'&&!doc)return <DocumentOpening projectId={route.projectId} status={status} error={error} onRetry={()=>void loadSource(new RemoteDocument(route.revisionId!))}/>;
 return <div className="app" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(doc)return;const file=e.dataTransfer.files[0];if(file&&file.name.toLowerCase().endsWith('.sketch'))void open(file);}}>
 {doc&&<header className="viewer-header"><a className="brand brand-link viewer-brand" href="/teams" aria-label="GeekDesign 工作台"><Logo size={30}/> Geek<span>Design</span></a><div className="viewer-document-nav"><ViewerNavigation projectId={route.projectId} detail={mode==='detail'} onOverview={returnOverview}/></div><div className="viewer-toolbar" ref={setToolbarHost}/><div className="viewer-header-actions">{missingFonts>0&&<button className="viewer-font-warning" title={`当前页面缺少 ${missingFonts} 种字体，点击查看`} aria-label={`当前页面缺少 ${missingFonts} 种字体，查看详情`} onClick={()=>setShowFonts(true)}><SpellCheck2 size={18} strokeWidth={1.6} aria-hidden="true"/></button>}{doc?.source==='team'&&<button className="viewer-copy" title="复制分享链接" aria-label="复制分享链接" onClick={()=>copy(location.origin+viewerURL(page?.do_objectID||'',mode==='detail'?board?.do_objectID:undefined))}><Link size={16}/>分享</button>}{doc&&board&&<button className="header-export primary" title="导出给 AI" aria-label="AI 导出" onClick={()=>setShowExport(true)}><Download size={16}/>AI 导出</button>}<div className="viewer-zoom" ref={setZoomHost}/></div></header>}<input ref={fontInput} hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e=>{if(e.target.files?.[0])loadFont(e.target.files[0]);e.target.value=''}}/><input ref={input} hidden type="file" accept=".sketch" onChange={e=>{if(e.target.files?.[0])open(e.target.files[0]);e.target.value=''}}/>
 {!doc?<main className="welcome local-landing"><a className="brand brand-link" href="/teams" aria-label="GeekDesign 工作台"><Logo size={32}/>Geek<span>Design</span></a><h1>打开本地 Sketch</h1><p>文件仅在当前浏览器处理</p><button className="drop" disabled={busy} onClick={()=>input.current?.click()}><FileImage size={44} strokeWidth={1.4}/><b>{busy?'正在解析文件…':'将 .sketch 文件拖到这里'}</b><span>或点击选择本地文件 · 无需上传</span></button><a className="local-return" href="/teams">返回工作台</a></main>:<div className="workspace viewer-workspace"><aside className="left"><h2 className="navigation-section-title">页面</h2><PageSwitcher pages={doc.pages} value={page?.do_objectID||''} disabled={busy} onChange={changePage} onReselect={returnOverview}/><h2 className="navigation-section-title layers-heading">图层</h2><input className="search" aria-label="搜索图层" placeholder="搜索图层…" value={search} onChange={e=>setSearch(e.target.value)}/>{cache&&<UnifiedTree boards={boards} cache={cache} activeBoardId={board?.do_objectID} selected={selected} search={search} onBoard={navigateBoard} onLayer={navigateLayer}/>}</aside>
 {mode==='overview'&&page&&cache&&thumbnails?<PageOverview toolbarHost={toolbarHost} zoomHost={zoomHost} key={page.do_objectID} boards={boards} pageId={page.do_objectID} pageName={page.name} doc={doc} cache={cache} thumbnails={thumbnails} selectedId={selected?board?.do_objectID:undefined} selected={selected} onLayer={(b,l)=>{setBoard(b);setSelected(l);}} search={search} onSelect={selectBoard} onOpen={openBoard} cameras={cameras.current} focus={focus}/>:scene?<Canvas key={`detail:${page?.do_objectID}:${board?.do_objectID}`} cameras={cameras.current} cameraKey={`detail:${page?.do_objectID}:${board?.do_objectID}`} toolbarHost={toolbarHost} zoomHost={zoomHost} doc={doc} scene={scene} pageName={page?.name||''} selected={selected} onSelect={choose} onWarnings={()=>setShowWarnings(v=>!v)} onOverview={returnOverview} focusRequest={detailFocus}/>:<main className="center overview-empty">选择画板以查看设计</main>}

 <Inspector selected={selected} root={scene?.root||null} doc={doc} onCopy={copy} onLoadFont={name=>{setShowFonts(true);pickFont(name)}}/></div>}

 {showFonts&&doc&&<FontPanel doc={doc} fonts={fonts} status={fontStatus} onClose={()=>setShowFonts(false)} onLoad={pickFont}/>}{showWarnings&&<div className="compat-panel"><h3>当前画板兼容情况 <button onClick={()=>setShowWarnings(false)}>关闭</button></h3><p>已启用组件覆盖、轮廓蒙版、组合形状和富文本。缺失字体可通过顶栏的字体入口从本机加载。</p>{scene?.warnings.length?<ul>{scene.warnings.map(w=><li key={w}>{w}</li>)}</ul>:<p>未检测到已知的未支持属性；这不代表已经与 Sketch 原稿逐像素对齐。</p>}<p>径向渐变、自动布局和文字排版仍可能存在差异。</p></div>}{(busy||error)&&<div className={'notice '+(error?'error':'')}>{error||status}{error&&<button onClick={()=>setError('')}>关闭</button>}</div>}{toast&&<div className="toast">{toast}</div>}
 {showExport&&doc&&scene&&<Suspense fallback={null}><AIExport doc={doc} board={scene.root} selected={selected} pageName={page?.name||''} warnings={scene.warnings} onClose={()=>setShowExport(false)}/></Suspense>}
</div>;
}

