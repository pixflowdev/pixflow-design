import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {decoder,encode,relay,validateRequest,type Configuration} from '../native-messaging/src/relay';
const config:Configuration={extensionOrigin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',bridge:'http://127.0.0.1:17467',sites:['https://example.test']};
const request={id:'request-1',origin:config.sites[0],url:config.bridge+'/api/health'};
test('connection test is allowed without opening other test endpoints',()=>{
 assert.doesNotThrow(()=>validateRequest({...request,url:config.bridge+'/api/test/connection',method:'POST'},config));
 for(const path of ['/api/test','/api/test/other','/api/test/connection/extra'])assert.throws(()=>validateRequest({...request,url:config.bridge+path,method:'POST'},config));
});
test('frames survive fragmented Unicode and coalesced messages',()=>{
 const seen:any[]=[];const consume=decoder(x=>seen.push(x));const bytes=Buffer.concat([encode({text:'Hello 👋'}),encode({done:true})]);
 for(const byte of bytes)consume(Buffer.from([byte]));assert.deepEqual(seen,[{text:'Hello 👋'},{done:true}]);
 assert.throws(()=>decoder(()=>{})(Buffer.from([255,255,255,127])));
});
test('adapter rejects foreign sites, destinations, methods and privilege headers',()=>{
 for(const change of [{origin:'https://evil.test'},{url:'http://localhost:17467/api/health'},{url:'http://127.0.0.1:7456/api/health'},{url:config.bridge+'/api/daemon/shutdown',method:'POST'},{url:config.bridge+'/api/%68ealth'},{headers:{Origin:'https://evil.test'}},{headers:{'X-OD-Tool-Token':'forged'}},{url:config.bridge+'/api/chat',method:'TRACE'}])assert.throws(()=>validateRequest({...request,...change},config));
 assert.equal(validateRequest(request,config).init.headers.get('origin'),config.sites[0]);
});
test('relay preserves server denials and streams chunks without replaying mutations',async()=>{
 let calls=0;const server=http.createServer((req,res)=>{calls++;assert.equal(req.headers.origin,config.sites[0]);if(req.url==='/api/chat'){res.writeHead(403,{'content-type':'application/json'});res.end('{"error":"denied"}');}else{res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: first\n\n');setTimeout(()=>res.end('data: second\n\n'),15);}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 try{
  for(const [path,method,status] of [['/api/agents/stream','GET',200],['/api/chat','POST',403]] as const){
   const messages:any[]=[];await relay({...request,url:base+path,method,headers:{'X-Pixflow-Site-Key':'synthetic'},body:method==='POST'?'{}':undefined},{...config,bridge:base},new AbortController().signal,async m=>{messages.push(m);});
   assert.equal(messages[0].status,status);assert.equal(messages.at(-1).type,'end');assert.ok(messages.some(m=>m.type==='chunk'));
  }assert.equal(calls,2);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('redirects cannot escape the approved local endpoint',async()=>{
 const server=http.createServer((_req,res)=>{res.writeHead(302,{location:'http://example.com'});res.end();});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 try{await assert.rejects(relay({...request,url:base+'/api/health'},{...config,bridge:base},new AbortController().signal,async()=>{}));}finally{server.closeAllConnections();server.close();}
});
test('cancellation ends a stalled request without replay and a later request recovers',async()=>{
 let calls=0;const server=http.createServer((_req,res)=>{calls++;if(calls>1)res.end('recovered');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+(server.address() as any).port,controller=new AbortController();
 try{
  const pending=relay({...request,url:base+'/api/health'},{...config,bridge:base},controller.signal,async()=>{});
  const timer=setTimeout(()=>controller.abort(),30);await assert.rejects(pending);clearTimeout(timer);assert.equal(calls,1);
  const messages:any[]=[];await relay({...request,url:base+'/api/health'},{...config,bridge:base},new AbortController().signal,async m=>{messages.push(m);});assert.equal(calls,2);assert.equal(messages.at(-1).type,'end');
 }finally{server.closeAllConnections();server.close();}
});

test('browser endpoint families preserve methods, binary bodies and session headers',async()=>{
 for(const family of ['runs','projects','connectors','amr','artifacts','dialog','editors','import','integrations','applied-plugins','pixflow-sync','plugins','pixflow']){
  for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE'])assert.equal(validateRequest({...request,url:config.bridge+'/api/'+family+'/fixture',method},config).init.method,method);
 }
 const bytes=Buffer.from([0,255,128,1,13,10]);let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),bytes);assert.equal(req.method,'PUT');assert.equal(req.headers['x-pixflow-workspace-session'],'synthetic-session');res.writeHead(206,{'content-type':'application/octet-stream','content-range':'bytes 0-5/6','etag':'"fixture"'});res.end(bytes);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 try{const messages:any[]=[];await relay({...request,url:base+'/api/projects/fixture/upload',method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Pixflow-Workspace-Session':'synthetic-session','X-OD-Client':'web'},body:bytes.toString('base64'),bodyEncoding:'base64'},{...config,bridge:base},new AbortController().signal,async m=>{messages.push(m);});assert.equal(calls,1);assert.equal(messages[0].headers['content-range'],'bytes 0-5/6');assert.deepEqual(Buffer.concat(messages.filter(m=>m.type==='chunk').map(m=>Buffer.from(m.data,'base64'))),bytes);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
