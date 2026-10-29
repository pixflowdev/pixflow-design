import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from './wordpress-context';
import { chatHistoryOwnerScope, historyMessageFingerprint, importChatHistory, mergeChatHistory, readChatHistory, resolveChatHistory, saveChatHistoryMessage, type ChatHistoryBinding, type HistoryMessage } from './chat-history-client';
import { historicalRecoveryCopy, preserveHistoryCopies } from './history-recovery';

/** The browser outbox is a recovery copy, never an expiring transcript cache. */
function readOutbox<T extends HistoryMessage>(key: string): { messages: T[]; readable: boolean; migrationIds?: string[] } {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    const messages = Array.isArray(value) ? value : value?.version === 1 ? value.messages : null;
    const migrationIds = Array.isArray(value) ? [] : value?.migrationIds;
    if (!Array.isArray(messages) || messages.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string')
      || !Array.isArray(migrationIds) || migrationIds.some(id => typeof id !== 'string')) return { messages: [], readable: false };
    return { messages: messages as T[], migrationIds, readable: true };
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
  const [recovering, setRecovering] = useState(false);
  const binding = useRef<ChatHistoryBinding | null>(null);
  const pending = useRef(new Map<string, T>());
  const migrationSnapshots = useRef(new Map<string, T>());
  const acknowledgedOutbox = useRef(new Map<string, string>());
  const writtenOutbox = useRef(new Map<string, string>());
  const removedOutbox = useRef(new Set<string>());
  const known = useRef(new Map<string, T>());
  const latest = useRef(messages); latest.current = messages;
  const hydrate = useRef(onHydrate); hydrate.current = onHydrate;
  const legacy = useRef(legacyMessages); legacy.current = legacyMessages;
  const importedCallback = useRef(onImported); importedCallback.current = onImported;
  const flushing = useRef(false);
  const refreshing = useRef(false);
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
      const shared = readOutbox<T>(outboxKey);
      if (!shared.readable) { setError('save'); return false; }
      // Another tab may have queued its final reply since this tab hydrated.
      // Remove only exact server acknowledgements, never unrelated identities.
      const merged = new Map(shared.messages.filter(item => !removedOutbox.current.has(item.id!)
        && acknowledgedOutbox.current.get(item.id!) !== historyMessageFingerprint(item)).map(item => [item.id!, item]));
      const displaced: T[] = [];
      for (const [id, item] of pending.current) {
        const prior = merged.get(id);
        if (prior && historyMessageFingerprint(prior) !== historyMessageFingerprint(item)
          && historyMessageFingerprint(prior) !== writtenOutbox.current.get(id)
          && historyMessageFingerprint(prior) !== historyMessageFingerprint(known.current.get(id) || {})) displaced.push(prior);
        merged.set(id, item);
      }
      if (displaced.length) {
        // Preserve an alternate from another writer before replacing its slot.
        // Do not auto-replay it, change its identity, or prune unacknowledged data.
        // A failed archive write leaves the original outbox untouched.
        const archiveKey = `${outboxKey}:alternates`;
        const archive = readOutbox<T>(archiveKey);
        if (!archive.readable) { setError('save'); return false; }
        const copies = [...archive.messages];
        const fingerprints = new Set(copies.map(historyMessageFingerprint));
        for (const item of displaced) if (!fingerprints.has(historyMessageFingerprint(item))) {
          copies.push(item); fingerprints.add(historyMessageFingerprint(item));
        }
        localStorage.setItem(archiveKey, JSON.stringify(copies));
      }
      if (merged.size) {
        const messages = [...merged.values()];
        const inheritedMigration = new Set(shared.migrationIds);
        const migrationIds = messages.filter(item => pending.current.has(item.id!)
          ? migrationSnapshots.current.get(item.id!) === item : inheritedMigration.has(item.id!)).map(item => item.id!);
        // A crash-safe migration copy is insert-only input, not an unsaved edit.
        // Carry that provenance across tabs until its import is acknowledged.
        localStorage.setItem(outboxKey, JSON.stringify(migrationIds.length ? { version: 1, messages, migrationIds } : messages));
      }
      else localStorage.removeItem(outboxKey);
      writtenOutbox.current = new Map([...pending.current].map(([id, item]) => [id, historyMessageFingerprint(item)]));
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
        let saved: T;
        try {
          saved = await saveChatHistoryMessage(target, snapshot);
        } catch {
          // Each identity has its own revision. Preserve a conflicting recovery
          // copy, but do not let it prevent unrelated replies from being saved.
          failed = true;
          if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
          setError('save');
          continue;
        }
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        const prior = known.current.get(id);
        known.current.set(id, saved);
        acknowledgedOutbox.current.set(id, historyMessageFingerprint(snapshot));
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
    acknowledgedOutbox.current = new Map(); writtenOutbox.current = new Map(); removedOutbox.current = new Set();
    const recovery = readOutbox<T>(outboxKey);
    readableOutbox.current = recovery.readable;
    if (!recovery.readable) {
      // Do not replace a record we could not inspect. A browser/storage failure
      // is not evidence that the recovery copy is empty or disposable.
      pending.current = new Map(); setError('save'); setLoading(false);
      return () => { generation.current++; };
    }
    pending.current = new Map(recovery.messages.map(item => [item.id!, item]));
    const migrationIds = new Set(recovery.migrationIds);
    const recoveredIds = new Set([...pending.current.keys()].filter(id => !migrationIds.has(id)));
    for (const item of initialLegacy) if (item.id && !pending.current.has(item.id)) pending.current.set(item.id, item);
    for (const item of initial) if (item.id && !pending.current.has(item.id)) pending.current.set(item.id, item);
    const migrationCopies = new Map(pending.current);
    migrationSnapshots.current = new Map([...migrationCopies].filter(([id]) => !recoveredIds.has(id)));
    persistOutbox();
    void (async () => {
      try {
        const hasMessages = initial.length > 0 || initialLegacy.length > 0 || pending.current.size > 0;
        const target = hasMessages ? await resolveChatHistory({ sessionKey }) : await resolveChatHistory({ sessionKey, create: false });
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        if (!target.projectId || !target.conversationId) {
          // A confirmed empty lookup is ready for its first message. Adopt the
          // current transcript without creating a server chat or losing input
          // that arrived while the lookup was pending.
          setEmptyLookup(true);
          hydrate.current?.(latest.current);
          setReadyKey(sessionKey); setError(null);
          return;
        }
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
        removedOutbox.current = deleted;
        for (const id of deleted) pending.current.delete(id);
        for (const item of [...imported.messages, ...page.messages]) known.current.set(item.id!, item);
        for (const [id, snapshot] of pending.current) {
          const canonical = known.current.get(id);
          if (canonical && historyMessageFingerprint(canonical) === historyMessageFingerprint(snapshot)) {
            acknowledgedOutbox.current.set(id, historyMessageFingerprint(snapshot)); pending.current.delete(id);
          }
          // An unchanged legacy cache was insert-only input, never an edit.
          else if (!recoveredIds.has(id) && migrationCopies.get(id) === snapshot) {
            acknowledgedOutbox.current.set(id, historyMessageFingerprint(snapshot)); pending.current.delete(id);
          }
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

  // Passive tabs consume server revisions; they must never replay an observed
  // reply as a local edit or replace an unacknowledged local snapshot.
  useEffect(() => {
    if (!active || readyKey !== sessionKey) return;
    const owner = generation.current;
    const controller = new AbortController();
    const refresh = async () => {
      const target = binding.current;
      if (!target || refreshing.current || initialOwner.current !== chatHistoryOwnerScope()) return;
      refreshing.current = true;
      try {
        const page = await readChatHistory<T>(target);
        if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        for (let index = 0; index < page.messages.length; index++) {
          const item = page.messages[index];
          if (!item) continue;
          const execution = item as T & { runId?: string; runStatus?: string; endedAt?: number };
          if (!execution.runId || execution.endedAt || !['queued', 'running'].includes(execution.runStatus || '') || pending.current.has(item.id!)) continue;
          const prior = known.current.get(item.id!);
          const local = latest.current.find(message => message.id === item.id);
          if (local && (!prior || historyMessageFingerprint(local) !== historyMessageFingerprint(prior))) continue;
          const { recoverCompletedWorkspaceRun } = await import('./completed-workspace-run');
          const recovered = await recoverCompletedWorkspaceRun(target, item, controller.signal);
          if (controller.signal.aborted || owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
          const current = latest.current.find(message => message.id === item.id);
          if (current && (!prior || historyMessageFingerprint(current) !== historyMessageFingerprint(prior))) continue;
          if (recovered && !pending.current.has(item.id!)) {
            // Revision-checked write: an active owner or another tab wins a race.
            // Failed replay never replaces the existing partial transcript.
            try { page.messages[index] = await saveChatHistoryMessage(target, recovered); } catch { /* Next refresh reads the winning revision. */ }
          }
        }
        if (controller.signal.aborted || owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
        const accepted = page.messages.filter(item => {
          if (!item.id || pending.current.has(item.id)) return false;
          const prior = known.current.get(item.id);
          const local = latest.current.find(message => message.id === item.id);
          if (local && (!prior || historyMessageFingerprint(local) !== historyMessageFingerprint(prior))) return false;
          return !prior || Number(item.historyRevision || 0) > Number(prior.historyRevision || 0);
        });
        if (!accepted.length) return;
        for (const item of accepted) known.current.set(item.id!, item);
        const merged = mergeChatHistory(latest.current, accepted);
        latest.current = merged;
        setHistory(current => mergeChatHistory(current, accepted));
        hydrate.current?.(merged);
      } catch { /* Keep the last readable history; a background read is not a save failure. */ }
      finally { refreshing.current = false; }
    };
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 15000);
    void refresh();
    return () => {
      controller.abort();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [active, readyKey, sessionKey]);

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
  const recover = useCallback(async (title: string) => {
    if (!binding.current || flushing.current || recovering) return;
    const owner = generation.current;
    const target = binding.current;
    const captured = [...pending.current.values()];
    const archive = readOutbox<T>(`${outboxKey}:alternates`);
    if (!archive.readable) { setError('save'); return; }
    setRecovering(true);
    try {
      await preserveHistoryCopies(target, [...captured, ...archive.messages.map(historicalRecoveryCopy)], title);
      if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
      const canonical = await importChatHistory(target, captured);
      if (owner !== generation.current || initialOwner.current !== chatHistoryOwnerScope()) return;
      const accepted = new Map(canonical.messages.map(item => [item.id, item as T]));
      for (const snapshot of captured) {
        const saved = accepted.get(snapshot.id);
        if (!saved || pending.current.get(snapshot.id!) !== snapshot) continue;
        acknowledgedOutbox.current.set(snapshot.id!, historyMessageFingerprint(snapshot));
        pending.current.delete(snapshot.id!); known.current.set(snapshot.id!, saved);
      }
      const restored = latest.current.map(item => {
        const before = captured.find(snapshot => snapshot.id === item.id);
        return before && historyMessageFingerprint(before) === historyMessageFingerprint(item)
          ? accepted.get(item.id) || item : item;
      });
      latest.current = restored; hydrate.current?.(restored);
      setHistory(current => mergeChatHistory(current, canonical.messages as T[]));
      if (persistOutbox() && !pending.current.size) setError(null);
    } catch { if (owner === generation.current) setError('save'); }
    finally { if (owner === generation.current) setRecovering(false); }
  }, [outboxKey, persistOutbox, recovering]);
  return {
    binding: readyKey === sessionKey ? binding.current : null,
    ready: active && readyKey === sessionKey,
    messages: readyKey === sessionKey ? mergeChatHistory(history, messages) : messages,
    acknowledged: readyKey === sessionKey && !error && pending.current.size === 0,
    hasMore, loading, error, loadEarlier, recover, recovering,
    retry: () => { if (binding.current && pending.current.size) void flush(); else setRetryCount(value => value + 1); },
  };
}
