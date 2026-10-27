import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const source=transformSync(readFileSync(new URL('../native-messaging/src/background.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
const flush=async()=>{for(let i=0;i<8;i++)await new Promise<void>(r=>setImmediate(r));};
function event(){const listeners:Function[]=[];return {addListener(fn:Function){listeners.push(fn);},emit(...args:any[]){for(const fn of listeners)fn(...args);}};}
function port(sender?:unknown){const p={name:'pixflow-native-prototype',sender,onMessage:event(),onDisconnect:event(),sent:[] as any[],closed:false,postMessage(value:any){if(p.closed)throw Error('closed');p.sent.push(value);},disconnect(){if(p.closed)return;p.closed=true;p.onDisconnect.emit();}};return p;}
function fixture(){
 let allowed=true;const native=port(),client=port({origin:'https://example.test',frameId:0});const chrome={
  runtime:{id:'fixture',getURL:(p:string)=>'chrome-extension://fixture/'+p,onInstalled:event(),onStartup:event(),onMessage:event(),onConnect:event(),connectNative:()=>native,lastError:undefined},
  permissions:{contains:async()=>allowed,onRemoved:event()},storage:{local:{get:async()=>({sites:['https://example.test']}),set:async()=>{}}},
  scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{}},tabs:{query:async()=>[]}
 };
 runInNewContext(source,{exports:{},module:{exports:{}},chrome,URL,fetch:async()=>({json:async()=>({sites:['https://example.test'],bridge:'http://127.0.0.1:17467'})})});
 return {client,native,chrome,revoke(){allowed=false;chrome.permissions.onRemoved.emit({origins:['https://example.test/*']});}};
}
test('revocation closes both active channels without requiring another page message',async()=>{
 const f=fixture();f.chrome.runtime.onConnect.emit(f.client);await flush();assert.equal(f.client.sent[0].type,'ready');
 f.native.onMessage.emit({id:'control',type:'chunk',data:'b2s='});await flush();assert.ok(f.client.sent.some(m=>m.id==='control'));
 f.revoke();await flush();assert.equal(f.native.closed,true);assert.equal(f.client.closed,true);
 const count=f.client.sent.length;f.native.onMessage.emit({id:'late',type:'chunk',data:'c2VjcmV0'});await flush();assert.equal(f.client.sent.length,count);
});
test('revocation during asynchronous connection admission never exposes a ready native channel',async()=>{
 const f=fixture();f.chrome.runtime.onConnect.emit(f.client);f.revoke();await flush();assert.equal(f.client.sent.some(m=>m.type==='ready'),false);assert.equal(f.client.closed,true);
});


test('queued response and request permission checks cannot use stale true after revocation',async()=>{
 const f=fixture();f.chrome.runtime.onConnect.emit(f.client);await flush();
 let resume!:(value:boolean)=>void;f.chrome.permissions.contains=()=>new Promise<boolean>(r=>{resume=r;});
 f.native.onMessage.emit({id:'late',type:'chunk',data:'c2VjcmV0'});await flush();
 f.revoke();resume(true);await flush();assert.equal(f.client.sent.some(m=>m.id==='late'),false);assert.equal(f.native.closed,true);
 const g=fixture();g.chrome.runtime.onConnect.emit(g.client);await flush();
 g.chrome.permissions.contains=()=>new Promise<boolean>(r=>{resume=r;});g.client.onMessage.emit({id:'write',type:'request'});await flush();g.revoke();resume(true);await flush();assert.equal(g.native.sent.length,0);
});

test('explicit direct-mode disable denies new connections while storage commit is pending',async()=>{
 const f=fixture();f.chrome.runtime.onConnect.emit(f.client);await flush();
 let commit!:()=>void;f.chrome.storage.local.set=()=>new Promise<void>(r=>{commit=r;});
 f.chrome.runtime.onMessage.emit({type:'disable',origin:'https://example.test'},{id:'fixture',url:'chrome-extension://fixture/popup.html'},()=>{});await flush();
 assert.equal(f.client.closed,true);const fresh=port({origin:'https://example.test',frameId:0});f.chrome.runtime.onConnect.emit(fresh);await flush();assert.equal(fresh.closed,true);assert.equal(fresh.sent.some(m=>m.type==='ready'),false);commit();await flush();
});

test('an older enable cannot undo disable while its final permission check is pending',async()=>{
 const f=fixture();let checks=0,resume!:(value:boolean)=>void,commit!:()=>void;
 f.chrome.permissions.contains=()=>++checks===2?new Promise<boolean>(r=>{resume=r;}):Promise.resolve(true);
 const sender={id:'fixture',url:'chrome-extension://fixture/popup.html'};
 f.chrome.runtime.onMessage.emit({type:'enable',origin:'https://example.test'},sender,()=>{});await flush();
 assert.equal(checks,2);
 f.chrome.storage.local.set=()=>new Promise<void>(r=>{commit=r;});
 f.chrome.runtime.onMessage.emit({type:'disable',origin:'https://example.test'},sender,()=>{});await flush();
 resume(true);await flush();
 const fresh=port({origin:'https://example.test',frameId:0});f.chrome.runtime.onConnect.emit(fresh);await flush();
 assert.equal(fresh.closed,true);assert.equal(fresh.sent.some(m=>m.type==='ready'),false);commit();await flush();
});
