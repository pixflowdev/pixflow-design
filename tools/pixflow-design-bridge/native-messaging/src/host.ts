import { readFileSync } from 'node:fs';
import { decoder, relay, writer, validateRequest, type Configuration } from './relay';
import { discoverPairedSite } from './enrollment';
const config:Configuration=JSON.parse(readFileSync(new URL('./config.json',import.meta.url),'utf8'));
if(process.argv[2]!==config.extensionOrigin)process.exit(1);
if(config.discoverPairedSite)config.sites=await discoverPairedSite(config.bridge).catch(()=>[]);
const active=new Map<string,AbortController>(), uploads=new Map<string,{request:any;body:string;timer:ReturnType<typeof setTimeout>}>(),acks=new Map<string,()=>void>(),send=writer(process.stdout);
function clearUpload(id:string){const u=uploads.get(id);if(u)clearTimeout(u.timer);uploads.delete(id);}
function start(message:any){
  if(active.has(message.id)||active.size+uploads.size>=8){void send({id:message.id,type:'error',error:'Request already active or capacity reached'});return;}
  const controller=new AbortController();active.set(message.id,controller);
  const timer=setTimeout(()=>controller.abort(),30*60_000);
  const stream=async(m:any)=>{
    if(m.type!=='chunk'){await send(m);return;}
    await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(deadline);acks.delete(message.id);controller.signal.removeEventListener('abort',abort);};
      const abort=()=>{cleanup();reject(new Error('Stream cancelled'));};
      const deadline=setTimeout(abort,30_000);acks.set(message.id,()=>{cleanup();resolve();});controller.signal.addEventListener('abort',abort,{once:true});
      void send(m).catch(abort);
    });
  };
  void relay(message,config,controller.signal,stream).catch(()=>send({id:message.id,type:'error',error:'Native Bridge request failed. No request was replayed; inspect its result before retrying an edit.'})).finally(()=>{clearTimeout(timer);active.delete(message.id);acks.delete(message.id);});
}
const consume=decoder(message=>{
  if(message.id==='discover'&&message.type==='discover'){void send({id:'discover',type:'sites',sites:config.sites});return;}
  if(message.type==='ack'){acks.get(message.id)?.();return;}
  if(message.type==='cancel'){active.get(message.id)?.abort();clearUpload(message.id);return;}
  if(message.type==='upload'){
    const u=uploads.get(message.id);if(!u)return;
    if(typeof message.data!=='string'||u.body.length+message.data.length>24*1024*1024){clearUpload(message.id);void send({id:message.id,type:'error',error:'Upload too large'});return;}
    u.body+=message.data;return;
  }
  if(message.type==='commit'){const u=uploads.get(message.id);if(u){clearUpload(message.id);start({...u.request,body:u.body,bodyEncoding:'base64'});}return;}
  try{validateRequest(message,config);}catch{void send({id:message.id,type:'error',error:'Native adapter rejected the site, destination, method or headers'});return;}
  if(message.type==='begin'){
    if(active.has(message.id)||uploads.has(message.id)||active.size+uploads.size>=8){void send({id:message.id,type:'error',error:'Request already active or capacity reached'});return;}
    uploads.set(message.id,{request:message,body:'',timer:setTimeout(()=>{clearUpload(message.id);void send({id:message.id,type:'error',error:'Upload expired'});},30_000)});return;
  }
  start(message);
});
process.stdin.on('data',chunk=>{try{consume(chunk);}catch{process.stdin.destroy();for(const c of active.values())c.abort();process.exitCode=1;}});
process.stdin.on('end',()=>{for(const c of active.values())c.abort();for(const id of uploads.keys())clearUpload(id);});
