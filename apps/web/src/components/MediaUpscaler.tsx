import { useEffect, useRef, useState } from 'react';
import { analyseUpscaleImage } from './media-upscale-analysis';
import { WorkspaceSelect } from './WorkspaceSelect';
import { useT } from '../i18n';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { upscalerRequest as request } from '../pixflow/upscaler-access';
import { uploadPixflowMedia, type PixflowMediaItem } from '../providers/registry';
import { Switch } from '@base-ui/react/switch';
import { Slider } from '@base-ui/react/slider';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Input } from '@base-ui/react/input';
import { MediaQualitySlider } from './MediaQualitySlider';
import { encodeMediaImage, readMediaImage } from './MediaOptimiser';

import { UPSCALER_MAX_INPUT_BYTES, UPSCALER_MAX_OUTPUT_PIXELS, type UpscalerStatus, type UpscalerResult } from '@open-design/contracts';
const formats = ['png','webp','jpeg'].map(value => ({value,label:value.toUpperCase()}));

type UpscaleProps={headerAction?:React.ReactNode;item:PixflowMediaItem;installedModels:string[];onBack:()=>void;onSaved:(copy:PixflowMediaItem)=>void;queue?:PixflowMediaItem[]};
export function MediaUpscaler(props:UpscaleProps) {
  const t=useT();
  const [active,setActive]=useState(props.item.id);
  const [pending,setPending]=useState<string[]>([]);
  const [outcomes,setOutcomes]=useState<Record<string,{ok:boolean;message:string}>>({});
  const queue=props.queue;
  const item=queue?.find(entry=>entry.id===(pending[0]??active))??props.item;
  const [kind,setKind]=useState(props.installedModels.some(id=>id.startsWith('photo'))?'photo':'art');
  const [noiseEnabled,setNoiseEnabled]=useState(false);
  const [manualStrength,setManualStrength]=useState<number>();
  const [target,setTarget]=useState({unit:'scale',value:'2'});
  const [minify,setMinify]=useState(false);
  const [chosenFormat,setFormat]=useState(props.item.mimeType==='image/png'?'webp':props.item.mimeType.slice(6));
  const [quality,setQuality]=useState(85);
  const remaining=queue?.filter(entry=>!outcomes[entry.id]?.ok)??[];
  function finish(ok:boolean,message:string){
    setOutcomes(prev=>({...prev,[item.id]:{ok,message}}));
    setActive(item.id);setPending(prev=>prev.slice(1));
  }
  return <UpscaleEditor key={item.id} {...props} item={item}
    settings={{kind,setKind,noiseEnabled,setNoiseEnabled,manualStrength,setManualStrength,target,setTarget,minify,setMinify,chosenFormat,setFormat,quality,setQuality}}
    autoSave={!!pending.length} onFailure={message=>finish(false,message)}
    onSaved={copy=>queue?finish(true,copy.filename):props.onSaved(copy)}
    batchAction={queue && <><button type="button" disabled={!remaining.length||!!pending.length}
      onClick={()=>setPending(remaining.map(entry=>entry.id))}>{t('media.bulk.saveUpscaled')} ({remaining.length})</button>{pending.length>1 && <button type="button" onClick={()=>setPending(prev=>prev.slice(0,1))}>{t('chat.stop')}</button>}</>}
    filmstrip={queue && <div className="direct-upscale-queue" aria-label={t('media.bulk.select')}>
      {queue.map(entry=><button key={entry.id} type="button" disabled={!!pending.length} aria-pressed={entry.id===item.id}
        onClick={()=>setActive(entry.id)}><img src={entry.thumbnailUrl||entry.url} alt="" loading="lazy"/><span>{entry.filename}
        <small>{pending[0]===entry.id?t('common.loading'):outcomes[entry.id]?.message}</small></span></button>)}
    </div>}/>;
}
type Setter<T>=(value:T)=>void;
type EditorSettings={kind:string;setKind:Setter<string>;noiseEnabled:boolean;setNoiseEnabled:Setter<boolean>;
  manualStrength?:number;setManualStrength:Setter<number>;target:{unit:string;value:string};setTarget:Setter<{unit:string;value:string}>;
  minify:boolean;setMinify:Setter<boolean>;chosenFormat:string;setFormat:Setter<string>;quality:number;setQuality:Setter<number>};
function UpscaleEditor({item,installedModels,onBack,onSaved,headerAction,settings,filmstrip,batchAction,autoSave,onFailure}:UpscaleProps & {
 settings:EditorSettings;filmstrip?:React.ReactNode;batchAction?:React.ReactNode;autoSave:boolean;onFailure:(message:string)=>void}) {
  const t = useT();
  const {kind,setKind,noiseEnabled,setNoiseEnabled,manualStrength,setManualStrength,target,setTarget,minify,setMinify,chosenFormat,setFormat,quality,setQuality}=settings;
  const [analysis,setAnalysis]=useState<ReturnType<typeof analyseUpscaleImage>>();
  const [crop,setCrop]=useState<{before:string;after:string;key:string;width:number;height:number}>();
  const source=useRef<HTMLImageElement>();
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
  const originalHash=useRef<Promise<string>>();
  const confirmation=useRef<HTMLDialogElement>(null);
  const [detail,setDetail] = useState(false);
  const [divider,setDivider] = useState(50);
  const [exported,setExported] = useState<{url:string;blob:Blob;key:string}>();
  const controller = useRef<AbortController|null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const w=item.width||0,h=item.height||0;
  const factor=target.unit==='scale'?Number(target.value):Number(target.value)/w;
  const canPhoto=installedModels.includes('photo2')||installedModels.includes('photo4');
  const canArt=installedModels.includes('art4');
  const effectiveKind=(kind==='photo'?canPhoto:canArt)?kind:(canPhoto?'photo':'art');
  const maxScale=effectiveKind==='art'||installedModels.includes('photo4')?4:2;
  const valid=w>0 && h>0 && factor>=0.5 && factor<=maxScale && (target.unit!=='width'||Number.isInteger(Number(target.value)));
  const width=valid?Math.max(1,Math.round(w*factor)):0,height=valid?Math.max(1,Math.round(h*width/w)):0;
  const model=factor<=1?'resize':effectiveKind==='art'?'art4':factor<=2&&installedModels.includes('photo2')?'photo2':'photo4';
  const multiplier=model==='photo2'?2:4;
  const tooLarge=model!=='resize' && (w*h*multiplier**2>UPSCALER_MAX_OUTPUT_PIXELS || Math.max(w,h)>4096 || w*h>4000000);
  const noiseAvailable=model==='photo2' && state?.noiseReduction===true;
  const strength=manualStrength??Math.max(1,(analysis?.noise??0)+1);
  const noise=noiseAvailable && noiseEnabled?strength-1:-1;
  const treatment=model+'_'+noise;
  const exportQuality=minify?quality:100;
  const key = JSON.stringify([treatment,width,format,exportQuality]);
  const cropKey=JSON.stringify([treatment,width]);
  const currentCrop=crop?.key===cropKey?crop:undefined;
  const ready=model==='resize'||!!state?.installed;
  useEffect(()=>{
    const task=new AbortController();
    source.current=undefined;setAnalysis(undefined);
    void readMediaImage(item,task.signal).then(({image,blob})=>{
      if(!task.signal.aborted){source.current=image;
        if(globalThis.crypto?.subtle)originalHash.current=blob.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(hash=>
          Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')).catch(()=>'');
        setAnalysis(analyseUpscaleImage(image));}
    }).catch(err=>{if(!task.signal.aborted)setError(String(err.message||err));});
    return ()=>task.abort();
  },[item.url]);
  const preview = exported?.key===key && native?.model===treatment && valid ? exported : undefined;

  useEffect(()=>{
    heading.current?.focus();
    return ()=>controller.current?.abort();
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    setState(undefined);setError('');
    if(model==='resize')return;
    void request<UpscalerStatus>('status',abort.signal,model).then(result=>{
      if(!abort.signal.aborted)setState(result);
    }).catch(err=>{if(!abort.signal.aborted)setError(String(err.message || err));});
    return ()=>abort.abort();
  },[model]);
  useEffect(()=>{
    if(!native || native.model!==treatment || !valid)return;
    let active=true, url='';
    const timer=setTimeout(async()=>{
      try {
        const blob=model!=='resize' && format==='png' && width===native.image.naturalWidth ? native.blob :
          (await encodeMediaImage(native.image,format,exportQuality,width)).blob;
        if(active){url=URL.createObjectURL(blob);setExported({blob,url,key});}
      } catch { if(active)setError(t('media.optimise.failed')); }
    },100);
    return ()=>{active=false;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
  },[native,valid,width,format,exportQuality,key,t]);

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
        const cropWidth=Math.max(1,Math.round(cw*factor)),cropHeight=Math.max(1,Math.round(ch*factor));
        if(isCrop)setPendingOriginal({before,width:cropWidth,height:cropHeight});
        const showCrop=(result:CanvasImageSource)=>{
          canvas.width=cropWidth;canvas.height=cropHeight;
          canvas.getContext('2d')!.drawImage(result,0,0,cropWidth,cropHeight);
          if(!task.signal.aborted)setCrop({before,after:canvas.toDataURL(),key:cropKey,width:cropWidth,height:cropHeight});
        };
        if(isCrop && native?.model===treatment && model!=='resize'){
          canvas.width=cropWidth;canvas.height=cropHeight;
          canvas.getContext('2d')!.drawImage(native.image,cx*multiplier,cy*multiplier,cw*multiplier,ch*multiplier,0,0,cropWidth,cropHeight);
          setCrop({before,after:canvas.toDataURL(),key:cropKey,width:cropWidth,height:cropHeight});
          return;
        }
        if(model==='resize'){
          if(isCrop){const original=new Image();original.src=before;await original.decode();showCrop(original);return;}
          const {blob}=await encodeMediaImage(image,'png',100,width);
          if(!task.signal.aborted)setNative({image,blob,model:treatment});
          return {image,blob,model:treatment};
        }
        const png=before.split(',')[1]!;
        if(png.length>4*Math.ceil(UPSCALER_MAX_INPUT_BYTES/3))throw new Error(t('media.fit.msgab4eb7a0a8'));
        const result=await request<UpscalerResult>('run',task.signal,model,png,noise);
        const uri='data:image/png;base64,'+result.png;
        const decoded=new Image();decoded.src=uri;await decoded.decode();
        if(isCrop){showCrop(decoded);return;}
        const blob=await (await fetch(uri,{signal:task.signal})).blob();
        const resultImage={image:decoded,blob,model:treatment};
        if(!task.signal.aborted)setNative(resultImage);
        return resultImage;
  }

  async function act(action:'run'|'save'|'crop'|'overwrite', point={x:0.5,y:0.5}){
    if(controller.current)return;
    const task=new AbortController();controller.current=task;setBusy(true);setError('');
    try {
      if(action==='run'||action==='crop'){
        await processImage(task,action==='crop',point);
      }else{
        const full=native?.model===treatment?native:await processImage(task,false,point);
        task.signal.throwIfAborted();
        if(!full)throw new Error(t('media.optimise.failed'));
        const output=preview?.blob??(model!=='resize' && format==='png' && width===full.image.naturalWidth
          ? full.blob : (await encodeMediaImage(full.image,format,exportQuality,width)).blob);
        task.signal.throwIfAborted();

        const ext=format==='jpeg'?'jpg':format;
        const filename=item.filename.replace(/\.[^.]+$/,'')+'-'+Number(factor.toFixed(3))+'x.'+ext;
        const file=new File([output],filename,{type:output.type});
        if(action==='overwrite'){
          const form=new FormData();form.append('file',file);form.append('originalHash',await originalHash.current||'');
          const response=await pixflowWordPressRestFetch('/media/attachments/'+item.attachmentId+'/overwrite',{method:'POST',body:form,signal:task.signal});
          const result=await response.json();
          if(!response.ok||!result.item)throw new Error(result.message||t('media.optimise.failed'));
          if(!task.signal.aborted)onSaved({...result.item,previewRevision:Date.now()});
        }else{
          const copy=await uploadPixflowMedia(file,item,{upscaled:true});
          if(!task.signal.aborted)onSaved(copy);
        }
      }
    }catch(err){if(!task.signal.aborted){const reason=err instanceof Error?err.message:String(err);setError(reason);if(autoSave)onFailure(reason);}}
    finally{controller.current=null;setBusy(false);setCropPending(false);setPendingOriginal(undefined);}
  }

  const started=useRef(false);
  useEffect(()=>{
    if(!autoSave){started.current=false;return;}
    if(started.current||controller.current)return;
    if(!valid||tooLarge||error||(state&&!ready)){
      started.current=true;onFailure(error||t(tooLarge||!valid?'media.upscale.limit':'media.upscale.requires'));return;
    }
    if(!ready||!analysis)return;
    started.current=true;void act('save');
  });
  return <section className="direct-upscale-view">
    <header><button type="button" onClick={onBack} disabled={busy||autoSave}>← {t('designFiles.back')}</button>
      <div><h2 ref={heading} tabIndex={-1}>{t('media.upscale.action')}</h2><small>{item.filename}</small></div>{headerAction}</header>
    {filmstrip}
    <div className="direct-upscale-layout">
      <div className="direct-upscale-canvas">
        <div className="direct-upscale-zoom"><button type="button" disabled={cropPending} aria-pressed={!detail&&!picking&&!currentCrop&&!cropPending} onClick={()=>{setCrop(undefined);setPicking(false);setDetail(false);}}>{t('media.upscale.fit')}</button>
          <button type="button" disabled={cropPending} aria-pressed={detail} onClick={()=>{setCrop(undefined);setPicking(false);setDetail(true);}}>100%</button>
          <button type="button" disabled={busy||autoSave||!ready||!valid} aria-pressed={picking||cropPending||!!currentCrop} onClick={()=>{setCrop(undefined);setDetail(false);setPicking(!picking);}}>{t('media.upscale.pick')}</button></div>
        <div className="direct-upscale-viewport" tabIndex={0}>
          <div className="direct-upscale-plane" style={{width:pendingOriginal?pendingOriginal.width:currentCrop?currentCrop.width:detail?(preview?width:item.width ?? undefined):'min(100cqw, '+((item.width||1)/(item.height||1)*100)+'cqh)',aspectRatio:pendingOriginal?pendingOriginal.width+'/'+pendingOriginal.height:currentCrop?currentCrop.width+'/'+currentCrop.height:(item.width||1)+'/'+(item.height||1)}}>
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
              <i aria-hidden="true" style={{left:divider+'%'}}
                onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={event=>{
                  if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
                  const bounds=event.currentTarget.parentElement!.getBoundingClientRect();
                  setDivider(Math.max(0,Math.min(100,Math.round((event.clientX-bounds.left)/bounds.width*100))));
                }}/>
            </>}
            {cropPending && <span className="direct-upscale-pending" role="status">{t('common.loading')}</span>}
          </div>
        </div>
        {(currentCrop||preview) && !picking && !cropPending && <div className="direct-upscale-labels"><span>{t('media.optimise.original')}</span><input type="range" min="0" max="100" value={divider} aria-label={t('media.upscale.compare')} onChange={e=>setDivider(Number(e.target.value))}/><span>{t('common.preview')}</span></div>}
      </div>
      <aside className="direct-upscale-settings">
        <WorkspaceSelect label={t('media.upscale.kind')} value={effectiveKind} disabled={busy||autoSave}
          options={[{value:'photo',label:t('media.upscale.photo')},{value:'art',label:t('ui.finalBrowser.c659a0d0ed')}].filter(option=>option.value==='photo'?canPhoto:canArt)}
          onValueChange={setKind}/>
        <label className="direct-upscale-switch-row">{t('media.upscale.noise')}
          <Switch.Root className="direct-upscale-switch" checked={noiseAvailable && noiseEnabled}
            aria-label={t('media.upscale.noise')} onCheckedChange={setNoiseEnabled} disabled={busy||autoSave||!noiseAvailable}>
            <Switch.Thumb className="direct-upscale-switch-thumb"/>
          </Switch.Root>
        </label>
        {model!=='photo2' && <small>{t('media.upscale.noiseRange')}</small>}
        {noiseAvailable && noiseEnabled && <Slider.Root className="direct-media-quality" min={1} max={4} step={1}
          value={strength} onValueChange={setManualStrength} disabled={busy||autoSave}>
          <div className="direct-media-quality-label">{t('media.upscale.strength')}<span>{strength} / 4</span></div>
          <Slider.Control className="direct-media-quality-control"><Slider.Track className="direct-media-quality-track">
            <Slider.Indicator className="direct-media-quality-range"/><Slider.Thumb className="direct-media-quality-thumb" aria-label={t('media.upscale.strength')}/>
          </Slider.Track></Slider.Control>
        </Slider.Root>}
        <label>{t('media.upscale.scale')} (×)
          <Input className="direct-media-width" data-slot="input" type="number" min="0.5" max={maxScale} step="any" disabled={busy||autoSave}
            value={target.unit==='scale'?target.value:valid?Number(factor.toFixed(4)):''} aria-invalid={!valid}
            onChange={e=>setTarget({unit:'scale',value:e.target.value})}/>
        </label>
        <RadioGroup className="direct-upscale-presets" aria-label={t('media.upscale.scale')}
          value={valid ? factor : 0} disabled={busy||autoSave}
          onValueChange={value=>setTarget({unit:'scale',value:String(value)})}>
          {[1.5,2,3,4].filter(scale=>scale<=maxScale).map(scale=>(
            <Radio.Root key={scale} value={scale} className="direct-upscale-preset">
              {scale}×
            </Radio.Root>
          ))}
        </RadioGroup>
        <label>{t('media.upscale.target')} (px)
          <Input className="direct-media-width" data-slot="input" type="number" disabled={busy||autoSave} min={Math.ceil(w/2)} max={w*maxScale}
            value={target.unit==='width'?target.value:width||''} aria-invalid={!valid} onChange={e=>setTarget({unit:'width',value:e.target.value})}/>
        </label>
        <output>{valid ? width+' × '+height+' px' : '0.5× – '+maxScale+'×'}</output>
        {tooLarge && <p>{t('media.upscale.limit')}</p>}
        {state && !state.supported && <p>{t('media.upscale.requires')}</p>}
        {model==='resize' && <button type="button" disabled={busy||autoSave||!valid} onClick={()=>void act('run')}>{t('media.upscale.generate')}</button>}
        {model!=='resize' && state?.supported && <button type="button" disabled={busy||autoSave||tooLarge||!valid||!ready} onClick={()=>void act('run')}>{t('media.upscale.generate')}</button>}
        <hr/>
        <label className="direct-upscale-switch-row">
          {t('media.upscale.minify')}
          <Switch.Root className="direct-upscale-switch" checked={minify} onCheckedChange={setMinify} disabled={busy||autoSave} aria-label={t('media.upscale.minify')}>
            <Switch.Thumb className="direct-upscale-switch-thumb"/>
          </Switch.Root>
        </label>
        {minify && <WorkspaceSelect label={t('media.optimise.format')} value={format} options={formats} disabled={busy||autoSave} onValueChange={setFormat}/>}
        {minify && format!=='png' && <MediaQualitySlider value={quality} onChange={setQuality} disabled={busy||autoSave}/>}
        {format==='jpeg' && <small>{t('media.upscale.white')}</small>}
        {preview && <output>{new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(preview.blob.size/1024)} KiB</output>}
        {batchAction || <button type="button" disabled={busy||autoSave||!ready||!valid||tooLarge} onClick={()=>void act('save')}>{t('media.upscale.save')}</button>}
        {!batchAction && <button type="button" disabled={busy||autoSave||!ready||!valid||tooLarge||format!==sourceFormat||!originalHash.current}
          onClick={()=>confirmation.current?.showModal()}>{t('media.upscale.overwrite')}</button>}
        {!batchAction && format!==sourceFormat && <small>{t('media.upscale.sameFormat')} ({sourceFormat.toUpperCase()})</small>}
        <dialog ref={confirmation} className="direct-upscale-confirm" aria-label={t('media.upscale.overwrite')} onCancel={event=>event.stopPropagation()}>
          <strong>{t('media.upscale.overwrite')}?</strong><p>{item.filename} · {width} × {height} px</p>
          <button type="button" autoFocus onClick={()=>confirmation.current?.close()}>{t('common.cancel')}</button>
          <button type="button" onClick={()=>{confirmation.current?.close();void act('overwrite');}}>{t('media.upscale.overwrite')}</button>
        </dialog>
        {busy && <output>{t('common.loading')}</output>}{error && <p role="alert">{error}</p>}
      </aside>
    </div>
  </section>;
}
