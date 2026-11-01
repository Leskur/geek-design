import fs from 'node:fs';
import path from 'node:path';
import {createApp} from './app';
const dataDir=path.resolve(process.env.SKETCHPEEK_DATA_DIR||'data');fs.mkdirSync(dataDir,{recursive:true});
const lock=path.join(dataDir,'server.lock');
try{const pid=Number(fs.readFileSync(lock,'utf8'));if(pid){let alive=true;try{process.kill(pid,0);}catch{alive=false;}if(alive)throw new Error('此数据目录已有服务运行，请勿重复启动');}fs.unlinkSync(lock);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
let shuttingDown=false;
try{
 const {app}=await createApp({dataDir,logger:true,publicOrigin:process.env.SKETCHPEEK_PUBLIC_ORIGIN,staticDir:path.resolve('dist'),maxFileSize:Number(process.env.SKETCHPEEK_MAX_FILE_SIZE||1024**3)});
 async function stop(){if(shuttingDown)return;shuttingDown=true;await app.close();fs.unlinkSync(lock);}
 process.on('SIGINT',()=>{void stop();});process.on('SIGTERM',()=>{void stop();});
 await app.listen({host:process.env.SKETCHPEEK_HOST||'127.0.0.1',port:Number(process.env.SKETCHPEEK_PORT||5174)});
 console.log(`SketchPeek 数据目录：${dataDir}`);
}catch(e){try{fs.unlinkSync(lock);}catch{}throw e;}
