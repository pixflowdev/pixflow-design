import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { PixflowChatHistoryStorageUsage } from '@open-design/contracts';
import { useT } from '../i18n';
import { readChatStorageUsage } from '../pixflow/chat-history-export';
import { chatHistoryOwnerScope } from '../pixflow/chat-history-client';
import { ChatHistoryBrowser } from '../pixflow/ChatHistoryBrowser';
import styles from './ChatStorageSettings.module.css';

export function formatChatStorageBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  const unit = safe >= 1024 ** 3 ? 3 : safe >= 1024 ** 2 ? 2 : safe >= 1024 ? 1 : 0;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit ? 1 : 0 }).format(safe / 1024 ** unit)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
}

export function ChatStorageSettings() {
  const t = useT();
  const [snapshot, setSnapshot] = useState<{ owner: string; usage: PixflowChatHistoryStorageUsage } | null>(null);
  const usage = snapshot?.owner === chatHistoryOwnerScope() ? snapshot.usage : null;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const owner = chatHistoryOwnerScope();
    setLoading(true); setFailed(false);
    try {
      const result = await readChatStorageUsage(controller.signal);
      if (request.current === controller && owner === chatHistoryOwnerScope()) setSnapshot({ owner, usage: result });
    } catch { if (!controller.signal.aborted && request.current === controller) setFailed(true); }
    finally { if (request.current === controller) setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { request.current?.abort(); request.current = null; }; }, []);
  return <section className={styles.card} aria-labelledby="chat-storage-heading" aria-busy={loading}>
    <header className={styles.header}><div><h3 id="chat-storage-heading">{t('history.storageTitle')}</h3><p>{t('history.storageDescription')}</p></div><Button variant="subtle" disabled={loading} onClick={() => void refresh()}>{t('history.storageRefresh')}</Button></header>
    {failed && <p role="alert">{t('history.storageError')}</p>}
    {!usage && loading && <p role="status">{t('common.loading')}</p>}
    {usage && <>
      <div className={styles.overview}><strong>{formatChatStorageBytes(usage.storedMessageBytes)}</strong><span>{t('history.storageStored')}</span><small>{t('history.storageMessages', { messages: String(usage.messageCount), chats: String(usage.conversationCount) })}</small></div>
      <dl className={styles.metrics}>
        <div><dt>{t('history.storageOriginal')}</dt><dd>{formatChatStorageBytes(usage.logicalMessageBytes)}{usage.savedMessageBytes > 0 && <span className={styles.saving}>{t('history.storageSaved', { percent: String(Math.round(usage.savedMessageBytes / usage.logicalMessageBytes * 100)) })}</span>}</dd></div>
        <div><dt>{t('history.storageMetadata')}</dt><dd>{formatChatStorageBytes(usage.projectMetadataBytes)}</dd></div>
        <div><dt>{t('history.storageContext')}</dt><dd>{formatChatStorageBytes(usage.workingContextBytes)}</dd></div>
      </dl>
    </>}
    <p>{t('history.storageExclusions')}</p>
    <footer className={styles.footer}><ChatHistoryBrowser /></footer>
  </section>;
}
