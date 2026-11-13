import { Progress } from '@base-ui/react/progress';
import { Button } from '@open-design/components';
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions } from './chat/Attachment';
import { Icon } from './Icon';
import type { Dict } from '../i18n/types';
import { useT } from '../i18n';
import type { MediaUploadJob } from './useMediaUploads';
import styles from './MediaUploads.module.css';
const upscaleLabels = {
 preview: { action:'media.upscale.render', done:'media.upscale.previewRendered' },
 copy: { action:'media.upscale.save', done:'media.upscale.copySaved' },
 replace: { action:'media.upscale.overwrite', done:'media.upscale.originalReplaced' },
} as const;

function queueLabel(job:MediaUploadJob):keyof Dict {
 if(job.status==='rendering')return 'media.upscale.renderingPreview';
 if(job.status==='saving')return job.operation==='replace'?'media.upscale.replacingOriginal':'media.upscale.savingCopy';
 if(job.status==='done'&&job.operation)return upscaleLabels[job.operation].done;
 return `media.upload.${job.status}`;
}

export function MediaUploadQueue({jobs,onRetry,onClear,operationLabel}:{jobs:MediaUploadJob[];onRetry:(job:MediaUploadJob)=>void;onClear:()=>void;operationLabel?:string}){
 const t=useT();if(!jobs.length)return null;
 return <section className={styles.queue} aria-label={operationLabel??t('media.upload.queue')}>
  <header><strong>{operationLabel??t('media.upload.queue')}</strong><span role="status">{t(operationLabel?'media.upscale.count':'media.upload.count',{done:String(jobs.filter(j=>j.status==='done').length),total:String(jobs.length)})}</span>{jobs.some(j=>j.status==='done')&&<Button variant="ghost" onClick={onClear}>{t('media.upload.clear')}</Button>}</header>
  <div className={styles.list}>{jobs.map(job=><Attachment key={job.id} data-state={job.status} className={styles.item}>
   <AttachmentMedia><Icon name={job.status==='done'&&job.operation!=='preview'?'check':job.status==='error'?'alert-triangle':job.file.type.startsWith('image/')?'image':'file'} size={20}/></AttachmentMedia>
   <AttachmentContent className={styles.content}><AttachmentTitle title={job.file.name}>{job.file.name}</AttachmentTitle>
    <AttachmentDescription>{t(queueLabel(job))}{job.operation&&(job.status==='queued'||job.status==='error'||job.status==='rendering'&&job.operation!=='preview')&&<> · {t(upscaleLabels[job.operation].action)}</>}{!operationLabel&&<>{job.status==='uploading'?` · ${job.progress}%`:''} · {(job.file.size/1024/1024).toFixed(1)} MB</>}</AttachmentDescription>
    {job.status==='error'&&<p role="alert" className={styles.error}>{job.error}</p>}
    {['queued','uploading','processing','rendering','saving'].includes(job.status)&&<Progress.Root className={styles.progress} value={job.status==='queued'||job.status==='uploading'?job.progress:null} aria-label={job.file.name}><Progress.Track className={styles.track}><Progress.Indicator className={styles.indicator}/></Progress.Track></Progress.Root>}
   </AttachmentContent><AttachmentActions>{job.status==='error'&&<Button variant="ghost" onClick={()=>onRetry(job)}>{t('history.retry')}</Button>}</AttachmentActions>
  </Attachment>)}</div>
 </section>;
}
export function MediaDropOverlay({active}:{active:boolean}){const t=useT();return <div className={styles.drop} data-active={active} aria-hidden={!active}><Icon name="upload" size={36}/><strong>{t('media.upload.drop')}</strong><span>{t('media.upload.hint')}</span></div>;}
