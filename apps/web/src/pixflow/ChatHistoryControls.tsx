import { Button } from '@open-design/components';
import { useT } from '../i18n';
import styles from './ChatHistoryControls.module.css';

export function ChatHistoryControls({ hasMore, loading, error, loadEarlier, retry }: {
  hasMore: boolean; loading: boolean; error: 'load' | 'save' | null;
  loadEarlier(): void | Promise<void>; retry(): void;
}) {
  const t = useT();
  if (!hasMore && !error) return null;
  return <div className={styles.controls}>
    {hasMore && <Button variant="subtle" disabled={loading} onClick={() => { void loadEarlier(); }}>{loading ? t('common.loading') : t('history.loadEarlier')}</Button>}
    {error && <div className={styles.error} role="status"><span>{t(error === 'save' ? 'history.saveError' : 'history.loadError')}</span><Button variant="subtle" onClick={retry}>{t('history.retry')}</Button></div>}
  </div>;
}
