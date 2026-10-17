import { effectiveMaxTokens } from '../state/maxTokens';
import type { AgentEvent, AppConfig, ChatMessage } from '../types';
import type {
  ProxyImageContentBlock,
  ProxyMessage,
  ProxyMessageContent,
  ProxyTextContentBlock,
} from '@open-design/contracts';
import { projectFileUrl } from './registry';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';
import { isAnthropicSupportedImagePath } from '../utils/apiProtocol';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';

/**
 * Optional per-request context that some protocols thread into the
 * proxy body or use to prepare provider-native message payloads:
 *  - `projectId` lets the `generate_image` tool write into the active
 *    project's folder instead of a daemon-global cache, and lets the
 *    Anthropic proxy resolve image attachments into content blocks.
 *  - `byokImageModel` is the user's BYOK Settings default for the
 *    image tool. The LLM can still override per-call via the tool's
 *    `model` arg; this is just the fallback when it omits one.
 * Other protocols ignore unknown body fields, so callers are free to
 * pass this for every protocol.
 */
export interface ProxyContext {
  projectId?: string;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
}

export async function streamProxyEndpoint(
  endpoint: string,
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  let acc = '';
  const providerActivityStartedAt = Date.now();
  const providerActivityId = `byok:${endpoint.replace(/[^a-z0-9]+/gi, '-')}:${providerActivityStartedAt.toString(36)}`;
  let providerActivityStarted = false;

  try {
    const messages = await buildProxyMessages(endpoint, history, context);
    const resp = await fetchProxyEndpoint(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        systemPrompt: system,
        messages,
        maxTokens: effectiveMaxTokens(cfg),
        apiVersion: cfg.apiVersion,
        ...(context?.projectId ? { projectId: context.projectId } : {}),
        ...(context?.byokImageModel
          ? { byokImageModel: context.byokImageModel }
          : {}),
        ...(context?.byokVideoModel
          ? { byokVideoModel: context.byokVideoModel }
          : {}),
        ...(context?.byokSpeechModel
          ? { byokSpeechModel: context.byokSpeechModel }
          : {}),
        ...(context?.byokSpeechVoice
          ? { byokSpeechVoice: context.byokSpeechVoice }
          : {}),
      }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => '');
      handlers.onError(new Error(`proxy ${resp.status}: ${text || 'no body'}`));
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      while (true) {
        const match = buf.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const frame = buf.slice(0, match.index);
        buf = buf.slice(match.index + match[0].length);

        const parsed = parseSseFrame(frame);
        if (!parsed || parsed.kind !== 'event') continue;

        if (parsed.event === 'start') {
          providerActivityStarted = true;
          handlers.onAgentEvent?.({
            kind: 'activity', id: providerActivityId, origin: 'provider', phase: 'preparing',
            status: 'started', label: 'Preparing provider response…', startedAt: providerActivityStartedAt,
          });
          continue;
        }

        const agentEvent = proxyAgentEvent(parsed.event, parsed.data);
        if (agentEvent) {
          handlers.onAgentEvent?.(agentEvent);
          continue;
        }

        if (parsed.event === 'delta') {
          const text = String(parsed.data.delta ?? parsed.data.text ?? '');
          if (text) {
            acc += text;
            if (providerActivityStarted) {
              handlers.onAgentEvent?.({
                kind: 'activity', id: providerActivityId, origin: 'provider', phase: 'preparing',
                status: 'progress', label: 'Receiving provider response…', startedAt: providerActivityStartedAt,
              });
            }
            handlers.onDelta(text);
          }
          continue;
        }

        if (parsed.event === 'error') {
          handlers.onAgentEvent?.({
            kind: 'activity', id: providerActivityId, origin: 'provider', phase: 'preparing',
            status: 'failed', label: 'Provider response failed',
            detail: proxyErrorMessage(parsed.data).slice(0, 500), endedAt: Date.now(),
          });
          handlers.onError(new Error(proxyErrorMessage(parsed.data)));
          return;
        }

        if (parsed.event === 'end') {
          if (providerActivityStarted) {
            handlers.onAgentEvent?.({
              kind: 'activity', id: providerActivityId, origin: 'provider', phase: 'preparing',
              status: 'succeeded', label: 'Provider response received', endedAt: Date.now(),
            });
          }
          handlers.onDone(acc);
          return;
        }
      }
    }

    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      if (providerActivityStarted) {
        handlers.onAgentEvent?.({
          kind: 'activity', id: providerActivityId, origin: 'provider', phase: 'preparing',
          status: 'canceled', label: 'Provider response stopped', endedAt: Date.now(),
        });
      }
      return;
    }
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

function proxyAgentEvent(event: string, data: Record<string, unknown>): AgentEvent | null {
  if (event === 'thinking') {
    const text = String(data.delta ?? data.text ?? '').slice(0, 16_000);
    return text ? { kind: 'thinking', text } : null;
  }
  if (event === 'tool_use') {
    const id = String(data.id || '').slice(0, 160);
    const name = String(data.name || '').slice(0, 160);
    if (!id || !name) return null;
    return { kind: 'tool_use', id, name, input: boundedProxyToolInput(data.input) };
  }
  if (event === 'tool_result') {
    const toolUseId = String(data.toolUseId ?? data.tool_use_id ?? '').slice(0, 160);
    if (!toolUseId) return null;
    return {
      kind: 'tool_result', toolUseId,
      content: String(data.content || '').slice(0, 20_000),
      isError: Boolean(data.isError ?? data.is_error),
    };
  }
  if (event === 'activity') {
    const phases = new Set(['preparing', 'researching', 'reading', 'thinking', 'planning', 'executing', 'verifying']);
    const statuses = new Set(['started', 'progress', 'succeeded', 'failed', 'canceled']);
    const phase = String(data.phase || '');
    const status = String(data.status || '');
    const id = String(data.id || '').slice(0, 160);
    const label = String(data.label || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!id || !label || !phases.has(phase) || !statuses.has(status)) return null;
    return {
      kind: 'activity', id,
      origin: data.origin === 'pixflow' ? 'pixflow' : 'provider',
      phase: phase as Extract<AgentEvent, { kind: 'activity' }>['phase'],
      status: status as Extract<AgentEvent, { kind: 'activity' }>['status'],
      label,
      ...(data.detail ? { detail: String(data.detail).replace(/\s+/g, ' ').trim().slice(0, 500) } : {}),
      ...(typeof data.sourceCount === 'number' ? { sourceCount: Math.max(0, Math.min(100, Math.floor(data.sourceCount))) } : {}),
    };
  }
  return null;
}

function boundedProxyToolInput(value: unknown): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 8_000);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 16_000 ? value : { summary: 'Tool input omitted because it exceeded the display limit.' };
  } catch {
    return { summary: 'Tool input could not be displayed.' };
  }
}

function fetchProxyEndpoint(endpoint: string, init: RequestInit): Promise<Response> {
  if (!hasPixflowWordPressContext()) {
    return fetch(endpoint, init);
  }
  const match = /^\/api\/proxy\/([^/]+)\/stream$/.exec(endpoint);
  if (!match?.[1]) {
    return fetch(endpoint, init);
  }
  return pixflowWordPressRestFetch(`/provider/proxy/${encodeURIComponent(match[1])}/stream`, init);
}

export async function buildProxyMessages(
  endpoint: string,
  history: ChatMessage[],
  context?: ProxyContext,
): Promise<ProxyMessage[]> {
  if (!usesAnthropicMessagesPayload(endpoint) || !context?.projectId) {
    return history.map((m) => ({ role: m.role, content: m.content }));
  }

  const out: ProxyMessage[] = [];
  for (const message of history) {
    out.push({
      role: message.role,
      content: await buildAnthropicMessageContent(message, context.projectId),
    });
  }
  return out;
}

function usesAnthropicMessagesPayload(endpoint: string): boolean {
  return endpoint.includes('/api/proxy/anthropic/');
}

async function buildAnthropicMessageContent(
  message: ChatMessage,
  projectId: string,
): Promise<ProxyMessageContent> {
  const imageAttachments = sortAttachmentsByUserOrder(
    (message.attachments ?? []).filter((attachment) => attachment.kind === 'image'),
  );
  if (message.role !== 'user' || imageAttachments.length === 0) {
    return message.content;
  }

  const blocks: Array<ProxyTextContentBlock | ProxyImageContentBlock> = [];
  if (message.content.trim()) {
    blocks.push({ type: 'text', text: message.content });
  }

  for (const attachment of imageAttachments) {
    const block = await readAnthropicImageBlock(projectId, attachment.path);
    if (block) {
      blocks.push(block);
    } else if (isAnthropicSupportedImagePath(attachment.path)) {
      blocks.push({
        type: 'text',
        text: `Attached image could not be sent as native image content: path: ${attachment.path} | name: ${attachment.name}`,
      });
    }
  }

  return blocks.length > 0 ? blocks : message.content;
}

function sortAttachmentsByUserOrder<T extends { order?: number }>(attachments: T[]): T[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

async function readAnthropicImageBlock(
  projectId: string,
  path: string,
): Promise<ProxyImageContentBlock | null> {
  try {
    const resp = await fetch(projectFileUrl(projectId, path), { cache: 'no-store' });
    if (!resp.ok) return null;

    const mediaType = supportedAnthropicImageMediaType(
      resp.headers.get('content-type') ?? '',
      path,
    );
    if (!mediaType) return null;

    const bytes = new Uint8Array(await resp.arrayBuffer());
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: bytesToBase64(bytes),
      },
    };
  } catch {
    return null;
  }
}

function supportedAnthropicImageMediaType(
  contentType: string,
  path: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/gif' ||
    normalized === 'image/webp'
  ) {
    return normalized;
  }
  const lower = path.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += alphabet[(n >> 6) & 63];
    out += alphabet[n & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const n = (a << 16) | (b << 8);
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

function proxyErrorMessage(data: Record<string, unknown>): string {
  const nested = data.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return String(data.message ?? 'proxy error');
}
