/**
 * Thin wrapper over @anthropic-ai/sdk. Minimal analog of
 * packages/providers/src/index.ts in the reference repo.
 *
 * Runs in the browser with dangerouslyAllowBrowser — this is a BYOK local-
 * first tool, so the key is the user's and never leaves their machine. If
 * you later move to a server-hosted build, drop that flag and proxy through
 * your own backend.
 */
import Anthropic from '@anthropic-ai/sdk';
import { fetchComposioGuidance } from './composio-guidance';
import { effectiveMaxTokens } from '../state/maxTokens';
import type { AgentEvent, AppConfig, ChatMessage } from '../types';
import { streamMessageAnthropicProxy } from './anthropic-compatible';
import type { ProxyContext } from './api-proxy';
import { streamMessageAzure } from './azure-compatible';
import { streamMessageGoogle } from './google-compatible';
import { streamMessageOllama } from './ollama-compatible';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';
import { streamMessageSenseAudio } from './senseaudio-compatible';
import { streamMessageAIHubMix } from './aihubmix-compatible';
import { usesAnthropicProxy } from '../utils/apiProtocol';
import { composioInferenceTurn } from './composio-inference';

// Re-export for convenience
export { isOpenAICompatible } from './openai-compatible';

export interface StreamHandlers {
  onDelta: (textDelta: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export function makeClient(cfg: AppConfig): Anthropic {
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  });
}

export async function streamMessage(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  // Only the senseaudio / aihubmix branches read `context.projectId`
  // today (so the daemon-side `generate_image` tool can write into the
  // active project's folder). Other branches accept and ignore — keeping the
  // signature uniform means the single call site in ProjectView passes
  // the same shape regardless of protocol.
  context?: ProxyContext,
): Promise<void> {
  if (cfg.apiTransport === 'composio') {
    try {
      const result = await composioInferenceTurn({ provider: cfg.composioProvider || '', model: cfg.composioModel || '', system, messages: history.map(message => ({ role: message.role, content: message.content })), maxTokens: cfg.maxTokens || 8192, siteTools: false }, signal);
      signal.throwIfAborted();
      handlers.onDelta(result.text); handlers.onDone(result.text);
    } catch (error) { if (!signal.aborted) handlers.onError(error instanceof Error ? error : new Error(String(error))); }
    return;
  }
  if (cfg.composio?.apiKeyConfigured) {
    const guidance = await fetchComposioGuidance(signal);
    if (guidance) system = `${system}\n\n${guidance}`;
  }
  if (signal.aborted) return;
  // Prefer the explicit Settings protocol; keep the legacy heuristic as a
  // fallback for configs saved before apiProtocol existed.
  if (cfg.apiProtocol === 'azure') {
    return streamMessageAzure(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'ollama') {
    return streamMessageOllama(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'google') {
    return streamMessageGoogle(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'senseaudio') {
    return streamMessageSenseAudio(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'aihubmix') {
    return streamMessageAIHubMix(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'openai' || (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl))) {
    return streamMessageOpenAI(cfg, system, history, signal, handlers);
  }

  if (usesAnthropicProxy(cfg)) {
    return streamMessageAnthropicProxy(cfg, system, history, signal, handlers, context);
  }

  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  const client = makeClient(cfg);
  let acc = '';
  const activityStartedAt = Date.now();
  const activityId = `byok:${cfg.apiProtocol || 'anthropic'}:${activityStartedAt.toString(36)}`;

  try {
    handlers.onAgentEvent?.({
      kind: 'activity', id: activityId, origin: 'provider', phase: 'preparing',
      status: 'started', label: 'Preparing provider response…', startedAt: activityStartedAt,
    });
    const stream = client.messages.stream(
      {
        model: cfg.model,
        max_tokens: effectiveMaxTokens(cfg),
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal },
    );

    stream.on('text', (delta) => {
      acc += delta;
      handlers.onAgentEvent?.({
        kind: 'activity', id: activityId, origin: 'provider', phase: 'preparing',
        status: 'progress', label: 'Receiving provider response…', startedAt: activityStartedAt,
      });
      handlers.onDelta(delta);
    });

    await stream.finalMessage();
    handlers.onAgentEvent?.({
      kind: 'activity', id: activityId, origin: 'provider', phase: 'preparing',
      status: 'succeeded', label: 'Provider response received', endedAt: Date.now(),
    });
    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      handlers.onAgentEvent?.({
        kind: 'activity', id: activityId, origin: 'provider', phase: 'preparing',
        status: 'canceled', label: 'Provider response stopped', endedAt: Date.now(),
      });
      return;
    }
    handlers.onAgentEvent?.({
      kind: 'activity', id: activityId, origin: 'provider', phase: 'preparing',
      status: 'failed', label: 'Provider response failed',
      detail: err instanceof Error ? err.message : String(err), endedAt: Date.now(),
    });
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
