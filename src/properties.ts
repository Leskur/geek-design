import {color,hex,point,type Layer} from './sketch';
import {textRuns} from './scene';

export const number=(value:number)=>String(Number(value.toFixed(2)));
export function cssColor(c:any,opacity=1) {const a=(c?.alpha??1)*opacity;return c? a>=.999999?hex(c):`rgba(${Math.round(c.red*255)}, ${Math.round(c.green*255)}, ${Math.round(c.blue*255)}, ${number(a)})`:'transparent';}
export function paintCSS(p:any,l:Layer) {
 if(p.fillType===0)return cssColor(p.color,p.contextSettings?.opacity??1);
 if(p.fillType!==1)return '';
 const g=p.gradient,stops=(g.stops||[]).map((s:any)=>`${cssColor(s.color,p.contextSettings?.opacity??1)} ${number(s.position*100)}%`).join(', ');
 if(g.gradientType===1){const [x,y]=point(g.from,100,100);return `radial-gradient(ellipse at ${number(x)}% ${number(y)}%, ${stops})`;}
 if(g.gradientType===2)return `conic-gradient(${stops})`;
 const a=point(g.from,l.frame.width,l.frame.height),b=point(g.to,l.frame.width,l.frame.height),angle=(Math.atan2(b[0]-a[0],a[1]-b[1])*180/Math.PI+360)%360;
 return `linear-gradient(${number(angle)}deg, ${stops})`;
}
export function cornerRadii(l:Layer):number[]|null {
 if(l._class==='oval')return null;
 if(l._class!=='rectangle')return null;
 const r=[0,0,0,0].map(()=>l.fixedRadius||0);
 for(const p of l.points||[]){const [x,y]=point(p.point,1,1);r[y>.5?(x>.5?2:3):(x>.5?1:0)]=l.fixedRadius||p.cornerRadius||0;}
 return r;
}
export function shadowCSS(s:any,inset=false) {return `${inset?'inset ':''}${number(s.offsetX||0)}px ${number(s.offsetY||0)}px ${number(s.blurRadius||0)}px ${number(s.spread||0)}px ${cssColor(s.color)}`;}
export function textProperties(a:any):Record<string,string> {
 const f=a.MSAttributedStringFontAttribute?.attributes||{},p=a.paragraphStyle||{},styles:Record<string,string>={};
 if(f.name)styles['font-family']=JSON.stringify(f.name);
 if(f.size!=null)styles['font-size']=`${number(f.size)}px`;
 if(a.MSAttributedStringColorAttribute)styles.color=cssColor(a.MSAttributedStringColorAttribute);
 if(a.kerning!=null)styles['letter-spacing']=`${number(a.kerning)}px`;
 if(p.maximumLineHeight||p.minimumLineHeight)styles['line-height']=`${number(p.maximumLineHeight||p.minimumLineHeight)}px`;
 if(p.alignment!=null)styles['text-align']=['left','right','center','justify','start'][p.alignment]||'start';
 if(f.name)styles['font-weight']=/black|heavy/i.test(f.name)?'900':/semibold|demibold/i.test(f.name)?'600':/bold/i.test(f.name)?'700':/medium/i.test(f.name)?'500':/light|thin/i.test(f.name)?'300':'400';
 if(/italic|oblique/i.test(f.name))styles['font-style']='italic';
 if(a.underlineStyle||a.strikethroughStyle)styles['text-decoration']=[a.underlineStyle?'underline':'',a.strikethroughStyle?'line-through':''].filter(Boolean).join(' ');
 return styles;
}
export function cssForLayer(l:Layer) {
 const s=l.style||{},styles:Record<string,string>={width:`${number(l.frame.width)}px`,height:`${number(l.frame.height)}px`};
 const opacity=s.contextSettings?.opacity;if(opacity!=null&&opacity!==1)styles.opacity=number(opacity);
 const radii=cornerRadii(l);if(radii?.some(Boolean))styles['border-radius']=radii.every(x=>x===radii[0])?`${number(radii[0])}px`:radii.map(r=>`${number(r)}px`).join(' ');
 if(l._class==='oval')styles['border-radius']='50%';
 const fills=(s.fills||[]).filter((f:any)=>f.isEnabled);
 if(l._class!=='text'){
  const paints=fills.map((f:any)=>paintCSS(f,l));
  if(paints.length===1&&paints[0])styles[fills[0].fillType===0?'background-color':'background']=paints[0];
  else if(paints.length>1&&paints.every(Boolean))styles.background=paints.map((p:string,i:number)=>fills[i].fillType===0?`linear-gradient(${p}, ${p})`:p).reverse().join(', ');
 }
 const border=(s.borders||[]).find((p:any)=>p.isEnabled&&p.fillType===0);if(border)styles.border=`${number(border.thickness||0)}px solid ${cssColor(border.color,border.contextSettings?.opacity??1)}`;
 const shadows=[...(s.shadows||[]).filter((s:any)=>s.isEnabled).map((s:any)=>shadowCSS(s)),...(s.innerShadows||[]).filter((s:any)=>s.isEnabled).map((s:any)=>shadowCSS(s,true))];if(shadows.length)styles['box-shadow']=shadows.join(', ');
 const transforms=[l.rotation?`rotate(${number(-l.rotation)}deg)`:'',l.isFlippedHorizontal?'scaleX(-1)':'',l.isFlippedVertical?'scaleY(-1)':''].filter(Boolean);if(transforms.length)styles.transform=transforms.join(' ');
 const runs=l._class==='text'?textRuns(l).map(r=>textProperties(r.attributes)):[];
 let mixed=false;
 if(runs.length){for(const [key,value] of Object.entries(runs[0])){if(runs.every(r=>r[key]===value))styles[key]=value;else mixed=true;}if(runs.some(r=>Object.keys(r).some(key=>runs[0][key]!==r[key])))mixed=true;}
 return Object.entries(styles).map(([key,value])=>`${key}: ${value};`).join('\n')+(mixed?'\n/* 混合文字样式：请查看分段属性。 */':'');
}
export function displayColor(c:any) {return `${hex(c)}${(c?.alpha??1)<1?` · ${number((c.alpha??1)*100)}%`:''}`;}
export {color};
