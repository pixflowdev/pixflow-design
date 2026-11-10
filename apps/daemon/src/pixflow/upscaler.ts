import { UPSCALER_MAX_INPUT_BYTES, UPSCALER_MAX_OUTPUT_PIXELS } from '@open-design/contracts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import type { Express, RequestHandler } from 'express';
import { downloadVerified } from './dictation.js';
import { notices } from './realesrgan-notices.js';
import { modelNotice } from './upscaler-model-notice.js';
import { authenticateDirectOwner, revokeDirectSession } from './direct-site-session.js';
import { registerPixflowRuntimeWork } from './runtime-idle.js';

const run = promisify(execFile);
const mac = process.platform === 'darwin';
const supported = (mac && ['arm64','x64'].includes(process.arch)) || (process.platform === 'win32' && process.arch === 'x64');
const platform = mac ? 'macos' : 'windows';
const dlls = mac ? [] : ['vcomp140.dll'];
const downloadBase='https://pixflow.dev/downloads/pixflow-design-bridge/packages/';
const photo = 'models-upconv_7_photo';
const noiseFiles = [0, 1, 2, 3].flatMap(level =>
  ['param', 'bin'].map(extension => photo + '/noise' + level + '_scale2.0x_model.' + extension));
const general = 'realesrgan-x4plus';
const illustration = 'realesrgan-x4plus-anime';
function packFor(id: unknown) {
  if (id === undefined || id === 'photo2') {
    const release = 'waifu2x-ncnn-vulkan-20250915-' + platform;
    const executable = mac ? 'waifu2x-ncnn-vulkan' : 'waifu2x-ncnn-vulkan.exe';
    return { release, executable, scale:2, prefix:release+'/', url:downloadBase,
      bytes:mac ? 41706129 : 35497352, sha256:mac ? 'a5b58b239eb3aa030db5464f6759637fe412d8c07891a4346ea57f708b514d42' : '7425be94b94e4c8f37a1e433ac0e0100c43790e2c37418f4b65d8235adfbdc87',
      files:[executable,...dlls,'LICENSE',photo+'/scale2.0x_model.bin',photo+'/scale2.0x_model.param',...noiseFiles], notice:modelNotice, args:['-n','-1','-m',photo] };
  }
  if (id !== 'photo4' && id !== 'art4') throw new Error('Unknown image model.');
  const executable = mac ? 'realesrgan-ncnn-vulkan' : 'realesrgan-ncnn-vulkan.exe';
  return { release:'realesrgan-ncnn-vulkan-20220424-'+platform, executable, scale:4, prefix:'', url:downloadBase,
    bytes:mac ? 51817124 : 45474481, sha256:mac ? 'e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a' : 'abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d',
    files:[executable,...dlls,...[general,illustration].flatMap(name=>['bin','param'].map(ext=>'models/'+name+'.'+ext))], notice:notices, args:['-n',id==='photo4'?general:illustration,'-m','models'] };
}
type Pack = ReturnType<typeof packFor>;
async function upscale(directory: string, input: Buffer, signal: AbortSignal, pack:Pack): Promise<Buffer> {
  if (input.length < 33 || input.length > UPSCALER_MAX_INPUT_BYTES || input.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Supply a PNG within the 17 MiB input limit.');
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  if (!width || !height || Math.max(width,height)>4096 || width*height>4000000) throw new Error('Choose an image up to 4 megapixels and 4096 pixels per side.');
  if(width*height*pack.scale**2 > UPSCALER_MAX_OUTPUT_PIXELS)throw new Error('Choose a smaller image. The output limit is 32 megapixels.');
  const safeInput = PNG.sync.write(PNG.sync.read(input));
  const work = await fs.mkdtemp(path.join(path.dirname(directory),'job-'));
  try {
    await fs.writeFile(path.join(work,'input.png'),safeInput);
    await run(path.join(directory,pack.executable), ['-i',path.join(work,'input.png'),'-o',path.join(work,'output.png'),'-s',String(pack.scale),'-t','128',...pack.args],{cwd:directory,windowsHide:true,timeout:180000,signal,maxBuffer:65536}).catch(() => { throw new Error('Upscaling failed. Check your Vulkan GPU and driver.'); });
    const result = await fs.readFile(path.join(work,'output.png'));
    if (result.readUInt32BE(16)!==width*pack.scale || result.readUInt32BE(20)!==height*pack.scale) throw new Error('The engine returned unexpected dimensions.');
    return result;
  } finally { await fs.rm(work,{recursive:true,force:true}); }
}

export function registerUpscalerRoutes(app: Express, dataDir: string, permission: RequestHandler) {
  const base = path.join(dataDir,'upscaler');
  let busy = false;
  registerPixflowRuntimeWork(app,()=>busy);
  async function install(signal: AbortSignal, pack:Pack, directory:string) {
    await fs.mkdir(base,{recursive:true});
    const stage=await fs.mkdtemp(path.join(base,'install-'));
    try {
      const archive=path.join(stage,'download.zip');
      await downloadVerified(pack.url+pack.release+'.zip', archive,pack,signal,()=>{});
      const zip=await JSZip.loadAsync(await fs.readFile(archive));
      for(const name of pack.files) {
        const entry=zip.file(pack.prefix+name);
        if(!entry) throw new Error('Incomplete upscaler package.');
        await fs.mkdir(path.dirname(path.join(stage,name)),{recursive:true});
        await fs.writeFile(path.join(stage,name),await entry.async('nodebuffer'));
      }
      await fs.writeFile(path.join(stage,'MODEL-LICENSE.txt'),pack.notice);
      await fs.chmod(path.join(stage,pack.executable),0o755);
      await fs.unlink(archive);
      await upscale(stage,PNG.sync.write(new PNG({width:16,height:16})),signal,pack);
      if (pack.scale === 2 && await fs.access(path.join(directory,pack.executable)).then(()=>true,()=>false)) {
        // Older installs already have the executable. Add validated weights without replacing working files.
        for (const file of noiseFiles) await fs.copyFile(path.join(stage,file),path.join(directory,file));
      } else {
        await fs.rename(stage,directory);
      }
    } finally { await fs.rm(stage,{recursive:true,force:true}); }
  }
  async function modelInstalled(model: string) {
    const pack = packFor(model);
    const required = pack.files.filter(file => !noiseFiles.includes(file) &&
      (pack.scale === 2 || !file.startsWith('models/') || file.startsWith('models/'+pack.args[1]+'.')));
    return (await Promise.all(required.map(file =>
      fs.access(path.join(base,pack.release,file)).then(()=>true,()=>false)))).every(Boolean);
  }
  async function enabled(existing: boolean) {
    try { return (await fs.readFile(path.join(base,'enabled'),'utf8')) === '1'; }
    catch(error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return existing; throw error; }
  }
  for(const action of ['status','install','run','remove','enable','disable']) {
    const route='/api/pixflow/upscaler/'+action;
    app.options(route,permission,(_req,res)=>{res.status(204).end();});
    app.post(route,permission,async(req,res)=>{
      res.set('Cache-Control','no-store');
      const session=req.body?.session;
      const abort=new AbortController();
      res.on('close',()=>{if(!res.writableEnded)abort.abort();});
      let verified=false, acquired=false;
      try {
        const paired=process.env.PIXFLOW_DESIGN_SITE_ORIGIN;
        if(!paired || new URL(session?.endpoint).origin!==new URL(paired).origin)throw new Error('Connect this site to Bridge first.');
        await authenticateDirectOwner(session,true,abort.signal);
        verified=true;
        const pack=packFor(req.body.model);
        const directory=path.join(base,pack.release);
        const ids=['photo2','photo4','art4'];
        const present=await Promise.all(ids.map(modelInstalled));
        const installedModels=ids.filter((_,index)=>present[index]);
        const installed=installedModels.includes(req.body.model??'photo2');
        const active=await enabled(installedModels.length>0);
        const noiseReady = pack.scale === 2 && installed && (await Promise.all(noiseFiles.map(file =>
          fs.access(path.join(directory,file)).then(()=>true,()=>false)))).every(Boolean);
        if(action==='status'){res.json({supported,installed,installedModels,enabled:active,bytes:pack.bytes,busy,models:true,noiseReduction:pack.scale===2?noiseReady:undefined});return;}
        if(!supported)throw new Error('This pack requires a supported Windows or Mac computer and compatible graphics.');
        if(busy){res.status(409).json({message:'The upscaler is busy.'});return;}
        acquired=busy=true;
        if(action==='install'||action==='remove'){
          // Preserve the switch independently of how many packs remain installed.
          await fs.mkdir(base,{recursive:true});
          try {await fs.writeFile(path.join(base,'enabled'),active?'1':'0',{flag:'wx'});}
          catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
        }
        if(action==='enable'||action==='disable'){
          await fs.mkdir(base,{recursive:true});
          const temp=path.join(base,'enabled.tmp');
          await fs.writeFile(temp,action==='enable'?'1':'0');
          await fs.rename(temp,path.join(base,'enabled'));
          res.json({enabled:action==='enable'});
        } else if(action==='install'){if(!installed || (pack.scale===2 && !noiseReady))await install(abort.signal,pack,directory);res.json({installed:true});}
        else if(action==='remove'){await fs.rm(directory,{force:true,recursive:true});res.json({installed:false});}
        else {
          if(!active)throw new Error('Enable the image upscaler in Settings first.');
          if(!installed)throw new Error('Install the upscaler first.');
          const noise=req.body.noise ?? -1;
          if(!Number.isInteger(noise) || noise < -1 || noise > 3 || (noise !== -1 && !noiseReady))
            throw new Error('Noise reduction requires the updated 2× photo pack and a supported strength.');
          if(noise !== -1) pack.args=['-n',String(noise),'-m',photo];
          const output=await upscale(directory,Buffer.from(String(req.body.png || ''),'base64'),abort.signal,pack);
          res.json({png:output.toString('base64')});
        }
      }catch(error){if(!res.destroyed)res.status(verified?400:403).json({message: error instanceof Error?error.message:'Upscaler unavailable.'});}
      finally{if(acquired)busy=false;if(verified)await revokeDirectSession(session);}
    });
  }
}
