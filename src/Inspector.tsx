import {safeName} from './ai-export';
import {SelectionExportDisclosure} from './SelectionExport';
import {useEffect,useMemo,useState} from 'react';
import {Copy,Image,MousePointer2,Download,Type,Layers,AlertCircle} from 'lucide-react';
import type {Layer,DocumentSource} from './sketch';
import {hasFont} from './fonts';
import {textRuns} from './scene';
import {indexLayers,spacingWithin} from './interaction';
import {cssSections,layerColors,colorValue,cssColor,cssForLayer,number,textProperties} from './properties';

type Copy=(value:string)=>void;
function Value({label,value,copyValue,onCopy}:{label:string;value:string;copyValue?:string;onCopy:Copy}){return <button className="property-row" title={`复制${label}`} onClick={()=>onCopy(copyValue??value)}><span>{label}</span><strong>{value}</strong></button>;}
export function Inspector({selected:l,root,doc,onCopy,onLoadFont}:{selected:Layer|null;root:Layer|null;doc:DocumentSource;onCopy:Copy;onLoadFont:(name:string)=>void}) {

 const [activeRun,setActiveRun]=useState(0);
 const [colorMode,setColorMode]=useState('HEX'),[downloading,setDownloading]=useState(''),[assetError,setAssetError]=useState('');
 useEffect(()=>{setActiveRun(0);setAssetError('');},[l?.do_objectID]);
 const index=useMemo(()=>root?indexLayers(root):null,[root]),entry=l?index?.get(l.do_objectID):null;
 const s=l?.style||{},fills=(s.fills||[]).filter((p:any)=>p.isEnabled),runs=l?textRuns(l):[];
 const isContainer=!!l&&['group','symbolInstance','artboard'].includes(l._class);
 const css=l?cssForLayer(l):'';
 const sections=l?cssSections(l):[];
 const colors=useMemo(()=>l&&['group','symbolInstance','artboard'].includes(l._class)?layerColors(l):[],[l]);
 const container=entry?.parent?index?.get(entry.parent):null;
 const spacing=entry&&container&&entry!==container?spacingWithin(entry,container):null;
 const textStyles=runs.map(r=>({text:r.text,styles:textProperties(r.attributes),attributes:r.attributes}));
 const mixed=textStyles.length>1&&textStyles.some(r=>JSON.stringify(r.styles)!==JSON.stringify(textStyles[0].styles));

 const run=textStyles[Math.min(activeRun,Math.max(0,textStyles.length-1))];
 const runCode=run?Object.entries(run.styles).map(([key,value])=>`${key}: ${value};`).join('\n'):'';
 const copyCSS=mixed?'/* 图层与片段分别应用；类名可按项目调整。 */\n.text-layer {\n'+css.split('\n').filter(line=>!line.startsWith('/*')).map(line=>'  '+line).join('\n')+'\n}\n\n'+textStyles.map((r,i)=>`/* 片段 ${i+1}: ${r.text.replace(/\*\//g,'* /').replace(/[\r\n]+/g,' ')} */\n.text-fragment-${i+1} {\n`+Object.entries(r.styles).map(([key,value])=>`  ${key}: ${value};`).join('\n')+'\n}').join('\n\n'):css;
 const resources=[...(l?.image?._ref?[{ref:l.image._ref,label:'原始图片'}]:[]),...fills.filter((p:any)=>p.image?._ref).map((p:any,i:number)=>({ref:p.image._ref,label:`填充图片 ${i+1}`}))].filter((r,i,all)=>all.findIndex(x=>x.ref===r.ref)===i);
 const typeName=l?({text:'文字',group:'分组',symbolInstance:'组件',bitmap:'图片',shapeGroup:'组合形状',shapePath:'矢量路径',rectangle:'矩形',oval:'椭圆',artboard:'画板'} as Record<string,string>)[l._class]||'图层':'';

 async function downloadOriginal(ref:string){
  setDownloading(ref);setAssetError('');
  try{const source=await doc.image(ref);if(!source)throw Error('未找到原始图片');const response=await fetch(source);if(!response.ok)throw Error('读取图片失败');const blob=await response.blob();
   const extension=ref.match(/\.([a-zA-Z0-9]+)$/)?.[1]||({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif'} as Record<string,string>)[blob.type.split(';')[0]]||'png';
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeName(l?.name||'image').replace(new RegExp('\\.'+extension+'$','i'),'')+'.'+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setAssetError((e as Error).message);}finally{setDownloading('');}
 }
 const codePanel=<div className="delivery-code"><div className="inspector-section-title"><h4>CSS</h4><button className="inspector-copy" aria-label="复制全部 CSS" title="复制全部 CSS" onClick={()=>onCopy(copyCSS)}><Copy size={13} aria-hidden="true"/></button></div>{sections.map(section=><section className="delivery-code-section" key={section.id}><div><h4>{section.label}</h4><button className="inspector-copy" title={`复制${section.label}代码`} aria-label={`复制${section.label}代码`} onClick={()=>onCopy(section.code)}><Copy size={13}/></button></div><ol>{section.code.split('\n').map((line,i)=>{const colon=line.indexOf(':');return <li key={i}><code><span>{line.slice(0,colon)}</span>: <b>{line.slice(colon+1).trim()}</b></code></li>;})}</ol></section>)}</div>;
 const assetPanel=l?<>{!isContainer&&resources.length>0&&<section className="developer-assets" aria-label="图片资源"><div className="inspector-section-title"><h4>图片资源</h4>{resources.length>1&&<span>{resources.length}</span>}</div>{resources.map(r=><div className="inspector-asset" key={r.ref}><AssetPreview doc={doc} reference={r.ref} name={l.name+(resources.length>1?` · ${r.label}`:'')}/><button className="inspector-copy" title={downloading===r.ref?'下载中…':'下载原图'} aria-label={`下载原图 ${l.name}`} disabled={!!downloading} onClick={()=>void downloadOriginal(r.ref)}><Download size={13} aria-hidden="true"/></button></div>)}{assetError&&<p className="inspector-error" role="alert">{assetError}</p>}</section>}</>:null;
 const exportPanel=l?<section className="selection-export" aria-label="导出设置"><SelectionExportDisclosure key={l.do_objectID} layer={l} doc={doc}/></section>:null;
 return <aside hidden={!l} className="right gd-inspector" aria-label="图层检查面板">{l?<><div className="inspector-selection"><div className="inspector-identity">{l._class==='text'?<Type size={18}/>:<Layers size={18}/>}<h3 title={l.name}>{l.name}</h3>{l._class==='text'&&<button className="identity-copy inspector-copy" aria-label="复制文案" title="复制文案" onClick={()=>onCopy(l.attributedString?.string||'')}><Copy size={13}/></button>}<span className="type">{typeName}</span></div>{l._componentName&&<p className="component-origin">来自组件 · {l._componentName}</p>}</div><div className="inspect" id="inspect-panel">
 {l._class==='text'&&<section className="developer-copy-content"><div className="inspector-section-title"><h4>文案</h4><button className="inspector-copy" title="复制文案" aria-label="复制文案" onClick={()=>onCopy(l.attributedString?.string||'')}><Copy size={13} aria-hidden="true"/></button></div><div className="text-preview developer-content">{l.attributedString?.string}</div></section>}

 {assetPanel}

 <div className="inspector-section-title"><h4>布局</h4></div><div className="metrics">{(isContainer?['width','height','x','y'] as const:['x','y','width','height'] as const).map(key=>{const value=l.frame[key];return <button key={key} className={isContainer&&(key==='x'||key==='y')?'secondary-position':undefined} title={`复制 ${key}`} onClick={()=>onCopy(number(value))}><small>{({x:'X',y:'Y',width:'W',height:'H'})[key]}</small><b>{number(value)}</b><em>px</em></button>;})}</div>
 {l._class==='text'&&<section className="developer-typography"><div className="inspector-section-title"><h4>字体排版</h4>{mixed&&<span className="mixed-tag">混合样式 · {textStyles.length} 段</span>}</div>
 {mixed&&<div className="text-run-tabs" role="tablist" aria-label="文字片段">{textStyles.map((r,i)=><button key={i} role="tab" aria-selected={Math.min(activeRun,textStyles.length-1)===i} aria-controls="text-run-properties" id={`text-run-${i}`} title={r.text} onClick={()=>setActiveRun(i)}>{r.text.trim()||'空白片段'}</button>)}</div>}
 {run&&<div id="text-run-properties" role={mixed?'tabpanel':undefined} aria-labelledby={mixed?`text-run-${Math.min(activeRun,textStyles.length-1)}`:undefined}><div className="developer-properties">{Object.entries(run.styles).map(([key,value])=><Value key={key} label={({'font-family':'字体','font-size':'字号','font-weight':'字重',color:'颜色','line-height':'行高','letter-spacing':'字距','text-align':'对齐','font-style':'字形','text-decoration':'文字装饰'} as Record<string,string>)[key]||key} value={value} onCopy={onCopy}/>)}{!run.styles['line-height']&&<Value label="行高" value="自动" copyValue="normal" onCopy={onCopy}/>}{!run.styles['letter-spacing']&&<Value label="字距" value="默认" copyValue="normal" onCopy={onCopy}/>}</div>{run.attributes.MSAttributedStringFontAttribute?.attributes?.name&&!hasFont(run.attributes.MSAttributedStringFontAttribute.attributes.name)&&<button className="developer-font-notice" onClick={()=>onLoadFont(run.attributes.MSAttributedStringFontAttribute.attributes.name)}><AlertCircle size={13}/>缺少此字体，点击加载</button>}{mixed&&<div className="run-css"><div className="inspector-section-title"><h4>当前片段 CSS</h4><button className="inspector-copy" title="复制当前片段 CSS" aria-label="复制当前片段 CSS" onClick={()=>onCopy(runCode)}><Copy size={13} aria-hidden="true"/></button></div><pre>{runCode}</pre></div>}</div>}
 </section>}
 {codePanel}
 {spacing&&<section className="container-spacing" aria-label="容器边缘距离"><div className="inspector-section-title"><h4>容器边缘距离</h4><span>px</span></div><div className="box-distance"><span className="box-distance-label">父级边缘</span>{(['top','right','bottom','left'] as const).map(side=><button key={side} className={`box-distance-${side}${spacing[side]<0?' negative':''}`} title={`复制${({top:'上',right:'右',bottom:'下',left:'左'})[side]}边距离`} onClick={()=>onCopy(number(spacing[side]))}>{number(spacing[side])}</button>)}<div className="box-distance-content"><span>图层</span><button title="复制图层原始尺寸" onClick={()=>onCopy(`${number(l.frame.width)} × ${number(l.frame.height)}`)}>{number(l.frame.width)} × {number(l.frame.height)}</button></div></div></section>}
 {colors.length>1&&<section aria-label="分组颜色"><div className="inspector-section-title"><h4>分组颜色</h4><div className="coordinate-switch" aria-label="颜色格式">{['HEX','RGB'].map(mode=><button key={mode} aria-pressed={colorMode===mode} onClick={()=>setColorMode(mode)}>{mode}</button>)}</div></div><div className="delivery-colors">{colors.map((p,i)=>{const value=colorValue(p.color,p.opacity,colorMode);return <button key={i} title={`复制 ${value}`} onClick={()=>onCopy(value)}><i style={{background:cssColor(p.color,p.opacity)}}/><span>{value}</span><small>{p.label}</small></button>;})}</div></section>}

 {exportPanel}
 </div></>:<div className="empty"><MousePointer2 size={34}/><h3>选中图层，查看设计细节</h3></div>}</aside>;
}
function AssetPreview({doc,reference,name}:{doc:DocumentSource;reference:string;name:string}){
 const [url,setUrl]=useState(''),[dimensions,setDimensions]=useState<{width:number;height:number}|null>(null);
 useEffect(()=>{let alive=true;setUrl('');setDimensions(null);doc.image(reference).then(url=>{if(alive)setUrl(url);}).catch(()=>{});return()=>{alive=false;};},[doc,reference]);
 return <>{url?<img src={url} alt="图片资源预览" onLoad={e=>{const image=e.currentTarget;if(image.naturalWidth&&image.naturalHeight)setDimensions({width:image.naturalWidth,height:image.naturalHeight});}} onError={()=>{setUrl('');setDimensions(null);}}/>:<div className="inspector-preview-placeholder"><Image size={24}/></div>}<div className="inspector-asset-info"><b title={name}>{name}</b>{dimensions&&<small>原图 {dimensions.width} × {dimensions.height} px</small>}</div></>;
}
