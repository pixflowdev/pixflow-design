import { useT as usePixflowUiTranslation } from '../i18n';
import { useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { Icon } from './Icon';
import type { ComposerQueueItem } from './composer-queue';
import styles from './ComposerQueue.module.css';
import { pageAnnotationPreview } from '../pixflow/page-annotation';

/** Shared queue presentation; each chat surface retains ownership of delivery and persistence. */
export interface ComposerQueueModel {
  items: ComposerQueueItem[];
  error: string;
  paused: boolean;
  reorder: (id: string, targetId: string) => void;
  remove: (id: string) => void;
  resume: () => void;
  steer: (item: ComposerQueueItem) => unknown;
}

export function ComposerQueue({ queue, canSteer, busy = false, onEdit, canEdit = true, canReorder = true, canRemove = true, onSendNow }: {
  queue: ComposerQueueModel;
  canSteer: boolean;
  busy?: boolean;
  onEdit: (item: ComposerQueueItem) => void;
  canEdit?: boolean;
  canReorder?: boolean;
  canRemove?: boolean;
  onSendNow?: (id: string) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const dragId = useRef<string | null>(null);
  const pointer = useRef<{ id: string; x: number; y: number; target: string; active: boolean; rows: { id: string; top: number; height: number }[] } | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number; shifts: Record<string, number> } | null>(null);
  const items = queue.items.filter(item => item.state !== 'accepted');
  if (!items.length && !queue.error) return null;
  const editable = canReorder && items.every(item => item.state === 'queued');
  return <section className={styles.queue} aria-label={translateUi("ui.composerQueue.queuedMessages")}>
    <ol className={styles.list}>{items.map(item => <li key={item.id} className={styles.item} data-queue-id={item.id} data-dragging={drag?.id === item.id || undefined}
      style={drag ? { transform: `translateY(${drag.id === item.id ? drag.offset : drag.shifts[item.id] ?? 0}px)` } : undefined}
      onDragOver={event => { if (editable) event.preventDefault(); }}
      onDrop={event => { event.preventDefault(); if (dragId.current && editable) queue.reorder(dragId.current, item.id); dragId.current = null; }}>
        <span className={styles.leading}
          onPointerDown={event => {
            if (!editable || items.length < 2 || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rows = Array.from(event.currentTarget.closest('ol')?.querySelectorAll<HTMLElement>('[data-queue-id]') ?? []).map(row => {
              const box = row.getBoundingClientRect();
              return { id: row.dataset.queueId!, top: box.top, height: box.height };
            });
            pointer.current = { id: item.id, x: event.clientX, y: event.clientY, target: item.id, active: false, rows };
          }}
          onPointerMove={event => {
            const pending = pointer.current; if (!pending || pending.id !== item.id) return;
            if (!pending.active && Math.hypot(event.clientX-pending.x,event.clientY-pending.y) < 6) return;
            pending.active = true;
            const from = pending.rows.findIndex(row => row.id === pending.id);
            const source = pending.rows[from];
            if (!source) return;
            const offset = event.clientY - pending.y;
            const centre = source.top + source.height / 2 + offset;
            let to = from, distance = Infinity;
            pending.rows.forEach((row,index) => {
              const next = Math.abs(centre - (row.top + row.height / 2));
              if (next < distance) { distance = next; to = index; }
            });
            pending.target = pending.rows[to]!.id;
            const shifts: Record<string, number> = {};
            pending.rows.forEach((row,index) => {
              if (from < to && index > from && index <= to) shifts[row.id] = pending.rows[index - 1]!.top - row.top;
              if (from > to && index >= to && index < from) shifts[row.id] = pending.rows[index + 1]!.top - row.top;
            });
            setDrag({ id: pending.id, offset, shifts });
          }}
          onPointerUp={event => {
            const drag = pointer.current; pointer.current = null; setDrag(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if(drag?.active && editable) queue.reorder(drag.id,drag.target);
          }}
          onPointerCancel={() => {pointer.current=null;setDrag(null);}}
 draggable={editable && items.length > 1}
          role={editable && items.length > 1 ? 'button' : undefined} tabIndex={editable && items.length > 1 ? 0 : undefined}
          aria-label={editable && items.length > 1 ? translateUi("ui.composerQueue.reorderQueuedMessage") : undefined}
          title={translateUi("ui.composerQueue.dragToReorderUseArrowKeysWhen")}
          onDragStart={() => { dragId.current = item.id; }} onDragEnd={() => { dragId.current = null; }}
          onKeyDown={event => { const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; const target = items[items.indexOf(item) + offset]; if (offset && target && editable) { event.preventDefault(); queue.reorder(item.id, target.id); } }}>
          {item.state === 'sending' ? <Icon name="refresh" size={15} className={styles.spinner}/> : editable && items.length > 1 ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 4v11a4 4 0 0 0 4 4h12m-4-4 4 4-4 4M9 5h10M9 10h7"/></svg>}
        </span>
        <div className={styles.content} title={pageAnnotationPreview(item.prompt) || item.attachments.map(file => file.name).join(', ')}>
          <p>{pageAnnotationPreview(item.prompt) || item.attachments.map(file => file.name).join(', ') || translateUi("ui.composerQueue.attachedFiles")}</p>
          {(item.state === 'unconfirmed' || (item.state === 'queued' && item.message)) && <small role="status">{item.message || translateUi("ui.composerQueue.checkTheConversationBeforeSendingAgain")}</small>}
          {item.state === 'sending' && <span className={styles.srOnly} role="status">{translateUi("ui.composerQueue.sending")}</span>}
        </div>
        <div className={styles.actions}>
          {!busy && !canSteer && onSendNow && item.state === 'queued' && <Button variant="ghost" className={styles.steer} title={translateUi("chat.send")} onClick={() => onSendNow(item.id)}><Icon name="play" size={14}/>{translateUi("chat.send")}</Button>}
          {!busy && queue.paused && !onSendNow && !canSteer && item.state === 'queued' && <Button variant="ghost" title={translateUi("ui.composerQueue.sendThisQueuedMessageAndContinueThe")} onClick={() => { queue.reorder(item.id, items[0]!.id); queue.resume(); }}><Icon name="play" size={14}/>{translateUi("chat.send")}</Button>}
          {canSteer && item.state === 'queued' && <Button variant="ghost" className={styles.steer} title={translateUi("ui.composerQueue.submitWithoutInterruptingTheModel")} onClick={() => void queue.steer(item)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5v5a4 4 0 0 0 4 4h12m-5-5 5 5-5 5"/></svg>{translateUi("ui.composerQueue.steer")}</Button>}
          <Button variant="ghost" className={styles.iconAction} disabled={!canRemove || item.state === 'sending'} aria-label={translateUi("ui.composerQueue.deleteQueuedMessage")} onClick={() => queue.remove(item.id)}><Icon name="trash" size={14}/></Button>
          {item.state === 'queued' && <Button variant="ghost" className={styles.iconAction} disabled={!canEdit} aria-label={translateUi("ui.composerQueue.editQueuedMessage")} title={canEdit ? translateUi("ui.composerQueue.editInComposer") : translateUi("ui.composerQueue.sendOrClearYourCurrentDraftFirst")} onClick={() => onEdit(item)}><Icon name="edit" size={14}/></Button>}
        </div>
    </li>)}</ol>
    {queue.error && <p role="alert">{queue.error}</p>}
  </section>;
}
