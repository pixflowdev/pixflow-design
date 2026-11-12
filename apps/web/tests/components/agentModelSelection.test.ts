import { describe, expect, it } from 'vitest';
import {
  effectiveAgentModelChoice,
  normalizeAgentModelChoice,
} from '../../src/components/agentModelSelection';
import type { AgentInfo } from '../../src/types';

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'glm-5', label: 'GLM 5' },
    { id: 'glm-5.1', label: 'GLM 5.1' },
  ],
};

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
};

describe('agent model selection', () => {
  it('selects the newest available named release and Medium for a first run', () => {
    const catalog = {
      ...codexAgent,
      models: [
        ...codexAgent.models!,
        { id: 'older', label: 'Older', releasedAt: '2026-10-01', reasoningOptions: [{ id: 'medium', label: 'Medium' }] },
        { id: 'newest', label: 'Newest', releasedAt: '2026-11-01', reasoningOptions: [{ id: 'medium', label: 'Medium' }] },
        { id: 'unavailable', label: 'Unavailable', releasedAt: '2026-11-04', enabled: false },
      ],
    };
    expect(effectiveAgentModelChoice(catalog, undefined)).toEqual({ model: 'newest', reasoning: 'medium' });
    expect(normalizeAgentModelChoice(catalog, { model: 'default' })).toEqual({ model: 'newest', reasoning: 'medium' });
    expect(effectiveAgentModelChoice(catalog, { model: 'older', reasoning: 'high' })).toEqual({ model: 'older', reasoning: 'high' });
  });

  it('uses provider order without dates and omits a placeholder when the catalogue is empty', () => {
    expect(effectiveAgentModelChoice(amrAgent, undefined)?.model).toBe('glm-5');
    expect(effectiveAgentModelChoice(codexAgent, { model: 'default' })?.model).toBeUndefined();
  });

  it('normalizes stale saved AMR models to the first live model', () => {
    expect(
      normalizeAgentModelChoice(amrAgent, {
        model: 'gpt-5.4-mini',
        reasoning: 'medium',
      }),
    ).toEqual({
      model: 'glm-5',
      reasoning: 'medium',
    });
  });

  it('submits the same normalized AMR model that the switcher displays', () => {
    expect(
      effectiveAgentModelChoice(amrAgent, {
        model: 'gpt-5.4-mini',
        reasoning: 'medium',
      }),
    ).toEqual({
      model: 'glm-5',
      reasoning: 'medium',
    });
  });

  it('keeps non-AMR custom model choices unchanged', () => {
    expect(
      effectiveAgentModelChoice(codexAgent, {
        model: 'custom-codex-model',
        reasoning: 'high',
      }),
    ).toEqual({
      model: 'custom-codex-model',
      reasoning: 'high',
    });
  });

  it('replaces a tier-restricted AMR model with the enabled account default', () => {
    const agent: AgentInfo = {
      ...amrAgent,
      models: [
        { id: 'gpt-5.6', label: 'GPT 5.6', enabled: false },
        { id: 'grok-4.5', label: 'Grok 4.5', enabled: true, default: true },
      ],
    };
    expect(normalizeAgentModelChoice(agent, { model: 'gpt-5.6' })).toEqual({
      model: 'grok-4.5',
    });
  });
});
