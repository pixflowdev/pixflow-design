import {useEffect,useRef,useState} from 'react';
import {Button} from '@open-design/components';
import {IconDownload,IconTrash} from '@tabler/icons-react';
import {Switch} from '@base-ui/react/switch';
import {useT} from '../i18n';
import {notifyUpscalerChange,upscalerRequest,useUpscalerInventory} from '../pixflow/upscaler-access';
import styles from './UpscalerSettings.module.css';

export function UpscalerSettings({onDownloads}:{onDownloads:()=>void}){
  const t=useT();
  const {status,error:connectionError}=useUpscalerInventory();
  const [error,setError]=useState('');
  const [pending,setPending]=useState('');
  const [largeBytes,setLargeBytes]=useState(0);
  const active=useRef<AbortController | undefined>(undefined);
  useEffect(()=>{
    const task=new AbortController();
    void upscalerRequest<{bytes:number}>('status',task.signal,'photo4').then(result=>{
      if(!task.signal.aborted)setLargeBytes(result.bytes);
    }).catch(()=>{});
    return ()=>{task.abort();active.current?.abort();};
  },[]);
  async function change(action:string,model:string){
    if(active.current)return;
    const task=new AbortController();active.current=task;
    setPending(model);setError('');
    try {await upscalerRequest(action,task.signal,model);notifyUpscalerChange();}
    catch(err){if(!task.signal.aborted)setError(err instanceof Error?err.message:String(err));}
    finally {active.current=undefined;setPending('');}
  }
  if(connectionError || (status && (!status.supported || !status.installedModels)))return <section className={styles.settings}>
    <p>{t('media.upscale.requires')}</p><Button variant="ghost" onClick={onDownloads}>{t('ui.dictationSettings.viewBridgeDownloads')}</Button>
  </section>;
  const packs=[
    {id:'photo2',name:t('media.upscale.photo')+' · 2×',bytes:status?.bytes},
    {id:'photo4',name:t('media.upscale.photo')+' + '+t('ui.finalBrowser.c659a0d0ed')+' · 4×',bytes:largeBytes},
  ];
  return <section className={styles.settings}>
    <div className={styles.enable}><strong>{t('media.upscale.enable')}</strong>
      <Switch.Root className={styles.toggle} aria-label={t('media.upscale.enable')} checked={!!status?.enabled}
        disabled={!status||!!pending||status.busy} onCheckedChange={enabled=>void change(enabled?'enable':'disable','photo2')}>
        <Switch.Thumb className={styles.thumb}/>
      </Switch.Root>
    </div>
    <p className={styles.note}>{t('media.upscale.settingsHelp')}</p>
    <div className={styles.models}>{packs.map(pack=>{
      const installed=status?.installedModels?.includes(pack.id);
      const upgrade=installed && pack.id==='photo2' && status?.noiseReduction===false;
      return <div className={styles.row} key={pack.id}><div><strong>{pack.name}</strong><small>{pack.bytes?(pack.bytes/1e6).toFixed(1)+' MB':'…'}</small></div>
        <small>{pending===pack.id?t('common.loading'):!status?'…':t(installed?'ui.dictationSettings.downloaded':'ui.dictationSettings.notDownloaded')}</small>
        {upgrade && <Button variant="ghost" disabled={!!pending} onClick={()=>void change('install',pack.id)}>{t('media.upscale.noise')}</Button>}
        <Button className={styles.iconButton} variant="ghost" size="icon" aria-label={t(installed?'dictationDelete':'dictationDownload')+' '+pack.name}
          disabled={!status||!!pending||status.busy} onClick={()=>void change(installed?'remove':'install',pack.id)}>
          {installed?<IconTrash size={17}/>:<IconDownload size={17}/>}
        </Button></div>;
    })}</div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
