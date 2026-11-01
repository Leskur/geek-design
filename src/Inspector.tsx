import {useMemo} from 'react';
import type {Layer,DocumentSource} from './sketch';
import {hasFont} from './fonts';
import {textRuns} from './scene';
import {indexLayers} from './interaction';
import {cornerRadii,cssColor,cssForLayer,displayColor,number,paintCSS,shadowCSS,textProperties,color} from './properties';

type Copy=(value:string)=>void;
function Value({label,value,copyValue,onCopy}:{label:string;value:string;copyValue?:string;onCopy:Copy}){return <button className="property-row" title={`复制${label}`} onClick={()=>onCopy(copyValue??value)}><span>{label}</span><strong>{value}</strong></button>;}
function Paint({paint:p,layer,index,onCopy}:{paint:any;layer:Layer;index:number;onCopy:Copy}) {
 const gradient=p.fillType===1,description=gradient?['线性渐变','径向渐变','角度渐变'][p.gradient?.gradientType||0]:p.fillType===0?displayColor(p.color):'图片 / 图案';
 const css=paintCSS(p,layer);
 return <div className="paint-property"><div className="paint-heading"><span>填充 {index+1}</span><span>{number((p.contextSettings?.opacity??1)*100)}%</span></div><button className="swatch" title={css?'复制填充值':'图片填充'} disabled={!css} onClick={()=>onCopy(css)}><i style={{background:gradient?css:color(p.color)}}/>{description}</button>{gradient&&<div className="gradient-stops">{p.gradient.stops.map((s:any,i:number)=><button key={i} title="复制渐变色值" onClick={()=>onCopy(cssColor(s.color))}><i style={{background:color(s.color)}}/><span>{displayColor(s.color)}</span><small>{number(s.position*100)}%</small></button>)}</div>}</div>;
}
export function Inspector({selected:l,root,doc,onCopy,onLoadFont}:{selected:Layer|null;root:Layer|null;doc:DocumentSource;onCopy:Copy;onLoadFont:(name:string)=>void}) {
 const index=useMemo(()=>root?indexLayers(root):null,[root]),entry=l?index?.get(l.do_objectID):null;
 const s=l?.style||{},fills=(s.fills||[]).filter((p:any)=>p.isEnabled),borders=(s.borders||[]).filter((p:any)=>p.isEnabled),runs=l?textRuns(l):[],radii=l?cornerRadii(l):null;
 const css=l?cssForLayer(l):'';
 const textStyles=runs.map(r=>({text:r.text,styles:textProperties(r.attributes),attributes:r.attributes}));
 const mixed=textStyles.length>1&&textStyles.some(r=>JSON.stringify(r.styles)!==JSON.stringify(textStyles[0].styles));
 async function download(ref:string){const a=document.createElement('a');a.href=await doc.image(ref);a.download=ref.split('/').pop()||'image';a.click();}
 return <aside className="right"><div className="panel-title">属性检查 <span>INSPECT</span></div>{l?<div className="inspect"><div className="type">{l._class}</div><h3>{l.name}</h3>{l._componentName&&<p className="component-origin">组件：{l._componentName}</p>}
  <h4>位置与尺寸</h4><div className="metrics">{(['x','y','width','height'] as const).map(key=><button key={key} title={`复制 ${key}`} onClick={()=>onCopy(number(l.frame[key]))}><small>{({x:'X',y:'Y',width:'W',height:'H'})[key]}</small><b>{number(l.frame[key])}</b></button>)}</div><p className="hint">X / Y 相对父图层；尺寸不计描边和阴影。</p>
  {entry&&<><Value label="画板外接框 X" value={number(entry.bounds.x)} onCopy={onCopy}/><Value label="画板外接框 Y" value={number(entry.bounds.y)} onCopy={onCopy}/></>}
  <h4>外观</h4><Value label="不透明度" value={`${number((s.contextSettings?.opacity??1)*100)}%`} copyValue={number(s.contextSettings?.opacity??1)} onCopy={onCopy}/><Value label="旋转" value={`${number(l.rotation||0)}°`} copyValue={number(l.rotation||0)} onCopy={onCopy}/>
  {radii&&<Value label="圆角 ↖ ↗ ↘ ↙" value={radii.map(number).join(' / ')} copyValue={radii.map(r=>`${number(r)}px`).join(' ')} onCopy={onCopy}/>}{l._class==='oval'&&<Value label="圆角" value="50%" onCopy={onCopy}/>}
  {l._class==='text'&&<><h4>文字 {mixed&&<span className="mixed-tag">混合样式 · {textStyles.length} 段</span>}</h4><button className="section-action" onClick={()=>onCopy(l.attributedString?.string||'')}>复制全部文案 ↗</button><div className="text-preview">{l.attributedString?.string}</div>
   {(mixed?textStyles:textStyles.slice(0,1)).map((run,i)=><div className="text-style-group" key={i}>{mixed&&<div className="run-preview" title={run.text}>{run.text}</div>}{Object.entries(run.styles).map(([key,value])=><Value key={key} label={({'font-family':'字体','font-size':'字号','font-weight':'字重',color:'颜色','line-height':'行高','letter-spacing':'字距','text-align':'对齐','font-style':'字形','text-decoration':'文字装饰'} as Record<string,string>)[key]||key} value={value} onCopy={onCopy}/>)}{!run.styles['line-height']&&<Value label="行高" value="自动" copyValue="normal" onCopy={onCopy}/>}{!run.styles['letter-spacing']&&<Value label="字距" value="0 px" copyValue="0px" onCopy={onCopy}/>}{run.attributes.MSAttributedStringFontAttribute?.attributes?.name&&!hasFont(run.attributes.MSAttributedStringFontAttribute.attributes.name)&&<button className="selected-font-action" onClick={()=>onLoadFont(run.attributes.MSAttributedStringFontAttribute.attributes.name)}>缺少此字体 · 加载本地字体</button>}</div>)}
  </>}
  {!!fills.length&&<><h4>填充 <span>{fills.length}</span></h4>{fills.map((p:any,i:number)=><Paint key={i} paint={p} layer={l} index={i} onCopy={onCopy}/>)}</>}
  {!!borders.length&&<><h4>描边</h4>{borders.map((p:any,i:number)=><div className="border-property" key={i}><Value label="粗细" value={`${number(p.thickness||0)} px`} copyValue={`${number(p.thickness||0)}px`} onCopy={onCopy}/><Value label="位置" value={['居中','内部','外部'][p.position||0]} onCopy={onCopy}/>{p.fillType===0?<button className="swatch" onClick={()=>onCopy(cssColor(p.color,p.contextSettings?.opacity??1))}><i style={{background:color(p.color)}}/>{displayColor(p.color)}</button>:<Value label="填充" value="渐变描边" copyValue={paintCSS(p,l)} onCopy={onCopy}/>}</div>)}</>}
  {(['shadows','innerShadows'] as const).map(key=>(s[key]||[]).filter((p:any)=>p.isEnabled).length>0&&<div key={key}><h4>{key==='shadows'?'阴影':'内阴影'}</h4>{s[key].filter((p:any)=>p.isEnabled).map((p:any,i:number)=><div className="shadow-property" key={i}><Value label="X / Y" value={`${number(p.offsetX||0)} / ${number(p.offsetY||0)}`} copyValue={`${number(p.offsetX||0)}px ${number(p.offsetY||0)}px`} onCopy={onCopy}/><Value label="模糊 / 扩展" value={`${number(p.blurRadius||0)} / ${number(p.spread||0)}`} onCopy={onCopy}/><button className="swatch" title="复制阴影 CSS" onClick={()=>onCopy(shadowCSS(p,key==='innerShadows'))}><i style={{background:color(p.color)}}/>{displayColor(p.color)}</button></div>)}</div>)}
  <h4>基础 CSS <button onClick={()=>onCopy(css)}>复制</button></h4><pre>{css}</pre><p className="hint">点击属性值即可复制。CSS 不包含布局；渐变、描边及复杂形状需结合实际页面核对。</p>
  {l.image?._ref&&<button className="primary" onClick={()=>download(l.image._ref)}>下载原始图片</button>}{fills.filter((p:any)=>p.image?._ref).map((p:any,i:number)=><button key={i} className="section-action" onClick={()=>download(p.image._ref)}>下载填充原图 {i+1}</button>)}
 </div>:<div className="empty"><span>⌖</span><h3>选择一个图层</h3><p>点击选择，双击进入分组。<br/>Ctrl + 点击可直接选中内部图层。<br/>选中后按住 Alt，悬停查看间距。</p></div>}<div className="right-note">空格 + 拖动平移画布。字体差异可能影响文字换行。</div></aside>;
}
