import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out=resolve(import.meta.dirname,'../../../.tmp/native-messaging-prototype');
const args=process.argv.slice(2),value=(flag:string)=>args[args.indexOf(flag)+1];
if(!args.includes('--site')||!args.includes('--bridge'))throw new Error('Use --site <approved origin> --bridge <loopback URL> [--register-windows]');
const site=new URL(value('--site')),bridge=new URL(value('--bridge'));
if(site.origin!==value('--site')||(!['https:'].includes(site.protocol)&&!(site.protocol==='http:'&&site.hostname==='127.0.0.1')))throw new Error('Use HTTPS or isolated loopback site origin');
if(bridge.protocol!=='http:'||bridge.hostname!=='127.0.0.1'||bridge.pathname!=='/'||bridge.search||bridge.hash||bridge.username||bridge.password)throw new Error('Bridge must be explicit IPv4 loopback origin');
const manifest=JSON.parse(await readFile(resolve(out,'manifest.json'),'utf8'));
manifest.key??=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'}).toString('base64');
const id=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].flatMap(x=>[x>>4,x&15]).map(x=>String.fromCharCode(97+x)).join('');
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(resolve(out,'config.json'),JSON.stringify({hostName:'dev.pixflow.bridge_prototype',extensionOrigin:`chrome-extension://${id}/`,bridge:bridge.origin,sites:[site.origin]},null,2));
const launcher=resolve(out,'native-host.cmd');
await writeFile(launcher,`@echo off\r\n"${process.execPath}" "${resolve(out,'host.mjs')}" %*\r\n`);
const file=resolve(out,'native-host.json');
await writeFile(file,JSON.stringify({name:'dev.pixflow.bridge_prototype',description:'Isolated Pixflow native transport prototype',path:launcher,type:'stdio',allowed_origins:[`chrome-extension://${id}/`]},null,2));
if(args.includes('--register-windows')){
 if(process.platform!=='win32')throw new Error('Windows registration only');
 const key='HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\dev.pixflow.bridge_prototype';
 // Never overwrite an existing registration, including another prototype run.
 let exists=false;try{execFileSync('reg',['query',key],{stdio:'ignore'});exists=true;}catch{}
 if(exists)throw new Error('Prototype host already registered; inspect it before replacing');
 execFileSync('reg',['add',key,'/ve','/t','REG_SZ','/d',file],{stdio:'inherit'});
}
console.log(JSON.stringify({extensionId:id,extension:out,nativeManifest:file,site:site.origin,bridge:bridge.origin}));
