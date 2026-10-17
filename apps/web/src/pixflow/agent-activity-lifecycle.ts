import type {
  AgentActivityPhase,
  AgentActivitySource,
  PersistedAgentEvent,
} from '@open-design/contracts';

export type AgentActivityEvent = Extract<PersistedAgentEvent, { kind: 'activity' }>;

/**
 * Keep provider activity/thinking/tool evidence while making one explicit
 * visible assistant text authoritative. Internal semantic contracts and raw
 * transport frames must never become user-facing chat content.
 */
export function sanitizeAgentAssistantEvents(
  events: unknown[],
  visibleText: string,
): unknown[] {
  const retained = events.filter((event) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return true;
    const kind = String((event as Record<string, unknown>).kind || '');
    return kind !== 'text' && kind !== 'raw';
  });
  return visibleText ? [...retained, { kind: 'text', text: visibleText }] : retained;
}

export function boundedAgentActivityText(value: unknown, max = 240): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function boundedAgentActivitySources(
  sources: AgentActivitySource[] | undefined,
): AgentActivitySource[] | undefined {
  if (!sources?.length) return undefined;
  const out: AgentActivitySource[] = [];
  const seen = new Set<string>();
  for (const source of sources.slice(0, 8)) {
    const title = boundedAgentActivityText(source.title, 160);
    const url = boundedAgentActivityText(source.url, 2_048);
    if (!title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title,
      url,
      ...(source.provider ? { provider: boundedAgentActivityText(source.provider, 80) } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function upsertAgentActivity(
  events: PersistedAgentEvent[],
  activity: AgentActivityEvent,
): PersistedAgentEvent[] {
  const index = events.findIndex((event) => event.kind === 'activity' && event.id === activity.id);
  if (index < 0) return [...events, activity];
  const next = [...events];
  next[index] = activity;
  return next;
}

export function agentActivityById(
  events: PersistedAgentEvent[],
  id: string,
): AgentActivityEvent | null {
  const event = events.find((candidate) => candidate.kind === 'activity' && candidate.id === id);
  return event?.kind === 'activity' ? event : null;
}

function isProviderResearchTool(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return [
    'web_search',
    'websearch',
    'search_web',
    'browser_search',
    'tavily_search',
    'research_search',
  ].some((token) => normalized === token || normalized.endsWith(`_${token}`));
}

/**
 * Preserve provider events while deriving the one provider-neutral research
 * lifecycle used by every Pixflow chat surface. Provider labels and raw tool
 * payloads never decide rendering or authority here.
 */
export function mergeProviderAgentEvent(
  events: PersistedAgentEvent[],
  event: PersistedAgentEvent,
  now = Date.now(),
): PersistedAgentEvent[] {
  if (event.kind === 'activity') return upsertAgentActivity(events, event);
  const next = [...events, event];
  if (event.kind === 'tool_use' && isProviderResearchTool(event.name)) {
    return upsertAgentActivity(next, {
      kind: 'activity',
      id: `provider-research:${boundedAgentActivityText(event.id, 120)}`,
      origin: 'provider',
      phase: 'researching',
      status: 'started',
      label: 'Researching current public sources…',
      detail: boundedAgentActivityText(event.name, 120),
      startedAt: now,
    });
  }
  if (event.kind === 'tool_result') {
    const use = events.find((candidate) => candidate.kind === 'tool_use' && candidate.id === event.toolUseId);
    if (use?.kind === 'tool_use' && isProviderResearchTool(use.name)) {
      const activityId = `provider-research:${boundedAgentActivityText(event.toolUseId, 120)}`;
      const current = agentActivityById(next, activityId);
      if (current) {
        return upsertAgentActivity(next, {
          ...current,
          status: event.isError ? 'failed' : 'succeeded',
          label: event.isError ? 'Public-source research failed' : 'Public-source research completed',
          endedAt: now,
        });
      }
    }
  }
  return next;
}

export function startAgentActivity(
  events: PersistedAgentEvent[],
  input: { id: string; phase: AgentActivityPhase; label: string; detail?: string },
  now = Date.now(),
): PersistedAgentEvent[] {
  return upsertAgentActivity(events, {
    kind: 'activity',
    id: boundedAgentActivityText(input.id, 160),
    origin: 'pixflow',
    phase: input.phase,
    status: 'started',
    label: boundedAgentActivityText(input.label),
    ...(input.detail ? { detail: boundedAgentActivityText(input.detail, 500) } : {}),
    startedAt: now,
  });
}

export function updateAgentResearchActivity(
  events: PersistedAgentEvent[],
  id: string,
  input: { sourceCount: number; detail?: string; sources?: AgentActivitySource[] },
): PersistedAgentEvent[] {
  const current = agentActivityById(events, id);
  if (!current || current.phase !== 'researching') return events;
  return upsertAgentActivity(events, {
    ...current,
    status: 'progress',
    sourceCount: Math.max(0, Math.min(100, Math.floor(input.sourceCount || 0))),
    ...(input.detail ? { detail: boundedAgentActivityText(input.detail, 500) } : {}),
    ...(boundedAgentActivitySources(input.sources)
      ? { sources: boundedAgentActivitySources(input.sources) }
      : {}),
  });
}

export function completeAgentActivity(
  events: PersistedAgentEvent[],
  id: string,
  input: { label?: string; detail?: string; sourceCount?: number; sources?: AgentActivitySource[] } = {},
  now = Date.now(),
): PersistedAgentEvent[] {
  const current = agentActivityById(events, id);
  if (!current) return events;
  const sources = boundedAgentActivitySources(input.sources) || current.sources;
  return upsertAgentActivity(events, {
    ...current,
    status: 'succeeded',
    label: boundedAgentActivityText(input.label || current.label),
    ...(input.detail ? { detail: boundedAgentActivityText(input.detail, 500) } : {}),
    ...(typeof input.sourceCount === 'number'
      ? { sourceCount: Math.max(0, Math.min(100, Math.floor(input.sourceCount))) }
      : {}),
    ...(sources ? { sources } : {}),
    endedAt: now,
  });
}

export function failAgentActivity(
  events: PersistedAgentEvent[],
  id: string,
  detail: string,
  canceled = false,
  now = Date.now(),
): PersistedAgentEvent[] {
  const current = agentActivityById(events, id);
  if (!current) return events;
  return upsertAgentActivity(events, {
    ...current,
    status: canceled ? 'canceled' : 'failed',
    detail: boundedAgentActivityText(detail, 500),
    endedAt: now,
  });
}

export function settleActiveAgentActivities(
  events: PersistedAgentEvent[],
  status: 'succeeded' | 'failed' | 'canceled',
  detail = '',
  now = Date.now(),
): PersistedAgentEvent[] {
  return events.map((event) => {
    if (event.kind !== 'activity' || !['started', 'progress'].includes(event.status)) return event;
    return {
      ...event,
      status,
      ...(detail ? { detail: boundedAgentActivityText(detail, 500) } : {}),
      endedAt: now,
    };
  });
}
