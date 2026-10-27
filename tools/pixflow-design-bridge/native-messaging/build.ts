import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname),out=resolve(root,'../../../.tmp/native-messaging-prototype');
await mkdir(out,{recursive:true});
for(const name of ['background','content','page'])await build({entryPoints:[resolve(root,'src',name+'.ts')],outfile:resolve(out,name+'.js'),bundle:true,platform:'browser',format:'iife',target:'chrome120'});
await build({entryPoints:[resolve(root,'src/host.ts')],outfile:resolve(out,'host.mjs'),bundle:true,platform:'node',format:'esm',target:'node24'});
await writeFile(resolve(out,'manifest.json'),JSON.stringify({manifest_version:3,name:'Pixflow Native Bridge Prototype',version:'0.0.1',permissions:['nativeMessaging','activeTab','scripting'],action:{default_title:'Enable native Bridge for this tab (prototype)'},background:{service_worker:'background.js'}},null,2));
console.log(out);
