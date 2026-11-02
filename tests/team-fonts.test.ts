import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/app';
import {matchingTeamFonts} from '../src/team-fonts';

async function sampleFont(){for(const filename of [process.env.TEST_FONT_PATH,'C:/Windows/Fonts/AGENCYR.TTF','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']){if(filename)try{return await readFile(filename);}catch{}}}
test('team font library validates uploads, deduplicates and isolates team access',async t=>{
 const root=await mkdtemp(path.resolve('.test-output/font-')),{app,store}=await createApp({dataDir:root,startJobs:false});
 const call=(url:string,cookie='',method:any='GET',payload?:any,extra:Record<string,string>={})=>app.inject({url:'/api'+url,method,headers:{host:'test.local',origin:'http://test.local',cookie,...extra},payload});
 const signup=async(username:string)=>{const r=await call('/register','','POST',{username,password:'abc123'});return {...r.json(),cookie:'sp_session='+r.cookies[0].value};};
 const binary={'content-type':'application/octet-stream','x-font-filename':'sample.ttf'};
 try{
 const owner=await signup('owner'),member=await signup('member'),outsider=await signup('outsider'),team=(await call('/teams',owner.cookie,'POST',{name:'Fonts'})).json(),other=(await call('/teams',owner.cookie,'POST',{name:'Other'})).json();store.run("INSERT INTO team_members VALUES(?,?,'member')",team.id,member.id);
 assert.equal((await call(`/teams/${team.id}/fonts`)).statusCode,401);assert.equal((await call(`/teams/${team.id}/fonts`,outsider.cookie)).statusCode,404);
 assert.equal((await call(`/teams/${team.id}/fonts`,member.cookie,'POST',Buffer.alloc(20),binary)).statusCode,403);
 assert.equal((await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',Buffer.alloc(20),binary)).statusCode,400);
 const malformed=Buffer.alloc(32);malformed.writeUInt32BE(0x10000);assert.equal((await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',malformed,binary)).statusCode,400);
 assert.equal((await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',Buffer.alloc(20),{...binary,'x-font-filename':'..%2Ffont.ttf'})).statusCode,400);
 assert.equal((await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',Buffer.alloc(20*1024**2+1),binary)).statusCode,413);
 const bytes=await sampleFont();if(!bytes){t.diagnostic('Valid font round-trip skipped: set TEST_FONT_PATH to exercise it');return;}
 const upload=await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',bytes,binary);assert.equal(upload.statusCode,201,upload.body);const font=upload.json().font;assert.ok(font.family);assert.ok(font.postscript_name);assert.ok(font.weight>=1);
 const duplicate=await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',bytes,binary);assert.equal(duplicate.statusCode,200);assert.equal(duplicate.json().duplicate,true);assert.equal(duplicate.json().font.id,font.id);assert.equal((await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',Buffer.concat([bytes,Buffer.from([0])]),binary)).statusCode,409);
 assert.equal((await call(`/teams/${team.id}/fonts`,member.cookie)).json().length,1);assert.equal((await call(`/teams/${other.id}/fonts`,owner.cookie)).json().length,0);
 const download=await app.inject({url:font.url,headers:{cookie:member.cookie}});assert.equal(download.statusCode,200);assert.deepEqual(download.rawPayload,bytes);
 assert.equal((await app.inject({url:font.url,headers:{cookie:outsider.cookie}})).statusCode,404);
 assert.equal((await call(`/teams/${other.id}/fonts/${font.id}`,owner.cookie)).statusCode,404);
 assert.equal((await call(`/teams/${team.id}/fonts/${font.id}`,member.cookie,'DELETE')).statusCode,403);
 const p=(await call('/projects',owner.cookie,'POST',{teamId:team.id,name:'Project'})).json();store.run("INSERT INTO documents VALUES('d',?,'Design',NULL,1)",p.id);store.run("INSERT INTO revisions(id,document_id,seq,hash,size,filename,note,created_by,status,created) VALUES('r','d',1,'hash',1,'x.sketch','',?,'ready',1)",owner.id);
 assert.equal((await call('/revisions/r/fonts',owner.cookie)).json().length,1);assert.equal((await call('/revisions/r/fonts',member.cookie)).statusCode,404);
 store.run("INSERT INTO members VALUES(?,?,'viewer')",p.id,member.id);assert.equal((await call('/revisions/r/fonts',member.cookie)).json().length,1);
 assert.equal((await call(`/teams/${team.id}/fonts/${font.id}`,owner.cookie,'DELETE')).statusCode,200);assert.equal((await app.inject({url:font.url,headers:{cookie:owner.cookie}})).statusCode,404);
 await call(`/teams/${team.id}/fonts`,owner.cookie,'POST',bytes,binary);assert.equal((await call(`/teams/${team.id}`,owner.cookie,'DELETE')).statusCode,200);assert.equal(store.all('SELECT * FROM team_fonts').length,0);
 }finally{await app.close();}
});
test('font matching prefers an exact PostScript face and falls back to family aliases',()=>{
 const regular={id:'r',family:'Demo',full_name:'Demo Regular',postscript_name:'Demo-Regular'},bold={id:'b',family:'Demo',full_name:'Demo Bold',postscript_name:'Demo-Bold'};
 const fonts=[regular,bold] as any;
 assert.deepEqual(matchingTeamFonts(fonts,['Demo-Bold']).map(f=>f.id),['b']);assert.deepEqual(matchingTeamFonts(fonts,['Demo']).map(f=>f.id),['r','b']);assert.deepEqual(matchingTeamFonts(fonts,['Missing']),[]);
});
