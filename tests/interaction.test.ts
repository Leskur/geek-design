import {fitCameraInArea,panFromAnchor} from '../src/interaction';
import test from 'node:test';
import assert from 'node:assert/strict';
import {indexLayers,branchInScope,inspectionTarget,spacingWithin,measure,panBy,zoomAt} from '../src/interaction';
import {cssForLayer,cssColor,cornerRadii,cssSections,layerColors,colorValue} from '../src/properties';
import type {Layer} from '../src/sketch';

const layer=(id:string,extra:any={}):Layer=>({_class:'rectangle',do_objectID:id,name:id,frame:{x:0,y:0,width:100,height:100},...extra});
const root=(layers:Layer[])=>layer('board',{_class:'artboard',frame:{x:1000,y:500,width:500,height:500},layers});
function near(actual:number,expected:number){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);}

test('board coordinates ignore the original page offset and include parent rotations',()=>{
 const child=layer('text',{frame:{x:0,y:0,width:10,height:20}});
 const parent=layer('group',{frame:{x:10,y:20,width:100,height:100},rotation:90,layers:[child]});
 const bounds=indexLayers(root([parent])).get('text')!.bounds;
 near(bounds.x,10);near(bounds.y,110);near(bounds.width,20);near(bounds.height,10);
});
test('flipped parent coordinates keep positive inspection dimensions',()=>{
 const child=layer('child',{frame:{x:20,y:5,width:30,height:10}});
 const parent=layer('parent',{frame:{x:10,y:20,width:100,height:100},isFlippedHorizontal:true,layers:[child]});
 assert.deepEqual(indexLayers(root([parent])).get('child')!.bounds,{x:60,y:25,width:30,height:10});
});
test('group selection drills one level and rejects objects outside the scope',()=>{
 const index=indexLayers(root([layer('group',{layers:[layer('nested',{layers:[layer('leaf')]})]}),layer('outside')]));
 assert.equal(branchInScope('leaf','board',index),'group');assert.equal(branchInScope('leaf','group',index),'nested');assert.equal(branchInScope('leaf','nested',index),'leaf');assert.equal(branchInScope('outside','group',index),null);
});
test('inspection selects deeply nested text directly and can explicitly select its parent',()=>{
 const index=indexLayers(root([layer('group',{layers:[layer('nested',{layers:[layer('text',{_class:'text'})]})]}),layer('other')]));
 assert.equal(inspectionTarget('text',index)?.layer.do_objectID,'text');
 assert.equal(inspectionTarget('text',index,true)?.layer.do_objectID,'nested');
 assert.equal(inspectionTarget('other',index)?.layer.do_objectID,'other');
 assert.equal(inspectionTarget(null,index),null);assert.equal(inspectionTarget('unknown',index),null);
});
test('compound vector icons stay atomic while normal groups expose their children',()=>{
 const index=indexLayers(root([layer('icon',{_class:'shapeGroup',layers:[layer('path',{_class:'shapePath'})]})]));
 assert.equal(inspectionTarget('path',index)?.layer.do_objectID,'icon');
 assert.equal(inspectionTarget('path',index,true)?.layer.do_objectID,'board');
});
test('panning is independent of zoom and does not change document coordinates',()=>{
 const source=root([layer('a')]),before=JSON.stringify(source),camera={x:0,y:50,scale:2};
 assert.deepEqual(panBy(camera,-250,120),{x:-250,y:170,scale:2});assert.equal(JSON.stringify(source),before);assert.deepEqual(camera,{x:0,y:50,scale:2});
});
test('zoom preserves the world point under the pointer and clamps extremes',()=>{
 const c={x:-140,y:90,scale:.5},anchor={x:320,y:180},next=zoomAt(c,2,anchor);
 near((anchor.x-next.x)/next.scale,(anchor.x-c.x)/c.scale);near((anchor.y-next.y)/next.scale,(anchor.y-c.y)/c.scale);
 assert.equal(zoomAt(c,100,anchor).scale,4);assert.equal(zoomAt(c,0,anchor).scale,.001);
});
test('separated rectangles measure edge gaps, not center distances',()=>{
 const a={x:10,y:20,width:40,height:30},b={x:70,y:90,width:20,height:10};
 assert.deepEqual(measure(a,b).map(m=>[m.axis,m.value]),[['x',20],['y',40]]);
 assert.deepEqual(measure(b,a).map(m=>m.value),[20,40]);
});
test('contained rectangles expose all four margins, including identical-edge suppression',()=>{
 const outer={x:0,y:0,width:100,height:100},inner={x:20,y:10,width:30,height:40};
 assert.deepEqual(measure(inner,outer).map(d=>d.value),[20,50,10,50]);assert.deepEqual(measure(outer,inner).map(d=>d.value),[20,50,10,50]);
 assert.deepEqual(measure(outer,outer),[]);
});
test('touching edges measure zero and overlapping boxes do not produce negative distances',()=>{
 const a={x:0,y:0,width:20,height:20};assert.equal(measure(a,{x:20,y:0,width:20,height:20})[0].value,0);
 assert.ok(measure(a,{x:10,y:10,width:20,height:20}).every(d=>d.value>=0));
});
test('CSS copies retain alpha, opacity, borders and shadow spread',()=>{
 const red={red:1,green:0,blue:0,alpha:.5};assert.equal(cssColor(red),'rgba(255, 0, 0, 0.5)');
 const css=cssForLayer(layer('a',{style:{contextSettings:{opacity:.6},fills:[{isEnabled:true,fillType:0,color:red}],borders:[{isEnabled:true,fillType:0,thickness:2,color:red}],shadows:[{isEnabled:true,offsetX:3,offsetY:4,blurRadius:8,spread:2,color:red}]}}));
 assert.match(css,/opacity: 0.6;/);assert.match(css,/background-color: rgba\(255, 0, 0, 0.5\);/);assert.match(css,/border: 2px solid/);assert.match(css,/box-shadow: 3px 4px 8px 2px/);
});
test('mixed text does not misrepresent the whole layer with the first font size',()=>{
 const attrs=(size:number)=>({MSAttributedStringFontAttribute:{attributes:{name:'Arial',size}},MSAttributedStringColorAttribute:{red:0,green:0,blue:0,alpha:1}});
 const text=layer('text',{_class:'text',attributedString:{string:'AB',attributes:[{location:0,length:1,attributes:attrs(12)},{location:1,length:1,attributes:attrs(24)}]}});
 const css=cssForLayer(text);assert.doesNotMatch(css,/font-size:/);assert.match(css,/混合文字样式/);assert.match(css,/font-family: "Arial"/);assert.doesNotMatch(css,/background-color:/);
});
test('individual corner values are copied in CSS corner order',()=>{
 const l=layer('r',{points:[{point:'{1,1}',cornerRadius:30},{point:'{0,0}',cornerRadius:10},{point:'{0,1}',cornerRadius:40},{point:'{1,0}',cornerRadius:20}]});
 assert.deepEqual(cornerRadii(l),[10,20,30,40]);assert.match(cssForLayer(l),/border-radius: 10px 20px 30px 40px;/);
});


test('container spacing uses the parent axes even when the parent is rotated',()=>{
 const child=layer('child',{frame:{x:20,y:10,width:30,height:40}}),parent=layer('parent',{rotation:90,frame:{x:50,y:60,width:100,height:100},layers:[child]});
 const index=indexLayers(root([parent]));const spacing=spacingWithin(index.get('child')!,index.get('parent')!)!;for(const [key,value] of Object.entries({left:20,top:10,right:50,bottom:50,width:30,height:40}))near(spacing[key as keyof typeof spacing],value);
 const overflow=indexLayers(root([layer('overflow',{frame:{x:-10,y:0,width:520,height:510}})]));assert.deepEqual(spacingWithin(overflow.get('overflow')!,overflow.get('board')!),{left:-10,top:0,right:-10,bottom:-10,width:520,height:510});
});
test('delivery code separates layout, text and appearance without inventing padding',()=>{
 const l=layer('label',{_class:'text',style:{contextSettings:{opacity:.5}},attributedString:{string:'A',attributes:[{location:0,length:1,attributes:{MSAttributedStringFontAttribute:{attributes:{name:'Arial',size:14}}}}]}});
 const sections=cssSections(l);assert.deepEqual(sections.map(s=>s.id),['layout','text','style']);assert.match(sections[0].code,/width: 100px;/);assert.match(sections[1].code,/font-size: 14px;/);assert.equal(sections[2].code,'opacity: 0.5;');assert.ok(sections.every(s=>!s.code.includes('padding')));
});
test('selected colors include visible descendants and preserve paint alpha',()=>{
 const c={red:1,green:0,blue:0,alpha:.5},fill={isEnabled:true,fillType:0,color:c,contextSettings:{opacity:.5}};
 const l=layer('group',{layers:[layer('a',{style:{fills:[fill]}}),layer('b',{style:{fills:[fill]}}),layer('hidden',{isVisible:false,style:{fills:[{...fill,color:{red:0,green:1,blue:0,alpha:1}}]}})]});
 const colors=layerColors(l);assert.equal(colors.length,1);assert.equal(colorValue(colors[0].color,colors[0].opacity),'#FF000040');assert.equal(colorValue(c,.5,'RGB'),'rgba(255, 0, 0, 0.25)');
});

test('fast dragging follows the final pointer position without accumulating frame timing errors',()=>{
 const camera={x:40,y:70,scale:.03},start={x:100,y:150};
 for(const point of [{x:900,y:10},{x:30,y:800},{x:200,y:250}])panFromAnchor(camera,start,point);
 assert.deepEqual(panFromAnchor(camera,start,{x:230,y:280}),{x:170,y:200,scale:.03});
 assert.deepEqual(panFromAnchor(camera,start,start),camera);
 assert.deepEqual(camera,{x:40,y:70,scale:.03});
});

test('fit and focus center inside the unobscured area, including long artboards',()=>{
 const area={x:250,y:0,width:890,height:840},bounds={x:-200,y:50,width:390,height:4000};
 const c=fitCameraInArea(bounds,area);
 near(c.x+(bounds.x+bounds.width/2)*c.scale,area.x+area.width/2);
 near(c.y+(bounds.y+bounds.height/2)*c.scale,area.y+area.height/2);
 assert.ok(c.y+bounds.y*c.scale>=48-1e-8);assert.ok(c.y+(bounds.y+bounds.height)*c.scale<=area.height-48+1e-8);
 const widthFit=fitCameraInArea(bounds,area,4,true);near(widthFit.x+bounds.x*widthFit.scale,area.x+48);
});
