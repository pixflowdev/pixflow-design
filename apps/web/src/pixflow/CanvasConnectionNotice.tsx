import { useT as usePixflowUiTranslation } from '../i18n';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
type Notice = { title: string; message: string; detail: string; retrying: boolean };
import styles from './CanvasConnectionNotice.module.css';

/** Quiet connection guidance; transport diagnostics stay available on demand. */
export function CanvasConnectionNotice({ notice }: { notice: Notice }) {
  const translateUi = usePixflowUiTranslation();
  const Glyph = notice.retrying ? IconRefresh : IconInfoCircle;
  return <aside className={styles.notice}>
    <Glyph size={16} stroke={1.7} aria-hidden="true" className={styles.icon} />
    <div className={styles.body}>
      <div role="status" aria-live="polite">
        <strong className={styles.title}>{notice.title}</strong>
        <p className={styles.message}>{notice.message}</p>
      </div>
      <details className={styles.details}>
        <summary>{translateUi("ui.composioSiteApps.connectionDetails")}</summary>
        <p>{notice.detail}</p>
      </details>
    </div>
  </aside>;
}
