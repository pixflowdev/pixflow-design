import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerPortableHost,removePortableHost,portableExecutable} from '../native-messaging/src/portable-installation';
for (const platform of ['darwin','linux'] as const) test(`${platform}: first launch and repair register outside package without changing user data`,async()=>{
 const home=await mkdtemp(join(tmpdir(),'pixflow-portable-'));const source=join(home,'readonly bundle');await mkdir(source);
 const config={hostName:'dev.pixflow.bridge',extensionOrigin:'chrome-extension://'+'a'.repeat(32)+'/',bridge:'http://127.0.0.1:7456',sites:[],discoverPairedSite:true};
 await writeFile(join(source,'config.json'),JSON.stringify(config));await writeFile(join(source,'host.mjs'),'// payload');await writeFile(join(home,'saved-chat'),'unchanged');
 const input={platform,home,source,executable:process.execPath,electron:true};
 try {const paths=await registerPortableHost(input);assert.ok(!paths.root.startsWith(source));const first=await readFile(paths.manifest,'utf8');await registerPortableHost(input);assert.equal(await readFile(paths.manifest,'utf8'),first);assert.match(await readFile(paths.launcher,'utf8'),/ELECTRON_RUN_AS_NODE=1/);assert.equal(await readFile(join(source,'host.mjs'),'utf8'),'// payload');
 await writeFile(join(source,'host.mjs'),'// repaired payload');await registerPortableHost(input);assert.equal(await readFile(join(paths.root,'host.mjs'),'utf8'),'// repaired payload');
 await writeFile(join(paths.root,'.registration-lock'),'99999999');await registerPortableHost(input);
 const other=join(home,'other-runtime');await writeFile(other,'other');await assert.rejects(registerPortableHost({...input,executable:other}),/Another installed Bridge/);assert.equal(await readFile(paths.manifest,'utf8'),first);
 assert.equal(await removePortableHost(input),true);assert.equal(await readFile(join(home,'saved-chat'),'utf8'),'unchanged');assert.equal(await removePortableHost(input),false);
 }finally{await rm(home,{recursive:true,force:true})}
});
test('launch path never points at a transient DMG, translocation or AppImage mount',()=>{
 assert.throws(()=>portableExecutable('darwin','/Volumes/Pixflow/Bridge.app/Contents/MacOS/Bridge'),/installed/);
 assert.throws(()=>portableExecutable('darwin','/private/var/AppTranslocation/x/Bridge'),/installed/);
 assert.throws(()=>portableExecutable('linux','/tmp/.mount_bridge/bridge'),/installed/);
 assert.equal(portableExecutable('linux','/tmp/.mount_bridge/bridge','/home/test/Applications/Bridge.AppImage'),'/home/test/Applications/Bridge.AppImage');
});



test('bundled install CLI routes POSIX install and uninstall to persistent user storage',async()=>{
 const {build}=await import('esbuild');const {execFileSync}=await import('node:child_process');const {pathToFileURL}=await import('node:url');
 const root=await mkdtemp(join(tmpdir(),'pixflow-cli-install-')),source=join(root,'bundle'),home=join(root,'home');await mkdir(source);await mkdir(home);
 try{await build({entryPoints:[new URL('../native-messaging/src/install-cli.ts',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')],outfile:join(source,'install.mjs'),bundle:true,platform:'node',format:'esm'});
 await writeFile(join(source,'host.mjs'),'// fixture');await writeFile(join(source,'config.json'),JSON.stringify({hostName:'dev.pixflow.bridge',extensionOrigin:'chrome-extension://'+'a'.repeat(32)+'/'}));
 for(const platform of ['darwin','linux']){const invoke=(operation:string)=>execFileSync(process.execPath,['--input-type=module','-e',`Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});process.argv[2]=${JSON.stringify(operation)};await import(${JSON.stringify(pathToFileURL(join(source,'install.mjs')).href)});`],{env:{...process.env,HOME:home,USERPROFILE:home,APPIMAGE:''},stdio:'pipe'});
 invoke('install');const dir=platform==='darwin'?join(home,'Library','Application Support','Google','Chrome'):join(home,'.config','google-chrome');const manifest=JSON.parse(await readFile(join(dir,'NativeMessagingHosts','dev.pixflow.bridge.json'),'utf8'));assert.ok(!manifest.path.startsWith(source));invoke('uninstall');}
 }finally{await rm(root,{recursive:true,force:true})}
});
