import {number} from './properties';
import {useEffect,useState} from 'react';
import {Download,Plus,Minus} from 'lucide-react';
import type {Layer,DocumentSource} from './sketch';
import {exportSelection,downloadSelection,type ImageFormat} from './selection-export';

function SelectionExport({layer,doc}:{layer:Layer;doc:DocumentSource}){
 const [open,setOpen]=useState(false),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 const preset=layer.exportOptions?.exportFormats?.find((p:any)=>['png','jpg','jpeg','svg'].includes(String(p.fileFormat).toLowerCase()));
 const initialFormat=String(preset?.fileFormat||'png').toLowerCase();
 const initialScale=Number(preset?.scale)||2;
 const [format,setFormat]=useState<ImageFormat>(initialFormat==='jpeg'?'jpg':initialFormat as ImageFormat),[scale,setScale]=useState(initialScale),[fontEpoch,setFontEpoch]=useState(0);
 const [result,setResult]=useState<{layer:Layer;doc:DocumentSource;epoch:number;url:string;width:number;height:number}|null>(null),[error,setError]=useState('');
 useEffect(()=>{const refresh=()=>setFontEpoch(v=>v+1);window.addEventListener('viewer-fonts-changed',refresh);document.fonts.addEventListener('loadingdone',refresh);return()=>{window.removeEventListener('viewer-fonts-changed',refresh);document.fonts.removeEventListener('loadingdone',refresh);};},[]);
 useEffect(()=>{
  let active=true,url='';setResult(null);setError('');
  const timer=setTimeout(()=>{void(async()=>{
   try{const blob=await exportSelection(layer,doc,'png',1);if(!active)return;url=URL.createObjectURL(blob);const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new window.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('预览图片加载失败'));img.src=url;});if(!active)return;setResult({layer,doc,epoch:fontEpoch,url,width:image.naturalWidth,height:image.naturalHeight});}
   catch(e){if(active)setError((e as Error).message);}
  })();},120);
  return()=>{active=false;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
 },[layer,doc,fontEpoch]);
 const ready=result?.layer===layer&&result.doc===doc&&result.epoch===fontEpoch?result:null;
 return <><section aria-label="切图"><div className="inspector-section-title"><h4>切图</h4>{ready&&<span className="slice-size">{number(ready.width)} × {number(ready.height)} px</span>}</div><div className="export-preview" aria-label="切图预览，棋盘格表示透明区域" aria-busy={!ready&&!error}>
  {ready?<img src={ready.url} alt={`${layer.name} 切图预览`} onError={()=>setError('预览图片加载失败')}/>:<span role="status">{error?'预览不可用':'正在生成预览…'}</span>}
 </div>
 </section><div className="export-disclosure"><button className="export-disclosure-toggle" aria-label={open?'收起导出设置':'展开导出设置'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>导出</span>{open?<Minus size={14}/>:<Plus size={14}/>}</button>
 {open&&<><div className="selection-export-controls"><select disabled={exporting} aria-label="导出格式" value={format} onChange={e=>setFormat(e.target.value as ImageFormat)}><option value="png">PNG</option><option value="svg">SVG</option><option value="jpg">JPG</option></select><select disabled={exporting} aria-label="导出倍率" value={scale} onChange={e=>setScale(Number(e.target.value))}>{[...new Set([1,2,3,initialScale])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n}×</option>)}</select><button disabled={!ready||!!error||exporting} onClick={async()=>{setExporting(true);setExportError('');try{await downloadSelection(layer,doc,format,scale);}catch(e){setExportError((e as Error).message);}finally{setExporting(false);}}}><Download size={13}/>{exporting?'导出中…':'导出'}</button></div></>}</div>
 {exportError&&<p role="alert" className="inspector-error">{exportError}</p>}
 {error&&<p role="alert" className="inspector-error">{error}</p>}</>;
}

export function SelectionExportDisclosure({layer,doc}:{layer:Layer;doc:DocumentSource}){
 return <SelectionExport layer={layer} doc={doc}/>;
}
