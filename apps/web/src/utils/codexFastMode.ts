import type { AgentInfo } from '../types';

/** True only when the installed Codex CLI advertised Fast for this exact model. */
export function codexModelSupportsFastMode(
  agent: AgentInfo | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (agent?.id !== 'codex' || !modelId || modelId === 'default') return false;
  return agent.models
    ?.find((model) => model.id === modelId)
    ?.metadata?.serviceTiers?.includes('fast') === true;
}
