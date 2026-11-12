import { floatingRunStorageKey, floatingConversationScope, rememberFloatingConversation, rememberFloatingExecution } from './floating-conversation';
import { withRunDesignGuidance } from './run-design-guidance';
import { useT as usePixflowUiTranslation } from '../i18n';
import { secureRandomUUID } from '../utils/uuid';
import { voiceStatusUpdates, type CodexVoiceConnection } from './codex-voice-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { PixflowDirectSiteSession, PixflowDirectSiteRunRequest, PixflowDirectSiteOutcome, PixflowDirectSiteSteerResponse, PixflowDirectSiteTimings, PixflowWorkspaceSource } from '@open-design/contracts';
import type { ComposerQueueItem } from '../components/composer-queue';
import type { AgentEvent, AppConfig } from '../types';
import { runByokSite, SiteDeliveryUncertain, type ByokSiteCheckpoint } from './direct-site-byok';
import { translateAgentEvent } from '../providers/daemon';

import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from './runtime-fetch';
import { ensurePixflowLicenseEntitlement } from './license';
import styles from './direct-site.module.css';
import { directTabStorageKey } from './direct-tab-storage';
import { SiteAccessError, siteAccessError } from './site-access-error';
import { createFrameCheckpoint } from '../runtime/frame-checkpoint';
import { recoverDirectStream, StreamAttachmentHttpError } from './direct-stream-recovery';
import { withoutTranscriptEvents } from './direct-history-storage';
import { chatHistoryOwnerScope, readChatHistory, type ChatHistoryBinding } from './chat-history-client';
import { prepareDocumentAttachments, siteDocumentRead } from './document-attachments';
import type { SavedHistoryPage } from './working-context';
const SITE_ACCESS_CHANGED = 'pixflow:site-access-changed';

/** Only known timing scalars enter local diagnostics, never arbitrary stream payloads. */
function bridgeTimings(value: unknown): Partial<PixflowDirectSiteTimings> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  const result: Partial<PixflowDirectSiteTimings> = {};
  for (const key of ['ownerReadyMs', 'contextReadyMs', 'spawnMs', 'protocolReadyMs', 'threadReadyMs', 'providerSubmittedMs', 'firstProviderEventMs', 'firstTextMs', 'totalMs', 'promptBytes'] as const) {
    const number = source[key];
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0) result[key] = number;
  }
  if (typeof source.nativeSessionReused === 'boolean') result.nativeSessionReused = source.nativeSessionReused;
  if (typeof source.warmWorkerUsed === 'boolean') result.warmWorkerUsed = source.warmWorkerUsed;
  return result;
}

/** WordPress owns uploaded references; Direct downloads them through its site session. */
export function useDirectAttachmentProject() {
  const project = useRef<Promise<string> | null>(null);
  return useCallback(() => {
    if (!project.current) project.current = (async () => {
      const response = await pixflowRuntimeFetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Direct agent attachments', conversationMode: 'chat', metadata: { purpose: 'direct-attachments' } }),
      });
      const value = await response.json();
      const id = value.project?.id || value.id;
      if (!response.ok || !id) throw new Error(value.message || 'Could not create an attachment workspace.');
      return String(id);
    })().catch(error => { project.current = null; throw error; });
    return project.current;
  }, []);
}

export function useSiteAccess(busy = false) {
  const guarded = false;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState('');
  const [retryRevision, retry] = useState(0);
  const lastSettingsRead = useRef<number | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      lastSettingsRead.current = undefined;
      if (busy) return;
      // Refresh the authenticated preference without tearing down a healthy
      // canvas/session between turns. Initial hydration starts unready.
      try {
        const response = await pixflowWordPressRestFetch('/wp-admin/direct/settings');
        if (!response.ok) throw await siteAccessError(response);
        await response.json();
        if (active) { lastSettingsRead.current = retryRevision; setError(''); setDetails(''); }
      } catch (reason) {
        if (active) {
          setError(reason instanceof SiteAccessError ? reason.message : 'The site connection was interrupted. Please retry.');
          setDetails(reason instanceof SiteAccessError ? reason.details : reason instanceof Error ? reason.message : String(reason));
        }
      } finally { if (active) setReady(true); }
    };
    if (lastSettingsRead.current !== retryRevision) void refresh();
    const onStorage = (event: StorageEvent) => { if (event.key === SITE_ACCESS_CHANGED) void refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener(SITE_ACCESS_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SITE_ACCESS_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [busy, retryRevision]);
  return { guarded, ready, error, details, retry: () => retry(value => value + 1) };
}

export function SiteAccessNotice({ access, busy = false }: { access: ReturnType<typeof useSiteAccess>; busy?: boolean }) {
  const translateUi = usePixflowUiTranslation();
  if (!access.error) return null;
  return <aside className={styles.notice} aria-label={translateUi("ui.direct-site.siteConnection")}>
    <div className={styles.noticeHeading}><span className={styles.noticeIcon} aria-hidden="true">!</span><strong>{translateUi("ui.direct-site.siteConnectionNeedsAttention")}</strong></div>
    <p className={styles.noticeMessage} role="status">{access.error}</p>
    <div className={styles.noticeActions}>
      <Button variant="subtle" disabled={busy || !access.ready} onClick={access.retry}>{access.ready ? translateUi("ui.direct-site.retryConnection") : translateUi("ui.direct-site.checking")}</Button>
      {access.details && <details className={styles.noticeDetails}><summary>{translateUi("ui.direct-site.technicalDetails")}</summary><pre>{access.details}</pre></details>}
    </div>
  </aside>;
}

export const DIRECT_BRICKS_RUN_STORAGE = 'pixflow:direct-bricks-run';
// Live controls must never depend on browser quota or persisted tool output.
const activeRunOwners = new Map<string, PendingDirectSiteRun>();
const runStorageKey = floatingRunStorageKey;
export type PendingDirectSiteRun = {
  preparing?: boolean;
  preparationDocument?: string;
  preparationEnded?: boolean;
  byok?: ByokSiteCheckpoint;
  connection: NonNullable<PixflowDirectSiteRunRequest['continuation']>;
  metadata: unknown;
  checkpoint?: { content: string; events: AgentEvent[]; sequence: number; outcome?: PixflowDirectSiteOutcome; endedAt?: number };
  conversationId?: string;
  mode?: string;
};
export class DirectSiteRunError extends Error {
  constructor(message: string, public readonly outcome: PixflowDirectSiteOutcome, options?: ErrorOptions) { super(message, options); this.name='DirectSiteRunError'; }
}
export function directRunStatus(error: unknown): PixflowDirectSiteOutcome {
  if(error instanceof SiteDeliveryUncertain)return 'interrupted';
  return error instanceof DirectSiteRunError ? error.outcome : 'failed';
}
export function directConversationId(surface: string, history: PixflowDirectSiteRunRequest['history'], scope = ''): string {
  const key=directTabStorageKey(`pixflow:direct-conversation:${surface}:${floatingConversationScope(surface, scope)}`);
  let id: string | null=null;
  try {id=window.sessionStorage.getItem(key);}catch { /* Explicit IDs still work without storage. */ }
  if(!history.some(message=>message.role==='user' || message.role==='assistant') || !id || !/^[a-f0-9]{32}$/.test(id)) {
    id=secureRandomUUID().replaceAll('-','');
    try {window.sessionStorage.setItem(key,id);}catch { /* Run-owned identity is retained in memory. */ }
  }
  return id;
}
export function pendingDirectSiteRun(surface = 'bricks'): PendingDirectSiteRun | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(runStorageKey(surface)) || 'null');
    if (value?.preparing && value.preparationEnded && value.preparationDocument === preparationDocument) return null;
    return /^[a-f0-9]{32}$/.test(value?.connection?.id) && /^[a-f0-9]{64}$/.test(value?.connection?.token) ? value : null;
  } catch { return null; }
}

const preparationDocument = secureRandomUUID();

/** Record ownership before asynchronous preparation. This is never an executable receipt. */
export function beginDirectPreparation(surface: string, sessionKey: string, metadata: Record<string, unknown>, controller: AbortController): () => void {
  rememberFloatingConversation(sessionKey, surface);
  const key = runStorageKey(surface);
  const connection = {id:secureRandomUUID().replaceAll('-',''),token:(secureRandomUUID()+secureRandomUUID()).replaceAll('-','')};
  const record: PendingDirectSiteRun = {connection,preparing:true,preparationDocument,metadata:{...metadata,sessionKey}};
  try { sessionStorage.setItem(key,JSON.stringify(record)); } catch { /* The live request remains usable without storage. */ }
  let leaving = false;
  const ownsPreparation = () => { const pending=pendingDirectSiteRun(surface); return pending?.preparing === true && pending.connection.id === connection.id; };
  const onHide = () => {
    if (!ownsPreparation()) return;
    leaving = true;
    controller.abort();
  };
  window.addEventListener('pagehide',onHide);
  return () => {
    window.removeEventListener('pagehide',onHide);
    // A navigation can reject fetch before pagehide. Retain recovery evidence
    // until the next document; the current panel already displays its outcome.
    if (!leaving && ownsPreparation()) try { sessionStorage.setItem(key,JSON.stringify({...record,preparationEnded:true})); } catch { /* Optional storage. */ }
  };
}

/** Same authenticated owner as resume/cancel. An uncertain delivery remains visible. */
export async function steerDirectSite(surface: string, item: ComposerQueueItem, workspaceContext?: Record<string, unknown>): Promise<PixflowDirectSiteSteerResponse> {
  const run = activeRunOwners.get(runStorageKey(surface)) ?? pendingDirectSiteRun(surface);
  if (!run || run.preparing || run.byok || run.checkpoint?.outcome) return { messageId: item.id, state: 'rejected', message: 'The active run is no longer available. Keep this message queued.' };
  const response = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'design' }),
  });
  if (!response.ok) return { messageId: item.id, state: 'rejected', message: 'Reconnect to WordPress before steering.' };
  const session = await response.json() as PixflowDirectSiteSession;
  const signal = AbortSignal.timeout(240_000);
  const attachments = await prepareDocumentAttachments(item.attachments, siteDocumentRead(session), signal);
  const result = await pixflowRuntimeFetch('/api/pixflow/direct-site/steer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...run.connection, session, messageId: item.id, prompt: item.prompt, attachments, context: { ...workspaceContext, ...item.meta?.context, ...directMcpMentionContext(item.meta), comments: item.comments } }),
    signal,
  });
  const value = await result.json();
  return result.ok ? value : { messageId: item.id, state: value.state === 'rejected' ? 'rejected' : result.status >= 500 ? 'unconfirmed' : 'rejected', message: value.message || 'Could not deliver guidance. Keep this message queued.' };
}

type HistoryPrefix = ChatHistoryBinding & { throughMessageId?: string };
type SessionOptions = Pick<PixflowDirectSiteRunRequest, 'editorTarget' | 'purpose'> & {
  workspaceSource?: PixflowWorkspaceSource;
  historyBinding?: HistoryPrefix;
  restorePanel?: boolean;
};
type SessionWithHistory = PixflowDirectSiteSession & { historyPage?: SavedHistoryPage; historyRevision?: string };

async function createPanelSession(options: SessionOptions, signal?: AbortSignal, onRestore?: (page: SavedHistoryPage, through?: string) => void): Promise<SessionWithHistory> {
  const response = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
    method: 'POST', priority: 'high', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'design', ...options }),
  });
  const { historyWindow, historyThrough, ...value } = await response.json();
  if (!response.ok) throw new Error(value.message || 'Could not connect to this WordPress site.');
  if (onRestore && historyWindow && value.historyRevision && Array.isArray(value.historyPage?.messages)) {
    onRestore({ ...historyWindow, messages: value.historyPage.messages.slice(-50) }, historyThrough);
  }
  // Complete a paginated snapshot before Send whenever the panel is already open.
  // WordPress verifies its original revision during Bridge admission.
  if (value.historyRevision && options.historyBinding && value.historyPage) {
    try {
      let page: SavedHistoryPage = value.historyPage;
      const pages = [page.messages];
      const cursors = new Set<string>();
      while (page.hasMore) {
        signal?.throwIfAborted();
        if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('Incomplete chat history.');
        cursors.add(page.nextCursor);
        page = await readChatHistory(options.historyBinding, page.nextCursor, 100);
        pages.push(page.messages);
      }
      value.historyPage = { messages: pages.reverse().flat(), hasMore: false, nextCursor: null };
    } catch (error) {
      await closeUnusedSession(value);
      throw error;
    }
  }
  return value;
}

interface PanelPreparation {
  take(options: SessionOptions, signal: AbortSignal): Promise<SessionWithHistory | undefined>;
  dispose(): void;
  invalidateHistory(): void;
}

/** Single use. An unclaimed credential is revoked even if its response arrives after panel cleanup. */
export function preparePanelSession(
  target: Promise<PixflowDirectSiteRunRequest['editorTarget']>, historyBinding?: HistoryPrefix,
  restore?: (page?: SavedHistoryPage) => void,
): PanelPreparation {
  const owner = chatHistoryOwnerScope();
  const started = Date.now();
  let disposed = false;
  let claimed = false;
  let historyInvalidated = false;
  let credential: SessionWithHistory | undefined;
  let preparedTarget: PixflowDirectSiteRunRequest['editorTarget'];
  let confirmedBinding = historyBinding;
  let pendingRestore = restore;
  const finishRestore = (page?: SavedHistoryPage, through?: string) => {
    if (through && historyBinding && !historyBinding.throughMessageId) confirmedBinding = { ...historyBinding, throughMessageId: through };
    const notify = pendingRestore;
    pendingRestore = undefined;
    notify?.(page);
  };
  const expiry = window.setTimeout(() => dispose(), 60_000);
  const dispose = () => {
    window.clearTimeout(expiry);
    disposed = true;
    finishRestore();
    if (credential && !claimed) {
      void closeUnusedSession(credential);
      credential = undefined;
    }
  };
  const ready = target.then(async editorTarget => {
    if (disposed || owner !== chatHistoryOwnerScope()) return;
    preparedTarget = editorTarget;
    credential = await createPanelSession({ editorTarget, historyBinding, ...(restore && { restorePanel: true }) }, undefined, finishRestore);
    if (disposed || (historyInvalidated && !credential.historyRevision)) dispose();
  }).catch(() => { dispose(); }).finally(() => finishRestore());
  return {
    async take(options, signal) {
      // A different authorized cutoff cannot claim this preparation. Start its own request immediately.
      if (disposed || options.purpose || options.workspaceSource || JSON.stringify(options.historyBinding) !== JSON.stringify(confirmedBinding)) {
        dispose();
        signal.throwIfAborted();
        return;
      }
      await ready;
      if (!credential || disposed || claimed || signal.aborted || owner !== chatHistoryOwnerScope()
        || Date.now() - started > 60_000 || credential.expiresAt * 1000 <= Date.now()
        || JSON.stringify(options.editorTarget) !== JSON.stringify(preparedTarget)) {
        dispose();
        signal.throwIfAborted();
        return;
      }
      claimed = true;
      window.clearTimeout(expiry);
      return credential;
    },
    invalidateHistory() {
      // The ownership GET validates a versioned snapshot even if another tab saved changes.
      // Older WordPress installations still need local invalidation.
      historyInvalidated = true;
      if (credential && !credential.historyRevision) dispose();
    },
    dispose,
  };
}

async function executeDirectSite(input: Omit<PixflowDirectSiteRunRequest, 'session'> & {
  panelPreparation?: PanelPreparation;
  historySource?: import('./working-context').WorkingContextSource;
  workspaceSource?: PixflowWorkspaceSource;
  voiceConnection?: CodexVoiceConnection;
  mode: string;
  signal: AbortSignal;
  onUpdate: (content: string, events: AgentEvent[]) => void;
  persistenceMetadata?: unknown;
  resume?: PendingDirectSiteRun;
  persistenceSurface?: string;
  onPlainReplyFinished?: () => void;
  onOutcome?: (outcome: PixflowDirectSiteOutcome, endedAt?: number) => void;
  onAccepted?: () => Promise<void>;
}, submitted: number, timings: Record<string, number>, authorization: Promise<void>, preparedHistory: (page?: SavedHistoryPage, revision?: string) => Promise<PixflowDirectSiteRunRequest['history']>, historyBinding?: HistoryPrefix): Promise<PixflowDirectSiteOutcome> {
  const elapsed = () => Math.round(performance.now()-submitted);
  let serverTimings: Partial<PixflowDirectSiteTimings> | undefined;
  const storageKey = runStorageKey(input.persistenceSurface);
  // A reconnect can fail before opening its stream. Keep the already-owned
  // checkpoint visible while the Bridge is unavailable.
  if (input.resume?.checkpoint) input.onUpdate(input.resume.checkpoint.content, [...input.resume.checkpoint.events]);
  try { await authorization; }
  catch (error) {
    if (input.resume) throw new DirectSiteRunError('The Bridge connection is unavailable. Reopen the panel after reconnecting; previous output and changes are retained.', 'interrupted');
    throw error;
  }
  let session: PixflowDirectSiteSession | undefined;
  input.signal.throwIfAborted();
  let continuation = input.resume?.connection;
  {
    const options = { editorTarget: input.editorTarget, purpose: input.purpose, workspaceSource: input.workspaceSource, historyBinding };
    const prepared = await input.panelPreparation?.take(options, input.signal);
    const response = prepared ?? await createPanelSession(options, input.signal);
    const { historyPage, historyRevision, ...value } = response;
    timings.preparedSessionUsed = Number(Boolean(prepared));
    if (input.purpose === 'guidance-draft' && value.writable !== false) throw new Error('Update Pixflow Design before generating guidance. A read-only draft session is required.');
    session = value;
    if (!input.resume) input = { ...input, context: withRunDesignGuidance(input.context, session) };
    timings.siteReadyMs=elapsed();
    try {
      const history = await preparedHistory(historyPage, historyRevision);
      input.signal.throwIfAborted();
      input = { ...input, history };
    } catch (error) {
      await closeUnusedSession(session);
      throw error;
    }
    if (!input.resume && (input.persistenceMetadata !== undefined || input.voiceConnection)) {
      const candidate = { id: secureRandomUUID().replaceAll('-', ''), token: (secureRandomUUID() + secureRandomUUID()).replaceAll('-', '') };
      continuation = candidate;
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ connection: candidate, metadata: withoutTranscriptEvents(input.persistenceMetadata), mode:input.mode }));
      } catch { /* Steer and Stop retain their live owner even without storage. */ }
    }
  }
  if (continuation) activeRunOwners.set(storageKey, { connection: continuation, metadata: undefined });
  const checkpoint=input.resume?.checkpoint?.sequence ? input.resume.checkpoint : undefined;
  let content = checkpoint?.content || '';
  const events: AgentEvent[] = [...(checkpoint?.events || [])];
  const pendingSpokenUserIds = new Set<string>();
  const presentation = createFrameCheckpoint(() => {
    timings.updates!++;
    if(content) timings.firstVisibleTextMs ??= elapsed();
    input.onUpdate(content, [...events]);
  });
  let sequence = input.resume?.checkpoint?.sequence || 0;
  let outcome: PixflowDirectSiteOutcome = checkpoint?.outcome || 'interrupted';
  let completed = !!checkpoint?.outcome;
  let admissionRejected = false;
  let endedAt = checkpoint?.endedAt;
  let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  let formTail = '';
  const diagnostic: { stage: 'connection' | 'activity' } = { stage: 'connection' };
  const saveCheckpoint = () => {
    if(checkpointTimer)clearTimeout(checkpointTimer);checkpointTimer=undefined;
    if(!continuation)return;
    const pending=pendingDirectSiteRun(input.persistenceSurface);
    if(pending?.connection.id!==continuation.id)return;
    const compact = {...pending, metadata: withoutTranscriptEvents(pending.metadata), checkpoint: undefined};
    // The Bridge owns the complete event log. Oversized or quota-rejected display
    // checkpoints recover by replaying that log from zero, never from a partial cursor.
    const snapshot = JSON.stringify({...compact,checkpoint:{content,events,sequence,...(completed?{outcome,endedAt}:{})}});
    try { window.sessionStorage.setItem(storageKey, snapshot.length <= 256_000 ? snapshot : JSON.stringify(compact)); }
    catch { try { window.sessionStorage.setItem(storageKey, JSON.stringify(compact)); } catch { /* Live owner remains usable. */ } }
  };
  const stop = () => {
    presentation.flush();
    presentation.dispose();
    saveCheckpoint();
    if (continuation) void pixflowRuntimeFetch('/api/pixflow/direct-site/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...continuation,session}), keepalive: true,
    }).catch(() => undefined);
  };
  input.signal.addEventListener('abort', stop, { once: true });
  const checkpointOnHide = () => { presentation.flush(); saveCheckpoint(); };
  window.addEventListener('pagehide', checkpointOnHide);
  document.addEventListener('visibilitychange', checkpointOnHide);
  const unsubscribeTranscript = input.voiceConnection?.subscribeTranscript?.(event => {
    if (input.signal.aborted || completed) return;
    const index = event.id ? events.findIndex(existing => existing.kind === 'voice_transcript' && existing.id === event.id) : -1;
    if (event.id && index < 0) pendingSpokenUserIds.add(event.id);
    if (index >= 0) events[index] = event; else events.push(event);
    content = events.map(item => item.kind === 'text' ? item.text : item.kind === 'voice_transcript' ? `\n\n**${item.role === 'user' ? 'You' : 'Codex'}:** ${item.text}\n\n` : '').join('');
    presentation.schedule();
    presentation.flush();
    saveCheckpoint();
  });
  try {
    const { voiceConnection, signal, onUpdate: _onUpdate, onOutcome: _onOutcome, onPlainReplyFinished: _onPlainReplyFinished, onAccepted: _onAccepted, resume: _resume, persistenceMetadata: _metadata, persistenceSurface: _surface, historySource: _historySource, panelPreparation: _prepared, ...request } = input;
    const conversationId=input.resume?.conversationId || input.conversationId || directConversationId(input.persistenceSurface || 'bricks',input.history,input.canvasPostId ? `post:${input.canvasPostId}` : input.canvasId);
    if(continuation) {
      const pending=pendingDirectSiteRun(input.persistenceSurface);
      if(pending?.connection.id===continuation.id)try{window.sessionStorage.setItem(storageKey,JSON.stringify({...pending,conversationId}));}catch { /* Optional storage. */ }
    }
    const attachments = input.resume ? undefined : await prepareDocumentAttachments(request.attachments, siteDocumentRead(session), signal);
    timings.bridgeRequestMs = elapsed();
    const submit = () => pixflowRuntimeFetch(input.resume ? '/api/pixflow/direct-site/resume-stream' : '/api/pixflow/direct-site/run-stream', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.resume ? {...continuation,session,afterSequence:sequence} : { ...request, attachments, session, continuation, conversationId,surface:input.persistenceSurface || 'bricks' }),
    });
    let response = await submit();
    if (response.status === 403) {
      const denial = await response.clone().json().catch(() => null);
      // Only this middleware response proves the run handler never started.
      if (denial?.error?.code === 'PIXFLOW_CENTRAL_ENTITLEMENT_REQUIRED') {
        await ensurePixflowLicenseEntitlement({ allowSiteSwitch: false });
        signal.throwIfAborted();
        response = await submit();
      }
    }
    if (response.status === 409 && historyBinding && !input.resume
      && (await response.clone().json().catch(() => null))?.code === 'DIRECT_HISTORY_CHANGED') {
      // This specific response precedes admission. Preserve the run ID and retry once.
      const fresh = await createPanelSession({ editorTarget: input.editorTarget, purpose: input.purpose,
        workspaceSource: input.workspaceSource, historyBinding }, signal);
      const { historyPage, historyRevision, ...credential } = fresh;
      session = credential;
      try { request.history = await preparedHistory(historyPage, historyRevision); }
      catch (error) { await closeUnusedSession(credential); throw error; }
      timings.historyRefreshed = 1;
      response = await submit();
    }
    timings.bridgeHeadersMs = elapsed();
    if (response.status === 404 && input.resume) completed = true;
    if (!response.ok) {
      const body = await response.text();
      // A rejected new request never owned a running agent. Do not manufacture
      // an interrupted checkpoint or invite the user to reconnect to that run.
      if (!input.resume && response.status >= 400 && response.status < 500) {
        admissionRejected = completed = true;
        outcome = 'failed';
        let message = `The Bridge could not start this request (HTTP ${response.status}).`;
        for (const line of body.split('\n')) {
          try {
            const event = JSON.parse(line);
            if (typeof event.message === 'string' && event.message.trim()) { message = event.message; break; }
            if (typeof event.error === 'string' && event.error.trim()) { message = event.error; break; }
          } catch { /* Non-JSON HTTP errors use the bounded fallback below. */ }
        }
        if (!body.trim().startsWith('{') && !body.includes('<') && body.trim().length <= 500 && body.trim()) message = body.trim();
        input.onOutcome?.(outcome);
        throw new DirectSiteRunError(message, outcome);
      }
      throw new StreamAttachmentHttpError(response.status, 'Could not reconnect to the existing run. Reopen the panel to retry; previous changes are retained.');
    }
    if (!response.body) throw new Error('Direct agent connection failed.');
    if (!input.resume) await input.onAccepted?.();
    if(content || events.length)input.onUpdate(content,[...events]);
    let reader = response.body.getReader();
    let decoder = new TextDecoder();
    let reconnects = 0;
    let buffer = '';
    let failure = '';
    const accept = (line: string) => {
      if (!line.trim()) return;
      diagnostic.stage = 'activity';
      const event = JSON.parse(line);
      if (event.type === 'run' && voiceConnection && continuation) {
        voiceConnection.onEndReady(async () => {
          const result = await pixflowRuntimeFetch('/api/pixflow/direct-site/voice-end', {
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...continuation,session}),
            signal: AbortSignal.timeout(15_000),
          });
          if (!result.ok) throw new Error('Could not end voice yet. Your microphone is muted; try End voice again.');
        });
      }
      if (event.type === 'voice_sdp') { void voiceConnection?.answer(event.sdp).catch(error => voiceConnection.finish(String(error))); return; }
      if(Number.isSafeInteger(event.sequence)) {
        if(event.sequence<=sequence)return;
        sequence=event.sequence;
        // Fresh durable activity ends the previous outage. Replayed duplicates
        // must not reset the bound on repeated empty/disconnected streams.
        reconnects=0;
      }
      timings.events!++;
      if (event.type === 'error') failure = String(event.message || event.error || 'Agent failed.');
      // Claude's result envelope is distinct from intermediate turn_end and per-message
      // deltas. A text-only reply can finish painting before the CLI exits. The run,
      // Stop, persistence and all tool outcomes still belong to the Bridge.
      if (input.agentId === 'claude' && !input.resume && event.type === 'usage' &&
          event.stopReason === 'end_turn' && !event.isError && !failure && content.trim() &&
          !/<question-form\b/i.test(content) && !events.some(item => item.kind === 'tool_use' || item.kind === 'tool_result')) {
        presentation.flush();
        input.onPlainReplyFinished?.();
      }
      if (event.type === 'done') {
        presentation.flush();
        serverTimings = bridgeTimings(event.timings);
        completed=true;outcome=event.outcome || (event.ok?'completed':'failed');
        endedAt=Number.isSafeInteger(event.timestamp) && event.timestamp>0 ? event.timestamp : undefined;
        failure=event.ok?'':String(event.message || failure || 'Agent run did not complete.');
        input.onOutcome?.(outcome,endedAt);
      }
      const translated = translateAgentEvent(event);
      if (translated) {
        if (translated.kind === 'voice_transcript' && translated.role === 'user' && !translated.id && pendingSpokenUserIds.size) {
          const userId = [...pendingSpokenUserIds].at(-1)!;
          pendingSpokenUserIds.delete(userId);
          const index = events.findIndex(item => item.kind === 'voice_transcript' && item.id === userId);
          if (index >= 0) {
            events[index] = { ...translated, id: userId };
            presentation.schedule(); presentation.flush(); saveCheckpoint();
            return;
          }
        }
        const firstReplyText = translated.kind === 'text' && !!translated.text && timings.firstTextReceivedMs === undefined;
        if (translated.kind === 'text') {
          if (translated.text) timings.firstTextReceivedMs ??= elapsed();
          content += translated.text;
        }
        if (translated.kind === 'voice_transcript') content += `\n\n**${translated.role === 'user' ? 'You' : 'Codex'}:** ${translated.text}\n\n`;
        events.push(translated);
        presentation.schedule();
        // Tool boundaries and questions stay responsive; text/thinking alone can wait a frame.
        const questionCompleted = translated.kind === 'text' && /<\/(?:question-form|ask-question)>/i.test(formTail + translated.text);
        if (translated.kind === 'text') formTail = (formTail + translated.text).slice(-32);
        if (firstReplyText || !['text', 'thinking'].includes(translated.kind) || questionCompleted) presentation.flush();
      }
      if (event.type === 'error') presentation.flush();
      if(!checkpointTimer)checkpointTimer=setTimeout(saveCheckpoint,200);
    };
    // Both a read error and an early EOF detach the viewer, not the owned run.
    const reconnect = async () => {
      diagnostic.stage = 'connection';
      reconnects++;
      presentation.flush(); saveCheckpoint();
      await reader.cancel().catch(() => undefined);
      // Recovery authorization is short-lived and revoked by resume-stream.
      // It must not revoke the credential still owned by the running agent.
      // Resume only the existing owned run. Never retry run-stream or resend edits.
      // Discard an incomplete JSON line; the server replays it after the last accepted sequence.
      const resumed = await recoverDirectStream(async attachmentSignal => {
        timings.reattachAttempts = (timings.reattachAttempts || 0) + 1;
        const authorization = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
          method: 'POST', signal: attachmentSignal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'design' }),
        });
        if (!authorization.ok) throw new StreamAttachmentHttpError(authorization.status, 'WordPress could not authorize reconnecting to this run.');
        const recoverySession = await authorization.json() as PixflowDirectSiteSession;
        const response = await pixflowRuntimeFetch('/api/pixflow/direct-site/resume-stream', {
          method: 'POST', signal: attachmentSignal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...continuation, session: recoverySession, afterSequence: sequence }),
        });
        if (!response.ok) throw new StreamAttachmentHttpError(response.status, 'Could not reconnect to the existing run. Reopen the panel to retry; previous changes are retained.');
        return response;
      }, signal);
      if (!resumed.ok || !resumed.body) throw new DirectSiteRunError('Could not reconnect to the existing run. Reopen the panel to retry; previous changes are retained.', 'interrupted');
      reader = resumed.body.getReader(); decoder = new TextDecoder(); buffer = '';
    };
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      diagnostic.stage = 'connection';
      try { chunk = await reader.read(); }
      catch (error) {
        timings.streamReadErrors = (timings.streamReadErrors || 0) + 1;
        if (!continuation || completed || input.signal.aborted || reconnects >= 2) throw error;
        await reconnect();
        continue;
      }
      const { done, value } = chunk;
      if (input.signal.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new DOMException('The run was canceled.', 'AbortError');
      }
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      lines.forEach(accept);
      if (completed) break;
      if (done) {
        // A clean HTTP close can still truncate the final NDJSON line. Only
        // acknowledge complete events; durable replay supplies any partial tail.
        if (buffer.trim()) {
          let completeLine = true;
          try { JSON.parse(buffer); } catch (error) {
            if (!(error instanceof SyntaxError) || !continuation || (sequence === 0 && timings.events !== 0)) throw error;
            completeLine = false;
          }
          if (completeLine) accept(buffer);
          buffer = '';
        }
        if (completed) break;
        timings.streamEarlyEnds = (timings.streamEarlyEnds || 0) + 1;
        if (!continuation || (sequence === 0 && timings.events !== 0) || reconnects >= 2) break;
        await reconnect();
      }
    }
    if (completed) await reader.cancel().catch(() => undefined);

    if (failure) throw new DirectSiteRunError(failure,outcome);
    if (!completed) throw new DirectSiteRunError('The direct agent connection ended before completion. Reopen the panel to reconnect; the agent may still be running.', 'interrupted');
    return outcome;
  } catch(error) {
    if(error instanceof DirectSiteRunError || input.signal.aborted)throw error;
    if(error instanceof StreamAttachmentHttpError)throw new DirectSiteRunError(error.message,'interrupted',{cause:error});
    // Keep the original cause for local diagnosis without logging prompts,
    // tool output, credentials or transport URLs into the console.
    const errorName = error instanceof SyntaxError ? 'SyntaxError' : error instanceof TypeError ? 'TypeError' : 'Error';
    console.warn('[Pixflow] Direct run interrupted', { stage: diagnostic.stage, sequence, errorName });
    const message = diagnostic.stage === 'activity'
      ? 'The panel could not read or display the Bridge activity data. Reload this page to reconnect to the existing run; changes already applied are retained.'
      : 'The connection to the Bridge was interrupted. Reload this page to reconnect to the existing run. Changes already applied are retained.';
    throw new DirectSiteRunError(message,'interrupted',{cause:error});
  } finally {
    unsubscribeTranscript?.();
    presentation.flush();
    presentation.dispose();
    window.removeEventListener('pagehide', checkpointOnHide);
    document.removeEventListener('visibilitychange', checkpointOnHide);
    saveCheckpoint();
    // A bounded User Timing entry can be inspected locally without collecting private content.
    try {
      performance.clearMeasures('pixflow.direct-run');
      performance.measure('pixflow.direct-run', {start:submitted,end:performance.now(),detail:{...timings,totalMs:elapsed(),outcome,...(serverTimings?{bridge:serverTimings}:{})}});
    } catch { /* Older browsers can still execute runs. */ }
    input.signal.removeEventListener('abort', stop);
    if (continuation && activeRunOwners.get(storageKey)?.connection.id === continuation.id) activeRunOwners.delete(storageKey);
    if (continuation && (completed || input.signal.aborted)) {
      try { if (pendingDirectSiteRun(input.persistenceSurface)?.connection.id === continuation.id) window.sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    }
    // Revocation is independent of an aborted streaming signal.
    if (session && (!continuation || input.resume || admissionRejected)) {
      await closeUnusedSession(session);
    }
  }
}

async function closeUnusedSession(session: PixflowDirectSiteSession): Promise<void> {
  const endpoint = new URL(session.endpoint);
  endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/session');
  await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } }).catch(() => undefined);
}

/** Release audio even when session preparation fails. */
export async function runDirectSite(request: Parameters<typeof executeDirectSite>[0] & { config?: AppConfig }): Promise<PixflowDirectSiteOutcome> {
  const submitted = performance.now();
  const timings: Record<string, number> = { updates: 0, events: 0 };
  request.signal.throwIfAborted();
  if (request.resume?.preparing) {
    const pending = pendingDirectSiteRun(request.persistenceSurface);
    if (pending?.preparing && pending.connection.id === request.resume.connection.id) {
      try { sessionStorage.removeItem(runStorageKey(request.persistenceSurface)); } catch { /* No executable receipt is discarded. */ }
    }
    throw new DirectSiteRunError('The page changed before this request finished preparing. Your message has been kept. Send it again to continue.', 'interrupted');
  }
  if (!request.resume && request.historySource?.sessionKey && request.persistenceSurface) {
    rememberFloatingConversation(request.historySource.sessionKey, request.persistenceSurface);
    if (request.config && ['admin','bricks'].includes(request.persistenceSurface)) rememberFloatingExecution(request.config);
    request = { ...request, persistenceMetadata: { ...(request.persistenceMetadata as object), sessionKey: request.historySource.sessionKey } };
  }
  const prepareEditor = async () => {
    if (request.resume || request.purpose === 'guidance-draft') return request;
    const { resolveEditorRunTarget } = await import('./editor-run-target');
    const editorTarget = await resolveEditorRunTarget(request, request.signal);
    timings.editorReadyMs = Math.round(performance.now() - submitted);
    return { ...request, editorTarget, ...(request.persistenceMetadata !== undefined ? {
      persistenceMetadata: { ...(request.persistenceMetadata as object), editorTarget },
    } : {}) };
  };
  if (request.resume?.byok || request.config?.mode === 'api') {
    if (!request.config) throw new Error('API settings are still loading. Reopen this panel to resume.');
    return runByokSite({ ...await prepareEditor(), config: request.config });
  }
  const authorize = async () => {
    await ensurePixflowLicenseEntitlement({ allowSiteSwitch: !request.resume, reusePairing: true });
    timings.licenseReadyMs = Math.round(performance.now() - submitted);
  };
  const historyOwner = chatHistoryOwnerScope();
  const prepareHistory = async (page?: SavedHistoryPage, revision?: string) => {
    if (request.resume || !request.historySource) return request.history;
    if (!request.historySource.messages.length) return [];
    const { prepareHistorySource } = await import('./working-context');
    if (chatHistoryOwnerScope() !== historyOwner) throw new Error('The signed-in account changed. Reopen this chat before continuing.');
    const source = await prepareHistorySource(request.historySource, request.signal, page, Boolean(revision));
    timings.historyReadyMs = Math.round(performance.now() - submitted);
    return source.messages;
  };
  const authorization = authorize();
  // Always observe failures, including when context preparation fails first.
  void authorization.catch(() => undefined);
  const source = request.historySource;
  const historyBinding = !request.resume && source?.checkSavedPageFirst && source.binding && source.messages.at(-1)?.id
    ? { ...source.binding, throughMessageId: source.messages.at(-1)!.id } : undefined;
  const separateHistory = historyBinding ? undefined : prepareHistory();
  void separateHistory?.catch(() => undefined);
  const history = (page?: SavedHistoryPage, revision?: string) => separateHistory ?? prepareHistory(page, revision);
  const prepared = await prepareEditor();
  const { config: _config, ...execution } = prepared;
  let input = execution;
  const voiceUpdates = input.voiceConnection ? voiceStatusUpdates(input.voiceConnection, input.onUpdate) : undefined;
  if (voiceUpdates) input = { ...input, onUpdate: voiceUpdates.update };
  try {
  // The Bridge reads its current guidance setting as part of run admission.
  if (!input.voiceConnection) return executeDirectSite(input, submitted, timings, authorization, history, historyBinding);
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  input.voiceConnection.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted || input.voiceConnection.signal.aborted) abort();
  try { return await executeDirectSite({ ...input, voice: { sdp: input.voiceConnection.sdp, name: input.voiceConnection.name }, signal: controller.signal }, submitted, timings, authorization, history, historyBinding); }
  catch (error) { input.voiceConnection.finish(controller.signal.aborted ? undefined : error instanceof Error ? error.message : String(error)); throw error; }
  finally { input.signal.removeEventListener('abort', abort); input.voiceConnection.signal.removeEventListener('abort', abort); input.voiceConnection.finish(); }
  } finally { voiceUpdates?.dispose(); }
}
import { directMcpMentionContext } from './mcp-mentions';
