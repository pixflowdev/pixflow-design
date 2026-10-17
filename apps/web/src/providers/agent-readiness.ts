import type { AgentReadiness, AgentReadinessResponse } from '@open-design/contracts';
import { pixflowOptionalBridgeCanRequest, pixflowOptionalBridgeJson } from '../pixflow/optional-bridge';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';

export const AGENT_READINESS_EVENT = 'pixflow-design:agent-readiness';

export type SelectedAgentReadinessInput = {
  mode?: string;
  agentId?: string | null;
  model?: string | null;
  force?: boolean;
};

type BridgeReadinessStatus = {
  running?: boolean;
  state?: string;
  status?: string;
  siteMismatch?: boolean;
  instanceId?: string;
  site?: { key?: string } | null;
};

const cache = new Map<string, AgentReadiness>();
const requests = new Map<string, Promise<AgentReadiness | null>>();

function readinessKey(agentId: string, model?: string | null): string {
  return `${agentId}:${String(model || '').trim() || 'default'}`;
}

function readinessPath(agentId: string, model?: string | null, force = false): string {
  const query = new URLSearchParams();
  const normalizedModel = String(model || '').trim();
  if (normalizedModel) query.set('model', normalizedModel);
  if (force) query.set('force', '1');
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return `agents/${encodeURIComponent(agentId)}/readiness${suffix}`;
}

export function agentReadinessBridgeStatusSignature(value: unknown): string {
  const status = value && typeof value === 'object' ? value as BridgeReadinessStatus : {};
  return [
    status.running === true ? 'running' : 'stopped',
    String(status.state || status.status || ''),
    status.siteMismatch === true ? 'mismatch' : 'matched',
    String(status.instanceId || ''),
    String(status.site?.key || ''),
  ].join('|');
}

export function bridgeStatusCanWarmAgentReadiness(value: unknown): boolean {
  const status = value && typeof value === 'object' ? value as BridgeReadinessStatus : {};
  return status.siteMismatch !== true
    && (status.running === true || status.state === 'connected' || status.status === 'connected');
}

function publish(readiness: AgentReadiness): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AGENT_READINESS_EVENT, { detail: readiness }));
}

export function readSelectedAgentReadiness(
  agentId: string,
  model?: string | null,
): AgentReadiness | null {
  const value = cache.get(readinessKey(agentId, model));
  if (!value || value.expiresAt <= Date.now()) return null;
  return value;
}

export function clearAgentReadinessCache(): void {
  cache.clear();
  requests.clear();
}

/**
 * Verify only the selected local CLI. This calls version/auth/model discovery
 * and never submits a prompt, starts a generation, or consumes provider usage.
 */
export async function warmSelectedAgentReadiness(
  input: SelectedAgentReadinessInput,
): Promise<AgentReadiness | null> {
  if (input.mode !== 'daemon') return null;
  if (hasPixflowWordPressContext() && !pixflowOptionalBridgeCanRequest(input.force === true)) return null;
  const agentId = String(input.agentId || '').trim();
  if (!agentId) return null;
  const key = readinessKey(agentId, input.model);
  const current = cache.get(key);
  if (!input.force && current && current.expiresAt > Date.now()) {
    publish(current);
    return current;
  }
  const pending = requests.get(key);
  // WP Admin, Bricks and the workspace can all observe the same heartbeat
  // transition. Even a forced refresh represents one selected-provider probe,
  // so share an already-running request instead of launching parallel CLIs.
  if (pending) return pending;

  const path = readinessPath(agentId, input.model, input.force === true);
  const request = (async () => {
    let result: AgentReadinessResponse;
    if (hasPixflowWordPressContext()) {
      result = await pixflowOptionalBridgeJson<AgentReadinessResponse>(path, {}, { timeoutMs: 12_000 });
    } else {
      const response = await fetch(`/api/${path}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`agent readiness ${response.status}`);
      result = await response.json() as AgentReadinessResponse;
    }
    cache.set(key, result.readiness);
    publish(result.readiness);
    return result.readiness;
  })().catch(() => null).finally(() => {
    requests.delete(key);
  });
  requests.set(key, request);
  return request;
}
