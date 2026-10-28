import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { IconLayoutSidebar } from '@tabler/icons-react';
import { useT } from '../i18n';
import { listChatHistory, readChatHistory, type SavedChatHistory } from './chat-history-client';
import { selectFloatingConversation } from './floating-conversation';
import styles from './FloatingChatMenu.module.css';

/** A view of the existing permission-filtered chat library, never a separate history. */
export function FloatingChatMenu() {
  const t = useT();
  const entry = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SavedChatHistory[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const header = entry.current?.closest('.pixflow-bricks-agent-panel')?.querySelector('.pixflow-bricks-agent-panel__head');
    if (!header) return;
    const slot = document.createElement('div');
    slot.className = `pixflow-design-token-scope ${styles.headerSlot}`;
    header.prepend(slot); setHeaderSlot(slot);
    setPanelHost(header.closest<HTMLElement>('.pixflow-bricks-agent-panel'));
    return () => { slot.remove(); };
  }, []);
  function close() {
    request.current?.abort(); generation.current++;
    setOpen(false); setPending(false);
  }
  async function load(before?: string | null) {
    const id = ++generation.current;
    setLoading(true); setError(false);
    try {
      const result = await listChatHistory(before);
      if (id !== generation.current) return;
      setRows(current => before ? [...current, ...result.conversations] : result.conversations);
      setCursor(result.hasMore ? result.nextCursor : null);
    } catch { if (id === generation.current) setError(true); }
    finally { if (id === generation.current) setLoading(false); }
  }
  function show() {
    setWaiting(false);
    const list = dialog.current?.querySelector('nav');
    if (list) list.scrollTop = 0;
    setOpen(true); void load();
  }
  useEffect(() => {
    if (!open) return;
    const header = panelHost?.querySelector('.pixflow-bricks-agent-panel__head');
    function position() {
      if (header && panelHost && dialog.current) dialog.current.style.setProperty('--header-height', `${header.getBoundingClientRect().bottom - panelHost.getBoundingClientRect().top}px`);
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    position(); const observer = new ResizeObserver(position);
    if (header) observer.observe(header);
    document.addEventListener('keydown', key);
    return () => { observer.disconnect(); document.removeEventListener('keydown', key); };
  }, [open, panelHost]);
  useEffect(() => () => { request.current?.abort(); generation.current++; }, []);
  async function choose(row: SavedChatHistory) {
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setPending(true); setWaiting(false); setError(false);
    try {
      await readChatHistory(row);
      if (controller.signal.aborted) return;
      await selectFloatingConversation(row, { signal: controller.signal, onWaiting: () => setWaiting(true) });
      if (!controller.signal.aborted) {
        window.dispatchEvent(new CustomEvent('pixflow-design:conversation-opened'));
        close();
      }
    } catch { if (!controller.signal.aborted) { setError(true); setPending(false); } }
  }
  const drawer = (<div ref={dialog} className={styles.layer} data-open={open} aria-hidden={!open} {...(!open ? { inert: '' } as Record<string, string> : {})}>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <div role="dialog" aria-label={t('chat.conversationsAria')} className={styles.drawer}>
      <header className={styles.header}><strong>{t('chat.conversationsAria')}</strong></header>
      <nav className={styles.list} aria-label={t('chat.conversationsAria')} aria-busy={loading || pending}>
        {rows.map(row => <Button variant="ghost" className={styles.row} key={`${row.projectId}:${row.conversationId}`} disabled={pending} onClick={() => void choose(row)} title={row.title || t('chat.conversationsAria')}><span>{row.title || t('chat.conversationsAria')}</span></Button>)}
        {!loading && !error && !rows.length && <p>{t('chat.emptyConversations')}</p>}
        {cursor && <Button variant="ghost" className={styles.more} disabled={loading || pending} onClick={() => void load(cursor)}>{t('history.moreChats')}</Button>}
      </nav>
      {(loading || pending) && <p className={styles.status} role="status"><span className={styles.spinner}/>{t(waiting ? 'history.switchWaiting' : 'common.loading')}</p>}
      {error && <div className={styles.status} role="alert">{t('history.switchError')}<Button variant="subtle" onClick={() => void load()}>{t('history.retry')}</Button></div>}
    </div></div>);
  const toggle = <Button variant="ghost" size="icon" aria-label={t('chat.conversationsAria')} title={t('chat.conversationsAria')} aria-haspopup="dialog" aria-expanded={open} onPointerDown={event => event.stopPropagation()} onClick={() => open ? close() : show()}><IconLayoutSidebar size={19} stroke={1.6}/></Button>;
  return <div ref={entry} className={styles.toolbar} data-header={Boolean(headerSlot)}>
    {headerSlot ? createPortal(toggle, headerSlot) : toggle}
    {panelHost ? createPortal(drawer, panelHost) : drawer}
  </div>;
}
