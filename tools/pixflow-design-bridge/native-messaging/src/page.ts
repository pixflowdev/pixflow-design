export {};
const scope=window as any;
if(!scope.__PIXFLOW_NATIVE_PROTOTYPE__){
 const original=scope.__PIXFLOW_DESIGN_NATIVE_FETCH__||window.fetch.bind(window);
 const pending=new Map<string,any>();let connected=true;
 const post=(payload:any)=>window.postMessage({channel:'pixflow-native-request',payload},location.origin);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  if(event.data?.channel==='pixflow-native-disconnected'){connected=false;for(const p of pending.values())p.fail(new Error('Native adapter disconnected; request not replayed'));pending.clear();return;}
  if(event.data?.channel!=='pixflow-native-response')return;
  const m=event.data.payload,p=pending.get(m?.id);if(!p)return;
  if(m.type==='headers'){p.resolve(new Response(new ReadableStream({start(c){p.controller=c;},cancel(){post({id:m.id,type:'cancel'});p.cleanup();}}),{status:m.status,headers:m.headers}));}
  else if(m.type==='chunk')p.controller?.enqueue(Uint8Array.from(atob(m.data),(s:string)=>s.charCodeAt(0)));
  else if(m.type==='end'){p.controller?.close();p.cleanup();}
  else if(m.type==='error')p.fail(new Error(m.error));
 });
 scope.__PIXFLOW_DESIGN_NATIVE_FETCH__=(url:any,init:RequestInit={})=>{
  const u=new URL(String(url),location.href);
  if(!['127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/api/'))return original(url,init);
  if(!connected)return Promise.reject(new Error('Native adapter disconnected. Reload to return to the standard Bridge connection.'));
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();const abort=()=>{post({id,type:'cancel'});p.fail(new DOMException('Aborted','AbortError'));};
   const timer=setTimeout(()=>{post({id,type:'cancel'});p.fail(new Error('Native adapter timed out; request not replayed'));},300000);
   const p:any={resolve,reject,cleanup(){clearTimeout(timer);init.signal?.removeEventListener('abort',abort);pending.delete(id);},fail(error:Error){if(p.controller)p.controller.error(error);else reject(error);p.cleanup();}};
   pending.set(id,p);init.signal?.addEventListener('abort',abort,{once:true});
   if(init.signal?.aborted){abort();return;}
   if(init.body!=null&&typeof init.body!=='string'){p.fail(new Error('Prototype supports JSON request bodies only'));return;}
   post({id,url:u.href,method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),body:init.body});
  });
 };
 scope.__PIXFLOW_NATIVE_PROTOTYPE__=true;
}
