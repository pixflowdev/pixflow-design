import { preferredNamedModel } from '@open-design/contracts';
import type { AgentInfo, AgentModelChoice } from '../types';
import { agentReasoningOptions } from '../utils/agentReasoning';

type AgentModelSource = Pick<AgentInfo, 'id' | 'models' | 'reasoningOptions'> | null | undefined;

export function normalizeAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | null {
  const configuredModel =
    typeof choice?.model === 'string' && choice.model ? choice.model : null;
  if (!agent || !configuredModel) return null;
  if (configuredModel === 'default') return initialAgentModelChoice(agent, choice) ?? null;
  if (agent.id !== 'amr') return null;

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
  return normalizeAgentModelChoice(agent, choice)
    ?? (choice?.model && choice.model !== 'default' ? choice : initialAgentModelChoice(agent, choice));
}

export function namedAgentModels(agent: AgentModelSource) {
  return agent?.models?.filter(model => model.id !== 'default') ?? [];
}

function initialAgentModelChoice(agent: AgentModelSource, choice?: AgentModelChoice): AgentModelChoice | undefined {
  const model = preferredNamedModel(agent?.models);
  if (!model) return choice?.model === 'default' ? { ...choice, model: undefined } : choice;
  const supportsMedium = agentReasoningOptions(agent, model.id).some(option => option.id === 'medium');
  return { ...choice, model: model.id, reasoning: choice?.reasoning ?? (supportsMedium ? 'medium' : undefined) };
}
