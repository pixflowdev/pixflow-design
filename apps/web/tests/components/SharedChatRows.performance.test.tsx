// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dict } from '../../src/i18n/types';
import type { ChatMessage } from '../../src/types';
import { SharedChatRows } from '../../src/components/shared-chat/SharedChatRows';

const observed = vi.hoisted(() => ({ messages: new Map<string, ChatMessage>(), files: new Map<string, unknown>(), renderCount: 0 }));
vi.mock('../../src/components/AssistantMessage', async () => {
  const { memo } = await import('react');
  return { AssistantMessage: memo(({ message, projectFiles }: { message: ChatMessage; projectFiles: unknown }) => {
    observed.renderCount++;
    observed.messages.set(message.id, message);
    observed.files.set(message.id, projectFiles);
    return <article data-message={message.id}>{message.content}</article>;
  }, (before, after) => before.message === after.message && before.projectFiles === after.projectFiles) };
});
const t = (key: keyof Dict) => key;
afterEach(() => { cleanup(); observed.messages.clear(); observed.files.clear(); observed.renderCount = 0; });

describe('shared long-conversation rendering', () => {
  it.each([1000, 5000])('preserves all %i loaded rows without renormalizing history on each streamed frame', count => {
    const messages: ChatMessage[] = Array.from({ length: count }, (_, index) => ({
      id: `large-${index}`, role: 'assistant', content: `Preserved answer ${index}`,
      createdAt: 1792140000000 + index, endedAt: 1792140001000 + index, runStatus: 'succeeded',
    }));
    messages[count - 1] = { ...messages[count - 1]!, runStatus: 'running', endedAt: undefined };
    const started = performance.now();
    const view = render(<SharedChatRows messages={messages} paneStreaming t={t} />);
    const mountMs = performance.now() - started;
    const first = observed.messages.get('large-0');
    const files = observed.files.get('large-0');
    expect(observed.renderCount).toBe(count);
    const next = [...messages];
    next[count - 1] = { ...next[count - 1]!, content: 'New streamed token' };
    const updateStarted = performance.now();
    view.rerender(<SharedChatRows messages={next} paneStreaming t={t} />);
    const updateMs = performance.now() - updateStarted;
    expect(view.container.querySelectorAll('[data-message]')).toHaveLength(count);
    expect(observed.messages.get('large-0')).toBe(first);
    expect(observed.files.get('large-0')).toBe(files);
    expect(observed.renderCount).toBe(count + 1);
    expect(observed.messages.get(`large-${count - 1}`)?.content).toBe('New streamed token');
    expect(view.container.textContent).toContain('Preserved answer 0');
    console.info(JSON.stringify({ scenario: 'shared-rows-jsdom', count, mountMs, updateMs, renderer: 'stubbed AssistantMessage; not browser paint' }));
  });

  it('refreshes replaced source data and live identity without changing saved identities', () => {
    const completed: ChatMessage = { id: 'saved', role: 'assistant', content: 'Before', createdAt: 1, endedAt: 2, agentId: 'openai' };
    const active: ChatMessage = { id: 'active', role: 'assistant', content: 'Working', createdAt: 3, runStatus: 'running' };
    const view = render(<SharedChatRows messages={[completed, active]} fallbackAgentIdentity={{ agentId: 'codex', agentName: 'Codex' }} t={t} />);
    view.rerender(<SharedChatRows messages={[{ ...completed, content: 'Edited' }, active]} fallbackAgentIdentity={{ agentId: 'claude', agentName: 'Claude' }} t={t} />);
    expect(observed.messages.get('saved')).toMatchObject({ content: 'Edited', agentId: 'openai' });
    expect(observed.messages.get('active')).toMatchObject({ agentId: 'claude', agentName: 'Claude' });
  });
});
