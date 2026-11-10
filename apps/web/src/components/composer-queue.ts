import { AnnotationUnavailableError } from '../pixflow/annotation-availability';
import { useEffect, useRef, useState } from 'react';
import type { ChatAttachment, ChatCommentAttachment } from '../types';
import type { ChatSendMeta, ChatSendOutcome } from './ChatComposer';
import type { PixflowDirectSiteSteerResponse } from '@open-design/contracts';
import { secureRandomUUID } from '../utils/uuid';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n/types';

// Persisted queue diagnostics stay stable; only their presentation is localized.
const QUEUE_MESSAGES: Record<string, keyof Dict> = {
  'Delivery was interrupted. Check the conversation before sending again.': 'ui.finalQueue.interrupted',
  'The queue could not be saved. Your message has been kept in the composer.': 'ui.finalQueue.saveFailed',
  'Could not start. Resume when ready.': 'ui.finalQueue.startFailed',
  'Check the conversation before retrying.': 'ui.finalQueue.retry',
  'Delivery could not be confirmed. Check the conversation before sending again.': 'ui.finalQueue.unconfirmed',
};

export interface ComposerQueueItem {
  id: string; prompt: string; attachments: ChatAttachment[]; comments: ChatCommentAttachment[]; meta?: ChatSendMeta;
  state: 'queued' | 'editing' | 'sending' | 'unconfirmed' | 'accepted'; message?: string;
}
interface QueueState { items: ComposerQueueItem[]; paused: boolean; steeringPauseIds?: string[] }
export function readComposerQueue(key: string): QueueState {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (Array.isArray(value?.items)) return { steeringPauseIds: Array.isArray(value.steeringPauseIds) && value.steeringPauseIds.every((id: unknown) => typeof id === 'string') && !value.items.some((item: ComposerQueueItem) => item.state === 'editing') ? value.steeringPauseIds : undefined, paused: value.paused || value.items.some((item: ComposerQueueItem) => ['sending', 'editing'].includes(item.state)), items: value.items.map((item: ComposerQueueItem) => item.state === 'editing' ? { ...item, state: 'queued' } : item.state === 'sending' ? { ...item, state: 'unconfirmed', message: 'Delivery was interrupted. Check the conversation before sending again.' } : item) };
  } catch { /* A corrupt or unavailable cache never submits a message. */ }
  return { items: [], paused: false };
}

/** Retain messages until dispatch is observed. Reloaded uncertain sends never auto-repeat. */
export function useComposerQueue(options: {
  key?: string; streaming: boolean; disabled: boolean; outcome?: string;
  /** Preparation can show activity before the provider owns the request. */
  requireAcceptance?: boolean;
  acceptedSteeringIds?: readonly string[];
  send: (prompt: string, attachments: ChatAttachment[], comments: ChatCommentAttachment[], meta?: ChatSendMeta, onAccepted?: () => void) => ChatSendOutcome | Promise<ChatSendOutcome>;
  steer?: (item: ComposerQueueItem) => Promise<PixflowDirectSiteSteerResponse>;
}) {
  const { t } = useI18n();
  const displayMessage = (message: string) => QUEUE_MESSAGES[message] ? t(QUEUE_MESSAGES[message]) : message;
  const [state, setState] = useState<QueueState>(() => options.key ? readComposerQueue(options.key) : { items: [], paused: false });
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const current = useRef(state), scope = useRef(options.key), busy = useRef<string | null>(null), wasStreaming = useRef(options.streaming);
  const latest = useRef(options); latest.current = options;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function update(next: QueueState) {
    if (options.key) sessionStorage.setItem(options.key, JSON.stringify(next));
    current.current = next; setState(next);
  }
  function change(fn: (value: QueueState) => QueueState) {
    try { update(fn(current.current)); setError(''); return true; }
    catch { setError('The queue could not be saved. Your message has been kept in the composer.'); return false; }
  }
  useEffect(() => {
    if (scope.current === options.key) return;
    scope.current = options.key; busy.current = null; wasStreaming.current = options.streaming;
    const next = options.key ? readComposerQueue(options.key) : { items: [], paused: false };
    current.current = next; setState(next);
  }, [options.key]);
  const receiptKey = JSON.stringify(options.acceptedSteeringIds ?? []);
  useEffect(() => {
    if (scope.current !== options.key) return;
    const accepted = new Set<string>(JSON.parse(receiptKey));
    if (!current.current.items.some(item => accepted.has(item.id))) return;
    // A reload can lose the HTTP acknowledgement while durable replay proves
    // delivery. Remove only receipted IDs; other uncertain work stays paused.
    if (busy.current && accepted.has(busy.current)) busy.current = null;
    change(value => {
      const items = value.items.filter(item => !accepted.has(item.id));
      const steeringPauseIds = value.steeringPauseIds?.filter(id => !accepted.has(id));
      // Durable acceptance resolves a delivery-only pause. A user stop, failed
      // run, edit or another uncertain message still owns its pause.
      const resolved = !!value.steeringPauseIds?.length && !steeringPauseIds?.length
        && (!options.outcome || ['succeeded', 'completed', 'answered', 'queued', 'running', 'streaming'].includes(options.outcome))
        && items.every(item => item.state === 'accepted' || (item.state === 'queued' && !item.message));
      return { ...value, items, steeringPauseIds, paused: resolved ? false : value.paused };
    });
  }, [options.key, receiptKey]);
  useEffect(() => {
    if (!options.key || scope.current !== options.key) return;
    if (options.streaming && busy.current && !options.requireAcceptance) {
      const id = busy.current; busy.current = null;
      change(value => ({ ...value, items: value.items.filter(item => item.id !== id) }));
    }
    const finished = wasStreaming.current && !options.streaming;
    wasStreaming.current = options.streaming;
    if (finished && options.requireAcceptance && busy.current) {
      const id = busy.current; busy.current = null;
      // Losing preparation/acceptance evidence is not permission to replay a
      // request. Keep its complete payload for an explicit, informed retry.
      change(value => ({ paused: true, items: value.items.map(item => item.id === id
        ? { ...item, state: 'unconfirmed', message: 'Delivery could not be confirmed. Check the conversation before sending again.' }
        : item) }));
      return;
    }
    if (finished && options.outcome && !['succeeded', 'completed', 'answered'].includes(options.outcome)) {
      change(value => ({ ...value, paused: true, steeringPauseIds: undefined })); return;
    }
    // A restored run owns the conversation before its stream reattaches. The
    // child queue effect must not start a second turn during parent hydration.
    const restoringRun = ['queued', 'running', 'streaming'].includes(options.outcome || '');
    if (options.streaming || restoringRun || options.disabled || current.current.paused || busy.current) return;
    const item = current.current.items.find(item => item.state !== 'accepted');
    if (!item || item.state !== 'queued') return;
    const key = options.key;
    busy.current = item.id;
    if (!change(value => ({ ...value, items: value.items.map(row => row.id === item.id ? { ...row, state: 'sending' } : row) }))) { busy.current = null; return; }
    const accepted = () => {
      if (!mounted.current || scope.current !== key || busy.current !== item.id) return;
      if (change(value => ({ ...value, items: value.items.filter(row => row.id !== item.id) }))) busy.current = null;
    };
    try {
      // Do not persist the callback in queue metadata: it belongs only to this
      // dispatch generation. Existing surfaces keep their streaming contract.
      const result = options.requireAcceptance
        ? latest.current.send(item.prompt, item.attachments, item.comments, item.meta, accepted)
        : latest.current.send(item.prompt, item.attachments, item.comments, item.meta);
      void Promise.resolve(result).then(result => {
        if (!mounted.current || scope.current !== key || busy.current !== item.id) return;
        if (result === 'restore-draft') {
          busy.current = null;
          change(value => ({ paused: true, items: value.items.map(row => row.id === item.id ? { ...row, state: 'queued', message: 'Could not start. Resume when ready.' } : row) }));
        }
      }, error => {
        if (!mounted.current || scope.current !== key || busy.current !== item.id) return;
        busy.current = null;
        change(value => ({ paused: true, items: value.items.map(row => row.id === item.id ? { ...row, state: error instanceof AnnotationUnavailableError ? 'queued' : 'unconfirmed', message: error instanceof AnnotationUnavailableError ? error.message : 'Check the conversation before retrying.' } : row) }));
      });
    } catch (error) {
      if (!mounted.current || scope.current !== key || busy.current !== item.id) return;
      busy.current = null;
      change(value => ({ paused: true, items: value.items.map(row => row.id === item.id ? { ...row, state: error instanceof AnnotationUnavailableError ? 'queued' : 'unconfirmed', message: error instanceof AnnotationUnavailableError ? error.message : 'Check the conversation before retrying.' } : row) }));
    }
  }, [options.key, options.streaming, options.disabled, options.outcome, options.requireAcceptance, state]);
  return {
    ...state,
    items: state.items.map(item => item.message ? { ...item, message: displayMessage(item.message) } : item),
    error: displayMessage(error),
    add: (prompt: string, attachments: ChatAttachment[], comments: ChatCommentAttachment[], meta?: ChatSendMeta) => change(value => ({
      ...value,
      // A failure with no pending deliveries must not pause a future, fresh queue.
      // Existing stopped or uncertain deliveries still require explicit resumption.
      paused: value.items.some(item => item.state !== 'accepted') ? value.paused : false,
      items: [...value.items, { id: secureRandomUUID(), prompt, attachments, comments, meta, state: 'queued' }],
    })),
    pause: () => change(value => ({ ...value, paused: true, steeringPauseIds: undefined })),
    resume: () => change(value => ({ ...value, paused: false, steeringPauseIds: undefined })),
    reorder: (id: string, targetId: string) => change(value => {
      const items = [...value.items];
      if (items.some(item => item.state !== 'queued' && item.state !== 'accepted')) return value;
      const from = items.findIndex(item => item.id === id), to = items.findIndex(item => item.id === targetId);
      if (from < 0 || to < 0 || from === to) return value;
      items.splice(to, 0, items.splice(from, 1)[0]!);
      return { ...value, items };
    }),
    remove: (id: string) => change(value => ({ ...value, items: value.items.filter(item => item.id !== id) })),
    takeForEditing: (id: string) => {
      const items = current.current.items;
      const index = items.findIndex(item => item.id === id && item.state === 'queued');
      if (index < 0) return null;
      const snapshot = { item: items[index]!, previousId: items[index - 1]?.id, nextId: items[index + 1]?.id };
      return change(value => ({ ...value, items: value.items.filter(item => item.id !== id) })) ? snapshot : null;
    },
    beginEdit: (id: string) => change(value => ({ ...value, items: value.items.map(item => item.id === id && item.state === 'queued' ? { ...item, state: 'editing' } : item) })),
    cancelEdit: (id: string) => change(value => ({ ...value, items: value.items.map(item => item.id === id && item.state === 'editing' ? { ...item, state: 'queued' } : item) })),
    edit: (id: string, prompt: string) => change(value => ({ ...value, items: value.items.map(item => item.id === id && (item.state === 'queued' || item.state === 'editing') ? { ...item, prompt, state: 'queued' } : item) })),
    steer: async (item: ComposerQueueItem) => {
      if (!options.steer || current.current.items.find(row => row.id === item.id)?.state !== 'queued') return;
      const key = options.key;
      if (!change(value => ({ ...value, items: value.items.map(row => row.id === item.id ? { ...row, state: 'sending' } : row) }))) return;
      let result: PixflowDirectSiteSteerResponse;
      try { result = await options.steer(item); }
      catch { result = { messageId: item.id, state: 'unconfirmed', message: 'Delivery could not be confirmed. Check the conversation before sending again.' }; }
      if (scope.current !== key || !current.current.items.some(row => row.id === item.id)) return;
      change(value => {
        const failed = !['accepted', 'queued'].includes(result.state);
        const steeringPauseIds = failed && (!value.paused || value.steeringPauseIds)
          ? [...new Set([...(value.steeringPauseIds ?? []), item.id])]
          : value.steeringPauseIds;
        return { ...value, steeringPauseIds, paused: value.paused || failed, items: value.items.map(row => row.id === item.id ? { ...row, state: result.state === 'rejected' ? 'queued' : result.state, message: result.message } : row) };
      });
    },
  };
}
