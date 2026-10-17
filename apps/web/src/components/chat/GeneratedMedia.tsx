import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import type { ProjectFile } from '../../types';
import { projectFileUrl, projectRawUrl, appendProjectFileQuery } from '../../providers/registry';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { useResolvedTheme } from '../ConnectorLogo';
import styles from './GeneratedMedia.module.css';

function source(projectId: string, file: ProjectFile) {
  return appendProjectFileQuery(projectRawUrl(projectId, file.name), `v=${encodeURIComponent(file.sha256 ?? file.mtime)}`);
}

export function MediaGenerationPlaceholder({ kind }: { kind: 'image' | 'video' }) {
  const t = useT();
  return <div className={styles.pending} role="status" aria-busy="true" aria-label={t(kind === 'video' ? 'chat.generatingVideo' : 'chat.generatingImage')}>
    <div className={styles.dots} aria-hidden="true" />
    <span>{t(kind === 'video' ? 'chat.generatingVideo' : 'chat.generatingImage')}</span>
  </div>;
}

/** Shared by the floating panel and Workspace through AssistantMessage. */
export function GeneratedMedia({ files, projectId, onRequestOpenFile, compact = false }: {
  files: ProjectFile[]; projectId: string; onRequestOpenFile?: (name: string) => void; compact?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const t = useT();
  const index = files.findIndex(file => file.name === selected);
  return <div className={styles.gallery} data-compact={compact}>
    {files.map(file => <figure key={file.name} className={styles.card}>
      {file.kind === 'video'
        ? <video className={styles.video} src={source(projectId, file)} controls playsInline preload="metadata" aria-label={file.name} />
        : <Button variant="subtle" className={styles.tile} aria-label={`${t('assistant.openFile')}: ${file.name}`} onClick={() => setSelected(file.name)}>
          <img src={source(projectId, file)} alt={file.name} loading="lazy" decoding="async" />
        </Button>}
      <figcaption className={styles.caption}>
        <span title={file.name}>{file.name}</span>
        <Button variant="subtle" size="icon" className={styles.action} aria-label={`${t('assistant.openFile')}: ${file.name}`} onClick={() => setSelected(file.name)}><Icon name="expand" size={16} /></Button>
        <a className={styles.action} href={projectFileUrl(projectId, file.name)} download={file.name} aria-label={`${t('assistant.downloadFile')}: ${file.name}`}><Icon name="download" size={16} /></a>
      </figcaption>
    </figure>)}
    {index >= 0 && <MediaLightbox key={projectId} files={files} index={index} projectId={projectId} onNavigate={next => setSelected(files[next]!.name)} onClose={() => setSelected(null)} onRequestOpenFile={onRequestOpenFile} />}
  </div>;
}

function MediaLightbox({ files, index, projectId, onNavigate, onClose, onRequestOpenFile }: {
  files: ProjectFile[]; index: number; projectId: string; onNavigate: (index: number) => void; onClose: () => void; onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  const theme = useResolvedTheme();
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [zoom, setZoom] = useState(1);
  const [copyStatus, setCopyStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const file = files[index]!;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
    };
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('keydown', escape, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { setZoom(1); setCopyStatus(''); setFailed(false); }, [file.name, file.mtime]);
  async function copyImage() {
    if (!image.current?.naturalWidth) return;
    setCopying(true); setCopyStatus('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.current.naturalWidth; canvas.height = image.current.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(image.current, 0, 0);
      // Pass the pending PNG into ClipboardItem while the click still grants user activation.
      const png = new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setCopyStatus(t('fileViewer.copied'));
    } catch { setCopyStatus(t('preview.shareCopyFailed')); }
    finally { setCopying(false); }
  }
  return createPortal(<div className="pixflow-design-portal-scope" data-theme={theme}>
    <dialog ref={dialog} className={styles.lightbox} aria-label={file.name} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onNavigate(index - 1); }
      if (event.key === 'ArrowRight' && index < files.length - 1) { event.preventDefault(); onNavigate(index + 1); }
    }}>
      <header className={styles.toolbar}><span className={styles.title}>{file.name}</span><span className={styles.position}>{index + 1} / {files.length}</span>
        {file.kind === 'image' && typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function' && <Button variant="subtle" size="icon" className={styles.action} disabled={failed || copying} aria-label={t('useEverywhere.copy')} onClick={() => void copyImage()}><Icon name="copy" size={18} /></Button>}
        {onRequestOpenFile && <Button variant="subtle" size="icon" className={styles.action} aria-label={t('workspace.summary')} onClick={() => { onClose(); onRequestOpenFile(file.name); }}><Icon name="folder" size={18} /></Button>}
        <a className={styles.action} href={projectFileUrl(projectId, file.name)} download={file.name} aria-label={t('assistant.downloadFile')}><Icon name="download" size={18} /></a>
        <Button variant="subtle" size="icon" className={styles.action} aria-label={t('common.close')} onClick={onClose}><Icon name="close" size={20} /></Button>
      </header>
      <div className={styles.stage} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        {file.kind === 'video' ? <video key={file.name} src={source(projectId, file)} controls playsInline preload="metadata" aria-label={file.name} onError={() => setFailed(true)} />
          : <img key={file.name} ref={image} src={source(projectId, file)} alt={file.name} style={{ width: zoom === 1 ? undefined : `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? '100%' : 'none' }} onError={() => setFailed(true)} />}
      </div>
      {failed && <p role="alert" className={styles.status}>{t('chat.mediaPreviewFailed')}</p>}
      {copyStatus && <p role="status" className={styles.status}>{copyStatus}</p>}
      <footer className={styles.controls}>
        {files.length > 1 && <Button variant="subtle" size="icon" className={styles.action} disabled={index === 0} aria-label={t('designFiles.prev')} onClick={() => onNavigate(index - 1)}><Icon name="chevron-left" size={18} /></Button>}
        {file.kind === 'image' && <><Button variant="subtle" size="icon" className={styles.action} disabled={zoom <= 1 || failed} aria-label={t('fileViewer.zoomOut')} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</Button><Button variant="subtle" className={styles.action} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Button><Button variant="subtle" size="icon" className={styles.action} disabled={zoom >= 3 || failed} aria-label={t('fileViewer.zoomIn')} onClick={() => setZoom(value => Math.min(3, value + .5))}>+</Button></>}
        {files.length > 1 && <Button variant="subtle" size="icon" className={styles.action} disabled={index === files.length - 1} aria-label={t('designFiles.next')} onClick={() => onNavigate(index + 1)}><Icon name="chevron-right" size={18} /></Button>}
      </footer>
    </dialog>
  </div>, document.body);
}
