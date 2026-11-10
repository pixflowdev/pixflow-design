import {access,readFile,writeFile,mkdir,rename,unlink,lstat,stat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {installNativeHost,uninstallNativeHost,installationPaths,type Registration} from './installation';
export type PortableInstallation={platform:'darwin'|'linux';home:string;source:string;executable:string;appImage?:string;electron:boolean};
/** A native host must remain launchable after the app quits and its mount disappears. */
export function portableExecutable(platform:PortableInstallation['platform'],executable:string,appImage?:string):string {
 const target=platform==='linux'&&appImage?appImage:executable;
 if(!isAbsolute(target)||/[\r\n\0"%]/.test(target)||/^\/Volumes\//.test(target)||/AppTranslocation|\/\.mount_|^\/tmp\/|^\/var\/tmp\//.test(target))throw Error('Open Bridge from a persistent installed location before enabling the browser extension');
 return target;
}
const exists=async(path:string)=>{try{await access(path);return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}};
async function registration(input:PortableInstallation):Promise<Registration>{
 const config=JSON.parse(await readFile(join(input.source,'config.json'),'utf8'));
 const extensionId=/^chrome-extension:\/\/([a-p]{32})\/$/.exec(config.extensionOrigin)?.[1];
 if(!extensionId)throw Error('Invalid native extension identity');
 const base=input.platform==='darwin'?join(input.home,'Library','Application Support'):join(input.home,'.local','share');
 const value:Registration={platform:input.platform,home:input.home,hostName:config.hostName,extensionId,runtimeRoot:join(base,'Pixflow Design Bridge','native-messaging',config.hostName),node:portableExecutable(input.platform,input.executable,input.appImage),electron:input.electron};
 installationPaths(value);return value;
}
async function atomicWrite(file:string,content:string){const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,content,{mode:0o600,flag:'wx'});await rename(temp,file)}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e})}}
async function acquireLock(file:string):Promise<()=>Promise<void>> {
 const claim=async()=>{await writeFile(file,String(process.pid),{flag:'wx',mode:0o600});return async()=>{await unlink(file)}};
 try{return await claim()}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
 // Only recover abandoned locks. A live owner or an incomplete recent write is never displaced.
 const text=await readFile(file,'utf8'),pid=Number(text);
 if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);throw Error('Native registration is already in progress')}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error}}
 else if(Date.now()-(await stat(file)).mtimeMs<30000)throw Error('Native registration is already in progress');
 await unlink(file);return claim();
}
async function owns(input:Registration){
 const paths=installationPaths(input);
 if(await exists(paths.manifest)){const m=JSON.parse(await readFile(paths.manifest,'utf8'));if(m.name!==input.hostName||m.path!==paths.launcher||JSON.stringify(m.allowed_origins)!==JSON.stringify([`chrome-extension://${input.extensionId}/`]))throw Error('Native registration belongs to another installation');}
 const owner=join(paths.root,'installation.json');
 if(await exists(owner)){const prior=JSON.parse(await readFile(owner,'utf8'));if(prior.extensionId!==input.extensionId||prior.hostName!==input.hostName)throw Error('Native payload belongs to another installation');if(prior.executable!==input.node&&await exists(prior.executable))throw Error('Another installed Bridge owns native registration');}
}
/** Per-user copies keep signed app bundles and AppImage mounts read-only. Consent is never modified. */
export async function registerPortableHost(input:PortableInstallation){
 const config=await registration(input),paths=installationPaths(config);
 await access(config.node);const host=await readFile(join(input.source,'host.mjs'),'utf8'),settings=await readFile(join(input.source,'config.json'),'utf8');
 await mkdir(paths.root,{recursive:true,mode:0o700});if((await lstat(paths.root)).isSymbolicLink())throw Error('Native runtime cannot be a symlink');
 const release=await acquireLock(join(paths.root,'.registration-lock'));
 try{await owns(config);await atomicWrite(join(paths.root,'host.mjs'),host);await atomicWrite(join(paths.root,'config.json'),settings);await atomicWrite(join(paths.root,'installation.json'),JSON.stringify({hostName:config.hostName,extensionId:config.extensionId,executable:config.node}));return await installNativeHost(config)}finally{await release()}
}
/** Explicit removal only unregisters this installation; no chats, settings, or Chrome grants are deleted. */
export async function removePortableHost(input:PortableInstallation){const config=await registration(input);await owns(config);return uninstallNativeHost(config)}
