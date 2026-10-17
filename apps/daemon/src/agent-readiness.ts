import type { AgentInfo, AgentReadiness } from '@open-design/contracts';
import { createHash } from 'node:crypto';

export const AGENT_READINESS_CACHE_MS = 60_000;
const readinessCache = new Map<string, AgentReadiness>();

export function agentReadinessCacheKey(
  agentId: string,
  model: string | undefined,
  configuredEnv: Record<string, string> = {},
): string {
  const stableEnv = Object.keys(configuredEnv)
    .sort()
    .map((key) => [key, configuredEnv[key] ?? '']);
  const profileHash = createHash('sha256').update(JSON.stringify(stableEnv)).digest('hex').slice(0, 16);
  return `${agentId}:${String(model || '').trim() || 'default'}:${profileHash}`;
}

export function readCachedAgentReadiness(key: string, now = Date.now()): AgentReadiness | null {
  const value = readinessCache.get(key);
  if (!value || value.expiresAt <= now) {
    readinessCache.delete(key);
    return null;
  }
  return { ...value, cached: true };
}

export function rememberAgentReadiness(key: string, value: AgentReadiness): AgentReadiness {
  readinessCache.set(key, value);
  return value;
}

export function clearAgentReadinessCache(): void {
  readinessCache.clear();
}

export function buildAgentReadiness(
  agent: AgentInfo,
  requestedModel: string | undefined,
  checkedAt = Date.now(),
  cached = false,
): AgentReadiness {
  const model = String(requestedModel || '').trim();
  const liveModels = agent.modelsSource === 'live' && Array.isArray(agent.models)
    ? agent.models.filter((entry) => entry.enabled !== false)
    : [];
  const modelUnavailable = Boolean(
    model
    && model !== 'default'
    && liveModels.length > 0
    && !liveModels.some((entry) => entry.id === model),
  );
  const status: AgentReadiness['status'] = !agent.available
    ? 'unavailable'
    : agent.authStatus === 'missing'
      ? 'auth_required'
      : modelUnavailable
        ? 'model_unavailable'
        : 'ready';

  return {
    schema: 'pixflow.agent-readiness.v1',
    agentId: agent.id,
    ...(model ? { model } : {}),
    status,
    checkedAt,
    expiresAt: checkedAt + AGENT_READINESS_CACHE_MS,
    cached,
    nonBillable: true,
    agent,
  };
}
