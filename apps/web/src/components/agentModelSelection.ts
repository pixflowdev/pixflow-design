import type { AgentInfo, AgentModelChoice } from '../types';

type AgentModelSource = Pick<AgentInfo, 'id' | 'models'> | null | undefined;

export function normalizeAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | null {
  const configuredModel =
    typeof choice?.model === 'string' && choice.model ? choice.model : null;
  if (agent?.id !== 'amr' || !configuredModel) return null;

  const models = agent.models ?? [];
  const configuredOption = models.find((model) => model.id === configuredModel);
  if (models.length === 0) return null;
  if (configuredOption && configuredOption.enabled !== false) return null;

  const replacement =
    models.find((model) => model.default === true && model.enabled !== false) ??
    models.find((model) => model.enabled !== false);
  if (!replacement) return null;

  return {
    ...choice,
    model: replacement.id,
  };
}

export function effectiveAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | undefined {
  return normalizeAgentModelChoice(agent, choice) ?? choice;
}
