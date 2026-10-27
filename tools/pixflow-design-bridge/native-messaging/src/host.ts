import { readFileSync } from 'node:fs';
import { decoder, relay, writer, type Configuration } from './relay';
const config:Configuration=JSON.parse(readFileSync(new URL('./config.json',import.meta.url),'utf8'));
if(process.argv[2]!==config.extensionOrigin)process.exit(1);
const active=new Map<string,AbortController>(), send=writer(process.stdout);
const consume=decoder(message=>{
  if(message.type==='cancel'){active.get(message.id)?.abort();return;}
  if(active.has(message.id)||active.size>=8){void send({id:message.id,type:'error',error:'Request already active or capacity reached'});return;}
  const controller=new AbortController();active.set(message.id,controller);
  const timer=setTimeout(()=>controller.abort(),300_000);
  void relay(message,config,controller.signal,send).catch(()=>send({id:message.id,type:'error',error:'Native Bridge request failed. No request was replayed; inspect its result before retrying an edit.'})).finally(()=>{clearTimeout(timer);active.delete(message.id);});
});
process.stdin.on('data',chunk=>{try{consume(chunk);}catch{process.stdin.destroy();for(const c of active.values())c.abort();process.exitCode=1;}});
process.stdin.on('end',()=>{for(const c of active.values())c.abort();});
