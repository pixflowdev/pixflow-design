import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useT } from '../../i18n';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { MediaView } from '../MediaView';
import styles from './GeneratedMedia.module.css';

type ChatImage = { attachmentId?: number; url: string; title: string };

function MediaDialog({ image, close }: { image?: ChatImage; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    return () => modal.close();
  }, []);
  return <dialog ref={dialog} className={styles.mediaDialog} aria-label={t('ui.mediaView.pixflowMedia')}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onKeyDown={event => event.stopPropagation()}>
    <div className={styles.mediaBody}>
      <MediaView onLeaveForSettings={close} attachmentId={image?.attachmentId} attachmentUrl={image?.url} headerAction={
        <Button variant="subtle" size="icon" className="direct-media-close" aria-label={t('common.close')} onClick={close}>
          <Icon name="close" size={18} />
        </Button>
      }/>
    </div>
  </dialog>;
}

/** The restored transcript can replace its rows while a visitor is browsing Media. */
export function openMediaLibrary(trigger: HTMLElement, image?: ChatImage, theme?: string) {
  const doc = trigger.ownerDocument;
  const host = doc.createElement('div');
  host.className = 'pixflow-design-portal-scope';
  const scope = trigger.closest<HTMLElement>('[data-theme]');
  host.dataset.theme = theme || scope?.dataset.theme || doc.documentElement.dataset.pixflowTheme || 'light';
  const source = doc.defaultView!.getComputedStyle(trigger);
  host.style.fontFamily = source.fontFamily;
  // Appearance updates target portal scopes too. Copy the initial custom accent
  // from the panel, leaving theme-dependent surface tokens to the stylesheet.
  for (const name of source) {
    if (name.startsWith('--accent') || name === '--selected' || name === '--selected-soft') {
      host.style.setProperty(name, source.getPropertyValue(name));
    }
  }
  doc.body.append(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
    const target = trigger.isConnected ? trigger : image && Array.from(doc.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]'))
      .find(button => button.querySelector('img')?.src === image.url);
    target?.focus({ preventScroll: true });
  };
  root.render(<I18nProvider><MediaDialog image={image} close={close} /></I18nProvider>);
}

export function ChatMediaAttachment({ image }: { image: ChatImage }) {
  const t = useT();
  return <button type="button" className={styles.attachment} aria-haspopup="dialog"
    aria-label={image.title || t('entry.navMedia')} onClick={event => openMediaLibrary(event.currentTarget, image)}>
    <img src={image.url} alt={image.title} loading="lazy" decoding="async" />
  </button>;
}
