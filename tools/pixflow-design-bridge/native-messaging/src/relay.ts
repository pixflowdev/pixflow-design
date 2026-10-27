import { once } from 'node:events';
import type { Writable } from 'node:stream';

export const MAX_FRAME = 512 * 1024;
export type Configuration = { extensionOrigin: string; bridge: string; sites: string[] };
export function validateRequest(value: any, config: Configuration) {
  if (!value || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) throw new Error('Invalid request identity');
  if (!config.sites.includes(value.origin)) throw new Error('Site not approved in native adapter');
  const base = new URL(config.bridge), url = new URL(value.url);
  if (base.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(base.hostname) || base.username || base.password) throw new Error('Invalid loopback configuration');
  if (url.origin !== base.origin || url.username || url.password || url.hash || /%|\\/.test(url.pathname)) throw new Error('Destination rejected');
  // Prototype intentionally excludes filesystem, arbitrary proxy and lifecycle endpoints.
  if (!/^\/api\/(health|agents(?:\/stream)?|pixflow\/site-context|chat|runs(?:\/[\w-]+(?:\/(?:events|steer|stop))?)?)$/.test(url.pathname)) throw new Error('Endpoint not enabled in prototype');
  const method = String(value.method || 'GET').toUpperCase();
  if (!['GET','POST'].includes(method) || (method === 'POST' && !/^\/api\/(chat|runs\/[\w-]+\/(steer|stop))$/.test(url.pathname))) throw new Error('Method rejected');
  if (value.body != null && (typeof value.body !== 'string' || Buffer.byteLength(value.body) > 256 * 1024)) throw new Error('Body too large');
  const headers = new Headers();
  for (const [key, val] of Object.entries(value.headers || {})) {
    if (!['accept','content-type','authorization','x-pixflow-site-key','x-pixflow-workspace-session'].includes(key.toLowerCase()) || typeof val !== 'string' || val.length > 8192) throw new Error('Header rejected');
    headers.set(key,val);
  }
  headers.set('Origin',value.origin);
  if (method === 'POST' && !headers.get('x-pixflow-site-key')) throw new Error('Site identity required for mutations');
  return { url, init: {method,headers,body:value.body,redirect:'error' as const} };
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
  await send({id:request.id,type:'headers',status:response.status,headers:{'content-type':response.headers.get('content-type')||'application/octet-stream'}});
  if(response.body){const reader=response.body.getReader();try{for(;;){
    const {done,value:data}=await reader.read();if(done)break;
    for(let i=0;i<data.length;i+=48*1024)await send({id:request.id,type:'chunk',data:Buffer.from(data.subarray(i,i+48*1024)).toString('base64')});
  }}finally{reader.releaseLock();}}
  await send({id:request.id,type:'end'});
}
export function writer(output:Writable){let chain=Promise.resolve();return (value:any)=>{chain=chain.then(async()=>{if(!output.write(encode(value)))await once(output,'drain');});return chain;};}
