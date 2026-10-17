import type { AgentInfo } from './registry.js';

export const AGENT_READINESS_SCHEMA = 'pixflow.agent-readiness.v1' as const;

export type AgentReadinessStatus =
  | 'ready'
  | 'auth_required'
  | 'unavailable'
  | 'model_unavailable';

export interface AgentReadiness {
  schema: typeof AGENT_READINESS_SCHEMA;
  agentId: string;
  model?: string;
  status: AgentReadinessStatus;
  checkedAt: number;
  expiresAt: number;
  cached: boolean;
  /** Readiness probes never submit a model prompt or consume provider usage. */
  nonBillable: true;
  agent: AgentInfo;
}

export interface AgentReadinessResponse {
  readiness: AgentReadiness;
}
