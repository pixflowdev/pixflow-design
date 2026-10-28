export {};
const scope=window as any;
if(!scope.__PIXFLOW_NATIVE_PROTOTYPE__){
 const original=scope.__PIXFLOW_DESIGN_NATIVE_FETCH__||window.fetch.bind(window);
 const pending=new Map<string,any>();let disabled=false,disconnected=false,bridge='';
 let resolveReady!:(value:void)=>void;const ready=new Promise<void>(resolve=>{resolveReady=resolve;});
 const post=(payload:any)=>window.postMessage({channel:'pixflow-native-request',payload},location.origin);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='pixflow-native-response')return;
  const m=event.data.payload;
  if(m?.type==='ready'){bridge=m.bridge;disabled=false;disconnected=false;resolveReady();window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request',{detail:{source:'native-extension'}}));return;}
  if(m?.type==='disabled'||m?.type==='disconnected'){
   disabled=disabled||m.type==='disabled';disconnected=!disabled;resolveReady();
   for(const p of pending.values())p.fail(Object.assign(new Error('Extension connection closed. The run may still be active; reconnect to inspect it. No request was replayed.'),{name:'PixflowNativeDisconnectedError'}));return;
  }
  const p=pending.get(m?.id);if(!p)return;
  if(m.type==='headers'){
   const noBody=[204,205,304].includes(m.status)||p.method==='HEAD';
   p.resolve(new Response(noBody?null:new ReadableStream({start(c){p.controller=c;},pull(){if(p.ack){p.ack=false;post({id:m.id,type:'ack'});}},cancel(){post({id:m.id,type:'cancel'});p.cleanup();}}),{status:m.status,headers:m.headers}));
  }else if(m.type==='chunk'){
   p.controller?.enqueue(Uint8Array.from(atob(m.data),(s:string)=>s.charCodeAt(0)));
   if(!p.controller||p.controller.desiredSize>0)post({id:m.id,type:'ack'});else p.ack=true;
  }else if(m.type==='end'){p.controller?.close();p.cleanup();}else if(m.type==='error')p.fail(new Error(m.error));
 });
 const transport=async(input:RequestInfo|URL,init:RequestInit={})=>{
  const u=new URL(input instanceof Request?input.url:String(input),location.href);
  if(!['127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/api/')||disabled)return original(input,init);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native connection did not initialise')),10000);})]);}finally{clearTimeout(timer);}
  if(disabled)return original(input,init);
  if(disconnected)throw Object.assign(new Error('Native adapter disconnected. Reconnect to inspect the existing run; no request was replayed.'),{name:'PixflowNativeDisconnectedError'});
  if(u.origin!==bridge)return original(input,init);
  const request=new Request(input,init),body=['GET','HEAD'].includes(request.method)?null:new Uint8Array(await request.arrayBuffer());
  if(body&&body.length>18*1024*1024)throw new Error('Native upload exceeds 18 MiB limit');
  if(pending.size>=8)throw new Error('Native transport is busy; wait for an active request to finish');
  return new Promise<Response>((resolve,reject)=>{
   const id=crypto.randomUUID(),signal=request.signal;
   const abort=()=>{post({id,type:'cancel'});p.fail(new DOMException('Aborted','AbortError'));};
   const timeout=setTimeout(()=>{post({id,type:'cancel'});p.fail(new Error('Native request timed out; request not replayed'));},30*60*1000);
   const p:any={resolve,method:request.method,cleanup(){clearTimeout(timeout);signal.removeEventListener('abort',abort);pending.delete(id);},fail(error:Error){if(p.controller)p.controller.error(error);else reject(error);p.cleanup();}};
   pending.set(id,p);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
   post({id,type:body?'begin':'request',url:u.href,method:request.method,headers:Object.fromEntries(request.headers)});
   if(body){for(let i=0;i<body.length;i+=48*1024){let bytes='';for(const byte of body.subarray(i,i+48*1024))bytes+=String.fromCharCode(byte);post({id,type:'upload',data:btoa(bytes)});}post({id,type:'commit'});}
  });
 };
 window.addEventListener('pagehide',()=>{for(const [id,p] of pending){post({id,type:'cancel'});p.fail(new Error('Page navigated; reconnect to the existing run'));}});
 scope.__PIXFLOW_DESIGN_NATIVE_FETCH__=transport;window.fetch=transport;
 scope.__PIXFLOW_NATIVE_PROTOTYPE__=true;post({type:'hello'});
}
