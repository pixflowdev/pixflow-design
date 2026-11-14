import { describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../src/runtimes/defs/shared.js', () => ({
  DEFAULT_MODEL_OPTION: { id: 'default', label: 'Default' },
  execAgentFile: execute,
}));
import { antigravityAgentDef } from '../src/runtimes/defs/antigravity.js';

describe('Antigravity installed model discovery', () => {
  it('reads current tab-separated labels without treating progress as a model', async () => {
    execute.mockResolvedValue({ stdout: 'Fetching available models...\r\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\r\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\r\ngemini-3.8-flash-medium\tDuplicate\r\n' });
    expect(await antigravityAgentDef.fetchModels('agy', {})).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    ]);
  });
  it('preserves older ID-only output', async () => {
    execute.mockResolvedValue({ stdout: 'gemini-3.6-flash-high\n' });
    expect(await antigravityAgentDef.fetchModels('agy', {})).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'gemini-3.6-flash-high', label: 'gemini-3.6-flash-high' },
    ]);
  });
});
