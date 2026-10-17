import type { AgentEvent, ChatMessage } from '../types';
import { streamViaDaemon } from '../providers/daemon';
import type { PixflowSurface } from '@open-design/contracts';

export type SemanticPreflightRunnerInput<TRequest, TResult> = {
  surface: PixflowSurface;
  request: TRequest;
  prompt: string;
  agentId: string;
  projectId?: string | null;
  conversationId: string;
  model?: string | null;
  reasoning?: string | null;
  signal: AbortSignal;
  parse: (text: string) => TResult | null;
  stream?: (prompt: string, signal: AbortSignal, handlers: { onDelta: (delta: string) => void; onDone: (text: string) => void; onError: (error: Error) => void }) => Promise<void>;
};

function balancedJsonObjects(source: string): string[] {
  const values: string[] = [];
  let start = -1;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] || '';
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"') {
      if (depth > 0) quote = char;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        values.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return values.slice(0, 16);
}

function boundedJsonCandidates(text: string): string[] {
  const source = String(text || '').trim().slice(0, 64_000);
  const fenced = Array.from(source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]?.trim()).filter(Boolean) as string[];
  return Array.from(new Set([...fenced, ...balancedJsonObjects(source), source].filter(Boolean)));
}

function providerEnvelopeValues(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const object = value as Record<string, unknown>;
  const candidates: unknown[] = [];
  const appendArguments = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
    const entry = candidate as Record<string, unknown>;
    const fn = entry.function && typeof entry.function === 'object' && !Array.isArray(entry.function)
      ? entry.function as Record<string, unknown>
      : null;
    if (fn?.arguments !== undefined) candidates.push(fn.arguments);
    if (entry.arguments !== undefined && (entry.name !== undefined || entry.type === 'function')) candidates.push(entry.arguments);
  };
  if (Array.isArray(object.tool_calls)) object.tool_calls.slice(0, 8).forEach(appendArguments);
  appendArguments(object.function_call);
  appendArguments(object.tool_call);
  if (Array.isArray(object.content)) {
    for (const block of object.content.slice(0, 16)) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      const entry = block as Record<string, unknown>;
      if (entry.type === 'tool_use' || entry.type === 'function_call') candidates.push(entry.input ?? entry.arguments);
      if ((entry.type === 'text' || entry.type === 'output_text') && typeof entry.text === 'string') candidates.push(entry.text);
    }
  }
  if (Array.isArray(object.output)) {
    for (const item of object.output.slice(0, 16)) candidates.push(...providerEnvelopeValues(item));
  }
  return candidates;
}

function parsedProviderCandidates(candidate: string): unknown[] {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    const envelope = providerEnvelopeValues(parsed).flatMap((value) => {
      if (typeof value !== 'string') return [value];
      return boundedJsonCandidates(value).flatMap((nested) => {
        try { return [JSON.parse(nested) as unknown]; } catch { return []; }
      });
    });
    return [...envelope, parsed];
  } catch {
    return [];
  }
}

export function parseBoundedJson<T>(text: string, normalize: (value: unknown) => T | null): T | null {
  for (const candidate of boundedJsonCandidates(text)) {
    for (const value of parsedProviderCandidates(candidate)) {
      try {
        const parsed = normalize(value);
        if (parsed) return parsed;
      } catch {
        // Try the next deterministic provider-envelope candidate.
      }
    }
  }
  return null;
}

/**
 * Surface-neutral model router. It owns transport/lifecycle only; each
 * surface supplies its own quoted-data prompt and strict contract parser.
 * The runner never dispatches a capability and never treats model output as
 * executable authority.
 */
export async function runSemanticPreflight<TRequest, TResult>(
  input: SemanticPreflightRunnerInput<TRequest, TResult>,
): Promise<TResult> {
  let output = '';
  let failure: Error | null = null;
  const now = Date.now();
  const stream = input.stream;
  if (stream) {
    await stream(input.prompt, input.signal, {
      onDelta(delta) { output += delta; },
      onDone(fullText) { output = fullText || output; },
      onError(error) { failure = error; },
    });
  } else await streamViaDaemon({
    agentId: input.agentId,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId,
    assistantMessageId: `pixflow-${input.surface}-semantic-preflight-assistant:${now.toString(36)}`,
    clientRequestId: `pixflow-${input.surface}-semantic-preflight:${now.toString(36)}`,
    history: [{
      id: `pixflow-${input.surface}-semantic-preflight-user:${now.toString(36)}`,
      role: 'user',
      content: input.prompt,
      createdAt: now,
    } as ChatMessage],
    signal: input.signal,
    cancelSignal: input.signal,
    skillId: null,
    skillIds: [],
    sessionMode: 'chat',
    model: input.model ?? null,
    reasoning: input.reasoning ?? null,
    projectMetadata: {
      kind: `pixflow-${input.surface}-semantic-preflight`,
      intent: `pixflow_${input.surface}_semantic_preflight`,
      skipDiscoveryBrief: true,
      source: `${input.surface}-agent-panel`,
      requestSchema: input.request && typeof input.request === 'object' ? 'bounded' : 'none',
    },
    handlers: {
      onDelta(delta: string) { output += delta; },
      onDone(fullText: string) { output = fullText || output; },
      onAgentEvent(_event: AgentEvent) {},
      onError(error: Error) { failure = error; },
    },
  });
  if (failure) throw failure;
  const parsed = input.parse(output);
  if (!parsed) throw new Error(`Pixflow ${input.surface} semantic preflight did not return a valid contract.`);
  return parsed;
}
