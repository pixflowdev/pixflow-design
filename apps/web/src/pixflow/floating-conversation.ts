import { useEffect, useState } from 'react';
import { rememberLastActiveChat, restoreLastActiveChat } from './last-active-chat';
import { directTabStorageKey } from './direct-tab-storage';
import { mergeChatHistory, resolveChatHistory, type HistoryMessage } from './chat-history-client';
import type { AppConfig } from '../types';
import { conversationBinding, conversationSessionKey } from './conversation-address';
import type { PixflowChatHistoryBinding } from '@open-design/contracts';
import { randomUUID } from '../utils/uuid';

const executionKey = () => directTabStorageKey('pixflow:floating-execution:v1');
/** Only execution choices cross documents. Credentials, CLI environment and personal data never do. */
function executionSelection(config: AppConfig) {
  const agentModels = Object.fromEntries(Object.entries(config.agentModels ?? {}).map(([id, value]) => [id, {
    model: value.model, reasoning: value.reasoning, fastMode: value.fastMode,
  }]));
  return {mode:config.mode,agentId:config.agentId,agentModels,apiProtocol:config.apiProtocol,
    apiTransport:config.apiTransport,composioProvider:config.composioProvider,composioModel:config.composioModel,model:config.model};
}
export function rememberFloatingExecution(config: AppConfig): void {
  try { sessionStorage.setItem(executionKey(), JSON.stringify(executionSelection(config))); } catch { /* Existing saved settings remain available. */ }
}

export function withFloatingExecution(config: AppConfig): AppConfig {
  if (!readFloatingConversation()) return config;
  try {
    const value = JSON.parse(sessionStorage.getItem(executionKey()) || 'null');
    if (!value || !['api','daemon'].includes(value.mode)) return config;
    return {...config, ...executionSelection(value)};
  } catch { return config; }
}

/** Recovery receipts supply missing rows; hydrated history owns existing revisions and payloads. */
export function mergeFloatingRecoveryMessages<T extends HistoryMessage>(current: T[], receipt: T[]): T[] {
  return mergeChatHistory(receipt, current);
}

type FloatingConversation = { historyKey: string; surface: string; runKey: string };
const referenceKey = () => directTabStorageKey('pixflow:floating-conversation:v1');
const legacyRunKey = (surface: string) => directTabStorageKey(surface === 'bricks' ? 'pixflow:direct-bricks-run' : `pixflow:direct-bricks-run:${surface}`);
const ordinary = (surface: string) => surface === 'bricks' || surface === 'admin';
const selectable = (surface: string) => ordinary(surface) || /^(admin|bricks)-handoff:[a-f0-9]{64}:[A-Za-z0-9_-]{16,128}$/.test(surface);
const ordinarySurface = (surface: string) => surface.startsWith('bricks') ? 'bricks' : 'admin';
const selectionEvent = 'pixflow-design:select-floating-conversation';
type SelectionRequest = { historyKey: string; owner: string; accepted?: () => void; completed?: () => void; signal?: AbortSignal };

/** Resolve the panel's current address, never replace it with an article-specific chat. */
export async function currentFloatingChat(): Promise<PixflowChatHistoryBinding | null> {
  const active = readFloatingConversation();
  if (active) return resolveChatHistory({sessionKey: active.historyKey});
  return restoreLastActiveChat();
}

/** Explicit, same-document selection. Active owners defer adoption until settled. */
export function selectFloatingConversation(binding: PixflowChatHistoryBinding, options?: { signal?: AbortSignal; onWaiting?: () => void }): Promise<void> {
  const historyKey = conversationSessionKey(binding);
  return new Promise((resolve, reject) => {
    let accepted = false;
    const controller = new AbortController();
    const complete = () => { clearInterval(timer); clearTimeout(timeout); options?.signal?.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { controller.abort(); clearInterval(timer); clearTimeout(timeout); options?.signal?.removeEventListener('abort', cancel); reject(new Error('Conversation selection cancelled.')); };
    const dispatch = () => {
      if (accepted || controller.signal.aborted) return;
      window.dispatchEvent(new CustomEvent<SelectionRequest>(selectionEvent, { detail: {
        historyKey, owner: referenceKey(), signal: controller.signal,
        accepted: () => { accepted = true; options?.onWaiting?.(); }, completed: complete,
      } }));
    };
    const timer = window.setInterval(dispatch, 100);
    const timeout = window.setTimeout(cancel, 120_000);
    options?.signal?.addEventListener('abort', cancel, { once: true });
    if (options?.signal?.aborted) cancel(); else dispatch();
  });
}

/** A tab-owned address, not a transcript or permission grant. Existing chats stay separate. */
export function readFloatingConversation(): FloatingConversation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(referenceKey()) || 'null');
    if (!value || !ordinary(value.surface) || typeof value.historyKey !== 'string'
      || !value.historyKey.length || value.historyKey.length > 1000 || typeof value.runKey !== 'string') return null;
    const base = legacyRunKey(value.surface).replace(/:post:\d+$/, '');
    const suffix = value.runKey.slice(base.length);
    return value.runKey.startsWith(base) && (suffix === '' || suffix === `:conversation:${encodeURIComponent(value.historyKey)}` || (value.surface === 'bricks' && /^:post:[1-9]\d*$/.test(suffix))) ? value : null;
  } catch { return null; }
}

export function floatingRunStorageKey(surface = 'bricks'): string {
  const active = readFloatingConversation();
  return active?.surface === surface ? active.runKey : legacyRunKey(surface);
}

export function floatingConversationScope(surface: string, fallback: string): string {
  const active = readFloatingConversation();
  return active?.surface === surface ? active.historyKey : fallback;
}

export function rememberFloatingConversation(historyKey: string, surface: string): void {
  if (!ordinary(surface)) return;
  const active = readFloatingConversation();
  const runKey = active?.historyKey === historyKey && active.surface === surface ? active.runKey : legacyRunKey(surface);
  try { sessionStorage.setItem(referenceKey(), JSON.stringify({historyKey, surface, runKey})); } catch { /* Durable history remains the source of truth. */ }
}

function initialPanelSelection(owner: string, surface: string) {
  const address = ordinary(surface) ? readFloatingConversation() : null;
  // A fresh tab must never resolve an older editor's default conversation.
  const emptyKey = ordinary(surface) && !address ? `pixflow-panel:${randomUUID()}` : null;
  return { owner, address, emptyKey };
}

/** Native editor initialization must never replace the session's selected chat. */
export function useFloatingConversation(historyKey: string, surface: string, busy = false) {
  const owner = referenceKey();
  const [selection, setSelection] = useState(() => initialPanelSelection(owner, surface));
  const [requested, setRequested] = useState<SelectionRequest | null>(null);
  useEffect(() => {
    if (!selectable(surface)) return;
    const select = (event: Event) => {
      const request = (event as CustomEvent<SelectionRequest>).detail;
      if (request?.owner === owner && conversationBinding(request.historyKey) && !request.signal?.aborted) {
        request.accepted?.();
        setRequested(request);
      }
    };
    window.addEventListener(selectionEvent, select);
    return () => window.removeEventListener(selectionEvent, select);
  }, [owner, surface]);
  useEffect(() => {
    if (!requested || busy) return;
    if (requested.owner !== owner || requested.signal?.aborted) { setRequested(null); return; }
    const selectedSurface = ordinarySurface(surface);
    const address = { historyKey: requested.historyKey, surface: selectedSurface, runKey: `${legacyRunKey(selectedSurface).replace(/:post:\d+$/, '')}:conversation:${encodeURIComponent(requested.historyKey)}` };
    try { sessionStorage.setItem(owner, JSON.stringify(address)); } catch { /* The mounted selection remains usable. */ }
    setSelection({ owner, address, emptyKey: null });
    rememberLastActiveChat(conversationBinding(requested.historyKey)!);
    requested.completed?.();
    setRequested(null);
  }, [requested, busy, owner, surface]);
  const current = selection.owner === owner ? selection : initialPanelSelection(owner, surface);
  if (current !== selection) setSelection(current);
  // Keep composers paused while a queued selection is waiting for an active run.
  return {
    ...(current.address ?? { historyKey: current.emptyKey ?? historyKey, surface }),
    restoring: false,
    selectionPending: !!requested,
    continuing: !!current.address,
  };
}

/** Both renderers consume the same recovery receipt without rewriting provider checkpoints. */
export function normalizeFloatingRunMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const data = value as Record<string, unknown>;
  const messages = Array.isArray(data.messages) ? data.messages : Array.isArray(data.initial) ? data.initial : undefined;
  if (!messages) return value;
  const messageId = typeof data.messageId === 'string' ? data.messageId : data.id;
  const reply = messages?.find(item => item?.id === messageId);
  return {...data, messages, initial: messages, messageId, id: messageId, agentId: data.agentId || reply?.agentId};
}
