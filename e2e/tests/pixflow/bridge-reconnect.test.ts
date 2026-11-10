import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect, test} from 'vitest';
const source=readFileSync(new URL('../../../wordpress/assets/admin/bridge-status.js', import.meta.url),'utf8');
const handler=source.slice(source.indexOf('  var extensionReconnectPending'),source.indexOf('  function reconnectDirect()'));
function fixture(mode:'extension'|'absent'|'throws'|'timeout') {
 const messages:any[]=[], timers=new Map<number,()=>void>();let probes=0;
 const config={siteHash:'a'.repeat(64),siteOrigin:'https://customer.example',siteUrl:'https://customer.example',siteLabel:'QA'};
 let callback:()=>void=()=>{};
 const window:any={setTimeout:(fn:()=>void)=>{timers.set(1,fn);return 1;},clearTimeout:(id:number)=>timers.delete(id)};
 if(mode!=='absent')window.chrome={runtime:{sendMessage:(id:string,payload:any,done:()=>void)=>{messages.push({id,payload});callback=done;if(mode==='throws')throw Error('Extension unavailable');}}};
 const context:any={window,config,reconnectDirect:()=>{probes++;}};
 runInNewContext(handler,context);
 return {context,messages,probes:()=>probes,reply:()=>callback(),timeout:()=>timers.get(1)?.()};
}
test.each(['execution-settings','floating-panel','workspace-header'])('%s requests extension recovery before probing',source=>{
 const f=fixture('extension');f.context.requestReconnect({detail:{source}});
 expect(f.messages).toHaveLength(1);expect(f.messages[0].payload.type).toBe('pixflow-bridge-reconnect');expect(f.probes()).toBe(0);
 f.reply();expect(f.probes()).toBe(1);
});
test.each(['absent','throws','timeout'] as const)('direct recovery survives extension %s',mode=>{
 const f=fixture(mode);f.context.requestReconnect({detail:{source:'execution-settings'}});if(mode==='timeout')f.timeout();expect(f.probes()).toBe(1);f.reply();expect(f.probes()).toBe(1);
});
test('extension-ready notification cannot reopen popup, and rapid clicks are coalesced',()=>{
 const f=fixture('extension');f.context.requestReconnect({detail:{source:'native-extension'}});expect(f.messages).toHaveLength(0);
 f.context.requestReconnect({detail:{source:'workspace-header'}});f.context.requestReconnect({detail:{source:'floating-panel'}});expect(f.messages).toHaveLength(1);
 f.reply();expect(f.probes()).toBe(2);
});
