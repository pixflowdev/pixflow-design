import { once } from 'node:events';
import type { Writable } from 'node:stream';

export const MAX_FRAME = 512 * 1024;
export type Configuration = { extensionOrigin: string; bridge: string; sites: string[]; discoverPairedSite?: boolean };
export function validateRequest(value: any, config: Configuration) {
  if (!value || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) throw new Error('Invalid request identity');
  if (!config.sites.includes(value.origin)) throw new Error('Site not approved in native adapter');
  const base = new URL(config.bridge), url = new URL(value.url);
  if (base.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(base.hostname) || base.username || base.password) throw new Error('Invalid loopback configuration');
  if (url.origin !== base.origin || url.username || url.password || url.hash || /\\|%2f|%5c|%00/i.test(url.pathname)) throw new Error('Destination rejected');
  // Existing browser-facing API families; the Bridge retains authorization.
  if (url.pathname !== '/api/test/connection' && !/^\/api\/(?:health|version|agents|app-config|active|chat|runs|projects|conversations|messages|pixflow|connectors|mcp|media|audio|uploads|files|skills|design-systems|models|providers|research|auth|amr|artifacts|dialog|editors|import|integrations|applied-plugins|pixflow-sync|plugins)(?:\/|$)/.test(url.pathname)) throw new Error('Endpoint not enabled in native adapter');
  if (/^\/api\/pixflow\/(?:daemon|shutdown|update)(?:\/|$)/.test(url.pathname)) throw new Error('Lifecycle endpoint rejected');
  const method = String(value.method || 'GET').toUpperCase();
  if (!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method)) throw new Error('Method rejected');
  if (value.body != null && (typeof value.body !== 'string' || Buffer.byteLength(value.body) > 24 * 1024 * 1024)) throw new Error('Body too large');
  const headers = new Headers();
  for (const [key, val] of Object.entries(value.headers || {})) {
    if (!['accept','content-type','x-od-client','authorization','x-pixflow-site-key','x-pixflow-workspace-session','x-pixflow-mcp-session','x-pixflow-audio-session','last-event-id','range'].includes(key.toLowerCase()) || typeof val !== 'string' || val.length > 8192) throw new Error('Header rejected');
    headers.set(key,val);
  }
  headers.set('Origin',value.origin);
  return { url, init: {method,headers,body:value.bodyEncoding==='base64' ? Buffer.from(value.body||'','base64') : value.body,redirect:'error' as const} };
}
export function encode(value: unknown): Buffer {
  const data=Buffer.from(JSON.stringify(value));
  if(data.length>MAX_FRAME) throw new Error('Frame too large');
  const size=Buffer.alloc(4);size.writeUInt32LE(data.length);return Buffer.concat([size,data]);
}
export function decoder(onMessage:(message:any)=>void) {
  let pending=Buffer.alloc(0);
  return (chunk:Buffer)=>{
    pending=Buffer.concat([pending,chunk]);
    while(pending.length>=4){const length=pending.readUInt32LE(0);if(!length||length>MAX_FRAME)throw new Error('Invalid frame size');if(pending.length<length+4)return;
      const data=pending.subarray(4,4+length);pending=pending.subarray(4+length);onMessage(JSON.parse(data.toString('utf8')));
    }
  };
}
export async function relay(request:any,config:Configuration,signal:AbortSignal,send:(message:any)=>Promise<void>) {
  const {url,init}=validateRequest(request,config);
  const response=await fetch(url,{...init,signal});
  const headers:Record<string,string>={};
  for(const name of ['content-type','content-range','accept-ranges','etag','last-modified','retry-after','content-disposition']){const value=response.headers.get(name);if(value!==null)headers[name]=value;}
  await send({id:request.id,type:'headers',status:response.status,headers});
  if(response.body){const reader=response.body.getReader();try{for(;;){
    const {done,value:data}=await reader.read();if(done)break;
    for(let i=0;i<data.length;i+=48*1024)await send({id:request.id,type:'chunk',data:Buffer.from(data.subarray(i,i+48*1024)).toString('base64')});
  }}finally{reader.releaseLock();}}
  await send({id:request.id,type:'end'});
}
export function writer(output:Writable){let chain=Promise.resolve();return (value:any)=>{chain=chain.then(async()=>{if(!output.write(encode(value)))await once(output,'drain');});return chain;};}
