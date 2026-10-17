import {
  PIXFLOW_WP_ADMIN_MEMORY_CAPS,
  PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA,
  type PixflowWpAdminContext,
  type PixflowWpAdminInteractionMode,
  type PixflowWpAdminWorkingMemory,
  type PixflowWpAdminWorkingMemoryFact,
} from '@open-design/contracts';

const SECRET = /(?:api[_ -]?key|secret|password|passwd|token|nonce|bearer|approval|credential|private[_ -]?key)/i;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type WpAdminWorkingMemoryInput = {
  siteHash: string;
  userId: string;
  conversationId: string;
  context?: PixflowWpAdminContext | Record<string, unknown>;
};

function clean(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function key(input: WpAdminWorkingMemoryInput): string {
  return `pixflow:wp-admin:working-memory:v1:${clean(input.siteHash, 120)}:${clean(input.userId, 80)}:${clean(input.conversationId, 160)}`;
}
function empty(input: WpAdminWorkingMemoryInput): PixflowWpAdminWorkingMemory {
  return { schema: PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA, version: 1, scope: 'session', siteId: clean(input.siteHash, 120), userId: clean(input.userId, 80), sessionId: clean(input.conversationId, 160), restored: false, recentChat: [], facts: [] };
}
function contextTarget(context?: PixflowWpAdminContext | Record<string, unknown>) {
  const record = context && typeof context === 'object' ? context as Record<string, unknown> : {};
  const resource = (record.resource || record.object) as Record<string, unknown> | undefined;
  return resource && typeof resource === 'object' ? {
    kind: typeof resource.kind === 'string' ? resource.kind : 'unknown',
    id: typeof resource.id === 'number' || typeof resource.id === 'string' ? resource.id : null,
    postType: typeof resource.postType === 'string' ? resource.postType : null,
    taxonomy: typeof resource.taxonomy === 'string' ? resource.taxonomy : null,
  } : { kind: 'unknown', id: null };
}

export function wpAdminWorkingMemoryStorageKey(input: WpAdminWorkingMemoryInput): string { return key(input); }

export function sanitizeWpAdminWorkingMemory(memory: PixflowWpAdminWorkingMemory): PixflowWpAdminWorkingMemory {
  const facts = memory.facts.filter((fact) => fact && !SECRET.test(JSON.stringify(fact))).slice(-PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxFacts).map((fact) => ({
    ...fact,
    capabilityId: clean(fact.capabilityId, 160), integrationId: clean(fact.integrationId, 80), intent: clean(fact.intent, 240),
    sourceMessageId: clean(fact.sourceMessageId, 160), targetFingerprint: clean(fact.targetFingerprint, 180),
    skillIds: fact.skillIds.filter((id) => !SECRET.test(id)).slice(0, PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxSkillIds),
  }));
  const cutoff = Date.now() - MAX_AGE_MS;
  const recentChat = memory.recentChat.filter((item) => item.createdAt >= cutoff && !SECRET.test(item.content)).slice(-PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxRecentChatMessages).map((item) => ({
    ...item, id: clean(item.id, 160), content: clean(item.content, PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxRecentMessageChars),
  }));
  const next: PixflowWpAdminWorkingMemory = { ...memory, siteId: clean(memory.siteId, 120), userId: clean(memory.userId, 80), sessionId: clean(memory.sessionId, 160), facts, recentChat, restored: true };
  try {
    if (new TextEncoder().encode(JSON.stringify(next)).length > PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxStoredBytes) {
      next.recentChat = next.recentChat.slice(-4);
      next.facts = next.facts.slice(-12);
    }
  } catch { return empty({ siteHash: memory.siteId, userId: memory.userId, conversationId: memory.sessionId }); }
  return next;
}

export function loadWpAdminWorkingMemory(input: WpAdminWorkingMemoryInput): PixflowWpAdminWorkingMemory {
  const fallback = empty(input);
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(input)) || 'null') as PixflowWpAdminWorkingMemory | null;
    if (!parsed || parsed.schema !== PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA || parsed.siteId !== clean(input.siteHash, 120) || parsed.userId !== clean(input.userId, 80) || parsed.sessionId !== clean(input.conversationId, 160)) return fallback;
    return sanitizeWpAdminWorkingMemory(parsed);
  } catch { return fallback; }
}

export function saveWpAdminWorkingMemory(input: WpAdminWorkingMemoryInput, memory: PixflowWpAdminWorkingMemory): PixflowWpAdminWorkingMemory {
  const next = sanitizeWpAdminWorkingMemory(memory);
  if (typeof window !== 'undefined') { try { window.localStorage.setItem(key(input), JSON.stringify(next)); } catch { /* storage is optional */ } }
  return next;
}

export function appendWpAdminWorkingMemoryTurn(
  input: WpAdminWorkingMemoryInput,
  memory: PixflowWpAdminWorkingMemory,
  turn: { id: string; role: 'user' | 'assistant'; content: string; mode: PixflowWpAdminInteractionMode; createdAt?: number },
): PixflowWpAdminWorkingMemory {
  if (SECRET.test(turn.content)) return saveWpAdminWorkingMemory(input, memory);
  const next: PixflowWpAdminWorkingMemory = { ...memory, recentChat: [...memory.recentChat, { id: clean(turn.id, 160), role: turn.role, content: clean(turn.content, PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxRecentMessageChars), mode: turn.mode, authority: turn.role === 'assistant' ? 'display_only' : 'conversation_only', createdAt: turn.createdAt || Date.now() }] };
  return saveWpAdminWorkingMemory(input, next);
}

export function rememberWpAdminFact(
  input: WpAdminWorkingMemoryInput,
  memory: PixflowWpAdminWorkingMemory,
  fact: Omit<PixflowWpAdminWorkingMemoryFact, 'target'> & { target?: PixflowWpAdminWorkingMemoryFact['target'] },
): PixflowWpAdminWorkingMemory {
  if (SECRET.test(JSON.stringify(fact))) return memory;
  const nextFact: PixflowWpAdminWorkingMemoryFact = { ...fact, target: fact.target || contextTarget(input.context) } as PixflowWpAdminWorkingMemoryFact;
  return saveWpAdminWorkingMemory(input, { ...memory, facts: [...memory.facts.filter((item) => item.id !== nextFact.id), nextFact] });
}

/** Memory is context-only. This projection intentionally has no capability or approval fields. */
export function workingMemoryContext(memory: PixflowWpAdminWorkingMemory) {
  return { recentChat: memory.recentChat.slice(-8), facts: memory.facts.slice(-12).map(({ capabilityId: _capabilityId, ...fact }) => fact) };
}
