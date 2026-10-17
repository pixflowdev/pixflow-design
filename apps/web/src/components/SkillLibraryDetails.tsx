import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { IconFileText, IconX } from '@tabler/icons-react';
import type { SkillLibraryItem, SkillLibraryPreview } from '@open-design/contracts';
import { useT } from '../i18n';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { useResolvedTheme } from './ConnectorLogo';
import { skillLibraryCategory, skillLibraryCategories } from './skill-library-categories';
import styles from './SkillLibraryDetails.module.css';

export function SkillLibraryDetails({ item, busy, actionError, onClose, onInstall }: {
  item: SkillLibraryItem; busy: boolean; actionError?: string; onClose: () => void; onInstall: () => void;
}) {
  const t = useT();
  const theme = useResolvedTheme();
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<SkillLibraryPreview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [path, setPath] = useState('SKILL.md');
  const invalidPreview = t('context.noMatches');
  useEffect(() => {
    const focused = document.activeElement;
    dialog.current?.showModal();
    return () => { if (focused instanceof HTMLElement && focused.isConnected) focused.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError(''); setPath('SKILL.md');
    const query = new URLSearchParams({ action: 'preview', id: item.id, digest: item.digest ?? '' });
    void pixflowWordPressRestFetch(`/skill-library?${query}`, { signal: controller.signal }).then(async response => {
      const data = await response.json() as SkillLibraryPreview & { error?: string };
      if (!response.ok) throw new Error(data.error || response.statusText);
      if (data.id !== item.id || data.digest !== item.digest || !data.files?.['SKILL.md']) throw new Error(invalidPreview);
      if (!controller.signal.aborted) setPreview(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); });
    return () => controller.abort();
  }, [item.id, item.digest, attempt, invalidPreview]);
  const paths = preview ? Object.keys(preview.files).sort((a, b) => a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)) : [];
  return createPortal(<div className="pixflow-design-portal-scope" data-theme={theme}>
    <dialog ref={dialog} className={styles.dialog} aria-label={item.name} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
      <header className={styles.header}><div><div className={styles.meta}><span>{t(skillLibraryCategories[skillLibraryCategory(item.id)].label)}</span><span>Pro</span><span>v{item.version}</span></div><h2>{item.name}</h2></div><Button variant="ghost" className={styles.close} aria-label={t('common.close')} onClick={onClose}><IconX size={19} stroke={1.5} /></Button></header>
      <p className={styles.description}>{preview?.description ?? item.description}</p>
      <div className={styles.previewHeading}><h3>{t('common.preview')}</h3>{preview && <span>{t('context.files')} · {paths.length}</span>}</div>
      <div className={styles.preview}>
        {error ? <div className={styles.status} role="alert"><p>{error}</p><Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>{t('workspaceSidebar.retry')}</Button></div>
          : !preview ? <div className={styles.status} role="status"><span className={styles.spinner} aria-hidden="true" /><span>{t('common.loading')}</span></div>
          : <><nav className={styles.files} aria-label={t('context.files')}>{paths.map(file => <Button key={file} variant="ghost" aria-pressed={file === path} onClick={() => setPath(file)} title={file}><IconFileText size={15} stroke={1.5} /><span>{file}</span></Button>)}</nav>
            <section className={styles.file} aria-label={path}><div className={styles.filename}>{path}</div><pre tabIndex={0}>{preview.files[path]}</pre></section></>}
      </div>
      {actionError && <p className={styles.actionError} role="alert">{actionError}</p>}<footer className={styles.footer}><span>{preview ? `${t('ui.pluginMetaSections.license')}: ${preview.license}` : ''}</span><div>{item.installedVersion && <span className={styles.installed}>{t('settings.libraryInstalled')} · {item.installedVersion}</span>}{(!item.installedVersion || item.updateAvailable) && <Button className={styles.install} disabled={busy || !item.canInstall || !preview} onClick={onInstall}>{busy ? t('common.loading') : item.updateAvailable ? t('skillLibrary.update') : t('settings.libraryInstallButton')}</Button>}</div></footer>
    </dialog>
  </div>, document.body);
}
