import type {Layer} from './sketch';

export function fontFamilies(name:string) {
 const base=name.replace(/-(?:Regular|Medium|Semibold|SemiBold|DemiBold|Bold|Light|Thin|Heavy|Black|Italic|BoldItalic|Book|Roman)(?:MT)?$/i,'');
 const aliases:Record<string,string>={PingFangSC:'PingFang SC',PingFangTC:'PingFang TC',HelveticaNeue:'Helvetica Neue',ArialMT:'Arial',Arial:'Arial',TimesNewRomanPSMT:'Times New Roman'};
 return [...new Set([name,base,aliases[base]].filter(Boolean))];
}

export function fontNames(root:Layer|null) {
 const names=new Set<string>();
 function visit(l:Layer){
  for(const run of l.attributedString?.attributes||[]){const name=run.attributes?.MSAttributedStringFontAttribute?.attributes?.name;if(name)names.add(name);}
  const name=l.style?.textStyle?.encodedAttributes?.MSAttributedStringFontAttribute?.attributes?.name;if(name)names.add(name);
  l.layers?.forEach(visit);
 }
 if(root)visit(root);return [...names].sort();
}

// FontFaceSet.check() alone returns true for unknown families without registered faces.
// Compare with different fallback metrics to detect unavailable local font names.
export function hasFont(name:string) {
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)return false;
 const sample='BESbswy 0123456789 汉字字体测试';
 return fontFamilies(name).some(family=>['monospace','serif','sans-serif'].some(fallback=>{
   context.font=`64px ${fallback}`;const base=context.measureText(sample).width;
   context.font=`64px "${family.replace(/["\\]/g,'')}", ${fallback}`;return Math.abs(context.measureText(sample).width-base)>.01;
 }));
}
