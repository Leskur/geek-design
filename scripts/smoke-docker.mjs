import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader,TextReader} from '@zip.js/zip.js';
import sharp from 'sharp';

const [target,...extra]=process.argv.slice(2);
if(!target||extra.length)throw Error('Usage: npm run smoke:docker -- <local-test-url>');
const base=new URL(target).origin;let cookie='';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Use a local disposable test instance, not a production server. This smoke test creates an account and a design.');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(relative,body,method=body===undefined?'GET':'POST',headers={}){return fetch(base+'/api'+relative,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
async function json(relative,body){const response=await request(relative,body);assert.ok(response.ok,`${relative}: ${response.status} ${await response.clone().text()}`);return response.json();}
async function waitFor(relative,predicate){for(let i=0;i<150;i++){const result=await json(relative);if(predicate(result))return result;if(result.status==='failed')throw Error(result.error||'Background job failed');await delay(200);}throw Error(`Timed out: ${relative}`);}

try{
 console.log('Checking static assets, SQLite account storage, and upload/preview worker processes...');
 const home=await fetch(base);assert.equal(home.status,200);const html=await home.text();assert.match(html,/GeekDesign/);const asset=html.match(/(?:src|href)="(\/assets\/[^\"]+\.js)"/)?.[1];assert.ok(asset,'Production JavaScript bundle is served');const assetResponse=await fetch(base+asset);assert.equal(assetResponse.status,200);await assetResponse.arrayBuffer();
 assert.equal((await request('/projects')).status,401);
 const username='smoke_'+randomBytes(6).toString('hex'),password=randomBytes(16).toString('hex');
 const registration=await request('/register',{username,password});assert.equal(registration.status,200,await registration.clone().text());cookie=registration.headers.get('set-cookie')?.split(';')[0]||'';assert.ok(cookie);
 const team=await json('/teams',{name:'Docker smoke test'}),project=await json('/projects',{teamId:team.id,name:'Test project'});
 const frame={x:0,y:0,width:100,height:100};
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#7962bd'}}).png().toBuffer();
 const page={_class:'page',do_objectID:'page',name:'Smoke page',frame,layers:[{_class:'artboard',do_objectID:'board',name:'Smoke board',frame,layers:[{_class:'bitmap',do_objectID:'image',name:'Image',frame,image:{_ref:'images/smoke'}},{_class:'text',do_objectID:'label',name:'Label',frame:{x:4,y:4,width:90,height:20},attributedString:{string:'Smoke',attributes:[{location:0,length:5,attributes:{MSAttributedStringFontAttribute:{attributes:{name:'Arial',size:14}}}}]}}]}]};
 const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
 for(const [name,value] of Object.entries({'meta.json':{pagesAndArtboards:{page:{name:'Smoke page',artboards:{board:{}}}}},'document.json':{pages:[{_ref:'pages/page'}]},'pages/page.json':page}))await writer.add(name,new TextReader(JSON.stringify(value)));
 await writer.add('images/smoke.png',new Uint8ArrayReader(png));const bytes=await writer.close();
 const upload=await json('/uploads/preflight',{projectId:project.id,filename:'smoke.sketch',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});assert.equal(upload.kind,'upload');
 let response=await request('/tus',undefined,'POST',{'Tus-Resumable':'1.0.0','Upload-Length':String(bytes.length),'Upload-Metadata':'ticket '+Buffer.from(upload.ticket).toString('base64')});assert.equal(response.status,201,await response.text());
 response=await fetch(base+'/api/tus/'+upload.ticket,{method:'PATCH',headers:{Origin:base,Cookie:cookie,'Tus-Resumable':'1.0.0','Upload-Offset':'0','Content-Type':'application/offset+octet-stream'},body:bytes});assert.equal(response.status,204,await response.text());
 const revision=upload.revision.id;await waitFor('/revisions/'+revision,r=>r.status==='ready');
 const manifest=await json('/revisions/'+revision+'/manifest');assert.equal(manifest.pages.length,1);
 await waitFor('/revisions/'+revision+'/thumbnails',r=>r.status==='ready');
 response=await request(`/revisions/${revision}/thumbnails/${manifest.thumbnailVersion}/page/board?size=small`);assert.equal(response.status,200);const preview=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(preview.format,'webp');assert.ok(preview.width>0);

 console.log('Static assets, native modules, registration, Sketch upload, parsing and thumbnail generation: PASS');
}catch(error){console.error('Docker validation failed:',error.message);process.exitCode=1;}
