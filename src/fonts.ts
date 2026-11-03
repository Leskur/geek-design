import type {Layer} from './sketch';

export function fontFamilies(name:string) {
 const base=name.replace(/-(?:Regular|Medium|Semibold|SemiBold|DemiBold|Bold|Light|Thin|Heavy|Black|Italic|BoldItalic|Book|Roman)(?:MT)?$/i,'');
 const aliases:Record<string,string>={PingFangSC:'PingFang SC',PingFangTC:'PingFang TC',HelveticaNeue:'Helvetica Neue',ArialMT:'Arial',Arial:'Arial',TimesNewRomanPSMT:'Times New Roman'};
 return [...new Set([name,base,aliases[base]].filter(Boolean))];
}

export function fontNames(root:Layer|null,library?:{symbols:Map<string,Layer>;styles?:Map<string,any>}) {
 const names=new Set<string>(),visited=new Set<Layer>(),symbols=new Set<string>();
 function attributes(a:any){const name=a?.MSAttributedStringFontAttribute?.attributes?.name;if(name)names.add(name);}
 function symbol(id:string){if(!id||symbols.has(id))return;symbols.add(id);const master=library?.symbols.get(id);if(master)visit(master);}
 function visit(l:Layer){
  if(visited.has(l))return;visited.add(l);
  for(const run of l.attributedString?.attributes||[])attributes(run.attributes);
  attributes(l.style?.textStyle?.encodedAttributes);
  if(l._class==='symbolInstance')symbol(l.symbolID);
  for(const override of l.overrideValues||[]){
   if(override.overrideName.endsWith('_symbolID'))symbol(override.value);
   if(override.overrideName.endsWith('_textStyle'))attributes(library?.styles?.get(override.value)?.textStyle?.encodedAttributes);
  }
  l.layers?.forEach(visit);
 }
 if(root)visit(root);return [...names].sort();
}

// FontFaceSet.check() alone returns true for unknown families without registered faces.
// Compare with different fallback metrics to detect unavailable local font names.
export function hasFont(name:string) {
 // Registered faces are authoritative; measuring at normal weight can miss a bold-only face.
 const normalize=(family:string)=>family.trim().replace(/^["']|["']$/g,'').toLowerCase();
 let registered=false;
 document.fonts?.forEach(face=>{if(face.status==='loaded'&&normalize(face.family)===normalize(name))registered=true;});
 if(registered)return true;
 const weight=/black|heavy/i.test(name)?900:/semibold|demibold/i.test(name)?600:/bold/i.test(name)?700:/medium/i.test(name)?500:/light|thin/i.test(name)?300:400;
 const style=/italic|oblique/i.test(name)?'italic':'normal';
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)return false;
 const sample='BESbswy 0123456789 汉字字体测试';
 return fontFamilies(name).some(family=>['monospace','serif','sans-serif'].some(fallback=>{
   context.font=`${style} ${weight} 64px ${fallback}`;const base=context.measureText(sample).width;
   context.font=`${style} ${weight} 64px "${family.replace(/["\\]/g,'')}", ${fallback}`;return Math.abs(context.measureText(sample).width-base)>.01;
 }));
}
