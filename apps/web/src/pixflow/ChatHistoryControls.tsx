import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import styles from './ChatHistoryControls.module.css';

export function ConversationTransitionStatus({active}: {active: boolean}) {
  const t = useT();
  return <div className={styles.continuing} hidden={!active} role="status" aria-live="polite"><Icon name="spinner" size={15} className="icon-spin" /><span>{t('history.continuingConversation')}</span></div>;
}

export function ChatHistoryControls({ hasMore, loading, error, loadEarlier, retry, recover, recovering, continuing = false }: {
  hasMore: boolean; loading: boolean; error: 'load' | 'save' | null;
  loadEarlier(): void | Promise<void>; retry(): void;
  recover?: (title: string) => Promise<void>; recovering?: boolean;
  continuing?: boolean;
}) {
  const t = useT();
  if (continuing && !error) return <ConversationTransitionStatus active />;
  if (!hasMore && !error) return null;
  return <div className={styles.controls}>
    {hasMore && <Button variant="subtle" disabled={loading} onClick={() => { void loadEarlier(); }}>{loading ? t('common.loading') : t('history.loadEarlier')}</Button>}
    {error && <div className={styles.error} role="status"><span>{t(error === 'save' ? 'history.saveError' : 'history.loadError')}</span><Button variant="subtle" onClick={retry}>{t('history.retry')}</Button></div>}
    {error === 'save' && recover && <div className={styles.error}><span>{t('history.recoveryExplanation')}</span><Button variant="subtle" disabled={recovering} onClick={() => { void recover(t('history.recoveryTitle')); }}>{t(recovering ? 'common.loading' : 'history.recoverCopies')}</Button></div>}
  </div>;
}
