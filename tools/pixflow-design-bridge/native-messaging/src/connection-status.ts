export type ConnectionState = 'direct'|'permission'|'connected'|'unavailable'|'missing-host'|'timeout'|'denied';
/** Bounded read-only probe. Opening settings never starts or replays a run. */
export function probeBridge(runtime:any, origin:string, bridge:string, timeoutMs=7000):Promise<ConnectionState>{
 return new Promise(resolve=>{
  let port:any,finished=false,status=0;
  const finish=(state:ConnectionState)=>{if(finished)return;finished=true;clearTimeout(timer);try{port?.disconnect();}catch{}resolve(state);};
  const timer=setTimeout(()=>finish('timeout'),timeoutMs);
  try{
   port=runtime.connectNative('dev.pixflow.bridge_prototype');
   port.onDisconnect.addListener(()=>{const error=runtime.lastError?.message||'';finish(/not found|not registered|host manifest/i.test(error)?'missing-host':'unavailable');});
   port.onMessage.addListener((message:any)=>{
    if(message.id!=='popup-health'||finished)return;
    if(message.type==='headers')status=message.status;
    else if(message.type==='chunk')port.postMessage({id:'popup-health',type:'ack'});
    else if(message.type==='end')finish(status===200?'connected':status===401||status===403?'denied':'unavailable');
    else if(message.type==='error')finish('unavailable');
   });
   port.postMessage({id:'popup-health',type:'request',origin,url:new URL('/api/health',bridge).href,method:'GET'});
  }catch{finish('unavailable');}
 });
}
