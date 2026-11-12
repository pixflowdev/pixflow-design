import { LoaderIcon } from 'lucide-react';
import { useT } from '../i18n';
import styles from './WorkspaceLoading.module.css';

/** Shared workspace and chat hydration indicator; keep mounted until all stages resolve. */
export function WorkspaceLoading() {
  const t = useT();
  return <div className={styles.loading} role="status" aria-live="polite">
    <div className={styles.indicator}>
      <LoaderIcon data-slot="spinner" className={styles.spinner} size={20} aria-hidden="true" />
      <span>{t('common.loading')}</span>
    </div>
  </div>;
}
