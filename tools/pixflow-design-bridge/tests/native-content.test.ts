import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const source=transformSync(readFileSync(new URL('../native-messaging/src/content.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
test('disconnect reaches the page even after Chrome invalidates extension APIs',()=>{
 let disconnect!:()=>void;const messages:any[]=[];
 const chrome={runtime:{connect:()=>({onMessage:{addListener(){}},onDisconnect:{addListener(fn:()=>void){disconnect=fn;}}}),onMessage:{addListener(){},removeListener(){throw Error('Extension context invalidated');}}}};
 const window={postMessage:(m:any)=>messages.push(m),addEventListener(){},removeEventListener(){}};
 runInNewContext(source,{module:{exports:{}},exports:{},chrome,window,location:{origin:'https://example.test'}});
 assert.doesNotThrow(()=>disconnect());assert.ok(messages.some(m=>m.payload.type==='disconnected'));
});
