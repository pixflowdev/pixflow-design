import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import JSZip from 'jszip';
import { DICTATION_MODELS, type DictationModelId, type DictationStatus } from '@open-design/contracts';
import { DICTATION_NOTICES } from './dictation-notices.js';

const revision = '5359861c739e955e79d9a303bcbc70fb988958b1';
const engines = {
  x64: { file: 'whisper-bin-x64.zip', bytes: 8928640, sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb' },
  arm64: { file: 'whisper-bin-win-cpu-arm64.zip', bytes: 4371193, sha256: '28c37e7b598c3d9bbfef94f3bd67f2ee6f12b7c86f3da5edcf5e4308d615ff6d' },
};
export function dictationModel(id: unknown) {
  const model = DICTATION_MODELS.find(item => item.id === id);
  if (!model) throw new Error('Select a supported dictation model.');
  return model;
}
export async function fileDigest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
/** A download becomes usable only after its pinned size and digest agree. */
export async function downloadVerified(url: string, destination: string, expected: {bytes: number; sha256: string}, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
  await fs.mkdir(path.dirname(destination), {recursive: true});
  const temporary = destination + '.' + randomUUID() + '.partial';
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]), credentials: 'omit' });
    if (!response.ok || !response.body) throw new Error('Download unavailable. Please retry.');
    const handle = await fs.open(temporary, 'wx');
    let received = 0;
    const hash = createHash('sha256');
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted(); received += chunk.length;
        if (received > expected.bytes) throw new Error('Download exceeded its expected size.');
        hash.update(chunk); await handle.writeFile(chunk); progress(received);
      }
    } finally { await handle.close(); }
    signal.throwIfAborted();
    if (received !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Download verification failed. Please retry.');
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, {force: true}); }
}
/** Accept only our bounded PCM format; never pass arbitrary media to a decoder. */
export function validateDictationAudio(audio: Buffer): void {
  if (audio.length < 46 || audio.length > 3_840_044 || audio.toString('ascii',0,4) !== 'RIFF' || audio.toString('ascii',8,12) !== 'WAVE'
    || audio.toString('ascii',12,16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1
    || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000
    || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii',36,40) !== 'data'
    || audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(4) !== audio.length - 8 || audio.length % 2) {
    throw new Error('Record up to two minutes of mono, 16 kHz PCM audio.');
  }
}

/** Model processes exist only during transcription, including when the module is enabled. */
export class DictationModule {
  readonly directory: string;
  private enabled = false;
  private selected: DictationModelId = 'small-q5';
  private download: DictationStatus['download'] = null;
  private downloadAbort: AbortController | undefined;
  private downloadTask: Promise<void> | undefined;
  private active: AbortController | undefined;
  private activeFinished: Promise<void> = Promise.resolve();
  private error: string | null = null;
  private ready: Promise<void>;
  private mutation: Promise<unknown> = Promise.resolve();
  private engine = process.platform === 'win32' ? engines[process.arch as keyof typeof engines] : undefined;
  constructor(dataDir: string) {
    this.directory = path.join(dataDir, 'dictation');
    this.ready = this.restore();
  }
  isBusy(): boolean { return !!this.active || !!this.download; }
  private async restore() {
    // A crashed process cannot retain private audio or a usable partial engine.
    await fs.rm(path.join(this.directory,'recordings'),{recursive:true,force:true}).catch(()=>undefined);
    await fs.rm(path.join(this.directory,'engine-b5454.partial'),{recursive:true,force:true}).catch(()=>undefined);
    for (const file of await fs.readdir(this.directory).catch(()=>[])) {
      if (/^ggml-(?:base-q5_1|small-q5_1|small)\.bin\.[a-f0-9-]+\.partial$/.test(file)) await fs.rm(path.join(this.directory,file),{force:true});
    }
    try {
      const value = JSON.parse(await fs.readFile(path.join(this.directory,'settings.json'),'utf8'));
      this.selected = dictationModel(value.selected).id; this.enabled = value.enabled === true;
    } catch { /* A new module starts disabled. Downloads remain independent of settings. */ }
  }
  private async save() {
    await fs.mkdir(this.directory,{recursive:true});
    await fs.writeFile(path.join(this.directory,'THIRD-PARTY-NOTICES.txt'),DICTATION_NOTICES);
    const file = path.join(this.directory,'settings.json');
    await fs.writeFile(file+'.tmp',JSON.stringify({enabled:this.enabled,selected:this.selected}));
    await fs.rename(file+'.tmp',file);
  }
  private modelPath(id: unknown) { return path.join(this.directory,dictationModel(id).file); }
  private async executable(): Promise<string | null> {
    if (process.platform === 'darwin' && ['arm64','x64'].includes(process.arch)) {
      const resources = process.env.OD_RESOURCE_ROOT?.trim();
      if (!resources) return null;
      const file = path.join(resources,'bin','libexec','whisper','whisper-cli');
      return await fs.stat(file).then(async stat => {
        if (!stat.isFile()) return null;
        await fs.access(file,constants.X_OK); return file;
      }).catch(()=>null);
    }
    if (!this.engine) return null;
    const root = path.join(this.directory, 'engine-b5454');
    for (const relative of ['whisper-cli.exe','Release/whisper-cli.exe','bin/whisper-cli.exe']) {
      const file = path.join(root,relative);
      if (await fs.stat(file).then(s=>s.isFile(),()=>false)) return file;
    }
    return null;
  }
  async status(): Promise<DictationStatus> {
    await this.ready;
    const installed: DictationModelId[] = []; let storageBytes = 0;
    for (const model of DICTATION_MODELS) {
      const bytes = await fs.stat(this.modelPath(model.id)).then(s=>s.size,()=>0);
      storageBytes += bytes;
      if (bytes === model.bytes) installed.push(model.id);
    }
    const executable = await this.executable();
    return {enabled:this.enabled,selected:this.selected,supported:!!this.engine || !!executable,engineReady:!!executable,installed,storageBytes,busy:!!this.active,download:this.download ? {...this.download}:null,error:this.error};
  }
  async change(action: 'enable'|'disable'|'download'|'cancel-download'|'select'|'delete', id?: unknown): Promise<DictationStatus> {
    const operation = this.mutation.then(async()=>{
      await this.ready;
      if (action === 'disable' || action === 'cancel-download') {
        this.downloadAbort?.abort(); await this.downloadTask;
        if (action === 'disable') { this.enabled = false; this.active?.abort(); await this.activeFinished; }
      } else if (action === 'delete') {
        const model = dictationModel(id);
        if (this.download?.model === model.id) {this.downloadAbort?.abort(); await this.downloadTask;}
        if (this.selected === model.id) {this.enabled=false; this.active?.abort(); await this.activeFinished;}
        // An in-flight transcription has its own immutable model selection.
        if (this.active) throw new Error('Wait for transcription to finish before removing a model.');
        await fs.rm(this.modelPath(model.id),{force:true});
      } else if (action === 'select') {
        this.selected = dictationModel(id).id;
      } else {
        if (!this.engine && !await this.executable()) throw new Error('Install a Bridge build with a dictation engine for this platform.');
        if (this.download) throw new Error('A model is already downloading.');
        if (id !== undefined) this.selected = dictationModel(id).id;
        if (action === 'enable') this.enabled = true;
        const model = dictationModel(this.selected);
        this.error = null;
        const controller = new AbortController(); this.downloadAbort=controller;
        this.download={model:model.id,phase:this.engine ? 'engine':'model',received:0,total:this.engine?.bytes ?? model.bytes};
        this.downloadTask=this.install(model.id,controller.signal).catch(error=>{
          if (!controller.signal.aborted) this.error=error instanceof Error ? error.message : 'Download failed.';
        }).finally(()=>{this.download=null;this.downloadAbort=undefined;this.downloadTask=undefined;});
      }
      await this.save(); return this.status();
    });
    this.mutation=operation.catch(()=>undefined); return operation;
  }
  private async install(id: DictationModelId, signal: AbortSignal) {
    if (!await this.executable()) {
      const engine = this.engine;
      if (!engine) throw new Error('The packaged dictation engine is missing. Reinstall Bridge.');
      const archive=path.join(this.directory,engine.file);
      await downloadVerified('https://github.com/ggml-org/whisper.cpp/releases/download/b5454/'+engine.file,archive,engine,signal,received=>{if(this.download)this.download.received=received;});
      try {
        const zip=await JSZip.loadAsync(await fs.readFile(archive));
        const root=path.join(this.directory,'engine-b5454.partial');
        for (const entry of Object.values(zip.files)) {
          signal.throwIfAborted();
          if(entry.dir)continue;
          const name=entry.name.replace(/\\/g,'/');
          if(name.split('/').includes('..') || name.startsWith('/') || name.includes(':')) throw new Error('Invalid engine archive.');
          if (!/^(?:whisper-cli\.exe|whisper\.dll|ggml(?:-[a-z0-9-]+)?\.dll)$/i.test(path.posix.basename(name))) continue;
          const file=path.join(root,name); await fs.mkdir(path.dirname(file),{recursive:true});
          await fs.writeFile(file,await entry.async('nodebuffer'));
        }
        signal.throwIfAborted();
        const target=path.join(this.directory,'engine-b5454');
        await fs.rm(target,{recursive:true,force:true});
        await fs.rename(root,target);
        if (!await this.executable()) throw new Error('The engine archive is missing its executable.');
      } finally {await fs.rm(archive,{force:true});}
    }
    const model=dictationModel(id); const file=this.modelPath(id);
    this.download={model:id,phase:'verifying',received:0,total:model.bytes};
    if(await fileDigest(file).catch(()=>null)===model.sha256)return;
    this.download={model:id,phase:'model',received:0,total:model.bytes};
    await downloadVerified(`https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/${model.file}`,file,model,signal,received=>{if(this.download)this.download.received=received;});
  }
  async transcribe(audio: Buffer, signal: AbortSignal, language='auto'): Promise<string> {
    await this.ready;
    validateDictationAudio(audio);
    if(!/^(auto|[a-z]{2,3})$/.test(language))throw new Error('Invalid transcription language.');
    if(!this.enabled)throw new Error('Enable dictation first.');
    if(this.active)throw new Error('Another recording is being transcribed. Please retry shortly.');
    const model=dictationModel(this.selected); const executable=await this.executable();
    if(!executable)throw new Error('Download the dictation engine first.');
    const controller=new AbortController(); this.active=controller;
    let finish!:()=>void; this.activeFinished=new Promise(resolve=>{finish=resolve;});
    const combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(5*60_000)]);
    const folder=path.join(this.directory,'recordings',randomUUID());
    try {
      if(await fileDigest(this.modelPath(model.id)).catch(()=>null)!==model.sha256)throw new Error('Download this model again before dictating.');
      combined.throwIfAborted();
      await fs.mkdir(folder,{recursive:true}); const file=path.join(folder,'audio.wav'); await fs.writeFile(file,audio);
      await new Promise<void>((resolve,reject)=>{
        const child=spawn(executable,['-m',this.modelPath(model.id),'-f',file,'-l',language,'-otxt','-of',path.join(folder,'result'),'-nt','-t',String(Math.min(4,Math.max(1,cpus().length-1)))],{windowsHide:true,stdio:'ignore',signal:combined});
        let failure: Error | undefined;
        child.once('error',error=>{failure=error;});
        // Wait for process closure before deleting its audio, including aborts on Windows.
        child.once('close',code=>code===0&&!failure?resolve():reject(new Error(combined.aborted?'Dictation canceled.':'Transcription failed. Please retry.')));
      });
      combined.throwIfAborted();
      return (await fs.readFile(path.join(folder,'result.txt'),'utf8')).trim();
    } finally { try {await fs.rm(folder,{recursive:true,force:true});} finally {this.active=undefined;finish();} }
  }
}
