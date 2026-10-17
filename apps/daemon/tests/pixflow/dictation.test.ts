import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DictationModule,dictationModel,downloadVerified,validateDictationAudio} from '../../src/pixflow/dictation.js';
const dirs:string[]=[];
async function directory(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-dictation-test-'));dirs.push(dir);return dir;}
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>fs.rm(dir,{recursive:true,force:true})));});
it('starts disabled without fetching, persists model selection, and rejects traversal',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const dir=await directory();const module=new DictationModule(dir);
 expect(await module.status()).toMatchObject({enabled:false,selected:'small-q5',installed:[],busy:false});
 await module.change('select','base-q5');await module.change('disable');
 expect(await new DictationModule(dir).status()).toMatchObject({enabled:false,selected:'base-q5'});expect(fetch).not.toHaveBeenCalled();
 expect(()=>dictationModel('../../settings')).toThrow();await expect(module.change('delete','../')).rejects.toThrow();
});
it('publishes verified downloads atomically and removes truncated or tampered files',async()=>{
 const dir=await directory();const file=path.join(dir,'model.bin');const bytes=Buffer.from('model data');const expected={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const fetch=vi.fn().mockResolvedValue(new Response(bytes));vi.stubGlobal('fetch',fetch);const progress=vi.fn();
 await downloadVerified('https://example.test/model',file,expected,new AbortController().signal,progress);
 expect(await fs.readFile(file)).toEqual(bytes);expect(progress).toHaveBeenCalledWith(bytes.length);
 for(const body of ['bad','altered!!!','too many bytes here']){
   fetch.mockResolvedValueOnce(new Response(body));await expect(downloadVerified('https://example.test/model',file,expected,new AbortController().signal,progress)).rejects.toThrow();
   expect(await fs.readFile(file)).toEqual(bytes);expect(await fs.readdir(dir)).toEqual(['model.bin']);
 }
});
it('cancels an incomplete download without leaving a usable model',async()=>{
 const dir=await directory();const controller=new AbortController();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}}))));
 await expect(downloadVerified('https://example.test/model',path.join(dir,'model'),{bytes:2,sha256:'bad'},controller.signal,()=>controller.abort())).rejects.toThrow();
 expect(await fs.readdir(dir)).toEqual([]);
});
it('deletes only the selected catalog model and preserves unrelated files',async()=>{
 const dir=await directory();const root=path.join(dir,'dictation');await fs.mkdir(root);await fs.writeFile(path.join(root,'keep.txt'),'keep');await fs.writeFile(path.join(root,'ggml-small-q5_1.bin'),'test');
 const module=new DictationModule(dir);await module.change('delete','small-q5');
 expect(await fs.readFile(path.join(root,'keep.txt'),'utf8')).toBe('keep');expect((await module.status()).enabled).toBe(false);
 expect(await fs.stat(path.join(root,'ggml-small-q5_1.bin')).catch(()=>null)).toBeNull();
});
it('rejects arbitrary media before starting an engine',async()=>{
 expect(()=>validateDictationAudio(Buffer.from('arbitrary media'))).toThrow();
 const module=new DictationModule(await directory());await expect(module.transcribe(Buffer.alloc(50),new AbortController().signal)).rejects.toThrow(/PCM/);
});
it('uses an executable packaged Mac engine and downloads only the selected model',async()=>{
 vi.spyOn(process,'platform','get').mockReturnValue('darwin');
 vi.spyOn(process,'arch','get').mockReturnValue('arm64');
 const root=await directory();vi.stubEnv('OD_RESOURCE_ROOT',root);
 const engine=path.join(root,'bin','libexec','whisper','whisper-cli');
 await fs.mkdir(path.dirname(engine),{recursive:true});await fs.writeFile(engine,'engine');await fs.chmod(engine,0o755);
 const fetch=vi.fn().mockResolvedValue(new Response('unavailable',{status:503}));vi.stubGlobal('fetch',fetch);
 const module=new DictationModule(await directory());
 expect(await module.status()).toMatchObject({supported:true,engineReady:true,enabled:false});
 await module.change('enable','base-q5');
 await vi.waitFor(async()=>expect((await module.status()).download).toBeNull());
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(fetch.mock.calls[0]?.[0]).toMatch(/^https:\/\/huggingface.co\/ggerganov\/whisper.cpp\/resolve\/.+\/ggml-base-q5_1.bin$/);
 expect((await module.status()).error).toMatch(/Download unavailable/);
 await module.change('disable');expect((await module.status()).enabled).toBe(false);
});
it('does not enable Mac dictation when its packaged engine is missing or nonexecutable',async()=>{
 vi.spyOn(process,'platform','get').mockReturnValue('darwin');vi.spyOn(process,'arch','get').mockReturnValue('x64');
 const root=await directory();vi.stubEnv('OD_RESOURCE_ROOT',root);
 const engine=path.join(root,'bin','libexec','whisper','whisper-cli');
 await fs.mkdir(path.dirname(engine),{recursive:true});
 const module=new DictationModule(await directory());
 for(const present of [false,true]){
   if(present){await fs.writeFile(engine,'engine');await fs.chmod(engine,0o644);
     // Windows does not enforce POSIX executable bits; model the macOS access result.
     vi.spyOn(fs,'access').mockRejectedValue(Object.assign(new Error('Permission denied'),{code:'EACCES'}));
   }
   expect(await module.status()).toMatchObject({supported:false,engineReady:false});
   await expect(module.change('enable')).rejects.toThrow(/Install a Bridge build/);
 }
});
it('keeps Windows engine downloads available without a Mac resource directory',async()=>{
 vi.spyOn(process,'platform','get').mockReturnValue('win32');vi.spyOn(process,'arch','get').mockReturnValue('x64');
 const fetch=vi.fn().mockResolvedValue(new Response('unavailable',{status:503}));vi.stubGlobal('fetch',fetch);
 const module=new DictationModule(await directory());
 expect(await module.status()).toMatchObject({supported:true,engineReady:false});
 await module.change('download','base-q5');
 await vi.waitFor(async()=>expect((await module.status()).download).toBeNull());
 expect(fetch.mock.calls[0]?.[0]).toBe('https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip');
});
