import { describe, expect, it } from 'vitest';

import {
  extractByokPublicReasoningSummary,
  extractPublicThinkingDelta,
} from '../src/agent-thinking.js';

describe('extractPublicThinkingDelta', () => {
  it('does not misclassify ordinary assistant content as thinking', () => {
    expect(extractPublicThinkingDelta({
      type: 'message',
      role: 'assistant',
      content: 'Rendered response',
    })).toBe('');
    expect(extractPublicThinkingDelta({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Cursor response' }] },
    })).toBe('');
    expect(extractPublicThinkingDelta({
      delta: { content: 'OpenCode response' },
    })).toBe('');
  });

  it('accepts explicit provider reasoning fields', () => {
    expect(extractPublicThinkingDelta({
      message: { reasoning_content: 'Public reasoning summary' },
    })).toBe('Public reasoning summary');
    expect(extractPublicThinkingDelta({
      delta: { thinking: 'Thinking update' },
    })).toBe('Thinking update');
  });

  it('accepts generic summary fields only on typed reasoning items', () => {
    expect(extractPublicThinkingDelta({
      item: { type: 'reasoning', summary: [{ text: 'Checked the layout' }] },
    })).toBe('Checked the layout');
    expect(extractPublicThinkingDelta({
      item: { type: 'message', summary: [{ text: 'Normal response' }] },
    })).toBe('');
  });
});

describe('extractByokPublicReasoningSummary', () => {
  it('accepts explicit summary channels from OpenAI and Anthropic wires', () => {
    expect(extractByokPublicReasoningSummary({
      choices: [{ delta: { reasoning_summary: 'Checking the requested constraints.' } }],
    })).toBe('Checking the requested constraints.');
    expect(extractByokPublicReasoningSummary({
      type: 'content_block_delta',
      delta: { type: 'thinking_summary_delta', text: 'Reviewing the available tools.' },
    })).toBe('Reviewing the available tools.');
  });

  it('rejects raw hidden reasoning fields', () => {
    expect(extractByokPublicReasoningSummary({
      choices: [{ delta: { reasoning_content: 'private chain of thought' } }],
      thinking: 'private chain of thought',
    })).toBe('');
  });
});
