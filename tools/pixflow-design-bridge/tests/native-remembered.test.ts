import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
const source=buildSync({entryPoints:[fileURLToPath(new URL('../native-messaging/src/background.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text;
const origin='https://remembered.example',site={siteKey:'c'.repeat(64),siteOrigin:origin,siteUrl:origin,siteLabel:'Remembered'};
function event(){const listeners:Function[]=[];return {addListener(fn:Function){listeners.push(fn);},emit(...args:any[]){for(const fn of listeners)fn(...args);}};}
const flush=async()=>{for(let i=0;i<30;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
function fixture({saved=true,granted=true,direct=false,online=true}={}){
 const stored:any={sites:saved?[origin]:[],rememberedSites:saved?[site]:[],directSites:direct?[origin]:[]};
 const requests:any[]=[],injected:any[]=[];
 const chrome:any={runtime:{id:'fixture',getURL:(p:string)=>'chrome-extension://fixture/'+p,onInstalled:event(),onStartup:event(),onConnect:event(),onMessage:event(),connectNative(){
  const port:any={onMessage:event(),onDisconnect:event(),disconnect(){},postMessage(message:any){requests.push(message);queueMicrotask(()=>online?port.onMessage.emit({id:message.id,type:'enrolled'}):port.onDisconnect.emit());}};return port;
 }},storage:{local:{get:async()=>({...stored}),set:async(value:any)=>Object.assign(stored,value)}},permissions:{contains:async()=>granted,onAdded:event(),onRemoved:event()},alarms:{create(){},onAlarm:event()},tabs:{query:async()=>[{id:1,url:origin+'/wp-admin/'}],onActivated:event(),onUpdated:event()},scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{},executeScript:async(args:any)=>{if(args.func)return [{frameId:0,result:site}];injected.push(args);return [];}}};
 runInNewContext(source,{module:{exports:{}},exports:{},chrome,URL,setTimeout,clearTimeout,fetch:async()=>({json:async()=>({sites:[],discoverPairedSite:true,bridge:'http://127.0.0.1:7456',hostName:'dev.pixflow.bridge'})})});
 return {chrome,requests,injected,stored,setOnline(value:boolean){online=value;},config:()=>new Promise<any>(resolve=>chrome.runtime.onMessage.emit({type:'configuration'},{id:'fixture',url:'chrome-extension://fixture/popup.html'},resolve))};
}
test('popup lists new supported browser site before consent and without contacting Bridge',async()=>{
 const f=fixture({saved:false,granted:false,online:false});const config=await f.config();assert.deepEqual(Array.from(config.sites),[origin]);assert.equal(f.requests.length,0);assert.equal(f.stored.sites.length,0);
});
test('saved site remains listed without a tab or running Bridge',async()=>{
 const f=fixture({online:false});f.chrome.tabs.query=async()=>[];const config=await f.config();assert.deepEqual(Array.from(config.sites),[origin]);assert.equal(f.requests.length,0);
});
test('startup reconnects remembered consent and alarm retries when Bridge becomes available',async()=>{
 const f=fixture({online:false});f.chrome.runtime.onStartup.emit();await flush();assert.equal(f.injected.length,0);assert.ok(f.requests.some(r=>r.type==='enroll'));
 f.setOnline(true);f.chrome.alarms.onAlarm.emit({name:'pixflow-reconnect'});await flush();assert.ok(f.injected.some(r=>r.files?.includes('page.js')));assert.ok(f.requests.every(r=>r.type==='enroll'),'never replay a run during reconnect');
});
test('explicit disconnect and removed host permission prevent automatic enrollment',async()=>{
 for(const options of [{direct:true},{granted:false}]){const f=fixture(options);f.chrome.runtime.onStartup.emit();await flush();assert.equal(f.requests.length,0);assert.equal(f.injected.length,0);}
});
