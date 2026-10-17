import { useEffect, useRef, useState } from 'react';
import type { ChatAttachment, PixflowBuilderHandoff, PixflowBuilderHandoffResult, PixflowBuilderId, PixflowEditorTarget } from '@open-design/contracts';
import { mutateBuilderHandoff, readBuilderHandoff } from './builder-handoff-client';

export interface BuilderHandoffExecution {
  receipt: PixflowBuilderHandoff;
  accepted(): Promise<void>;
  finished(error?: string, awaitingInput?: boolean): Promise<void>;
}

/** URL carries only a receipt identity; all executable context comes from WordPress. */
export function builderHandoffAddress(href: string): { id: string; tabId: string } | null {
  const url = new URL(href);
  const id = url.searchParams.get('pixflow_handoff');
  const tabId = url.searchParams.get('pixflow_handoff_tab');
  return id && tabId && /^[a-f0-9]{64}$/.test(id) && /^[A-Za-z0-9_-]{16,128}$/.test(tabId) ? { id, tabId } : null;
}

export function builderHandoffAttachments(receipt: PixflowBuilderHandoff): ChatAttachment[] {
  return receipt.assets.map(asset => ({ projectId: asset.projectId, path: asset.path, name: asset.name, kind: asset.mime?.startsWith('image/') ? 'image' : 'file' }));
}

/** A receipt can only recover on its original page and named destination tab. */
function handoffPageIdentity(source: Window): string | null {
  const url = new URL(source.location.href);
  const post = url.searchParams.get('post') || url.searchParams.get('page_id') || url.searchParams.get('post_id');
  return post && /^[1-9]\d*$/.test(post) ? `${url.origin}${url.pathname}:${post}` : null;
}

function rememberNamedHandoff(source: Window, address: { id: string; tabId: string }): void {
  const page = handoffPageIdentity(source);
  if (!page || source.name !== `pixflow-build-${address.tabId}`) return;
  try { source.sessionStorage.setItem(`pixflow:builder-launch:${source.name}`, JSON.stringify({ ...address, page })); } catch { /* The current document can still use its launch URL/bootstrap. */ }
}

export function builderHandoffDocumentAddress(source: Window): { id: string; tabId: string } | null {
  const direct = builderHandoffAddress(source.location.href);
  if (direct) { rememberNamedHandoff(source, direct); return direct; }
  const launch = (source as Window & { pixflowDesignWpAdmin?: { builderHandoff?: unknown } }).pixflowDesignWpAdmin?.builderHandoff;
  if (launch && typeof launch === 'object') {
    const { id, tabId, postId } = launch as Record<string, unknown>;
    const currentUrl = new URL(source.location.href);
    const currentPost = currentUrl.searchParams.get('post') || currentUrl.searchParams.get('post_id') || currentUrl.searchParams.get('page_id');
    if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
      && typeof tabId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(tabId)
      && Number(postId) > 0 && String(postId) === currentPost) {
      rememberNamedHandoff(source, { id, tabId });
      return { id, tabId };
    }
  }
  // WordPress replaces history even on reload. A destination's unique window
  // name survives it; copied sessionStorage from another window cannot match.
  if (!/^pixflow-build-[A-Za-z0-9_-]{16,128}$/.test(source.name)) return null;
  try {
    const saved = JSON.parse(source.sessionStorage.getItem(`pixflow:builder-launch:${source.name}`) || 'null');
    if (saved?.page === handoffPageIdentity(source) && saved?.page
      && typeof saved.id === 'string' && /^[a-f0-9]{64}$/.test(saved.id)
      && typeof saved.tabId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(saved.tabId)
      && source.name === `pixflow-build-${saved.tabId}`) return { id: saved.id, tabId: saved.tabId };
  } catch { /* Missing or unavailable storage never authorizes a launch. */ }
  return null;
}

/** Receipt-owned runs never read or replace an unrelated panel checkpoint.
 * This address selects storage only; server claim and canvas checks authorize execution. */
export function builderHandoffPersistenceSurface(builder: PixflowBuilderId, source: Window = window): string {
  // Etch and Elementor share the admin panel; keep its ordinary history key.
  const base = builder === 'bricks' ? 'bricks' : 'admin';
  let host = source;
  let address = builderHandoffDocumentAddress(host);
  try { if (!address && source.parent && source.parent !== source) { host = source.parent; address = builderHandoffDocumentAddress(host); } } catch { /* Cross-origin parent is not a launch authority. */ }
  if (!address) return base;
  return `${base}-handoff:${address.id}:${address.tabId}`;
}

/** New native-builder handoffs own a transcript, so another admin panel cannot
 * replace it. Ordinary history and existing Gutenberg/Bricks recovery stay put. */
export function builderHandoffConversationKey(baseKey: string, persistenceSurface: string, builder: PixflowBuilderId): string {
  if ((builder !== 'etch' && builder !== 'elementor') || !/^admin-handoff:[a-f0-9]{64}:[A-Za-z0-9_-]{16,128}$/.test(persistenceSurface)) return baseKey;
  return `${baseKey}:${builder}:${persistenceSurface}`;
}

const request = (body: Record<string, unknown>) => mutateBuilderHandoff<PixflowBuilderHandoffResult>(body);

/** Completed receipts need no canvas connection, and must never replay on reload. */
function settleTerminalHandoff(receipt: PixflowBuilderHandoff, notice: (message: string) => void): boolean {
  if (receipt.status === 'completed' || receipt.status === 'cancelled') return true;
  if (receipt.status === 'awaiting_input') {
    notice('The agent is waiting for your answer in this conversation. The original request has not been repeated.');
    return true;
  }
  if (receipt.status === 'failed') {
    notice(receipt.error || 'The previous handoff stopped. Check this conversation before starting new work.');
    return true;
  }
  return false;
}

/** A sticky server claim precedes sending. Lost acknowledgements never trigger replay. */
export async function receiveBuilderHandoff(
  address: { id: string; tabId: string }, target: PixflowEditorTarget,
  start: (execution: BuilderHandoffExecution) => Promise<boolean> | boolean,
  notice: (message: string) => void = () => undefined,
): Promise<void> {
  const claimed = await request({ action: 'claim', ...address, editorTarget: target });
  if (!claimed.shouldStart) {
    if (settleTerminalHandoff(claimed.handoff, notice)) return;
    throw new Error('This handoff has already been claimed. Check the existing conversation before trying again; Pixflow has not repeated the request.');
  }
  const receipt = claimed.handoff;
  if (receipt.destination.builder !== target.builder || receipt.destination.postId !== target.postId) throw new Error('The handoff belongs to another editor. Nothing was started.');
  const base = { id: address.id, tabId: address.tabId, messageId: receipt.messageId };
  const execution: BuilderHandoffExecution = {
    receipt,
    accepted: async () => {
      try { await request({ action: 'ack', ...base }); }
      catch { notice('The agent started, but its handoff status could not be confirmed. The request is continuing and will not be repeated.'); }
    },
    finished: async (error, awaitingInput) => {
      try { await request({ action: 'finish', ...base, outcome: error ? 'failed' : awaitingInput ? 'awaiting_input' : 'completed', ...(error ? { error } : {}) }); }
      catch { notice('The agent response is preserved, but its handoff status could not be saved. Check this conversation; the request will not be repeated.'); }
    },
  };
  if (!await start(execution)) {
    await execution.finished('The destination agent was busy or unavailable. No request was started.');
    throw new Error('The destination agent was busy or unavailable. The handoff was not started.');
  }
}

export function useBuilderHandoffReceiver(options: {
  builder: PixflowBuilderId; enabled: boolean; busy: boolean;
  target(): Promise<PixflowEditorTarget | undefined>;
  start(execution: BuilderHandoffExecution): Promise<boolean> | boolean;
  notice(message: string): void;
}): void {
  const latest = useRef(options); latest.current = options;
  const attempted = useRef(false);
  const waitingForConnection = useRef<{ id: string; tabId: string; page: string | null } | null>(null);
  const [connectionRetry, setConnectionRetry] = useState(0);
  useEffect(() => {
    const connected = (event: Event) => {
      const pending = waitingForConnection.current;
      if (!pending || (event as CustomEvent).detail?.connected !== true || !latest.current.enabled || latest.current.busy) return;
      let current = builderHandoffDocumentAddress(window);
      try { current ||= builderHandoffDocumentAddress(window.parent); } catch { /* Cross-origin parents are not launch authorities. */ }
      if (!current || current.id !== pending.id || current.tabId !== pending.tabId || handoffPageIdentity(window) !== pending.page) return;
      // Clear synchronously before scheduling React: an event burst admits only
      // one fresh resolution attempt, and no event can reset an uncertain claim.
      waitingForConnection.current = null;
      attempted.current = false;
      setConnectionRetry(value => value + 1);
    };
    const name = `pixflow-design:${options.builder}-connection`;
    window.addEventListener(name, connected);
    return () => window.removeEventListener(name, connected);
  }, [options.builder]);
  useEffect(() => {
    if (!options.enabled || options.busy || attempted.current) return;
    let host: Window = window;
    let address = builderHandoffDocumentAddress(host);
    try { if (!address) { host = window.parent; address = builderHandoffDocumentAddress(host); } } catch { /* Never inspect another origin. */ }
    if (!address) return;
    const launchPage = handoffPageIdentity(window);
    const hostPage = handoffPageIdentity(host);
    const deadline = Date.now() + 30_000;
    let cancelled = false;
    let claimed = false;
    let resolved = false;
    let receiptChecked = false;
    void (async () => {
      try {
        // Read-only status lookup is not execution authority. Every active
        // receipt still needs the live target and the server's sticky claim.
        const receipt = await readBuilderHandoff({ id: address.id });
        if (cancelled || !latest.current.enabled) return;
        const currentAddress = builderHandoffDocumentAddress(host);
        if (!receipt || receipt.id !== address.id || receipt.targetTabId !== address.tabId
          || receipt.destination.builder !== latest.current.builder
          || !hostPage || handoffPageIdentity(host) !== hostPage
          || !hostPage.endsWith(`:${receipt.destination.postId}`)
          || currentAddress?.id !== address.id || currentAddress.tabId !== address.tabId) {
          throw new Error('The handoff does not match this editor page and tab. Nothing was started.');
        }
        if (settleTerminalHandoff(receipt, message => latest.current.notice(message))) {
          attempted.current = true;
          waitingForConnection.current = null;
          return;
        }
        receiptChecked = true;
        let target: PixflowEditorTarget | undefined;
        while (!cancelled && !target) {
          try { target = await latest.current.target(); } catch (error) { if (Date.now() >= deadline) throw error; }
          if (target) break;
          if (Date.now() >= deadline) throw new Error('The destination editor did not connect. The handoff has not started.');
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (cancelled || !target || !latest.current.enabled) return;
        resolved = true;
        if (target.builder !== latest.current.builder) throw new Error('The handoff destination does not match this editor.');
        if (latest.current.busy) throw new Error('The editor is already running a request. The handoff has not started.');
        attempted.current = true;
        waitingForConnection.current = null;
        claimed = true;
        await receiveBuilderHandoff(address, target, execution => cancelled || !latest.current.enabled || latest.current.busy ? false : latest.current.start(execution), message => latest.current.notice(message));
      } catch (error) { if (!cancelled || claimed) {
        attempted.current = true;
        // Only a failed canvas-resolution attempt is recoverable automatically.
        // Claim/network/start failures remain sticky to prevent duplicate work.
        if (receiptChecked && !claimed && !resolved) waitingForConnection.current = { ...address, page: launchPage };
        latest.current.notice(receiptChecked && !claimed && !resolved
          ? 'The destination editor did not connect yet. Pixflow will continue automatically when this tab connects. No build has started.'
          : error instanceof Error ? error.message : String(error));
      } }
    })();
    return () => { cancelled = true; };
  }, [options.enabled, options.builder, options.busy, connectionRetry]);
}

/** A page change after claim must fail before the agent can start. */
export function assertBuilderHandoffTarget(execution: BuilderHandoffExecution, target: PixflowEditorTarget | undefined): void {
  const expected = execution.receipt.editorTarget;
  if (!target || !expected || target.builder !== expected.builder || target.canvasId !== expected.canvasId || target.postId !== expected.postId) {
    throw new Error('The destination editor changed before the handoff started. Nothing was sent.');
  }
}

export async function finishBuilderHandoffReceipt(receipt: PixflowBuilderHandoff, error?: string, awaitingInput?: boolean): Promise<void> {
  await request({ action: 'finish', id: receipt.id, tabId: receipt.targetTabId, messageId: receipt.messageId, outcome: error ? 'failed' : awaitingInput ? 'awaiting_input' : 'completed', ...(error ? { error } : {}) });
}
