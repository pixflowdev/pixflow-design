import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const source = transformSync(readFileSync(new URL('../native-messaging/src/page.ts', import.meta.url),'utf8'),{loader:'ts',format:'iife'}).code;

test('actual extension responses identify native transport; disabled and other endpoints identify direct fallback', async () => {
  const events = new EventTarget();
  const scope: any = { addEventListener:events.addEventListener.bind(events), dispatchEvent:events.dispatchEvent.bind(events), fetch:async()=>Response.json({ok:true}) };
  const send=(payload:unknown)=>{const event=new Event('message');Object.assign(event,{source:scope,origin:'https://site.test',data:{channel:'pixflow-native-response',payload}});events.dispatchEvent(event);};
  scope.postMessage=({payload}:any)=>{
    if(payload.type==='hello')queueMicrotask(()=>send({type:'ready',bridge:'http://127.0.0.1:7456'}));
    if(payload.type==='request')queueMicrotask(()=>{send({id:payload.id,type:'headers',status:200,headers:{'content-type':'application/json'}});send({id:payload.id,type:'end'});});
  };
  vm.runInNewContext(source,{window:scope,location:{href:'https://site.test',origin:'https://site.test'},URL,Request,Response,ReadableStream,CustomEvent,crypto,atob,setTimeout,clearTimeout,Uint8Array,DOMException});
  const native=await scope.fetch('http://127.0.0.1:7456/api/health');
  assert.equal(native.headers.get('X-Pixflow-Connection-Route'),'chrome-extension');
  const different=await scope.fetch('http://127.0.0.1:17467/api/health');
  assert.equal(different.pixflowConnectionRoute,'direct');
  send({type:'disconnected'});
  await assert.rejects(scope.fetch('http://127.0.0.1:7456/api/health'),/disconnected/);
  send({type:'disabled'});
  const direct=await scope.fetch('http://127.0.0.1:7456/api/health');
  assert.equal(direct.pixflowConnectionRoute,'direct');
  assert.equal(direct.headers.get('X-Pixflow-Connection-Route'),null);
});
