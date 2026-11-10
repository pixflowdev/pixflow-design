import type { AgentInfo } from '../types';

/** Model-specific runtime choices take precedence, including an explicit unsupported list. */
export function agentReasoningOptions(agent: AgentInfo | null | undefined, model: string | null | undefined) {
  const options = agent?.models?.find(option => option.id === (model || agent.models?.[0]?.id))?.reasoningOptions
    ?? agent?.reasoningOptions ?? [];
  return agent?.id === 'codex' ? options.filter(option => option.id !== 'ultra') : options;
}
