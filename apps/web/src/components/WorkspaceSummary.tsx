import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import { IconLayoutSidebarRight, IconX, IconFile, IconPhoto, IconVideo, IconMusic, IconCode, IconDownload, IconChevronRight } from '@tabler/icons-react';
import type { ProjectFile } from '../types';
import { useT } from '../i18n';
import { fetchProjectFileText, projectFileUrl, projectRawUrl } from '../providers/registry';
import { GeneratedMedia } from './chat/GeneratedMedia';
import { WorkspaceLoading } from './WorkspaceLoading';
import styles from './WorkspaceSummary.module.css';

export function WorkspaceSummaryToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  return <Button variant="subtle" size="icon" className={styles.iconButton} title={t('workspace.summary')}
    aria-label={t('workspace.summary')} aria-expanded={open} aria-controls="pixflow-chat-summary" onClick={onToggle}>
    <IconLayoutSidebarRight size={18} stroke={1.5} />
  </Button>;
}

/** A chat-owned output summary. It never mounts the retired file workspace or mutates saved files. */
export function WorkspaceSummary({ open, projectId, files, selectedName, onSelect, onClose, destinationAction }: {
  open: boolean; projectId: string; files: ProjectFile[]; selectedName: string | null;
  onSelect: (name: string) => void; onClose: () => void; destinationAction?: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(true);
  // Imported catalogue metadata stays on disk but is not a user-generated output.
  const outputs = files.filter(file => file.type !== 'dir' && !/^plugin-assets[\\/]od-default[\\/]plugin-manifest\.json$/i.test(file.name));
  const selected = outputs.find(file => file.name === selectedName) ?? outputs[0];
  // Anchor the floating card to the visible chat viewport, independently of transcript scrolling.
  useLayoutEffect(() => {
    const element = panel.current;
    const viewport = element?.parentElement;
    if (!element || !viewport) return;
    const position = () => {
      const bounds = viewport.getBoundingClientRect();
      const top = Math.max(20, bounds.top + 56);
      element.style.setProperty('--summary-top', `${top}px`);
      element.style.setProperty('--summary-max-height', `${Math.max(0, window.innerHeight - top - 20)}px`);
    };
    position();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(viewport);
    window.addEventListener('resize', position);
    return () => { observer?.disconnect(); window.removeEventListener('resize', position); };
  }, []);
  useEffect(() => {
    panel.current?.toggleAttribute('inert', !open);
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault(); onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);
  return <aside ref={panel} id="pixflow-chat-summary" data-testid="workspace-summary" className={styles.panel} data-open={open} aria-hidden={!open} aria-labelledby={titleId}>
    <header className={styles.header}>
      <h2 id={titleId}>{t('workspace.summary')}</h2>
      <Button variant="subtle" size="icon" className={styles.iconButton} aria-label={t('common.close')} onClick={onClose}><IconX size={18} stroke={1.5} /></Button>
    </header>
    <div className={styles.scroll}>
      <Button variant="subtle" className={styles.sectionToggle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <IconChevronRight size={14} stroke={1.5} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
        <span>{t('workspace.summaryOutputs')}</span><span className={styles.count}>{outputs.length}</span>
      </Button>
      {expanded && <div className={styles.files}>
        {outputs.map(file => <div key={file.name} className={styles.row} data-selected={file.name === selected?.name}>
          <Button variant="subtle" className={styles.file} title={file.name} onClick={() => onSelect(file.name)} aria-pressed={file.name === selected?.name}>
            <span className={styles.fileIcon} aria-hidden="true"><OutputIcon kind={file.kind} /></span><span>{file.name}</span>
          </Button>
          <a className={styles.iconButton} href={projectFileUrl(projectId, file.name)} download={file.name} aria-label={`${t('assistant.downloadFile')}: ${file.name}`}><IconDownload size={15} stroke={1.5} /></a>
        </div>)}
        {outputs.length === 0 && <p className={styles.empty}>{t('workspace.summaryEmpty')}</p>}
      </div>}
      {open && selected && <section className={styles.preview} aria-label={t('fileViewer.preview')}>
        <OutputPreview key={`${projectId}:${selected.name}`} projectId={projectId} file={selected} />
      </section>}
    </div>
    {destinationAction && <footer className={styles.footer}>{destinationAction}</footer>}
  </aside>;
}

function OutputIcon({ kind }: { kind: ProjectFile['kind'] }) {
  const Icon = kind === 'image' ? IconPhoto : kind === 'video' ? IconVideo : kind === 'audio' ? IconMusic : kind === 'html' || kind === 'code' ? IconCode : IconFile;
  return <Icon size={15} stroke={1.5} />;
}

function OutputPreview({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const t = useT();
  const textFile = ['text', 'code'].includes(file.kind) && file.size <= 1_000_000;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(textFile);
  useEffect(() => {
    if (!textFile) return;
    let cancelled = false;
    setLoading(true);
    void fetchProjectFileText(projectId, file.name, { cacheBustKey: file.sha256 ?? file.mtime }).then(value => {
      if (!cancelled) setText(value);
    }).catch(() => { if (!cancelled) setText(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, file.name, file.mtime, file.sha256, textFile]);
  if (file.kind === 'image' || file.kind === 'video') return <GeneratedMedia files={[file]} projectId={projectId} compact />;
  if (file.kind === 'audio') return <audio controls preload="metadata" src={projectFileUrl(projectId, file.name)} aria-label={file.name} />;
  if (loading) return <div className={styles.previewLoading}><WorkspaceLoading /></div>;
  // Generated HTML is untrusted. Keep scripts, forms, popups and top navigation disabled.
  if (file.kind === 'html') return <iframe title={file.name} sandbox="" src={projectRawUrl(projectId, file.name)} referrerPolicy="no-referrer" />;
  if (text !== null) return <pre>{text}</pre>;
  return <p className={styles.empty}>{t('fileViewer.previewUnavailable')}</p>;
}
