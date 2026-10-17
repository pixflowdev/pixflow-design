import express from 'express';
import {createServer,type Server} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {registerDictationRoutes} from '../../src/pixflow/dictation-routes.js';
const servers:Server[]=[];const dirs:string[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})));await Promise.all(dirs.splice(0).map(dir=>fs.rm(dir,{recursive:true,force:true})));});
it('applies permission checks to every operation and handles real JSON and WAV requests',async()=>{
 let pro=true;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dictation-route-'));dirs.push(dir);const app=express();app.use(express.json({limit:'4mb'}));
 app.get('/session',(_req,res)=>res.json({identity:{siteId:'audio-test',userId:1,blogId:1},writable:false,features:{audio:pro}}));
 app.delete('/session',(_req,res)=>res.json({ok:true}));
 registerDictationRoutes(app,dir,(req,res,next)=>{if(req.headers.authorization!=='Bearer test'){res.status(403).end();return;}res.set('Access-Control-Allow-Origin','http://localhost');next();});
 const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test server');
 const base=`http://127.0.0.1:${address.port}/api/pixflow/dictation/`;
 for(const action of ['status','enable','disable','download','cancel-download','select','delete','transcribe']){
   expect((await fetch(base+action,{method:'POST'})).status).toBe(403);
   expect((await fetch(base+action,{method:'OPTIONS',headers:{Authorization:'Bearer test'}})).status).toBe(204);
 }
 const session=JSON.stringify({endpoint:`http://127.0.0.1:${address.port}/tools`,token:'pfdirect_'+'a'.repeat(64),writable:false,features:{audio:true}});
 const headers={Authorization:'Bearer test','X-Pixflow-Audio-Session':session};
 expect((await fetch(base+'enable',{method:'POST',headers:{Authorization:'Bearer test'}})).status).toBe(403);
 pro=false;
 for(const action of ['status','enable','download','select','transcribe']) expect((await fetch(base+action,{method:'POST',headers})).status).toBe(403);
 expect((await fetch(base+'disable',{method:'POST',headers})).status).toBe(200);
 pro=true;
 const response=await fetch(base+'status',{method:'POST',headers});expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toMatchObject({enabled:false,installed:[]});
 const selected=await fetch(base+'select',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({model:'base-q5'})});expect(await selected.json()).toMatchObject({selected:'base-q5'});
 const invalid=await fetch(base+'transcribe',{method:'POST',headers:{...headers,'Content-Type':'audio/wav'},body:'invalid'});expect(invalid.status).toBe(400);expect(await invalid.json()).toMatchObject({message:expect.stringContaining('PCM')});
});
