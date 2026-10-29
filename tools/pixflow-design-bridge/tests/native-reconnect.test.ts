import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconnectRequest} from '../native-messaging/src/reconnect-request';
import {validateRequest} from '../native-messaging/src/relay';
function fixture() {
 const origin='https://customer.example', tab={id:1,windowId:2,url:origin+'/wp-admin/'};
 const stored:any={}, opened:any[]=[], candidates:any[]=[];
 let allowed=false, active=0, time=1000;
 const chrome={tabs:{query:async()=>[tab]},windows:{get:async()=>({focused:true})},storage:{local:{get:async()=>stored}},permissions:{contains:async()=>allowed},action:{openPopup:async(v:any)=>{opened.push(v);}}};
 const request=reconnectRequest(chrome,async()=>{active++;},s=>{candidates.push(s);},()=>time);
 const sender={origin,url:tab.url,frameId:0,tab:{...tab}},message={type:'pixflow-bridge-reconnect',site:{siteKey:'a'.repeat(64),siteOrigin:origin,siteUrl:origin,siteLabel:'Customer'}};
 return {request,sender,message,tab,chrome,stored,opened,candidates,allow(){allowed=true;},active:()=>active,advance(){time+=4000;}};
}
test('explicit reconnect opens approval UI without granting access or starting native requests',async()=>{
 const f=fixture();assert.equal((await f.request(f.message,f.sender)).state,'approval');
 assert.equal(f.opened.length,1);assert.equal(f.active(),0);assert.deepEqual(f.stored,{});
 assert.equal((await f.request(f.message,f.sender)).state,'busy');
});
test('approved sites reconnect silently; explicit direct preference is preserved',async()=>{
 const f=fixture();f.allow();assert.equal((await f.request(f.message,f.sender)).state,'reconnecting');assert.equal(f.active(),1);assert.equal(f.opened.length,0);
 f.advance();f.stored.directSites=[f.sender.origin];assert.equal((await f.request(f.message,f.sender)).state,'approval');assert.equal(f.active(),1);assert.equal(f.opened.length,1);assert.deepEqual(f.stored.directSites,[f.sender.origin]);
});
test('rejects subframes, background tabs, cross-origin metadata, and arbitrary commands',async()=>{
 for(const mode of ['frame','background','origin','command']){
  const f=fixture();if(mode==='frame')f.sender.frameId=1;if(mode==='background')f.tab.id=2;if(mode==='origin')f.message.site.siteOrigin='https://other.example';if(mode==='command')f.message.type='enable';
  assert.equal((await f.request(f.message,f.sender)).state,'rejected');assert.equal(f.opened.length,0);assert.equal(f.active(),0);
 }
});
test('navigation during permission check cannot open popup on another site',async()=>{
 const f=fixture();f.chrome.permissions.contains=async()=>{f.tab.url='https://other.example';return false;};
 assert.equal((await f.request(f.message,f.sender)).state,'unavailable');assert.equal(f.opened.length,0);
});
test('existing native relay supports Claude sign-in, status and cancellation without new privilege',()=>{
 const config={extensionOrigin:'chrome-extension://'+'a'.repeat(32)+'/',bridge:'http://127.0.0.1:7456',sites:['https://customer.example']};
 for(const [path,method] of [['/api/agents/claude/sign-in','POST'],['/api/agents/claude/sign-in','GET'],['/api/agents/claude/sign-in/cancel','POST']]) {
  assert.doesNotThrow(()=>validateRequest({id:'sign-in',origin:config.sites[0],url:config.bridge+path,method},config));
 }
});
