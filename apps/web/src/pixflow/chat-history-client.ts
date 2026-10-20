import { pixflowWordPressRestFetch } from './runtime-fetch';
import { getPixflowWordPressConfig } from './wordpress-context';
import type { PixflowChatHistoryBinding, PixflowChatHistoryPage, PixflowSavedChatHistory, PixflowChatHistoryListPage, PixflowChatHistoryImportResponse, PixflowChatHistoryResolveRequest, PixflowChatHistorySaveResponse, PixflowChatHistoryLookupResponse } from '@open-design/contracts';

export type ChatHistoryBinding = PixflowChatHistoryBinding;
export interface HistoryMessage { id?: string; role?: string; content?: string; historyRevision?: number; historySequence?: number }
export type ChatHistoryPage<T> = PixflowChatHistoryPage<T>;
export type SavedChatHistory = PixflowSavedChatHistory;
export function listChatHistory(before?: string | null): Promise<PixflowChatHistoryListPage> {
  return request(`/chat-history/conversations?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await pixflowWordPressRestFetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new ChatHistoryRequestError(body.message || `Chat history request failed (${response.status})`, response.status, body);
  return body as T;
}
class ChatHistoryRequestError extends Error {
  constructor(message: string, readonly status: number, readonly body: {code?:string;data?:{message?:HistoryMessage}}) { super(message); }
}
/** Old Bricks caches added display defaults and dropped revision metadata.
 * Acknowledge an identical terminal row, never overwrite or rebase its data.
 */
function legacyDisplayReplayMatches(incoming: HistoryMessage, saved?: HistoryMessage): boolean {
  const next = incoming as HistoryMessage & Record<string, unknown>;
  const prior = saved as (HistoryMessage & Record<string, unknown>) | undefined;
  // Older panel restores inferred completion from visible text after losing
  // their transport. That is not evidence that the durable run completed.
  // A matching display projection may acknowledge the canonical row, never
  // promote its status or replace its retained activity.
  const inferredCompletion = prior?.role === 'assistant'
    && prior.runStatus === 'running' && prior.status === 'streaming'
    && prior.endedAt === undefined && next.status === 'complete'
    && next.runStatus === 'succeeded' && typeof next.endedAt === 'number'
    && Number.isFinite(next.endedAt);
  if (!prior || next.id !== prior.id || !['user', 'assistant'].includes(String(next.role)) || next.role !== prior.role
    || !['session_restore_v2', 'device_restore_v2'].includes(String(next.provenance))
    || (next.role === 'assistant' && !inferredCompletion && (!['succeeded', 'failed', 'canceled', 'interrupted'].includes(String(prior.runStatus)) || next.runStatus !== prior.runStatus))) return false;
  // The legacy display cache joins adjacent plain text deltas. Compare their
  // text, not transport chunk boundaries, without crossing activity boundaries
  // or dropping event metadata. The durable row itself is never modified.
  const coalesceDisplayText = (events: unknown[]) => {
    const result: unknown[] = [];
    const plainText = (event: unknown): event is { kind: 'text'; text: string } =>
      !!event && typeof event === 'object' && !Array.isArray(event)
      && (event as Record<string, unknown>).kind === 'text'
      && typeof (event as Record<string, unknown>).text === 'string'
      && Object.keys(event).every(key => key === 'kind' || key === 'text');
    for (const event of events) {
      const last = result[result.length - 1];
      if (plainText(event) && plainText(last)) {
        result[result.length - 1] = { kind: 'text', text: last.text + event.text };
      } else result.push(event);
    }
    return result;
  };
  const normalize = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([key, value]) => {
    if (['historyRevision', 'historySequence', 'provenance'].includes(key)) return false;
    if (inferredCompletion && ['status', 'runStatus', 'endedAt'].includes(key)) return false;
    if (row.role === 'user' && prior[key] === undefined && (
      (key === 'endedAt' && typeof value === 'number') || (key === 'status' && value === 'complete')
      || (key === 'runStatus' && value === 'succeeded') || (key === 'sessionMode' && value === 'design')
      || (key === 'events' && Array.isArray(value) && value.length === 0))) return false;
    // Restore caches can omit all events. Only the incoming display projection
    // may omit them; the acknowledged result remains the complete durable row.
    if (row === next && next.role === 'assistant' && key === 'events'
      && Array.isArray(value) && value.length === 0 && Array.isArray(prior.events)) return false;
    if (key === 'startedAt' && value === row.createdAt) return false;
    if (key === 'attachments' && Array.isArray(value) && value.length === 0) return false;
    if (key === 'awaitingInput' && value === false) return false;
    return value !== undefined;
  }).map(([key, value]) => [key, key === 'events' && Array.isArray(value) ? coalesceDisplayText(value) : value] as const)
    .sort(([a], [b]) => a.localeCompare(b)));
  // Legacy caches also clipped nested tool input objects. Accept only a
  // subset already present in the durable row; return that full row unchanged.
  const contains = (full: unknown, cached: unknown): boolean => {
    if (Array.isArray(cached)) return Array.isArray(full) && full.length === cached.length && cached.every((item, index) => contains(full[index], item));
    if (cached && typeof cached === 'object') return !!full && typeof full === 'object' && !Array.isArray(full)
      && Object.entries(cached).every(([key, value]) => Object.hasOwn(full, key) && contains((full as Record<string, unknown>)[key], value));
    return full === cached;
  };
  return next.content === prior.content && contains(normalize(prior), normalize(next));
}

/** Old recovery records omitted events but retained the durable revision.
 * Only acknowledge an otherwise identical terminal reply; never persist that
 * event-less projection or accept changed text/metadata as a replay.
 */
function eventlessRecoveryReplayMatches(incoming: HistoryMessage, saved?: HistoryMessage): boolean {
  const next = incoming as HistoryMessage & Record<string, unknown>;
  const prior = saved as (HistoryMessage & Record<string, unknown>) | undefined;
  if (!prior || next.role !== 'assistant' || prior.role !== 'assistant' || next.id !== prior.id
    || !Number.isInteger(next.historyRevision) || !(next.historyRevision! > 0)
    || !(prior.historyRevision! > next.historyRevision!) || next.events !== undefined
    || !Array.isArray(prior.events) || prior.events.length === 0
    || !['succeeded', 'failed', 'canceled', 'interrupted'].includes(String(prior.runStatus))) return false;
  const normalize = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row)
    .filter(([key, value]) => value !== undefined && !['historyRevision', 'historySequence', 'events'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(normalize(next)) === JSON.stringify(normalize(prior));
}

/** A legacy live cache can add display metadata before the original outbox drains.
 * Acknowledge only identical unversioned payloads; never write or rebase them.
 */
function legacyLiveReplayMatches(incoming: HistoryMessage, saved?: HistoryMessage): boolean {
  const next = incoming as HistoryMessage & Record<string, unknown>;
  const prior = saved as (HistoryMessage & Record<string, unknown>) | undefined;
  if (!prior || next.historyRevision || next.provenance || next.id !== prior.id || next.role !== prior.role
    || !['user', 'assistant'].includes(String(next.role)) || prior.provenance !== 'floating_panel_live_v2'
    || prior.authority !== 'fluency_only') return false;
  const normalize = (row: Record<string, unknown>): unknown => Object.fromEntries(Object.entries(row).filter(([key, value]) => {
    if (value === undefined || ['historyRevision', 'historySequence'].includes(key)) return false;
    if (['attachments', 'commentAttachments'].includes(key) && Array.isArray(value) && value.length === 0) return false;
    if (row === prior && next[key] === undefined) {
      if (['provenance', 'authority'].includes(key) || (key === 'startedAt' && value === row.createdAt)) return false;
      if (next.role === 'user' && ((key === 'endedAt' && typeof value === 'number')
        || (key === 'status' && value === 'complete') || (key === 'sessionMode' && value === 'design')
        || (key === 'awaitingInput' && value === false) || (key === 'events' && Array.isArray(value) && value.length === 0))) return false;
    }
    return true;
  }).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(normalize(next)) === JSON.stringify(normalize(prior));
}

/** A terminal durable replay can acknowledge a previously truncated tail only
 * when its exact content, events and metadata are already present there.
 */
function completedReplayContains<T extends HistoryMessage>(incoming:T,saved?:HistoryMessage): saved is T {
  type Snapshot=HistoryMessage & {runId?:string;runStatus?:string;lastRunEventId?:string;events?:unknown[]};
  const next=incoming as Snapshot, prior=saved as Snapshot | undefined;
  if (!prior || next.id!==prior.id || next.role!=='assistant' || prior.role!=='assistant'
    || !next.runId || next.runId!==prior.runId || prior.runStatus!=='succeeded' || next.runStatus!=='succeeded'
    || !next.lastRunEventId || next.lastRunEventId!==prior.lastRunEventId
    || !next.content || !prior.content?.endsWith(next.content)) return false;
  const events=(list:unknown[] = [])=>list.filter(event=>!!event&&typeof event==='object'&&(event as {kind?:string}).kind!=='text');
  const oldEvents=events(prior.events), newEvents=events(next.events), offset=oldEvents.length-newEvents.length;
  if (offset<0 || newEvents.some((event,index)=>JSON.stringify(event)!==JSON.stringify(oldEvents[offset+index]))) return false;
  const changing=new Set(['content','events','historyRevision','historySequence']);
  return Object.entries(next).every(([key,value])=>changing.has(key)||JSON.stringify(value)===JSON.stringify((prior as unknown as Record<string,unknown>)[key]));
}

/** A reload may lose a local revision acknowledgement, never another tab's edits.
 * Rebase only an exact append-only continuation of the same still-active run.
 */
function appendOnlyRecoveryRevision(incoming: HistoryMessage, saved?: HistoryMessage): number | null {
  type Snapshot = HistoryMessage & {runId?:string;runStatus?:string;lastRunEventId?:string;events?:unknown[]};
  const next=incoming as Snapshot, prior=saved as Snapshot | undefined;
  // Bricks native replays historically carried identity on boundary events,
  // not the message envelope. Require that identity plus an exact event prefix
  // before a single CAS retry can append recovered output or its terminal state.
  if (prior && next.id === prior.id && next.role === 'assistant' && prior.role === 'assistant'
    && prior.runStatus === 'running' && Number.isInteger(prior.historyRevision)
    && typeof next.content === 'string' && typeof prior.content === 'string'
    && next.content.startsWith(prior.content)
    && ['running', 'succeeded', 'failed', 'canceled', 'interrupted'].includes(next.runStatus || '')) {
    const identity = (events: unknown[] = []) => {
      const rows = events.filter((event): event is Record<string, unknown> => !!event && typeof event === 'object');
      const ids = new Set(rows.map(row => row.runId).filter(value => typeof value === 'string' && value));
      const boundaries = rows.filter(row => row.kind === 'assistant_message_boundary'
        && typeof row.runId === 'string' && Number.isSafeInteger(row.sequence));
      return { id: ids.size === 1 ? [...ids][0] : undefined,
        sequence: Math.max(0, ...boundaries.map(row => Number(row.sequence))) };
    };
    const before = identity(prior.events), after = identity(next.events);
    const prefix = Array.isArray(prior.events) && prior.events.length > 0 && Array.isArray(next.events)
      && next.events.length >= prior.events.length
      && prior.events.every((event, index) => JSON.stringify(event) === JSON.stringify(next.events![index]));
    const changing = new Set(['content', 'events', 'historyRevision', 'historySequence', 'runStatus', 'status', 'endedAt']);
    if (before.id && before.id === after.id && after.sequence > before.sequence && prefix
      && (!next.runId || next.runId === before.id) && (!prior.runId || prior.runId === before.id)
      && Object.entries(prior).every(([key, value]) => changing.has(key)
        || JSON.stringify(value) === JSON.stringify((next as unknown as Record<string, unknown>)[key]))) return prior.historyRevision!;
  }
  if (!prior || next.id!==prior.id || next.role!=='assistant' || prior.role!=='assistant'
    || !next.runId || next.runId!==prior.runId || !['queued','running'].includes(prior.runStatus || '')
    || !Number.isInteger(prior.historyRevision) || !next.content?.startsWith(prior.content || '')
    || !/^\d+$/.test(next.lastRunEventId || '') || !/^\d+$/.test(prior.lastRunEventId || '')
    || Number(next.lastRunEventId)<=Number(prior.lastRunEventId)) return null;
  const activity=(events:unknown[] = [])=>events.filter(event=>!!event && typeof event==='object' && (event as {kind?:string}).kind!=='text');
  const oldEvents=activity(prior.events), newEvents=activity(next.events);
  if (oldEvents.some((event,index)=>JSON.stringify(event)!==JSON.stringify(newEvents[index]))) return null;
  // Other saved metadata (attachments, identity, etc.) must also survive intact.
  const changing=new Set(['content','events','historyRevision','historySequence','runStatus','lastRunEventId','endedAt','producedFiles','telemetryFinalized','resumable']);
  for (const [key,value] of Object.entries(prior)) if (!changing.has(key) && JSON.stringify(value)!==JSON.stringify((next as unknown as Record<string,unknown>)[key])) return null;
  if ((prior as Snapshot & {producedFiles?:unknown[]}).producedFiles?.some(file=>!((next as Snapshot & {producedFiles?:unknown[]}).producedFiles || []).some(value=>JSON.stringify(value)===JSON.stringify(file)))) return null;
  return prior.historyRevision!;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const base = (binding: ChatHistoryBinding) => `/chat-history/${encodeURIComponent(binding.projectId)}/${encodeURIComponent(binding.conversationId)}/messages`;
export const historyMessageFingerprint = (message: HistoryMessage) => {
  const { historyRevision: _revision, historySequence: _sequence, ...payload } = message;
  return JSON.stringify(payload);
};
export function resolveChatHistory(input: PixflowChatHistoryResolveRequest & { create: false }): Promise<PixflowChatHistoryLookupResponse>;
export function resolveChatHistory(input: PixflowChatHistoryResolveRequest): Promise<ChatHistoryBinding>;
export function resolveChatHistory(input: PixflowChatHistoryResolveRequest): Promise<PixflowChatHistoryLookupResponse> {
  return request('/chat-history/resolve', json('POST', input));
}
export function readChatHistory<T extends HistoryMessage>(binding: ChatHistoryBinding, before?: string | null): Promise<ChatHistoryPage<T>> {
  return request(`${base(binding)}?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
}
export async function importChatHistory<T extends HistoryMessage>(binding: ChatHistoryBinding, messages: T[]): Promise<PixflowChatHistoryImportResponse<T>> {
  const owner = ownerScope();
  const result: PixflowChatHistoryImportResponse<T> = { messages: [], deletedMessageIds: [] };
  for (let offset = 0; offset < messages.length; offset += 100) {
    if (ownerScope() !== owner) throw new Error('The signed-in account changed before chat history could be saved.');
    const page = await request<PixflowChatHistoryImportResponse<T>>(base(binding), json('POST', { messages: messages.slice(offset, offset + 100), importOnly: true }));
    if (ownerScope() !== owner) throw new Error('The signed-in account changed before chat history could be saved.');
    // An exact imported snapshot is our own acknowledged baseline. A different
    // server payload belongs to another writer and must retain CAS protection.
    for (const saved of page.messages || []) {
      const sent = messages.slice(offset, offset + 100).find(item => item.id === saved.id);
      if (!sent || !saved.id || !Number.isInteger(saved.historyRevision)
        || historyMessageFingerprint(sent) !== historyMessageFingerprint(saved)) continue;
      const key = `${owner}:${base(binding)}/${encodeURIComponent(saved.id)}`;
      const prior = acknowledged.get(key);
      if (prior && prior.revision > saved.historyRevision!) continue;
      acknowledged.set(key, { revision: saved.historyRevision!, inputs: new Set([...(prior?.inputs || []), sent.historyRevision ?? 0, saved.historyRevision!]) });
    }
    result.messages.push(...(page.messages || []));
    result.deletedMessageIds.push(...(page.deletedMessageIds || []));
  }
  return result;
}

// Serialize our own revisions. A stale tab still submits the revision it read,
// so it cannot replace another tab's more recent answer.
const writers = new Map<string, Promise<unknown>>();
const acknowledged = new Map<string, { revision: number; inputs: Set<number> }>();
export function chatHistoryOwnerScope(): string {
  const config = getPixflowWordPressConfig();
  return JSON.stringify([config?.restBaseUrl || config?.siteUrl || config?.siteHash || '', config?.userId || config?.restNonce || '']);
}
const ownerScope = chatHistoryOwnerScope;
export function saveChatHistoryMessage<T extends HistoryMessage>(binding: ChatHistoryBinding, message: T): Promise<T> {
  if (!message.id) return Promise.reject(new Error('Chat messages require a stable identity.'));
  const path = `${base(binding)}/${encodeURIComponent(message.id)}`;
  const owner = ownerScope();
  const writerKey = `${owner}:${path}`;
  const inputRevision = message.historyRevision ?? 0;
  const task = (writers.get(writerKey) || Promise.resolve()).catch(() => undefined).then(async () => {
    if (ownerScope() !== owner) throw new Error('The signed-in account changed before chat history could be saved.');
    const previous = acknowledged.get(writerKey);
    const revision = previous?.inputs.has(inputRevision) ? previous.revision : inputRevision;
    let result: PixflowChatHistorySaveResponse<T>;
    try {
      // Restore snapshots are display projections, not edits. Read/insert without
      // replacing a durable row, even when this browser acknowledged its revision.
      const provenance = (message as HistoryMessage & { provenance?: string }).provenance;
      if (provenance === 'session_restore_v2' || provenance === 'device_restore_v2') {
        const imported = await request<PixflowChatHistoryImportResponse<T>>(base(binding), json('POST', { messages: [message], importOnly: true }));
        if (ownerScope() !== owner) throw new Error('The signed-in account changed before chat history could be saved.');
        const saved = imported.messages.find(item => item.id === message.id);
        if (!saved || !Number.isInteger(saved.historyRevision)) {
          throw new ChatHistoryRequestError('This message is no longer available.', 410, { code: 'pixflow_history_deleted' });
        }
        if (historyMessageFingerprint(saved) !== historyMessageFingerprint(message) && !legacyDisplayReplayMatches(message, saved)) {
          throw new ChatHistoryRequestError('This message has a newer saved version.', 409, { code: 'pixflow_history_conflict', data: { message: saved } });
        }
        result = { ok: true, message: saved, revision: saved.historyRevision! };
      } else {
        result = await request(path, json('PUT', { ...message, historyRevision: revision }));
      }
    } catch (error) {
      if (error instanceof ChatHistoryRequestError && error.status===409 && error.body.code==='pixflow_history_conflict'
        && (eventlessRecoveryReplayMatches(message,error.body.data?.message) || legacyLiveReplayMatches(message,error.body.data?.message) || completedReplayContains(message,error.body.data?.message) || legacyDisplayReplayMatches(message,error.body.data?.message)) && ownerScope()===owner) {
        result={message:error.body.data!.message!,revision:error.body.data!.message!.historyRevision!} as PixflowChatHistorySaveResponse<T>;
      } else {
      const recovered = error instanceof ChatHistoryRequestError && error.status===409 && error.body.code==='pixflow_history_conflict'
        ? appendOnlyRecoveryRevision(message,error.body.data?.message) : null;
      if (recovered===null || ownerScope()!==owner) throw error;
      // One compare-and-swap retry; a concurrent edit still wins a real conflict.
      result = await request(path, json('PUT',{...message,historyRevision:recovered}));
      }
    }
    acknowledged.set(writerKey, { revision: result.revision, inputs: new Set([...(previous?.inputs || []), inputRevision, result.revision]) });
    return result.message;
  });
  writers.set(writerKey, task);
  void task.finally(() => { if (writers.get(writerKey) === task) writers.delete(writerKey); }).catch(() => undefined);
  return task;
}

/** Historical payloads are preserved intact; identity, not array position, deduplicates. */
export function mergeChatHistory<T extends HistoryMessage>(older: T[], newer: T[]): T[] {
  const byId = new Map<string, T>();
  for (const message of [...older, ...newer]) if (message.id) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    if (a.historySequence && b.historySequence) return a.historySequence - b.historySequence;
    const time = (value: T) => Number((value as T & { createdAt?: number }).createdAt || 0);
    return time(a) - time(b);
  });
}
