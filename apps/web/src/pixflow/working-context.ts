import type { PixflowWorkingContextRequest, PixflowWorkingContextResponse, PixflowWorkingRunContextRequest, PixflowWorkingRunContextResponse } from '@open-design/contracts';
import type { AppConfig } from '../types';
import { chatHistoryOwnerScope, historyMessageFingerprint, importChatHistory, readChatHistory, resolveChatHistory, saveChatHistoryMessage, type ChatHistoryBinding, type HistoryMessage } from './chat-history-client';
import { pixflowWordPressRestFetch } from './runtime-fetch';
import { steeringPromptHistory } from './steering-messages';

export interface WorkingContextSource {
  binding?: ChatHistoryBinding;
  sessionKey?: string;
  /** Previous persisted rows only: excludes this request and its assistant placeholder. */
  messages: Array<HistoryMessage & { events?: unknown[] }>;
}
export interface PreparedHistory {
  binding: ChatHistoryBinding;
  throughMessageId: string;
  messages: Array<{ role: string; content: string }>;
}

export const workingContextBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export async function compactWorkingRun(binding: ChatHistoryBinding, config: AppConfig,
  state: Pick<PixflowWorkingRunContextRequest, 'messages' | 'turns' | 'results' | 'calls' | 'inFlight'>, signal: AbortSignal): Promise<PixflowWorkingRunContextResponse> {
  signal.throwIfAborted();
  if (state.calls.length || state.inFlight) return { status: 'fallback', reason: 'unfinished_tools' };
  const owner = chatHistoryOwnerScope();
  const request: PixflowWorkingRunContextRequest = { ...state,
    transport: config.apiTransport === 'composio' ? 'composio' : 'api',
    ...(config.apiTransport === 'composio' ? { provider: config.composioProvider, model: config.composioModel } : {
      apiProtocol: config.apiProtocol, baseUrl: config.baseUrl, apiKey: config.apiKey, apiVersion: config.apiVersion, model: config.model,
    }),
  };
  const response = await pixflowWordPressRestFetch(`/chat-history/${encodeURIComponent(binding.projectId)}/${encodeURIComponent(binding.conversationId)}/working-context/run`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  const value = await response.json();
  signal.throwIfAborted();
  if (owner !== chatHistoryOwnerScope()) throw new Error('The signed-in account changed. Reopen this chat before continuing.');
  if (!response.ok) return { status: 'fallback', reason: 'compaction_unavailable' };
  if (value.status !== 'compacted' || typeof value.summary !== 'string' || !value.summary.trim() || workingContextBytes(value.summary) > 24000) return { status: 'fallback', reason: 'compaction_unavailable' };
  return value;
}

/** Read every saved page for execution; display pagination never limits model context. */
export async function prepareHistorySource(source: WorkingContextSource, signal: AbortSignal): Promise<PreparedHistory> {
  const owner = chatHistoryOwnerScope();
  const check = () => {
    signal.throwIfAborted();
    if (owner !== chatHistoryOwnerScope()) throw new Error('The signed-in account changed. Reopen this chat before continuing.');
  };
  check();
  const binding = source.binding || await resolveChatHistory({ sessionKey: source.sessionKey! });
  check();
  // Insert-only import retains the original payload and never downgrades another tab.
  const imported = await importChatHistory(binding, source.messages);
  check();
  const savedById = new Map(imported.messages.map(message => [message.id, message]));
  for (const message of source.messages) {
    const saved = savedById.get(message.id);
    // The writer can advance a revisionless snapshot only when this same browser
    // already acknowledged its own revision-zero write. Otherwise CAS rejects it;
    // never borrow a server revision and overwrite another tab's newer payload.
    if (saved && historyMessageFingerprint(saved) !== historyMessageFingerprint(message)) {
      await saveChatHistoryMessage(binding, message);
      check();
    }
  }
  const throughMessageId = source.messages.at(-1)?.id || '';
  if (!throughMessageId) return { binding, throughMessageId, messages: [] };
  let cursor: string | null | undefined;
  const cursors = new Set<string>();
  const identities = new Set<string>();
  let messages: WorkingContextSource['messages'] = [];
  do {
    const page = await readChatHistory<WorkingContextSource['messages'][number]>(binding, cursor);
    check();
    for (const message of page.messages) {
      if (!message.id || identities.has(message.id)) throw new Error('Chat history changed while loading. Please retry.');
      identities.add(message.id);
    }
    messages = [...page.messages, ...messages];
    if (page.hasMore && (!page.nextCursor || cursors.has(page.nextCursor))) throw new Error('Chat history could not be loaded completely. Please retry.');
    if (page.nextCursor) cursors.add(page.nextCursor);
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  const end = messages.findIndex(message => message.id === throughMessageId);
  if (end < 0) throw new Error('The preceding chat message is not saved. Retry after chat history finishes saving.');
  return { binding, throughMessageId, messages: steeringPromptHistory(messages.slice(0, end + 1)) };
}

/** Prepare is disposable; only a still-active caller may commit a validated summary. */
export async function compactWorkingContext(history: PreparedHistory, config: AppConfig, signal: AbortSignal): Promise<PixflowWorkingContextResponse> {
  const owner = chatHistoryOwnerScope();
  const check = () => {
    signal.throwIfAborted();
    if (owner !== chatHistoryOwnerScope()) throw new Error('The signed-in account changed. Reopen this chat before continuing.');
  };
  const path = `/chat-history/${encodeURIComponent(history.binding.projectId)}/${encodeURIComponent(history.binding.conversationId)}/working-context`;
  const post = async (url: string, body: unknown) => {
    check();
    const response = await pixflowWordPressRestFetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    check();
    if (!response.ok) throw new Error(value.message || 'Could not prepare chat context. Your saved history is unchanged.');
    return value as PixflowWorkingContextResponse;
  };
  const request: PixflowWorkingContextRequest = {
    transport: config.apiTransport === 'composio' ? 'composio' : 'api', throughMessageId: history.throughMessageId,
    ...(config.apiTransport === 'composio' ? { provider: config.composioProvider, model: config.composioModel } : {
      apiProtocol: config.apiProtocol, baseUrl: config.baseUrl, apiKey: config.apiKey, apiVersion: config.apiVersion, model: config.model,
    }),
  };
  const prepared = await post(path, request);
  return prepared.candidateId ? post(`${path}/commit`, { candidateId: prepared.candidateId }) : prepared;
}
