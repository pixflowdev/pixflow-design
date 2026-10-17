import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from './wordpress-context';
import { chatHistoryOwnerScope, historyMessageFingerprint, importChatHistory, mergeChatHistory, readChatHistory, resolveChatHistory, saveChatHistoryMessage, type ChatHistoryBinding, type HistoryMessage } from './chat-history-client';

/** The browser outbox is a recovery copy, never an expiring transcript cache. */
function readOutbox<T extends HistoryMessage>(key: string): { messages: T[]; readable: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string')) return { messages: [], readable: false };
    return { messages: value as T[], readable: true };
  } catch { return { messages: [], readable: false }; }
}
export function useDurableChatHistory<T extends HistoryMessage>({ sessionKey, messages, onHydrate, enabled = true, scrollRef, legacyMessages, onImported }: {
  sessionKey: string; messages: T[]; onHydrate?: (messages: T[]) => void; enabled?: boolean; scrollRef?: RefObject<HTMLDivElement>;
  legacyMessages?: T[]; onImported?: (ids: string[]) => void;
}) {
  const initialOwner = useRef(chatHistoryOwnerScope());
  const active = enabled && hasPixflowWordPressContext() && initialOwner.current === chatHistoryOwnerScope();
  const [history, setHistory] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [readyKey, setReadyKey] = useState('');
  const [emptyLookup, setEmptyLookup] = useState(false);
  const binding = useRef<ChatHistoryBinding | null>(null);
  const pending = useRef(new Map<string, T>());
  const known = useRef(new Map<string, T>());
  const latest = useRef(messages); latest.current = messages;
  const hydrate = useRef(onHydrate); hydrate.current = onHydrate;
  const legacy = useRef(legacyMessages); legacy.current = legacyMessages;
  const importedCallback = useRef(onImported); importedCallback.current = onImported;
  const flushing = useRef(false);
  const generation = useRef(0);
  const readableOutbox = useRef(false);
  const scrollAnchor = useRef<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = scrollRef?.current;
    if (!node || !scrollAnchor.current) return;
    node.scrollTop = scrollAnchor.current.top + node.scrollHeight - scrollAnchor.current.height;
    scrollAnchor.current = null;
  }, [history, scrollRef]);
  const owner = getPixflowWordPressConfig();
  const outboxKey = `pixflow:chat-history-outbox:${owner?.siteHash || owner?.siteUrl || owner?.restBaseUrl}:${owner?.userId || 'current'}:${sessionKey}`;
  const persistOutbox = useCallback(() => {
    if (!readableOutbox.current) { setError('save'); return false; }
    try {
      if (pending.current.size) localStorage.setItem(outboxKey, JSON.stringify([...pending.current.values()]));
      else localStorage.removeItem(outboxKey);
      return true;
    } catch { setError('save'); return false; }
  }, [outboxKey]);
  const flush = useCallback(async (): Promise<void> => {
    if (!binding.current || flushing.current) return;
    const owner = generation.current;
    const target = binding.current;
    if (initialOwner.current !== chatHistoryOwnerScope()) return;
    flushing.current = true;
    let failed = false;
    try {
      for (const [id, snapshot] of [...pending.current]) {
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        const saved = await saveChatHistoryMessage(target, snapshot);
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        const prior = known.current.get(id);
        known.current.set(id, saved);
        setHistory(current => mergeChatHistory(current, [saved]));
        const live = latest.current.find(item => item.id === id);
        if (live && (historyMessageFingerprint(live) === historyMessageFingerprint(snapshot)
          || (prior && historyMessageFingerprint(live) === historyMessageFingerprint(prior)))) {
          const merged = latest.current.map(item => item.id === id ? saved : item);
          latest.current = merged;
          hydrate.current?.(merged);
        }
        if (pending.current.get(id) === snapshot) pending.current.delete(id);
        else {
          const queued = pending.current.get(id);
          if (queued) pending.current.set(id, { ...queued, historyRevision: saved.historyRevision });
        }
        persistOutbox();
      }
      if (pending.current.size === 0) setError(null);
    } catch { failed = true; if (owner === generation.current) setError('save'); }
    finally {
      if (owner === generation.current) {
        flushing.current = false;
        if (!failed && pending.current.size) window.setTimeout(() => { if (owner === generation.current) void flush(); }, 400);
      }
    }
  }, [persistOutbox]);

  useEffect(() => {
    if (!active) return;
    const owner = ++generation.current;
    binding.current = null; flushing.current = false;
    setReadyKey(''); setHistory([]); setHasMore(false); setCursor(null); setLoading(true);
    const initial = latest.current;
    const initialLegacy = legacy.current || [];
    known.current = new Map(initial.filter(item => item.id).map(item => [item.id!, item]));
    const recovery = readOutbox<T>(outboxKey);
    readableOutbox.current = recovery.readable;
    if (!recovery.readable) {
      // Do not replace a record we could not inspect. A browser/storage failure
      // is not evidence that the recovery copy is empty or disposable.
      pending.current = new Map(); setError('save'); setLoading(false);
      return () => { generation.current++; };
    }
    pending.current = new Map(recovery.messages.map(item => [item.id!, item]));
    const recoveredIds = new Set(pending.current.keys());
    for (const item of initialLegacy) if (item.id && !pending.current.has(item.id)) pending.current.set(item.id, item);
    for (const item of initial) if (item.id && !pending.current.has(item.id)) pending.current.set(item.id, item);
    const migrationCopies = new Map(pending.current);
    persistOutbox();
    void (async () => {
      try {
        const hasMessages = initial.length > 0 || initialLegacy.length > 0 || pending.current.size > 0;
        const target = hasMessages ? await resolveChatHistory({ sessionKey }) : await resolveChatHistory({ sessionKey, create: false });
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        if (!target.projectId || !target.conversationId) { setEmptyLookup(true); return; }
        setEmptyLookup(false);
        // Import only missing identities. A restored interrupted browser snapshot
        // must never downgrade a completed message already held by WordPress.
        const legacyCandidates = initialLegacy;
        // Preserve untouched legacy payloads before presentation reconciliation
        // converts an interrupted run or sanitizes a rendered event list.
        if (legacyCandidates.length) await importChatHistory(target, legacyCandidates);
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        const importCandidates = mergeChatHistory(legacyCandidates, mergeChatHistory(initial, [...pending.current.values()]));
        const imported = await importChatHistory(target, importCandidates);
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        importedCallback.current?.(importCandidates.map(item => item.id!).filter(Boolean));
        const page = await readChatHistory<T>(target);
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        binding.current = target;
        const deleted = new Set(imported.deletedMessageIds);
        for (const id of deleted) pending.current.delete(id);
        for (const item of [...imported.messages, ...page.messages]) known.current.set(item.id!, item);
        for (const [id, snapshot] of pending.current) {
          const canonical = known.current.get(id);
          if (canonical && historyMessageFingerprint(canonical) === historyMessageFingerprint(snapshot)) pending.current.delete(id);
          // An unchanged legacy cache was insert-only input, never an edit.
          else if (!recoveredIds.has(id) && migrationCopies.get(id) === snapshot) pending.current.delete(id);
        }
        const changed = latest.current.filter(item => item.id && !deleted.has(item.id) && historyMessageFingerprint(item) !== historyMessageFingerprint(initial.find(old => old.id === item.id) || {})).map(item => {
          const baseline = initial.find(old => old.id === item.id);
          const canonical = known.current.get(item.id!);
          return baseline && canonical && historyMessageFingerprint(baseline) === historyMessageFingerprint(canonical)
            ? { ...item, historyRevision: canonical.historyRevision } : item;
        });
        const initialIds = new Set([...initial.map(item => item.id), ...recoveredIds]);
        const restored = mergeChatHistory(initial.filter(item => !deleted.has(item.id || '')), [...imported.messages.filter(item => initialIds.has(item.id)), ...page.messages]);
        const combined = mergeChatHistory(restored, changed);
        setHistory(combined); setCursor(page.nextCursor); setHasMore(page.hasMore);
        hydrate.current?.(combined);
        for (const item of changed) pending.current.set(item.id!, item);
        persistOutbox(); setReadyKey(sessionKey); setError(null);
        await flush();
      } catch { if (owner === generation.current) setError('load'); }
      finally { if (owner === generation.current) setLoading(false); }
    })();
    return () => { generation.current++; };
  // Retry reads the same durable outbox; it never clears an unacknowledged write.
  }, [active, sessionKey, retryCount]);

  useEffect(() => {
    if (active && emptyLookup && messages.length > 0) { setEmptyLookup(false); setRetryCount(value => value + 1); }
  }, [active, emptyLookup, messages.length]);

  useEffect(() => {
    if (!active) return;
    for (const item of messages) {
      if (!item.id) continue;
      const previous = known.current.get(item.id);
      if (previous && historyMessageFingerprint(previous) === historyMessageFingerprint(item)) continue;
      // Never borrow a newer server revision for a snapshot produced by an old
      // tab. Only acknowledgements of this outbox may advance its expected CAS.
      pending.current.set(item.id, item);
    }
    if (!pending.current.size) return;
    persistOutbox();
    if (readyKey !== sessionKey) return;
    const timer = window.setTimeout(() => { void flush(); }, 400);
    return () => window.clearTimeout(timer);
  }, [active, messages, readyKey, sessionKey, flush, persistOutbox]);

  useEffect(() => {
    if (!active) return;
    const retry = () => { if (binding.current) void flush(); else setRetryCount(value => value + 1); };
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', retry);
    const timer = window.setInterval(retry, 15000);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('pagehide', retry); window.clearInterval(timer); };
  }, [active, flush]);

  const loadEarlier = useCallback(async () => {
    if (!binding.current || !cursor || loading) return;
    const owner = generation.current;
    setLoading(true);
    try {
      const page = await readChatHistory<T>(binding.current, cursor);
      if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
      const node = scrollRef?.current;
      if (node) scrollAnchor.current = { top: node.scrollTop, height: node.scrollHeight };
      setHistory(current => mergeChatHistory(page.messages, current));
      setCursor(page.nextCursor); setHasMore(page.hasMore); setError(null);
    } catch { if (owner === generation.current) setError('load'); }
    finally { if (owner === generation.current) setLoading(false); }
  }, [cursor, loading, scrollRef]);
  return {
    messages: readyKey === sessionKey ? mergeChatHistory(history, messages) : messages,
    acknowledged: readyKey === sessionKey && !error && pending.current.size === 0,
    hasMore, loading, error, loadEarlier,
    retry: () => { if (binding.current && pending.current.size) void flush(); else setRetryCount(value => value + 1); },
  };
}
