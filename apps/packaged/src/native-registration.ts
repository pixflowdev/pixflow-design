import {access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
export type NativeRegistrationInput={resourceRoot:string;platform?:NodeJS.Platform;executable?:string;electron?:boolean;env?:NodeJS.ProcessEnv};
/** Optional registration must not delay or prevent direct Bridge startup. */
export async function registerPackagedNativeHost(input:NativeRegistrationInput):Promise<'registered'|'unavailable'|'skipped'>{
 const platform=input.platform??process.platform;
 if(platform!=='darwin'&&platform!=='linux')return 'skipped';
 const helper=join(input.resourceRoot,'native-transport','install.mjs');
 try{await access(helper)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return 'skipped';return 'unavailable'}
 const env={...(input.env??process.env)};
 if(input.electron??Boolean(process.versions.electron))env.ELECTRON_RUN_AS_NODE='1';else delete env.ELECTRON_RUN_AS_NODE;
 return new Promise(resolve=>{execFile(input.executable??process.execPath,[helper,'install'],{env,timeout:10000,maxBuffer:64*1024,windowsHide:true},error=>resolve(error?'unavailable':'registered'))});
}
