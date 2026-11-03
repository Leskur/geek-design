import {renderToStaticMarkup} from 'react-dom/server';
import type {Layer,DocumentSource} from './sketch';
import {color} from './sketch';
import type {SceneCache} from './SceneCache';
import {Children} from './renderer';
const imageFrom=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片解码失败'));image.src=src;});
export async function renderThumbnail(board:Layer,doc:DocumentSource,cache:SceneCache,small=false){
 const root=cache.get(board).root,refs=new Set<string>();
 function collect(l:Layer){if(l.isVisible===false||l._hiddenSymbol)return;if(l.image?._ref)refs.add(l.image._ref);for(const fill of l.style?.fills||[])if(fill.isEnabled&&fill.image?._ref)refs.add(fill.image._ref);l.layers?.forEach(collect);}collect(root);
 const previewImages=new Map<string,string>();
 for(const ref of refs){try{const url=await doc.image(ref);if(!url)continue;const image=await imageFrom(url),scale=Math.min(1,(small?384:768)/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);previewImages.set(ref,canvas.toDataURL('image/png'));}catch{}}
 const source=Object.assign(Object.create(doc),{previewImages,image:async(ref:string)=>previewImages.get(ref)||''}) as DocumentSource;
 const scale=Math.min(1,(small?192:256)/Math.max(1,board.frame.width),(small?768:1024)/Math.max(1,board.frame.height)),width=Math.max(1,Math.round(board.frame.width*scale)),height=Math.max(1,Math.round(board.frame.height*scale));
 const markup=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${root.frame.width} ${root.frame.height}`}><rect width={root.frame.width} height={root.frame.height} fill={root.hasBackgroundColor?color(root.backgroundColor):'#fff'}/><Children layers={root.layers||[]} doc={source} choose={()=>{}} w={root.frame.width} h={root.frame.height} interactive={false}/></svg>).replace(/(<foreignObject[^>]*>)<div/g,'$1<div xmlns="http://www.w3.org/1999/xhtml"');
 const image=await imageFrom('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')!.drawImage(image,0,0,width,height);
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('无法生成缩略图')),'image/png'));
}
