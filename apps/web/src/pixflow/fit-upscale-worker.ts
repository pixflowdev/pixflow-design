import { UPSCALER_MAX_INPUT_BYTES, UPSCALER_MAX_OUTPUT_PIXELS, type UpscalerStatus, type UpscalerResult } from '@open-design/contracts';
import { upscalerRequest } from './upscaler-request';
import { encodeMediaImage } from '../utils/encode-media-image';

type Job = { id: number; version: string; width: number; url: string; mime: string };
const route = '/pixflow-design/v1/media/fit-upscale';
const retry = new Map<string,number>();
let running = false;
let cursor = 0;

async function decode(url: string, signal: AbortSignal) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  const stop = () => image.removeAttribute('src');
  signal.throwIfAborted();
  signal.addEventListener('abort',stop,{once:true});
  try { await image.decode(); } finally { signal.removeEventListener('abort',stop); }
  return image;
}

function toast(text: string, dimensions?: string) {
  const wp = (window as any).wp;
  document.querySelector('[data-pixflow-fit-toast]')?.remove();
  const notice = document.createElement('div');
  notice.dataset.pixflowFitToast = '';
  notice.setAttribute('role','status');
  const message = wp.i18n.__(text,'pixflow-design');
  notice.textContent = dimensions ? wp.i18n.sprintf(message,dimensions) : message;
  document.body.append(notice);
  return notice;
}

async function processJobs() {
  if (running || document.hidden) return;
  running = true;
  const signal = AbortSignal.timeout(180000);
  const api = (window as any).wp?.apiFetch;
  try {
    if (!api) return;
    const page: {jobs: Job[]; next: number} = await api({path:route+'?after='+cursor,signal});
    cursor = page.next;
    for (const [entry,until] of retry) if (until<=Date.now()) retry.delete(entry);
    const key = (j: Job) => [j.id,j.version,j.width].join('/');
    const ready = page.jobs.filter(j => (retry.get(key(j))??0)<Date.now());
    if (!ready.length) return;
    const status = await upscalerRequest<UpscalerStatus>('status',signal,'photo2');
    if (!status.supported || !status.enabled || status.busy || !status.installedModels?.length) return;
    for (const job of ready) {
      let progress: HTMLElement | undefined;
      try {
        retry.set(key(job),Date.now()+300000);
        const source = await decode(job.url,signal);
        const w = source.naturalWidth, h = source.naturalHeight;
        const models = job.mime==='image/jpeg' ? ['photo2','photo4'] : ['photo2','photo4','art4'];
        const model = models.find(m => status.installedModels!.includes(m) && w*(m==='photo2'?2:4)>=job.width);
        if (!model || w>=job.width || w*h*(model==='photo2'?4:16)>UPSCALER_MAX_OUTPUT_PIXELS || w*h>4000000 || Math.max(w,h)>4096) continue;
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d')!.drawImage(source,0,0);
        const png=canvas.toDataURL('image/png').split(',')[1]!;
        if (png.length>4*Math.ceil(UPSCALER_MAX_INPUT_BYTES/3)) continue;
        const targets = ready.filter(j=>j.id===job.id && j.version===job.version && j.width<=w*(model==='photo2'?2:4));
        const width = Math.max(...targets.map(j=>j.width));
        const dimensions = w+' × '+h+' → '+width+' × '+Math.round(h*width/w)+' px';
        progress = toast('Upscaling image… %s',dimensions);
        const result=await upscalerRequest<UpscalerResult>('run',signal,model,png);
        const enlarged=await decode('data:image/png;base64,'+result.png,signal);
        if (enlarged.naturalWidth<width) throw Error('Undersized output');
        for (const target of targets) {
          const {blob}=await encodeMediaImage(enlarged,'webp',82,target.width);
          const form=new FormData();
          form.append('file',blob,'fit.webp'); form.append('width',String(target.width)); form.append('version',job.version);
          await api({path:route+'/'+job.id,method:'POST',body:form,signal});
          retry.delete(key(target));
        }
        window.dispatchEvent(new CustomEvent('pixflow:fit-preview-ready',{detail:job.id}));
        const finished = toast('Upscaled image saved. %s',dimensions);
        window.setTimeout(()=>finished.remove(),6000);
        if (ready.length>targets.length || cursor) window.setTimeout(check,1000);
        break;
      } catch {
        if (progress) {
          const failed = toast('Upscaling interrupted. Remaining sizes will be retried.');
          window.setTimeout(()=>failed.remove(),6000);
        }
        if (signal.aborted) return;
      } finally { progress?.remove(); }
    }
  } catch { /* Pending sizes survive disconnects and are retried by a connected editor. */ }
  finally { running=false; }
}

function check() {
  if (document.hidden || !document.querySelector('#bricks-builder-iframe,#etch-iframe,#elementor-preview-iframe,.block-editor-writing-flow,iframe[name="editor-canvas"]')) return;
  if (navigator.locks) void navigator.locks.request('pixflow-fit-upscale',{ifAvailable:true},lock=>lock?processJobs():undefined);
  else void processJobs();
}
if (window.top===window) {
  window.setTimeout(check,3000);
  window.setInterval(check,30000);
  window.addEventListener('pixflow:before-bricks-save',()=>window.setTimeout(check,2000));
  window.addEventListener('pixflow:before-editor-fit-save',()=>window.setTimeout(check,2000));
  window.addEventListener('pixflow-upscaler-settings-changed',check);
}
