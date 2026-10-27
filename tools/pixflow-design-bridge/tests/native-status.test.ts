import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeBridge} from '../native-messaging/src/connection-status';
function fixture(){
 const events=()=>{let callback=(message?:any)=>{};return {addListener(fn:typeof callback){callback=fn;},emit(value?:any){callback(value);}};};
 const port={onMessage:events(),onDisconnect:events(),sent:[] as any[],closed:false,postMessage(message:any){this.sent.push(message);},disconnect(){this.closed=true;}};
 const runtime={connectNative:()=>port,lastError:undefined as {message:string}|undefined};return {port,runtime};
}
test('reports connected only after a completed successful read-only native probe',async()=>{
 const f=fixture(),result=probeBridge(f.runtime,'https://example.test','http://127.0.0.1:17467');
 assert.equal(f.port.sent[0].method,'GET');assert.equal(f.port.sent[0].url,'http://127.0.0.1:17467/api/health');
 f.port.onMessage.emit({id:'popup-health',type:'headers',status:200});f.port.onMessage.emit({id:'popup-health',type:'chunk',data:'e30='});
 assert.equal(f.port.sent[1].type,'ack');f.port.onMessage.emit({id:'popup-health',type:'end'});
 assert.equal(await result,'connected');assert.equal(f.port.closed,true);
});
test('distinguishes host setup, refusal, unreachable Bridge and timeout without retrying',async()=>{
 for(const [kind,expected] of [['missing','missing-host'],['denied','denied'],['error','unavailable'],['timeout','timeout']] as const){
  const f=fixture(),result=probeBridge(f.runtime,'https://example.test','http://127.0.0.1:17467',10);
  if(kind==='missing'){f.runtime.lastError={message:'Specified native messaging host not found.'};f.port.onDisconnect.emit();}
  if(kind==='denied'){f.port.onMessage.emit({id:'popup-health',type:'headers',status:403});f.port.onMessage.emit({id:'popup-health',type:'end'});}
  if(kind==='error')f.port.onMessage.emit({id:'popup-health',type:'error'});
  assert.equal(await result,expected);assert.equal(f.port.sent.length,1);assert.equal(f.port.closed,true);
 }
});
