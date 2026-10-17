import { useT } from '../i18n';
import styles from './WorkspaceLoading.module.css';

/** Shared workspace and chat hydration indicator; keep mounted until all stages resolve. */
export function WorkspaceLoading() {
  const t = useT();
  return <div className={styles.loading} role="status" aria-live="polite">
    <div className={styles.indicator}>
      <svg className={styles.spinner} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className={styles.track} cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span>{t('common.loading')}</span>
    </div>
  </div>;
}
