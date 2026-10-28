import { floatingRunStorageKey, floatingConversationScope, rememberFloatingConversation, rememberFloatingExecution } from './floating-conversation';
import { withRunDesignGuidance } from './run-design-guidance';
import { useT as usePixflowUiTranslation } from '../i18n';
import { secureRandomUUID } from '../utils/uuid';
import { fetchPixflowOptionalBridgeConfig } from './optional-bridge';
import { voiceStatusUpdates, type CodexVoiceConnection } from './codex-voice-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { PixflowDirectSiteSession, PixflowDirectSiteRunRequest, PixflowDirectSiteOutcome, PixflowDirectSiteSteerResponse, PixflowWorkspaceSource } from '@open-design/contracts';
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
const SITE_ACCESS_CHANGED = 'pixflow:site-access-changed';

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
  useEffect(() => {
    // A preference changed in another tab applies to the next run. Do not
    // replace this panel's execution path or transcript during an active turn.
    if (busy) return;
    let active = true;
    const refresh = async () => {
      // Refresh the authenticated preference without tearing down a healthy
      // canvas/session between turns. Initial hydration starts unready.
      try {
        const response = await pixflowWordPressRestFetch('/wp-admin/direct/settings');
        if (!response.ok) throw await siteAccessError(response);
        await response.json();
        if (active) { setError(''); setDetails(''); }
      } catch (reason) {
        if (active) {
          setError(reason instanceof SiteAccessError ? reason.message : 'The site connection was interrupted. Please retry.');
          setDetails(reason instanceof SiteAccessError ? reason.details : reason instanceof Error ? reason.message : String(reason));
        }
      } finally { if (active) setReady(true); }
    };
    void refresh();
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
export async function steerDirectSite(surface: string, item: ComposerQueueItem): Promise<PixflowDirectSiteSteerResponse> {
  const run = activeRunOwners.get(runStorageKey(surface)) ?? pendingDirectSiteRun(surface);
  if (!run || run.preparing || run.byok || run.checkpoint?.outcome) return { messageId: item.id, state: 'rejected', message: 'The active run is no longer available. Keep this message queued.' };
  const response = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'design' }),
  });
  if (!response.ok) return { messageId: item.id, state: 'rejected', message: 'Reconnect to WordPress before steering.' };
  const session = await response.json() as PixflowDirectSiteSession;
  const result = await pixflowRuntimeFetch('/api/pixflow/direct-site/steer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...run.connection, session, messageId: item.id, prompt: item.prompt, attachments: item.attachments, context: { ...item.meta?.context, ...directMcpMentionContext(item.meta), comments: item.comments } }),
    signal: AbortSignal.timeout(240_000),
  });
  const value = await result.json();
  return result.ok ? value : { messageId: item.id, state: value.state === 'rejected' ? 'rejected' : result.status >= 500 ? 'unconfirmed' : 'rejected', message: value.message || 'Could not deliver guidance. Keep this message queued.' };
}

async function executeDirectSite(input: Omit<PixflowDirectSiteRunRequest, 'session'> & {
  historySource?: import('./working-context').WorkingContextSource;
  workspaceSource?: PixflowWorkspaceSource;
  voiceConnection?: CodexVoiceConnection;
  mode: string;
  signal: AbortSignal;
  onUpdate: (content: string, events: AgentEvent[]) => void;
  persistenceMetadata?: unknown;
  resume?: PendingDirectSiteRun;
  persistenceSurface?: string;
  onOutcome?: (outcome: PixflowDirectSiteOutcome, endedAt?: number) => void;
  onAccepted?: () => Promise<void>;
}): Promise<PixflowDirectSiteOutcome> {
  const submitted = performance.now();
  const timings: Record<string, number> = {updates:0,events:0};
  const elapsed = () => Math.round(performance.now()-submitted);
  const storageKey = runStorageKey(input.persistenceSurface);
  // A reconnect can fail before opening its stream. Keep the already-owned
  // checkpoint visible while the Bridge is unavailable.
  if (input.resume?.checkpoint) input.onUpdate(input.resume.checkpoint.content, [...input.resume.checkpoint.events]);
  try { await ensurePixflowLicenseEntitlement({allowSiteSwitch:!input.resume}); }
  catch (error) {
    if (input.resume) throw new DirectSiteRunError('The Bridge connection is unavailable. Reopen the panel after reconnecting; previous output and changes are retained.', 'interrupted');
    throw error;
  }
  let session: PixflowDirectSiteSession | undefined;
  timings.licenseReadyMs=elapsed();
  let continuation = input.resume?.connection;
  {
    const sessionResponse = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
    method: 'POST', signal: input.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'design', purpose: input.purpose, editorTarget: input.editorTarget, workspaceSource: input.workspaceSource }),
    });
    const value = await sessionResponse.json() as PixflowDirectSiteSession & { message?: string };
    if (!sessionResponse.ok) throw new Error(value.message || 'Could not connect to this WordPress site.');
    if (input.purpose === 'guidance-draft' && value.writable !== false) throw new Error('Update Pixflow Design before generating guidance. A read-only draft session is required.');
    session = value;
    if (!input.resume) input = { ...input, context: withRunDesignGuidance(input.context, session) };
    timings.siteReadyMs=elapsed();
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
    const { voiceConnection, signal, onUpdate: _onUpdate, onOutcome: _onOutcome, onAccepted: _onAccepted, resume: _resume, persistenceMetadata: _metadata, persistenceSurface: _surface, historySource: _historySource, ...request } = input;
    const conversationId=input.resume?.conversationId || input.conversationId || directConversationId(input.persistenceSurface || 'bricks',input.history,input.canvasPostId ? `post:${input.canvasPostId}` : input.canvasId);
    if(continuation) {
      const pending=pendingDirectSiteRun(input.persistenceSurface);
      if(pending?.connection.id===continuation.id)try{window.sessionStorage.setItem(storageKey,JSON.stringify({...pending,conversationId}));}catch { /* Optional storage. */ }
    }
    const response = await pixflowRuntimeFetch(input.resume ? '/api/pixflow/direct-site/resume-stream' : '/api/pixflow/direct-site/run-stream', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.resume ? {...continuation,session,afterSequence:sequence} : { ...request, session, continuation, conversationId,surface:input.persistenceSurface || 'bricks' }),
    });
    if (response.status === 404 && input.resume) completed = true;
    if (!response.ok || !response.body) throw new Error(await response.text() || 'Direct agent connection failed.');
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
      if (event.type === 'done') {
        presentation.flush();
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
        if (translated.kind === 'text') content += translated.text;
        if (translated.kind === 'voice_transcript') content += `\n\n**${translated.role === 'user' ? 'You' : 'Codex'}:** ${translated.text}\n\n`;
        events.push(translated);
        presentation.schedule();
        // Tool boundaries and questions stay responsive; text/thinking alone can wait a frame.
        const questionCompleted = translated.kind === 'text' && /<\/(?:question-form|ask-question)>/i.test(formTail + translated.text);
        if (translated.kind === 'text') formTail = (formTail + translated.text).slice(-32);
        if (!['text', 'thinking'].includes(translated.kind) || questionCompleted) presentation.flush();
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
      performance.measure('pixflow.direct-run', {start:submitted,end:performance.now(),detail:{...timings,totalMs:elapsed(),outcome}});
    } catch { /* Older browsers can still execute runs. */ }
    input.signal.removeEventListener('abort', stop);
    if (continuation && activeRunOwners.get(storageKey)?.connection.id === continuation.id) activeRunOwners.delete(storageKey);
    if (continuation && (completed || input.signal.aborted)) {
      try { if (pendingDirectSiteRun(input.persistenceSurface)?.connection.id === continuation.id) window.sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    }
    // Revocation is independent of an aborted streaming signal.
    if (session && (!continuation || input.resume)) {
      const endpoint = new URL(session.endpoint);
      endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/session');
      await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } }).catch(() => undefined);
    }
  }
}

/** Release audio even when session preparation fails. */
export async function runDirectSite(request: Parameters<typeof executeDirectSite>[0] & { config?: AppConfig }): Promise<PixflowDirectSiteOutcome> {
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
  if (!request.resume && request.purpose !== 'guidance-draft') {
    const { resolveEditorRunTarget } = await import('./editor-run-target');
    request = { ...request, editorTarget: await resolveEditorRunTarget(request, request.signal) };
    if (request.persistenceMetadata !== undefined) request = { ...request, persistenceMetadata: {...(request.persistenceMetadata as object), editorTarget: request.editorTarget} };
  }
  // Provider credentials belong only to the WordPress provider transport.
  const { config, ...execution } = request;
  if (execution.resume?.byok || config?.mode === 'api') {
    if(!config)throw new Error('API settings are still loading. Reopen this panel to resume.');
    return runByokSite({ ...execution, config });
  }
  let input = execution;
  if (!input.resume && input.historySource) {
    const { prepareHistorySource } = await import('./working-context');
    const source = await prepareHistorySource(input.historySource, input.signal);
    input = { ...input, history: source.messages };
  }
  const voiceUpdates = input.voiceConnection ? voiceStatusUpdates(input.voiceConnection, input.onUpdate) : undefined;
  if (voiceUpdates) input = { ...input, onUpdate: voiceUpdates.update };
  try {
  // Capture the shared preference before asynchronous site/session preparation.
  // Reconnecting streams keep the original server-owned request unchanged.
  if (!input.resume && input.enhancedDesignGuidance === undefined) {
    const config = await fetchPixflowOptionalBridgeConfig();
    if (config) input = { ...input, enhancedDesignGuidance: config.enhancedDesignGuidance !== false };
  }
  if (!input.voiceConnection) return executeDirectSite(input);
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  input.voiceConnection.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted || input.voiceConnection.signal.aborted) abort();
  try { return await executeDirectSite({ ...input, voice: { sdp: input.voiceConnection.sdp, name: input.voiceConnection.name }, signal: controller.signal }); }
  catch (error) { input.voiceConnection.finish(controller.signal.aborted ? undefined : error instanceof Error ? error.message : String(error)); throw error; }
  finally { input.signal.removeEventListener('abort', abort); input.voiceConnection.signal.removeEventListener('abort', abort); input.voiceConnection.finish(); }
  } finally { voiceUpdates?.dispose(); }
}
import { directMcpMentionContext } from './mcp-mentions';
