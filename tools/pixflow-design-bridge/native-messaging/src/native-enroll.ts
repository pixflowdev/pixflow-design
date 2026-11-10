import type {BrowserSite} from './browser-sites';
/** Only the trusted extension background may invoke this after checking saved host consent. */
export function enrollNativeSite(runtime:any,hostName:string,site:BrowserSite, existingPort?:any):Promise<void>{
 return new Promise((resolve,reject)=>{
  let port:any,finished=false;
  const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);try{if(!existingPort)port?.disconnect();}catch{}error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(Error('Bridge connection timed out')),45000);
  try{
   port=existingPort||runtime.connectNative(hostName);
   port.onDisconnect.addListener(()=>finish(Error(runtime.lastError?.message||'Bridge unavailable')));
   port.onMessage.addListener((message:any)=>{if(message.id==='enroll')finish(message.type==='enrolled'?undefined:Error(message.error||'Site connection failed'));});
   port.postMessage({id:'enroll',type:'enroll',site});
  }catch(error){finish(error as Error);}
 });
}
