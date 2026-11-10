import type {BrowserSite} from './browser-sites';
export type ConnectionState = 'direct'|'permission'|'connected'|'unavailable'|'missing-host'|'timeout'|'denied';
/** Bounded read-only probe. Opening settings never starts or replays a run. */
export function probeBridge(runtime:any, origin:string, bridge:string, timeoutMs=7000,hostName='dev.pixflow.bridge_prototype', site?:BrowserSite):Promise<ConnectionState>{
 return new Promise(resolve=>{
  let port:any,finished=false,status=0,healthStarted=false;
  const finish=(state:ConnectionState)=>{if(finished)return;finished=true;clearTimeout(timer);try{port?.disconnect();}catch{}resolve(state);};
  const timer=setTimeout(()=>finish('timeout'),timeoutMs);
  if(site&&site.siteOrigin!==origin){finish('denied');return;}
  const health=()=>{if(finished||healthStarted)return;healthStarted=true;port.postMessage({id:'popup-health',type:'request',origin,url:new URL('/api/health',bridge).href,method:'GET'});};
  try{
   port=runtime.connectNative(hostName);
   port.onDisconnect.addListener(()=>{const error=runtime.lastError?.message||'';finish(/not found|not registered|host manifest/i.test(error)?'missing-host':'unavailable');});
   port.onMessage.addListener((message:any)=>{
    if(finished)return;
    if(site&&message.id==='enroll'){if(message.type==='enrolled')health();else finish('unavailable');return;}
    if(message.id!=='popup-health'||!healthStarted)return;
    if(message.type==='headers')status=message.status;
    else if(message.type==='chunk')port.postMessage({id:'popup-health',type:'ack'});
    else if(message.type==='end')finish(status===200?'connected':status===401||status===403?'denied':'unavailable');
    else if(message.type==='error')finish('unavailable');
   });
   // Enrollment is per native process: another approved site may be active globally.
   if(site)port.postMessage({id:'enroll',type:'enroll',site});else health();
  }catch{finish('unavailable');}
 });
}
