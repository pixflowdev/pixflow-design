import { useEffect, useState } from 'react';
import { directTabStorageKey } from './direct-tab-storage';
import { mergeChatHistory, type HistoryMessage } from './chat-history-client';
import type { AppConfig } from '../types';
import { conversationBinding, conversationSessionKey } from './conversation-address';
import type { PixflowChatHistoryBinding } from '@open-design/contracts';

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
const selectionEvent = 'pixflow-design:select-floating-conversation';

/** Explicit, same-document selection. Active owners defer adoption until settled. */
export function selectFloatingConversation(binding: PixflowChatHistoryBinding): void {
  const historyKey = conversationSessionKey(binding);
  window.dispatchEvent(new CustomEvent(selectionEvent, { detail: { historyKey } }));
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

/** Adopt once on document mount. A native New chat selection still starts its own chat. */
export function useFloatingConversation(historyKey: string, surface: string, busy = false) {
  const [selection, setSelection] = useState(() => ({source: historyKey, address: ordinary(surface) ? readFloatingConversation() : null, changed: false}));
  const [requested, setRequested] = useState<{ historyKey: string; owner: string } | null>(null);
  useEffect(() => {
    if (!ordinary(surface)) return;
    const select = (event: Event) => {
      const key = (event as CustomEvent<{ historyKey: string }>).detail?.historyKey;
      if (typeof key === 'string' && conversationBinding(key)) setRequested({ historyKey: key, owner: referenceKey() });
    };
    window.addEventListener(selectionEvent, select);
    return () => window.removeEventListener(selectionEvent, select);
  }, [surface]);
  useEffect(() => {
    if (!requested || busy) return;
    if (requested.owner !== referenceKey()) { setRequested(null); return; }
    const address = { historyKey: requested.historyKey, surface, runKey: `${legacyRunKey(surface).replace(/:post:\d+$/, '')}:conversation:${encodeURIComponent(requested.historyKey)}` };
    try { sessionStorage.setItem(referenceKey(), JSON.stringify(address)); } catch { /* The mounted selection remains usable. */ }
    setSelection({ source: historyKey, address, changed: false });
    setRequested(null);
  }, [requested, busy, historyKey, surface]);
  useEffect(() => {
    if (selection.changed) rememberFloatingConversation(selection.source, surface);
  }, [selection.changed, selection.source, surface]);
  if (selection.source !== historyKey) {
    setSelection({source: historyKey, address: null, changed: true});
    return {historyKey, surface, continuing: false};
  }
  return { ...(selection.address ?? {historyKey, surface}), continuing: !!selection.address && (selection.address.historyKey !== historyKey || selection.address.surface !== surface) };
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
