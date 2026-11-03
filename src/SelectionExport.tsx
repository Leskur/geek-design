import {useEffect,useState} from 'react';
import {Download,Plus,Minus} from 'lucide-react';
import type {Layer,DocumentSource} from './sketch';
import {exportSelection,exportSize,type ImageFormat} from './selection-export';
import {safeName} from './ai-export';

function SelectionExport({layer,doc}:{layer:Layer;doc:DocumentSource}){
 const preset=layer.exportOptions?.exportFormats?.find((p:any)=>['png','jpg','jpeg','svg'].includes(String(p.fileFormat).toLowerCase()));
 const initialFormat=String(preset?.fileFormat||'png').toLowerCase();
 const initialScale=Number(preset?.scale)||2;
 const [format,setFormat]=useState<ImageFormat>(initialFormat==='jpeg'?'jpg':initialFormat as ImageFormat),[scale,setScale]=useState(initialScale),[fontEpoch,setFontEpoch]=useState(0);
 const [result,setResult]=useState<{layer:Layer;doc:DocumentSource;format:ImageFormat;scale:number;epoch:number;url:string;width:number;height:number}|null>(null),[error,setError]=useState('');
 useEffect(()=>{const refresh=()=>setFontEpoch(v=>v+1);window.addEventListener('viewer-fonts-changed',refresh);document.fonts.addEventListener('loadingdone',refresh);return()=>{window.removeEventListener('viewer-fonts-changed',refresh);document.fonts.removeEventListener('loadingdone',refresh);};},[]);
 useEffect(()=>{
  let active=true,url='';setResult(null);setError('');
  const timer=setTimeout(()=>{void(async()=>{
   try{const size=exportSize(layer,scale),blob=await exportSelection(layer,doc,format,scale);if(!active)return;url=URL.createObjectURL(blob);setResult({layer,doc,format,scale,epoch:fontEpoch,url,...size});}
   catch(e){if(active)setError((e as Error).message);}
  })();},120);
  return()=>{active=false;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
 },[layer,doc,format,scale,fontEpoch]);
 const ready=result?.layer===layer&&result.doc===doc&&result.format===format&&result.scale===scale&&result.epoch===fontEpoch?result:null;
 return <><div className="export-preview" aria-label="导出预览，棋盘格表示透明区域" aria-busy={!ready&&!error}>
  {ready?<img src={ready.url} alt={`${layer.name} 导出预览`} onError={()=>setError('预览图片加载失败')}/>:<span role="status">{error?'预览不可用':'正在生成预览…'}</span>}
 </div>{ready&&<div className="export-preview-size">{ready.width} × {ready.height} px</div>}
 <div className="selection-export-controls"><select aria-label="导出格式" value={format} onChange={e=>setFormat(e.target.value as ImageFormat)}><option value="png">PNG</option><option value="svg">SVG</option><option value="jpg">JPG</option></select><select aria-label="导出倍率" value={scale} onChange={e=>setScale(Number(e.target.value))}>{[...new Set([1,2,3,initialScale])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n}×</option>)}</select><button disabled={!ready||!!error} onClick={()=>{if(!ready)return;const a=document.createElement('a');a.href=ready.url;a.download=`${safeName(layer.name)}@${scale}x.${format}`;a.click();}}><Download size={13}/>导出</button></div>
 {error&&<p role="alert" className="inspector-error">{error}</p>}</>;
}

export function SelectionExportDisclosure({layer,doc,hasImages}:{layer:Layer;doc:DocumentSource;hasImages:boolean}){
 const [open,setOpen]=useState(()=>!!layer.exportOptions?.exportFormats?.length);
 return <div className="export-disclosure"><button className="export-disclosure-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>{hasImages?'导出当前效果':'资源导出'}</span>{open?<Minus size={14}/>:<Plus size={14}/>}</button>{open&&<SelectionExport layer={layer} doc={doc}/>}</div>;
}
