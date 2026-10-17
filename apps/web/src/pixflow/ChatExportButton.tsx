import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import type { ChatHistoryBinding } from './chat-history-client';
import { downloadChatExport, prepareChatExport } from './chat-history-export';
import styles from './ChatExportButton.module.css';

/** The same complete, read-only export is available in Workspace and the Free panel. */
export function ChatExportButton({ binding }: { binding: ChatHistoryBinding }) {
  const t = useT();
  const active = useRef<AbortController | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'error' | 'done'>('idle');
  useEffect(() => {
    setCount(null); setStatus('idle');
    return () => { active.current?.abort(); active.current = null; };
  }, [binding.projectId, binding.conversationId]);
  useEffect(() => {
    if (status !== 'done') return;
    const timer = window.setTimeout(() => setStatus('idle'), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);
  const start = async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setCount(0); setStatus('idle');
    try {
      const result = await prepareChatExport(binding, controller.signal, value => {
        if (active.current === controller && !controller.signal.aborted) setCount(value);
      });
      if (active.current !== controller) return;
      downloadChatExport(result.blob, binding); setStatus('done');
    } catch {
      if (active.current === controller && !controller.signal.aborted) setStatus('error');
    } finally {
      if (active.current === controller) { active.current = null; setCount(null); }
    }
  };
  return <div className={styles.control}>
    <Button variant="subtle" disabled={count !== null} title={t('history.exportHint')} onClick={() => void start()}>{t(count !== null ? 'history.exporting' : 'history.export')}</Button>
    {count !== null && <span className={styles.status} role="status">{t('history.exportProgress', { count: String(count) })}</span>}
    {status !== 'idle' && <span className={styles.status} role={status === 'error' ? 'alert' : 'status'}>{t(status === 'error' ? 'history.exportError' : 'history.exportSuccess')}</span>}
  </div>;
}
