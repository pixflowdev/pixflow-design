import { Progress } from '@base-ui/react/progress';
import { Button } from '@open-design/components';
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions } from './chat/Attachment';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { MediaUploadJob } from './useMediaUploads';
import styles from './MediaUploads.module.css';
export function MediaUploadQueue({jobs,onRetry,onClear}:{jobs:MediaUploadJob[];onRetry:(job:MediaUploadJob)=>void;onClear:()=>void}){
 const t=useT();if(!jobs.length)return null;
 return <section className={styles.queue} aria-label={t('media.upload.queue')}>
  <header><strong>{t('media.upload.queue')}</strong><span role="status">{t('media.upload.count',{done:String(jobs.filter(j=>j.status==='done').length),total:String(jobs.length)})}</span>{jobs.some(j=>j.status==='done')&&<Button variant="ghost" onClick={onClear}>{t('media.upload.clear')}</Button>}</header>
  <div className={styles.list}>{jobs.map(job=><Attachment key={job.id} data-state={job.status} className={styles.item}>
   <AttachmentMedia><Icon name={job.status==='done'?'check':job.status==='error'?'alert-triangle':job.file.type.startsWith('image/')?'image':'file'} size={20}/></AttachmentMedia>
   <AttachmentContent className={styles.content}><AttachmentTitle title={job.file.name}>{job.file.name}</AttachmentTitle>
    <AttachmentDescription>{t(`media.upload.${job.status}`)}{job.status==='uploading'?` · ${job.progress}%`:''} · {(job.file.size/1024/1024).toFixed(1)} MB</AttachmentDescription>
    {job.status==='error'&&<p role="alert" className={styles.error}>{job.error}</p>}
    {['queued','uploading','processing'].includes(job.status)&&<Progress.Root className={styles.progress} value={job.status==='processing'?null:job.progress} aria-label={job.file.name}><Progress.Track className={styles.track}><Progress.Indicator className={styles.indicator}/></Progress.Track></Progress.Root>}
   </AttachmentContent><AttachmentActions>{job.status==='error'&&<Button variant="ghost" onClick={()=>onRetry(job)}>{t('history.retry')}</Button>}</AttachmentActions>
  </Attachment>)}</div>
 </section>;
}
export function MediaDropOverlay({active}:{active:boolean}){const t=useT();return <div className={styles.drop} data-active={active} aria-hidden={!active}><Icon name="upload" size={36}/><strong>{t('media.upload.drop')}</strong><span>{t('media.upload.hint')}</span></div>;}
