import {useState} from 'react';
import type {DocumentSource} from './sketch';
import {teamPath} from './routes';

export function FontPanel({doc,fonts,status,onClose,onLoad}:{doc:DocumentSource;fonts:{name:string;available:boolean}[];status:string;onClose:()=>void;onLoad:(name:string)=>void}){
 const [retrying,setRetrying]=useState(false),[retryError,setRetryError]=useState('');
 const team=doc.source==='team',library=doc.fontLibrary;
 async function retry(){setRetrying(true);setRetryError('');try{await doc.retryFonts?.();}catch(e){setRetryError((e as Error).message);}finally{setRetrying(false);}}
 return <div className="font-panel"><h3>当前页面字体 <button onClick={onClose}>关闭</button></h3>
 {team?<div className="font-library-guidance"><p>{library?.canUpload?'上传到团队字体库后，团队成员查看设计时会自动匹配使用。':'缺少团队字体时，请联系团队管理员上传到字体库。'}</p>{library&&<a href={`${teamPath(library.teamId)}/fonts`} target="_blank" rel="noopener noreferrer">{library.canUpload?'前往字体库上传':'查看团队字体库'}</a>}<p>也可以临时从本机加载，仅当前页面生效，刷新后需重新加载。</p></div>:<p>从本机临时加载字体，不会上传。仅当前页面生效，刷新或关闭页面后需重新加载。</p>}
 {fonts.map(font=>{const error=!font.available?doc.fontLoadError?.(font.name):undefined;return <div className="font-row" key={font.name}><div><strong>{font.name}</strong><small className={font.available?'available':''}>{font.available?'可用':error?'团队字体加载失败':'缺少字体，将使用替代字体'}</small>{error&&<small title={error}>{error}</small>}</div>{error&&doc.retryFonts&&<button disabled={retrying} onClick={()=>void retry()}>{retrying?'重试中…':'重试加载'}</button>}<button onClick={()=>onLoad(font.name)}>临时加载</button></div>;})}
 {!fonts.length&&<p>当前页面没有文字图层。</p>}{retryError&&<p role="alert" className="error">{retryError}</p>}{status&&<p className={status.includes('失败')?'error':'success'}>{status}</p>}
 </div>;
}
