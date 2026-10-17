import { pixflowWordPressRestFetch } from './runtime-fetch';

const APPLY_DOCUMENT = 'pixflow/wp-admin/gutenberg/apply-document';

export type GutenbergActionUnavailable = Record<string, unknown> & {
  allowed: false;
  code: 'pro_required';
  message: string;
};

/** Feature availability is an ordinary result; authorization failures still use HTTP errors. */
export function isGutenbergActionUnavailable(value: unknown): value is GutenbergActionUnavailable {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.allowed === false && result.code === 'pro_required' && typeof result.message === 'string';
}

export function gutenbergActionUnavailableMessage(value: GutenbergActionUnavailable): string {
  const more = value.learnMore && typeof value.learnMore === 'object' ? value.learnMore as Record<string, unknown> : {};
  if (typeof more.label !== 'string' || typeof more.url !== 'string') return value.message;
  try {
    const url = new URL(more.url);
    if (url.protocol !== 'https:' || url.hostname !== 'pixflow.dev') return value.message;
    const label = more.label.replace(/[\[\]\\]/g, '\\$&');
    return `${value.message}\n\n[${label}](${url.href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
  } catch {
    return value.message;
  }
}

type PreparedTicket = {
  ticketId: string;
  postId: number;
  resolvedTreeHash: string;
  resolvedBlocks?: unknown[];
  editorUrl: string;
};

type PreparedReceipt = {
  preparedReceiptId: string;
  treeHash: string;
  contentHash: string;
  serializedBytes: number;
  topLevelBlockCount: number;
  blockCount: number;
  proposedBlockCount: number;
  blockOutline?: Array<{ name?: string; depth?: number }>;
  media?: Array<Record<string, unknown>>;
  browserValidation?: Record<string, unknown>;
};

const EMPTY_CONTENT_HASH = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function browserValidationDiagnostic(validation: Record<string, unknown>): string {
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  const first = errors[0];
  if (typeof first === 'string') return first.slice(0, 320);
  if (!first || typeof first !== 'object' || Array.isArray(first)) return '';
  const error = first as Record<string, unknown>;
  const name = typeof error.name === 'string' ? error.name : '';
  const index = Number.isInteger(Number(error.index)) ? `block ${Number(error.index)}` : '';
  const issues = Array.isArray(error.issues)
    ? error.issues.filter((issue): issue is string => typeof issue === 'string').slice(0, 3).join('; ')
    : '';
  return [index, name, issues].filter(Boolean).join(' · ').slice(0, 320);
}

export function assertNonEmptyGutenbergSerialization(
  result: { content: string; validation: Record<string, unknown> },
): void {
  const bytes = new TextEncoder().encode(result.content).byteLength;
  const blockCount = Number(result.validation.blockCount || 0);
  if (!result.content.trim() || bytes < 1 || result.validation.valid !== true || blockCount < 1) {
    const diagnostic = browserValidationDiagnostic(result.validation);
    throw new Error(`The target Block Editor returned an empty or unverified document. Nothing was changed.${diagnostic ? ` ${diagnostic}` : ''}`);
  }
}

function assertPreparedReceipt(receipt: PreparedReceipt): void {
  if (!receipt.preparedReceiptId
    || receipt.contentHash === EMPTY_CONTENT_HASH
    || Number(receipt.serializedBytes || 0) < 1
    || Number(receipt.topLevelBlockCount || 0) < 1
    || Number(receipt.blockCount || 0) < 1
    || Number(receipt.proposedBlockCount || 0) < 1
    || !Array.isArray(receipt.blockOutline)
    || receipt.blockOutline.length < 1) {
    throw new Error('WordPress rejected the Gutenberg preparation because its canonical document was empty or contradictory. Nothing was changed.');
  }
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(String(body?.message || `WordPress returned ${response.status}.`));
  }
  return body as T;
}

function serializeInTargetEditor(ticket: PreparedTicket, signal?: AbortSignal): Promise<{
  content: string;
  validation: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Pixflow Gutenberg serializer';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error('The target Block Editor did not finish preparing this document.')), 30_000);

    const finish = (error?: Error, result?: { content: string; validation: Record<string, unknown> }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    const onAbort = () => finish(new DOMException('Stopped.', 'AbortError'));
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.source !== 'pixflow-design-gutenberg-editor' || message.ticketId !== ticket.ticketId) return;
      if (message.type === 'ready' && message.resolvedTreeHash === ticket.resolvedTreeHash) {
        iframe.contentWindow?.postMessage({
          source: 'pixflow-design-gutenberg-host',
          type: 'serialize',
          ticketId: ticket.ticketId,
          resolvedTreeHash: ticket.resolvedTreeHash,
          blocks: ticket.resolvedBlocks ?? [],
        }, window.location.origin);
      } else if (message.type === 'serialized' && typeof message.content === 'string') {
        finish(undefined, {
          content: message.content,
          validation: message.validation && typeof message.validation === 'object'
            ? message.validation as Record<string, unknown>
            : { valid: false, errors: [{ message: 'The editor returned no validation report.' }] },
        });
      } else if (message.type === 'error') {
        finish(new Error(String(message.message || 'The target Block Editor could not serialize the proposed document.')));
      }
    };

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('message', onMessage);
    iframe.src = ticket.editorUrl;
    document.body.appendChild(iframe);
  });
}

export async function discoverGutenbergBlockTypes(
  postId: number,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const response = await pixflowWordPressRestFetch('/wp-admin/gutenberg/discovery-ticket', {
    ...jsonBody({ postId, sessionId: sessionId.slice(0, 160) }),
    signal,
  });
  const ticket = await responseJson<PreparedTicket>(response);
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Pixflow Gutenberg block discovery';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error('The target Block Editor did not finish block discovery.')), 20_000);
    const finish = (error?: Error, items?: Array<Record<string, unknown>>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      if (error) reject(error);
      else resolve(items ?? []);
    };
    const onAbort = () => finish(new DOMException('Stopped.', 'AbortError'));
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.source !== 'pixflow-design-gutenberg-editor' || message.ticketId !== ticket.ticketId) return;
      if (message.type === 'ready' && message.resolvedTreeHash === ticket.resolvedTreeHash) {
        iframe.contentWindow?.postMessage({
          source: 'pixflow-design-gutenberg-host',
          type: 'discover',
          ticketId: ticket.ticketId,
          resolvedTreeHash: ticket.resolvedTreeHash,
        }, window.location.origin);
      } else if (message.type === 'discovered') {
        const items = Array.isArray(message.items)
          ? message.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).slice(0, 500)
          : [];
        finish(undefined, items);
      } else if (message.type === 'error') {
        finish(new Error(String(message.message || 'The target Block Editor could not discover its blocks.')));
      }
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('message', onMessage);
    iframe.src = ticket.editorUrl;
    document.body.appendChild(iframe);
  });
}

/** Parse an exact server read with the real target editor's registered block schemas. */
export async function canonicalizeGutenbergReadBlocks(
  postId: number,
  sessionId: string,
  content: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  if (!content.trim()) throw new Error('The exact Gutenberg read contained no canonical content.');
  const response = await pixflowWordPressRestFetch('/wp-admin/gutenberg/discovery-ticket', {
    ...jsonBody({ postId, sessionId: sessionId.slice(0, 160) }),
    signal,
  });
  const ticket = await responseJson<PreparedTicket>(response);
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Pixflow Gutenberg exact-read parser';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error('The target Block Editor did not finish parsing the exact document read.')), 20_000);
    const finish = (error?: Error, blocks?: unknown[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      if (error) reject(error);
      else resolve(blocks ?? []);
    };
    const onAbort = () => finish(new DOMException('Stopped.', 'AbortError'));
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.source !== 'pixflow-design-gutenberg-editor' || message.ticketId !== ticket.ticketId) return;
      if (message.type === 'ready' && message.resolvedTreeHash === ticket.resolvedTreeHash) {
        iframe.contentWindow?.postMessage({
          source: 'pixflow-design-gutenberg-host',
          type: 'parse',
          ticketId: ticket.ticketId,
          resolvedTreeHash: ticket.resolvedTreeHash,
          content,
        }, window.location.origin);
      } else if (message.type === 'parsed') {
        const validation = message.validation && typeof message.validation === 'object'
          ? message.validation as Record<string, unknown>
          : {};
        const blocks = Array.isArray(message.blocks) ? message.blocks : [];
        if (Number(validation.blockCount || 0) < 1 || blocks.length < 1) {
          finish(new Error('The target Block Editor did not return a complete canonical block tree.'));
        } else {
          finish(undefined, blocks);
        }
      } else if (message.type === 'error') {
        finish(new Error(String(message.message || 'The target Block Editor could not parse the exact document read.')));
      }
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('message', onMessage);
    iframe.src = ticket.editorUrl;
    document.body.appendChild(iframe);
  });
}

/**
 * Converts model-authored blocks into a short-lived canonical receipt before
 * the ordinary Pixflow approval card is created. Raw blocks never enter the
 * generic capability normalizer or reviewed execution request.
 */
export async function prepareGutenbergAction(
  capabilityId: string,
  argumentsValue: Record<string, unknown>,
  sessionId: string,
  signal?: AbortSignal,
  contextBinding?: import('@open-design/contracts').PixflowWpAdminContextAuthorityBinding,
): Promise<Record<string, unknown>> {
  if (capabilityId !== APPLY_DOCUMENT) return argumentsValue;
  const blocks = argumentsValue.blocks;
  if (!Array.isArray(blocks)) {
    throw new Error('The Gutenberg document action is missing its typed block tree.');
  }
  const ticketResponse = await pixflowWordPressRestFetch('/wp-admin/gutenberg/prepare', {
    ...jsonBody({
      postId: argumentsValue.postId,
      expectedFingerprint: argumentsValue.expectedFingerprint,
      blocks,
      sessionId,
      contextBinding,
    }),
    signal,
  });
  const ticket = await responseJson<PreparedTicket | GutenbergActionUnavailable>(ticketResponse);
  if (isGutenbergActionUnavailable(ticket)) return ticket;
  const serialized = await serializeInTargetEditor(ticket, signal);
  assertNonEmptyGutenbergSerialization(serialized);
  const receiptResponse = await pixflowWordPressRestFetch('/wp-admin/gutenberg/serialization-result', {
    ...jsonBody({
      ticketId: ticket.ticketId,
      resolvedTreeHash: ticket.resolvedTreeHash,
      content: serialized.content,
      validation: serialized.validation,
    }),
    signal,
  });
  const receipt = await responseJson<PreparedReceipt | GutenbergActionUnavailable>(receiptResponse);
  if (isGutenbergActionUnavailable(receipt)) return receipt;
  assertPreparedReceipt(receipt);
  const media = Array.isArray(receipt.media) ? receipt.media.slice(0, 24).map((item) => {
    const attachment = item?.attachment && typeof item.attachment === 'object'
      ? item.attachment as Record<string, unknown>
      : {};
    return {
      attachmentId: attachment.attachmentId,
      title: attachment.title,
      thumbnailUrl: attachment.thumbnailUrl,
      altText: item?.altText,
    };
  }) : [];

  const { blocks: _blocks, ...reviewedArguments } = argumentsValue;
  return {
    ...reviewedArguments,
    preparedReceiptId: receipt.preparedReceiptId,
    preparedSessionId: sessionId.slice(0, 160),
    contentIntent: 'replace',
    review: {
      serializedBytes: receipt.serializedBytes,
      topLevelBlockCount: receipt.topLevelBlockCount,
      blockCount: receipt.blockCount,
      blockOutline: Array.isArray(receipt.blockOutline) ? receipt.blockOutline.slice(0, 64) : [],
      media,
      contentHash: receipt.contentHash,
      treeHash: receipt.treeHash,
      browserValidated: receipt.browserValidation?.valid === true,
      replacesEntireDocument: true,
    },
  };
}
