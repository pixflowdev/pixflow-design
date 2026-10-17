import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { SharedChatRows, type SharedChatInputMessage } from '../components/shared-chat/SharedChatRows';
import { listChatHistory, mergeChatHistory, readChatHistory, type SavedChatHistory } from './chat-history-client';
import styles from './ChatHistoryBrowser.module.css';
import { exactDateTime } from '../utils/chatTime';
import { CenteredLoader } from '../components/Loading';
import { ChatExportButton } from './ChatExportButton';

/** History browsing never changes the live editor, draft, run or conversation owner. */
export function ChatHistoryBrowser() {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const failedBefore = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SavedChatHistory | null>(null);
  const [conversations, setConversations] = useState<SavedChatHistory[]>([]);
  const [messages, setMessages] = useState<SharedChatInputMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !anchor.current) return;
    body.scrollTop = anchor.current.top + body.scrollHeight - anchor.current.height;
    anchor.current = null;
  }, [messages]);
  async function load(target: SavedChatHistory | null, before?: string | null) {
    const owner = ++requestId.current;
    setLoading(true); setFailed(false);
    try {
      if (target) {
        const result = await readChatHistory<SharedChatInputMessage>(target, before);
        if (owner !== requestId.current) return;
        if (before && bodyRef.current) anchor.current = { top: bodyRef.current.scrollTop, height: bodyRef.current.scrollHeight };
        setMessages(current => before ? mergeChatHistory(result.messages, current) : result.messages);
        setCursor(result.hasMore ? result.nextCursor : null);
      } else {
        const result = await listChatHistory(before);
        if (owner !== requestId.current) return;
        setConversations(current => before ? [...current, ...result.conversations] : result.conversations);
        setCursor(result.hasMore ? result.nextCursor : null);
      }
    } catch { if (owner === requestId.current) { failedBefore.current = before || null; setFailed(true); } }
    finally { if (owner === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    if (!open) { requestId.current++; dialog.current?.close(); return; }
    dialog.current?.showModal();
    setSelected(null); setMessages([]); setCursor(null); void load(null);
  }, [open]);
  const choose = (conversation: SavedChatHistory | null) => {
    setSelected(conversation); setMessages([]); setCursor(null); void load(conversation);
  };
  return <div className={styles.entry}>
    <Button variant="subtle" onClick={() => setOpen(true)}>{t('chat.conversationsAria')}</Button>
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className={styles.header}>
        <div><h2>{selected?.title || t('chat.conversationsAria')}</h2><span>{t('critiqueTheater.readOnly')}</span></div>
        {open && selected && <ChatExportButton key={`${selected.projectId}:${selected.conversationId}`} binding={selected} />}
        <Button variant="subtle" onClick={() => setOpen(false)}>{t('common.close')}</Button>
      </header>
      <div ref={bodyRef} className={styles.body}>
        {selected && <Button variant="subtle" onClick={() => choose(null)}>{t('chat.conversationsAria')}</Button>}
        {failed && <p role="status">{t('history.loadError')} <Button variant="subtle" onClick={() => { void load(selected, failedBefore.current); }}>{t('history.retry')}</Button></p>}
        {loading && <div className={styles.loading}><CenteredLoader label={t('common.loading')} /></div>}
        {selected ? <>
          {cursor && <Button variant="subtle" disabled={loading} onClick={() => { void load(selected, cursor); }}>{t('history.loadEarlier')}</Button>}
          <SharedChatRows messages={messages} projectId={selected.projectId} t={t} />
        </> : <div className={styles.list}>
          {!loading && !failed && !conversations.length && <p>{t('chat.emptyConversations')}</p>}
          {conversations.map(conversation => <Button variant="subtle" key={`${conversation.projectId}:${conversation.conversationId}`} onClick={() => choose(conversation)}><span>{conversation.title || t('chat.conversationsAria')}</span>{conversation.updatedAt > 0 && <time dateTime={new Date(conversation.updatedAt).toISOString()}>{exactDateTime(conversation.updatedAt)}</time>}</Button>)}
          {cursor && <Button variant="subtle" disabled={loading} onClick={() => { void load(null, cursor); }}>{t('history.loadEarlier')}</Button>}
        </div>}
      </div>
    </dialog>
  </div>;
}
