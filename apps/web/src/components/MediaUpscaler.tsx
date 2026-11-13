import useEmblaCarousel from 'embla-carousel-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { ButtonGroup, ButtonGroupSeparator } from '@open-design/components/button-group';
import { Menu } from '@base-ui/react/menu';
import { openWordPressMediaLibrary, canOpenWordPressMediaLibrary } from './wordPressMediaPicker';
import { pixflowPublicAssetUrl } from '../pixflow/public-assets';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { IconLink, IconUnlink, IconArrowLeft, IconPlus, IconPhoto, IconUpload, IconChevronDown, IconDeviceFloppy, IconDownload, IconX, IconLoader2, IconCheck, IconArrowsHorizontal } from '@tabler/icons-react';
import { MediaUploadQueue } from './MediaUploads';
import { useMediaUploads, type UpscaleOperation } from './useMediaUploads';
import { Badge } from './Badge';
import { encodeUpscaleAdjustments } from './media-upscale-adjustments';
import styles from './MediaUpscaler.module.css';
import { analyseUpscaleImage } from './media-upscale-analysis';
import { WorkspaceSelect } from './WorkspaceSelect';
import { useT } from '../i18n';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { upscalerRequest as request } from '../pixflow/upscaler-access';
import { uploadPixflowMedia, importPixflowWpMedia, type PixflowMediaItem } from '../providers/registry';
import { Switch } from '@base-ui/react/switch';
import { Slider } from '@base-ui/react/slider';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Input } from '@base-ui/react/input';
import { MediaQualitySlider } from './MediaQualitySlider';
import { encodeMediaImage, readMediaImage } from './MediaOptimiser';

import { UPSCALER_MAX_INPUT_BYTES, UPSCALER_MAX_OUTPUT_PIXELS, type UpscalerStatus, type UpscalerResult } from '@open-design/contracts';
const formats = ['png','webp','jpeg'].map(value => ({value,label:value.toUpperCase()}));

type UpscaleAction='run'|'save'|'crop'|'overwrite';
type QueuedUpscaleAction = Exclude<UpscaleAction, 'crop'>;
const upscaleOperations: Record<QueuedUpscaleAction, UpscaleOperation> = {run:'preview', save:'copy', overwrite:'replace'};
type UpscaleRunner=(action:QueuedUpscaleAction,setPhase:(phase:'rendering'|'saving')=>void)=>Promise<void>;
type UpscaleSettings = {
  model: string;
  noiseEnabled: boolean;
  noiseStrength?: number;
  target: {unit: string; value: string};
  aspectLocked: boolean;
  freeHeight: string;
  minify: boolean;
  format: string;
  quality: number;
  sharpen: number;
  contrast: number;
  preserve: boolean;
};
type SettingsApplication = {sourceId: string; targetIds: string[]; settings: UpscaleSettings};

type UpscaleProps={headerAction?:React.ReactNode;item:PixflowMediaItem;installedModels:string[];onBack:()=>void;onSaved:(copy:PixflowMediaItem)=>void;queue?:PixflowMediaItem[]};
export function MediaUpscaler(props:UpscaleProps) {
  const t=useT();
  const headingId=useId();
  const [items,setItems]=useState(()=>props.queue?.length?props.queue:[props.item]);
  const [active,setActive]=useState(props.item.id);
  const [settingsApplication,setSettingsApplication]=useState<SettingsApplication>();
  const [working,setWorking]=useState('');
  const runners=useRef(new Map<string,UpscaleRunner>());
  const operations=useMediaUploads(()=>{});
  const queued=operations.jobs.some(job=>['queued','rendering','saving'].includes(job.status));
  const [batchConfirm,setBatchConfirm]=useState(false);
  function enqueue(entries:PixflowMediaItem[],action:QueuedUpscaleAction){
    if(queued||working)return;
    const files=entries.map(entry=>new File([],entry.filename,{type:entry.mimeType}));
    const tasks=new Map(files.map((file,index)=>[file,runners.current.get(entries[index]!.id)]));
    operations.add(files,file=>async (_progress,setPhase)=>{
      const run=tasks.get(file);
      if(!run)throw new Error(t('media.optimise.failed'));
      await run(action,setPhase);
    },upscaleOperations[action]);
  }
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [sidebar,setSidebar]=useState<HTMLDivElement|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const cards=useRef(new Map<string,HTMLElement>());
  function select(id:string){setActive(id);cards.current.get(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});}
  async function add(files:File[]){
    setUploading(true);setError('');
    try {for(const file of files){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(t('media.fit.msg789571f356'));
      const copy=await uploadPixflowMedia(file);
      setItems(previous=>[...previous,copy]);setActive(copy.id);
    }}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setUploading(false);}
  }
  async function addLibrary(){
    try {
      const selection=await openWordPressMediaLibrary({multiple:true,libraryTypes:['image'],buttonText:t('ui.mediaView.addSelected')});
      const ids=selection.map(entry=>Number(entry.id)).filter(id=>Number.isFinite(id)&&id>0);
      if(!ids.length)return;
      setUploading(true);setError('');
      const imported=await importPixflowWpMedia(ids);
      const supported=imported.filter(entry=>['image/png','image/jpeg','image/webp'].includes(entry.mimeType));
      setItems(previous=>[...previous,...supported.filter(entry=>!previous.some(existing=>existing.id===entry.id))]);
      if(supported[0])setActive(supported[0].id);
      if(supported.length!==imported.length)setError(t('media.fit.msg789571f356'));
    }catch(err){setError(err instanceof Error?err.message:String(err));}finally{setUploading(false);}
  }
  const addMenu=(compact=false)=><Menu.Root><Menu.Trigger render={<Button/>} className={compact?styles.thumbnail:undefined} aria-label={t('media.upscale.add')} disabled={uploading||queued||!!working}>
    {uploading?<IconLoader2 size={18} className={styles.spin}/>:<IconPlus size={compact?23:17}/>}{!compact&&<>{t('media.upscale.add')}<IconChevronDown size={14}/></>}
    </Menu.Trigger><Menu.Portal container={sidebar?.closest<HTMLElement>('.pixflow-design-token-scope')??sidebar?.closest<HTMLElement>('.direct-upscale-view')}><Menu.Positioner sideOffset={6} align="end" className={styles.menuPositioner}><Menu.Popup className={styles.menu}>
      <Menu.Item className={styles.menuItem} disabled={!canOpenWordPressMediaLibrary()} onClick={()=>void addLibrary()}><IconPhoto size={17}/>{t('ui.composerPlusMenu.wpMedia')}</Menu.Item>
      <Menu.Item className={styles.menuItem} onClick={()=>input.current?.click()}><IconUpload size={17}/>{t('ui.mediaView.upload')}</Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
  return <section className={styles.studio+' direct-upscale-view'}>
    <div className={styles.layout}>
      <section className={styles.settingsPanel} aria-labelledby={headingId}>
        <header className={styles.toolbar+' '+styles.settingsHeader}>
          <Button variant="ghost" size="icon" aria-label={t('designFiles.back')} disabled={!!working||queued||uploading} onClick={props.onBack}><IconArrowLeft size={18}/></Button>
          <h2 id={headingId}>{t('media.upscale.settingsTitle')}</h2>
        </header>
        <div ref={setSidebar} className={styles.sidebar} tabIndex={0} role="region" aria-labelledby={headingId}/>
      </section>
      <div className={styles.workspacePanel}>
        <header className={styles.toolbar+' '+styles.workspaceHeader}>
          {addMenu()}
          {items.length>1&&<Menu.Root><Menu.Trigger render={<Button/>} disabled={queued||!!working||uploading}>{t('media.upscale.batch')}<IconChevronDown size={14}/></Menu.Trigger><Menu.Portal container={sidebar?.closest<HTMLElement>('.direct-upscale-view')}><Menu.Positioner className={styles.menuPositioner} sideOffset={6}><Menu.Popup className={styles.menu}>
            <Menu.Item className={styles.menuItem} onClick={()=>enqueue(items,'save')}>{t('media.upscale.batchCopies')}</Menu.Item>
            <Menu.Item className={styles.menuItem} disabled={items.some(entry=>!entry.attachmentId)} onClick={()=>setBatchConfirm(true)}>{t('media.upscale.batchOverwrite')}</Menu.Item>
          </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}
          {props.headerAction}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event=>{void add(Array.from(event.target.files??[]));event.target.value='';}}/>
        </header>
        <div className={styles.workspaceBody} tabIndex={0} role="region" aria-label={t('common.preview')}>
          {error&&<p role="alert" className={styles.error}>{error}</p>}
          <div className={styles.gallery}>{items.map(item=><div key={item.id} ref={node=>{if(node)cards.current.set(item.id,node);else cards.current.delete(item.id);}}>
            <UpscaleEditor {...props} item={item} selected={active===item.id} sidebar={sidebar}
              settingsApplication={settingsApplication}
              onApplyToAll={items.length>1?settings=>setSettingsApplication({sourceId:item.id,targetIds:items.filter(entry=>entry.id!==item.id).map(entry=>entry.id),settings}):undefined}
              register={runner=>{if(runner)runners.current.set(item.id,runner);else runners.current.delete(item.id);}}
              enqueue={action=>enqueue([item],action)} locked={queued||!!working&&working!==item.id} onSelect={()=>setActive(item.id)}
              onBusy={busy=>setWorking(previous=>busy?item.id:previous===item.id?'':previous)}
              onSaved={()=>{}} onRemove={()=>{setItems(previous=>previous.filter(entry=>entry.id!==item.id));if(active===item.id)setActive(items.find(entry=>entry.id!==item.id)?.id??'');}}
              removable={items.length>1&&!queued&&!working}/>
          </div>)}</div>
          <nav className={styles.rail} aria-label={t('media.bulk.select')}>
            {items.map(item=><Button key={item.id} className={styles.thumbnail} aria-label={item.filename} aria-pressed={active===item.id} onClick={()=>select(item.id)}><img src={item.thumbnailUrl||item.url} alt="" loading="lazy"/></Button>)}
            {addMenu(true)}
          </nav>
        </div>
      </div>
    </div>
    <div className={styles.progressQueue}><MediaUploadQueue jobs={operations.jobs} onRetry={operations.retry} onClear={operations.clear} operationLabel={t('media.upscale.progress')}/></div>
    <AlertDialog.Root open={batchConfirm} onOpenChange={setBatchConfirm}><AlertDialog.Portal container={sidebar?.closest<HTMLElement>('.pixflow-design-token-scope')??sidebar?.closest<HTMLElement>('.direct-upscale-view')}>
      <AlertDialog.Backdrop className={styles.backdrop}/><AlertDialog.Popup className={styles.dialog}>
        <AlertDialog.Title className={styles.dialogTitle}>{t('media.upscale.batchOverwrite')}?</AlertDialog.Title>
        <AlertDialog.Description className={styles.dialogDescription}>{t('media.upscale.batchWarning',{count:String(items.length)})}</AlertDialog.Description>
        <div className={styles.dialogActions}><AlertDialog.Close render={<Button variant="ghost"/>}>{t('common.cancel')}</AlertDialog.Close><Button className={styles.destructive} onClick={()=>{setBatchConfirm(false);enqueue(items,'overwrite');}}>{t('media.upscale.batchOverwrite')}</Button></div>
      </AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root>
  </section>;
}
function UpscaleEditor({item,installedModels,onSaved,selected,sidebar,locked,onSelect,onBusy,onRemove,removable,register,enqueue,settingsApplication,onApplyToAll}:UpscaleProps & {
 settingsApplication?:SettingsApplication;onApplyToAll?:(settings:UpscaleSettings)=>void;
 register:(runner:UpscaleRunner|null)=>void;enqueue:(action:QueuedUpscaleAction)=>void;selected:boolean;sidebar:HTMLElement|null;locked:boolean;onSelect:()=>void;onBusy:(busy:boolean)=>void;onRemove:()=>void;removable:boolean}) {
  const t=useT();
  const [chosenModel,setChosenModel]=useState(installedModels.includes('photo2')?'photo2':installedModels[0]??'photo4');
  const [noiseEnabled,setNoiseEnabled]=useState(false);
  const [manualStrength,setManualStrength]=useState<number>();
  const [target,setTarget]=useState({unit:'scale',value:'2'});
  const [aspectLocked,setAspectLocked]=useState(true);
  const [freeHeight,setFreeHeight]=useState('');
  const [modelViewport,modelCarousel]=useEmblaCarousel({align:'start',containScroll:'trimSnaps',dragFree:true,skipSnaps:true,slides:'[role=radio]'});
  const [modelEdges,setModelEdges]=useState({left:false,right:false});
  useEffect(()=>{
    if(!modelCarousel)return;
    const updateEdges=()=>{
      const progress=modelCarousel.scrollProgress();
      const overflows=modelCarousel.scrollSnapList().length>1;
      const left=overflows&&progress>0.001;
      const right=overflows&&progress<0.999;
      setModelEdges(previous=>previous.left===left&&previous.right===right?previous:{left,right});
    };
    updateEdges();
    modelCarousel.on('scroll',updateEdges).on('select',updateEdges).on('reInit',updateEdges);
    return ()=>{modelCarousel.off('scroll',updateEdges).off('select',updateEdges).off('reInit',updateEdges);};
  },[modelCarousel]);
  const [minify,setMinify]=useState(false);
  const [chosenFormat,setFormat]=useState(item.mimeType==='image/png'?'webp':item.mimeType.slice(6));
  const [quality,setQuality]=useState(85);
  const [sharpen,setSharpen]=useState(0);
  const [contrast,setContrast]=useState(0);
  const [preserve,setPreserve]=useState(true);
  const [saved,setSaved]=useState('');
  useEffect(()=>{
    if(!settingsApplication||!settingsApplication.targetIds.includes(item.id))return;
    const {settings}=settingsApplication;
    setChosenModel(settings.model);
    setNoiseEnabled(settings.noiseEnabled);
    setManualStrength(settings.noiseStrength);
    setTarget(settings.target);
    setAspectLocked(settings.aspectLocked);
    setFreeHeight(settings.freeHeight);
    setMinify(settings.minify);
    setFormat(settings.format);
    setQuality(settings.quality);
    setSharpen(settings.sharpen);
    setContrast(settings.contrast);
    setPreserve(settings.preserve);
  },[item.id,settingsApplication]);
  const [confirmation,setConfirmation]=useState(false);
  const [saveAction,setSaveAction]=useState<'save'|'overwrite'>('save');
  const [analysis,setAnalysis]=useState<ReturnType<typeof analyseUpscaleImage>>();
  const [crop,setCrop]=useState<{before:string;after:string;key:string;width:number;height:number}>();
  const source=useRef<HTMLImageElement | undefined>(undefined);
  const [picking,setPicking]=useState(false);
  const [point,setPoint]=useState({x:0.5,y:0.5});
  const [cropPending,setCropPending]=useState(false);
  const [pendingOriginal,setPendingOriginal]=useState<{before:string;width:number;height:number}>();
  const boxWidth=Math.min(1,128/Math.max(1,item.width||1));
  const boxHeight=Math.min(1,128/Math.max(1,item.height||1));
  const [state,setState] = useState<UpscalerStatus>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [native,setNative] = useState<{image:HTMLImageElement;blob:Blob;model:string}>();
  const sourceFormat=item.mimeType.replace('image/','');
  const format=minify?chosenFormat:sourceFormat;
  const originalHash=useRef<Promise<string> | undefined>(undefined);

  const [detail,setDetail] = useState(false);
  const [divider,setDivider] = useState(50);
  const [exported,setExported] = useState<{url:string;blob:Blob;key:string}>();
  const controller = useRef<AbortController|null>(null);
  const mounted=useRef(true);

  const w=item.width||0,h=item.height||0;
  const widthFactor=target.unit==='scale'?Number(target.value):Number(target.value)/w;
  const requestedHeight=aspectLocked?Math.round(h*widthFactor):Number(freeHeight);
  const factor=Math.max(widthFactor,requestedHeight/h);
  const maxScale=chosenModel==='photo2'?2:4;
  const valid=w>0 && h>0 && widthFactor>=0.5 && factor<=maxScale && requestedHeight>=Math.ceil(h/2) && Number.isInteger(requestedHeight) && (target.unit!=='width'||Number.isInteger(Number(target.value)));
  const width=valid?Math.max(1,Math.round(w*widthFactor)):0,height=valid?requestedHeight:0;
  const model=factor<=1?'resize':chosenModel;
  const multiplier=model==='photo2'?2:4;
  const tooLarge=model!=='resize' && (w*h*multiplier**2>UPSCALER_MAX_OUTPUT_PIXELS || Math.max(w,h)>4096 || w*h>4000000);
  const noiseAvailable=model==='photo2';
  const strength=manualStrength??Math.max(1,(analysis?.noise??0)+1);
  const noise=noiseAvailable && noiseEnabled?strength-1:-1;
  const treatment=model+'_'+noise;
  const exportQuality=minify?quality:100;
  const key = JSON.stringify([treatment,width,height,format,exportQuality,sharpen,contrast,preserve]);
  const cropKey=JSON.stringify([treatment,width,height,sharpen,contrast,preserve]);
  const currentCrop=crop?.key===cropKey?crop:undefined;
  const ready=model==='resize'||!!state?.installed;
  useEffect(()=>{
    const task=new AbortController();
    if(source.current||!selected)return;
    source.current=undefined;setAnalysis(undefined);
    void readMediaImage(item,task.signal).then(({image,blob})=>{
      if(!task.signal.aborted){source.current=image;
        if(globalThis.crypto?.subtle)originalHash.current=blob.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(hash=>
          Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')).catch(()=>'');
        setAnalysis(analyseUpscaleImage(image));}
    }).catch(err=>{if(!task.signal.aborted)setError(String(err.message||err));});
    return ()=>task.abort();
  },[item.url,selected]);
  const preview = exported?.key===key && native?.model===treatment && valid ? exported : undefined;

  useEffect(()=>{

    mounted.current=true;
    return ()=>{mounted.current=false;controller.current?.abort();};
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    if(model==='resize'||!selected)return;
    setState(undefined);setError('');
    void request<UpscalerStatus>('status',abort.signal,model).then(result=>{
      if(!abort.signal.aborted)setState(result);
    }).catch(err=>{if(!abort.signal.aborted)setError(String(err.message || err));});
    return ()=>abort.abort();
  },[model,selected]);
  useEffect(()=>{
    if(!native || native.model!==treatment || !valid)return;
    let active=true, url='';const adjustmentAbort=new AbortController();
    const timer=setTimeout(async()=>{
      try {
        const blob=await encodeUpscaleAdjustments(native.image,format,exportQuality,width,{sharpen,contrast,preserve},adjustmentAbort.signal,height);
        if(active){url=URL.createObjectURL(blob);setExported({blob,url,key});}
      } catch { if(active)setError(t('media.optimise.failed')); }
    },100);
    return ()=>{active=false;adjustmentAbort.abort();clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
  },[native,valid,width,format,exportQuality,key,sharpen,contrast,preserve,t]);

  async function processImage(task:AbortController,isCrop:boolean,point:{x:number;y:number}){
        const image=source.current??(await readMediaImage(item,task.signal)).image;

        if(isCrop){setPoint(point);setCropPending(true);}
        setPicking(false);setCrop(undefined);
        const cw=isCrop?Math.min(128,image.naturalWidth):image.naturalWidth;
        const ch=isCrop?Math.min(128,image.naturalHeight):image.naturalHeight;
        const cx=Math.max(0,Math.min(image.naturalWidth-cw,Math.round(point.x*image.naturalWidth-cw/2)));
        const cy=Math.max(0,Math.min(image.naturalHeight-ch,Math.round(point.y*image.naturalHeight-ch/2)));
        const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
        canvas.getContext('2d')!.drawImage(image,cx,cy,cw,ch,0,0,cw,ch);
        const before=canvas.toDataURL('image/png');
        const cropWidth=Math.max(1,Math.round(cw*width/w)),cropHeight=Math.max(1,Math.round(ch*height/h));
        if(isCrop)setPendingOriginal({before,width:cropWidth,height:cropHeight});
        const showCrop=async(result:CanvasImageSource)=>{
          canvas.width=cropWidth;canvas.height=cropHeight;
          canvas.getContext('2d')!.drawImage(result,0,0,cropWidth,cropHeight);
          const cropImage=new Image();cropImage.src=canvas.toDataURL();await cropImage.decode();
          const adjusted=await encodeUpscaleAdjustments(cropImage,'png',100,cropWidth,{sharpen,contrast,preserve},task.signal);
          const after=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(adjusted);});
          if(!task.signal.aborted)setCrop({before,after,key:cropKey,width:cropWidth,height:cropHeight});
        };
        if(isCrop && native?.model===treatment && model!=='resize'){
          canvas.width=cropWidth;canvas.height=cropHeight;
          canvas.getContext('2d')!.drawImage(native.image,cx*multiplier,cy*multiplier,cw*multiplier,ch*multiplier,0,0,cropWidth,cropHeight);
          const cached=new Image();cached.src=canvas.toDataURL();await cached.decode();await showCrop(cached);
          return;
        }
        if(model==='resize'){
          if(isCrop){const original=new Image();original.src=before;await original.decode();await showCrop(original);return;}
          const {blob}=await encodeMediaImage(image,'png',100,width);
          if(!task.signal.aborted)setNative({image,blob,model:treatment});
          return {image,blob,model:treatment};
        }
        const png=before.split(',')[1]!;
        if(png.length>4*Math.ceil(UPSCALER_MAX_INPUT_BYTES/3))throw new Error(t('media.fit.msgab4eb7a0a8'));
        const result=await request<UpscalerResult>('run',task.signal,model,png,noise);
        const uri='data:image/png;base64,'+result.png;
        const decoded=new Image();decoded.src=uri;await decoded.decode();
        if(isCrop){await showCrop(decoded);return;}
        const blob=await (await fetch(uri,{signal:task.signal})).blob();
        const resultImage={image:decoded,blob,model:treatment};
        if(!task.signal.aborted)setNative(resultImage);
        return resultImage;
  }

  useEffect(()=>{register((action,setPhase)=>act(action,{x:0.5,y:0.5},setPhase));return ()=>register(null);});
  async function act(action:UpscaleAction, point={x:0.5,y:0.5},setPhase?:(phase:'rendering'|'saving')=>void){
    if(!mounted.current)throw new Error('Upscaler closed');
    if(controller.current||locked&&!setPhase)throw new Error(t('common.loading'));
    if(!valid||(tooLarge&&action!=='crop'))throw new Error(t('media.optimise.failed'));
    const task=new AbortController();controller.current=task;setBusy(true);onBusy(true);setError('');setSaved('');
    try {
      if(action==='overwrite'){
        if(!item.attachmentId||format!==sourceFormat)throw new Error(t('media.upscale.sameFormat'));
        if(!originalHash.current){
          const original=await readMediaImage(item,task.signal);
          source.current=original.image;
          originalHash.current=original.blob.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(hash=>Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''));
        }
        if(!await originalHash.current)throw new Error(t('media.optimise.failed'));
      }
      if(action==='run'||action==='crop'){
        if(action==='crop'||native?.model!==treatment)await processImage(task,action==='crop',point);
      }else{
        const full=native?.model===treatment?native:await processImage(task,false,point);
        task.signal.throwIfAborted();
        if(!full)throw new Error(t('media.optimise.failed'));
        const output=preview?.blob??await encodeUpscaleAdjustments(full.image,format,exportQuality,width,{sharpen,contrast,preserve},task.signal,height);
        task.signal.throwIfAborted();

        const ext=format==='jpeg'?'jpg':format;
        const filename=item.filename.replace(/\.[^.]+$/,'')+'-'+Number(factor.toFixed(3))+'x.'+ext;
        const file=new File([output],filename,{type:output.type});
        setPhase?.('saving');
        if(action==='overwrite'){
          const form=new FormData();form.append('file',file);form.append('originalHash',await originalHash.current||'');
          const response=await pixflowWordPressRestFetch('/media/attachments/'+item.attachmentId+'/overwrite',{method:'POST',body:form,signal:task.signal});
          const result=await response.json();
          if(!response.ok||!result.item)throw new Error(result.message||t('media.optimise.failed'));
          if(!task.signal.aborted){setSaved(key);onSaved({...result.item,previewRevision:Date.now()});}
        }else{
          const copy=await uploadPixflowMedia(file,item,{upscaled:true});
          if(!task.signal.aborted){setSaved(key);onSaved(copy);}
        }
      }
      task.signal.throwIfAborted();
    }catch(err){if(!task.signal.aborted){const reason=err instanceof Error?err.message:String(err);setError(reason);}if(setPhase)throw err;}
    finally{controller.current=null;setBusy(false);onBusy(false);setCropPending(false);setPendingOriginal(undefined);}
  }

  const disabled=busy||locked;
  return <article className={styles.imageCard} data-selected={selected} onPointerDown={onSelect}>
    <header className={styles.imageHeader}><Button variant="ghost" onClick={onSelect}>{item.filename}</Button>
      <span>{w} × {h} <span aria-hidden="true">→</span> {width} × {height}</span>
      {(busy||(native?.model===treatment&&valid&&!preview&&!error))&&<Badge><IconLoader2 size={13} className={styles.spin}/>{t('common.loading')}</Badge>}
      {saved===key&&<Badge><IconCheck size={13}/>{t('sketch.saved')}</Badge>}
      {removable&&<Button variant="ghost" size="icon" aria-label={t('chat.removeAria',{name:item.filename})} disabled={busy} onClick={onRemove}><IconX size={16}/></Button>}
    </header>
      <div className="direct-upscale-canvas">
        <div className="direct-upscale-zoom"><Button type="button" disabled={cropPending} aria-pressed={!detail&&!picking&&!currentCrop&&!cropPending} onClick={()=>{setCrop(undefined);setPicking(false);setDetail(false);}}>{t('media.upscale.fit')}</Button>
          <Button type="button" disabled={cropPending} aria-pressed={detail} onClick={()=>{setCrop(undefined);setPicking(false);setDetail(true);}}>100%</Button>
          <Button type="button" disabled={disabled||!ready||!valid} aria-pressed={picking||cropPending||!!currentCrop} onClick={()=>{setCrop(undefined);setDetail(false);setPicking(!picking);}}>{t('media.upscale.pick')}</Button></div>
        <div className="direct-upscale-viewport" tabIndex={0}>
          <div className="direct-upscale-plane" style={{width:pendingOriginal?pendingOriginal.width:currentCrop?currentCrop.width:detail?(preview?width:item.width ?? undefined):'min(100cqw, '+((item.width||1)/(item.height||1)*100)+'cqh)',aspectRatio:pendingOriginal?pendingOriginal.width+'/'+pendingOriginal.height:currentCrop?currentCrop.width+'/'+currentCrop.height:(item.width||1)+'/'+(item.height||1)}}>
            <span className={styles.originalLabel}>{t('media.optimise.original')}</span>
            {preview&&<span className={styles.resultLabel}>{t('common.preview')}</span>}
            <img src={pendingOriginal?.before??currentCrop?.before??item.url} alt={item.title || item.filename} />
            {(picking||(cropPending&&!pendingOriginal)) && <span aria-hidden="true" className="direct-upscale-region" style={{
              width:boxWidth*100+'%',height:boxHeight*100+'%',
              left:Math.max(0,Math.min(1-boxWidth,point.x-boxWidth/2))*100+'%',
              top:Math.max(0,Math.min(1-boxHeight,point.y-boxHeight/2))*100+'%'
            }}/>}
            {picking && <div className="direct-upscale-pick" role="button" tabIndex={0}
              onKeyDown={event=>{
                if(event.key==='Enter'||event.key===' '){event.preventDefault();void act('crop');}
              }} aria-label={t('media.upscale.pick')} onPointerMove={event=>{
              const bounds=event.currentTarget.getBoundingClientRect();
              setPoint({x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height});
            }} onFocus={()=>setPoint({x:0.5,y:0.5})} onClick={event=>{
              const bounds=event.currentTarget.getBoundingClientRect();
              void act('crop',event.detail?{x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height}:undefined);
            }}/>}
            {(currentCrop||preview) && !picking && !cropPending && <><img src={currentCrop?.after??preview?.url} alt={t('common.preview')} style={{clipPath:'inset(0 0 0 '+divider+'%)'}} />
              <Slider.Root className={styles.comparison} min={0} max={100} value={divider} onValueChange={setDivider}>
                <Slider.Control className={styles.comparisonControl}><Slider.Track className={styles.comparisonTrack}>
                  <Slider.Thumb className={styles.comparisonThumb} aria-label={t('media.upscale.compare')}><span aria-hidden="true"><IconArrowsHorizontal size={19}/></span></Slider.Thumb>
                </Slider.Track></Slider.Control>
              </Slider.Root>
            </>}
            {preview&&<a className={styles.download} aria-label={t('designFiles.download')} title={t('designFiles.download')} href={preview.url} download={item.filename.replace(/\.[^.]+$/,'')+'-'+factor+'x.'+(format==='jpeg'?'jpg':format)}><IconDownload size={19}/></a>}
            {cropPending && <span className="direct-upscale-pending" role="status">{t('common.loading')}</span>}
          </div>
        </div>

      </div>
      {selected&&sidebar&&createPortal(<aside className={styles.settings}>
        <section className={styles.group+' '+styles.modelGroup}><h3>{t('settings.model')}</h3>
          <div ref={modelViewport} className={styles.modelViewport} data-fade-left={modelEdges.left} data-fade-right={modelEdges.right}><RadioGroup className={styles.models} aria-label={t('settings.model')} value={chosenModel} disabled={disabled} onValueChange={value=>{setChosenModel(String(value));if(value==='photo2'&&factor>2){setTarget({unit:'scale',value:'2'});setFreeHeight(String(h*2));}setCrop(undefined);}}>
            {installedModels.filter(id=>['photo2','photo4','art4'].includes(id)).map(id=><Radio.Root key={id} value={id} className={styles.model} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))modelCarousel?.scrollTo(installedModels.filter(id=>['photo2','photo4','art4'].includes(id)).indexOf(id));}}>
              <img src={pixflowPublicAssetUrl('upscaler-models/'+id+'.png')} alt=""/>
              <strong>{t(id==='art4'?'ui.finalBrowser.c659a0d0ed':'media.upscale.photo')} {id==='photo2'?'2×':'4×'}</strong>
              <span>{id==='photo2'?'Waifu2x':'Real-ESRGAN'}</span>
            </Radio.Root>)}
          </RadioGroup></div>
        </section>
        <section className={styles.group}><h3>{t('media.upscale.scale')}</h3>
          <RadioGroup className={styles.scales} aria-label={t('media.upscale.scale')} value={valid&&Math.abs(width/w-height/h)<0.001?factor:0} disabled={disabled} onValueChange={value=>{setTarget({unit:'scale',value:String(value)});setFreeHeight(String(Math.round(h*Number(value))));}}>
            {[1,2,3,4].filter(scale=>scale<=maxScale).map(scale=><Radio.Root key={scale} value={scale}>{scale}×</Radio.Root>)}
          </RadioGroup>
          <div className={styles.dimensions}><label><span aria-hidden="true">W</span><Input data-slot="input" type="number" aria-label={t('media.upscale.target')} disabled={disabled} min={Math.ceil(w/2)} max={w*maxScale} value={target.unit==='width'?target.value:width||''} aria-invalid={!valid} onChange={e=>setTarget({unit:'width',value:e.target.value})}/></label><Button size="icon" variant="ghost" className={styles.aspectLock} aria-label={t('media.upscale.lockAspect')} aria-pressed={aspectLocked} disabled={disabled} onClick={()=>{if(aspectLocked)setFreeHeight(String(height));setAspectLocked(!aspectLocked);}}>{aspectLocked?<IconLink size={17}/>:<IconUnlink size={17}/>}</Button><label><span aria-hidden="true">H</span><Input data-slot="input" type="number" aria-label={t('ui.manualEditPanel.height')} disabled={disabled} min={Math.ceil(h/2)} max={h*maxScale} value={aspectLocked?height||'':freeHeight} onChange={e=>{if(aspectLocked)setTarget({unit:'width',value:e.target.value?String(Math.round(Number(e.target.value)*w/h)):''});else setFreeHeight(e.target.value);}}/></label></div>
          {!valid&&<p role="alert">0.5× – {maxScale}×</p>}
          {tooLarge&&<p role="alert">{t('media.upscale.limit')}</p>}
        </section>
        <section className={styles.group}>
          <Adjustment label={t('media.upscale.sharpen')} value={sharpen} onChange={setSharpen} disabled={disabled}/>
          <Adjustment label={t('media.upscale.noise')} value={noiseEnabled?strength:0} max={4} onChange={value=>{setNoiseEnabled(value>0);setManualStrength(Math.max(1,value));}} disabled={disabled||!noiseAvailable}/>
          {!noiseAvailable&&<small>{t('media.upscale.noiseRange')}</small>}
          <Adjustment label={t('media.upscale.contrast')} value={contrast} min={-50} max={50} onChange={setContrast} disabled={disabled}/>
          <label className={styles.switchRow}><span>{t('media.upscale.preserve')}<small>{t('media.upscale.preserveHelp')}</small></span><Switch.Root data-slot="switch" className={styles.toggle} checked={preserve} onCheckedChange={setPreserve} disabled={disabled} aria-label={t('media.upscale.preserve')}><Switch.Thumb className={styles.thumb}/></Switch.Root></label>
        </section>
        <section className={styles.group}>
          <label className={styles.switchRow}>{t('media.upscale.minify')}<Switch.Root data-slot="switch" className={styles.toggle} checked={minify} onCheckedChange={setMinify} disabled={disabled} aria-label={t('media.upscale.minify')}><Switch.Thumb className={styles.thumb}/></Switch.Root></label>
          {minify&&<WorkspaceSelect label={t('media.optimise.format')} value={format} options={formats} disabled={disabled} onValueChange={setFormat}/>}
          {minify&&format!=='png'&&<MediaQualitySlider value={quality} onChange={setQuality} disabled={disabled}/>}
          {format==='jpeg'&&<small>{t('media.upscale.white')}</small>}
        </section>
        <footer className={styles.actions}>
          {onApplyToAll&&<Button className={styles.applyAll} variant="ghost" disabled={disabled||!valid}
            onClick={()=>onApplyToAll({
              model:chosenModel, noiseEnabled, noiseStrength:noiseEnabled?strength:manualStrength,
              target, aspectLocked, freeHeight, minify, format:chosenFormat, quality, sharpen, contrast, preserve,
            })}>{t('media.upscale.applyAll')}</Button>}
          {onApplyToAll&&<span role="status" className={styles.applyStatus}>
            {settingsApplication?.sourceId===item.id?t('media.upscale.appliedAll'):''}
          </span>}
          <Button className={styles.render} disabled={disabled||!ready||!valid||tooLarge} onClick={()=>enqueue('run')}>{t('media.upscale.render')}</Button>
          {busy&&<Button variant="ghost" onClick={()=>controller.current?.abort()}>{t('chat.stop')}</Button>}
          <ButtonGroup className={styles.saveActions} aria-label={t('media.upscale.save')}><Button className={styles.save} disabled={disabled||!ready||!valid||tooLarge||(saveAction==='overwrite'&&(format!==sourceFormat||!originalHash.current))} onClick={()=>saveAction==='overwrite'?setConfirmation(true):enqueue('save')}><IconDeviceFloppy size={17}/>{t(saveAction==='overwrite'?'media.upscale.overwrite':'media.upscale.save')}</Button>
          <ButtonGroupSeparator/><Menu.Root><Menu.Trigger render={<Button size="icon"/>} className={styles.save} aria-label={t('media.upscale.overwrite')} disabled={disabled||!ready||!valid||tooLarge}><IconChevronDown size={16}/></Menu.Trigger><Menu.Portal container={sidebar?.closest<HTMLElement>('.direct-upscale-view')}><Menu.Positioner side="top" align="end" sideOffset={6} className={styles.menuPositioner}><Menu.Popup className={styles.menu}><Menu.RadioGroup value={saveAction} onValueChange={value=>setSaveAction(value as 'save'|'overwrite')}><Menu.RadioItem closeOnClick value="save" className={styles.menuItem}><IconDeviceFloppy size={17}/>{t('media.upscale.save')}<Menu.RadioItemIndicator><IconCheck size={14}/></Menu.RadioItemIndicator></Menu.RadioItem><Menu.RadioItem closeOnClick value="overwrite" className={styles.menuItem} disabled={format!==sourceFormat||!originalHash.current}><IconDeviceFloppy size={17}/>{t('media.upscale.overwrite')}<Menu.RadioItemIndicator><IconCheck size={14}/></Menu.RadioItemIndicator></Menu.RadioItem></Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></ButtonGroup>
          {!ready&&<small>{!state&&!error?t('common.loading'):t('media.upscale.requires')}</small>}
          {format!==sourceFormat&&<small>{t('media.upscale.sameFormat')} ({sourceFormat.toUpperCase()})</small>}
        </footer>
      </aside>,sidebar)}
      <div className={styles.cardActions}>

        {preview&&<small>{new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(preview.blob.size/1024)} KiB</small>}
        {!selected&&<Button disabled={disabled||!valid||tooLarge} onClick={onSelect}>{t('common.edit')}</Button>}
        {error&&<p role="alert" className={styles.error}>{error}</p>}
      </div>
      <AlertDialog.Root open={confirmation} onOpenChange={setConfirmation}><AlertDialog.Portal container={sidebar?.closest<HTMLElement>('.pixflow-design-token-scope')??sidebar?.closest<HTMLElement>('.direct-upscale-view')}>
        <AlertDialog.Backdrop className={styles.backdrop}/><AlertDialog.Popup className={styles.dialog}>
          <AlertDialog.Title className={styles.dialogTitle}>{t('media.upscale.overwrite')}?</AlertDialog.Title><AlertDialog.Description className={styles.dialogDescription}>{item.filename} · {width} × {height} px<br/><br/>{t('media.upscale.batchWarning',{count:'1'})}</AlertDialog.Description>
          <div className={styles.dialogActions}><AlertDialog.Close render={<Button variant="ghost"/>}>{t('common.cancel')}</AlertDialog.Close><Button className={styles.destructive} onClick={()=>{setConfirmation(false);enqueue('overwrite');}}>{t('media.upscale.overwrite')}</Button></div>
        </AlertDialog.Popup>
      </AlertDialog.Portal></AlertDialog.Root>
    </article>;
}
function Adjustment({label,value,onChange,disabled,min=0,max=100}:{label:string;value:number;onChange:(value:number)=>void;disabled:boolean;min?:number;max?:number}){
  return <Slider.Root className={styles.adjustment} data-slot="slider" min={min} max={max} step={1} value={value} onValueChange={onChange} disabled={disabled}>
    <div><span>{label}</span><output>{max===4?value+' / 4':value+'%'}</output></div>
    <Slider.Control className={styles.sliderControl}><Slider.Track data-slot="slider-track" className={styles.track}><Slider.Indicator data-slot="slider-range" className={styles.range}/><Slider.Thumb data-slot="slider-thumb" className={styles.sliderThumb} aria-label={label}/></Slider.Track></Slider.Control>
  </Slider.Root>;
}
