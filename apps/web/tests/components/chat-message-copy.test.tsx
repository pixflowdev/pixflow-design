// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SharedChatRows } from '../../src/components/shared-chat/SharedChatRows';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

const write = vi.fn().mockResolvedValue(true);
vi.mock('../../src/lib/copy-to-clipboard', () => ({ copyToClipboard: (...args: unknown[]) => write(...args) }));
afterEach(() => { cleanup(); write.mockClear(); });
const reply: ChatMessage = { id: 'reply', role: 'assistant', content: 'Older reply\n\nCurrent **reply**',
  events: [{ kind: 'text', text: 'Current **reply**' }], endedAt: 2000, runStatus: 'succeeded' };

it('copies the rendered reply rather than a cumulative content snapshot in both chat surfaces', async () => {
  for (const surface of ['shared', 'workspace']) {
    const view = render(surface === 'shared'
      ? <SharedChatRows messages={[{ id: 'user', role: 'user', content: 'Only this prompt', createdAt: 1000 }, reply]} t={key => key} />
      : <AssistantMessage projectId={null} message={reply} streaming={false} />);
    fireEvent.click(view.container.querySelector('.assistant-copy-button')!);
    await waitFor(() => expect(write).toHaveBeenLastCalledWith('Current **reply**'));
    if (surface === 'shared') {
      fireEvent.click(view.container.querySelector('.user-copy-btn')!);
      await waitFor(() => expect(write).toHaveBeenLastCalledWith('Only this prompt'));
    }
    view.unmount();
  }
});

it('copies saved text when optional stream events have been removed', async () => {
  const view = render(<AssistantMessage projectId={null} message={{ ...reply, content: 'Saved\n\nreply', events: [] }} streaming={false} />);
  fireEvent.click(view.container.querySelector('.assistant-copy-button')!);
  await waitFor(() => expect(write).toHaveBeenLastCalledWith('Saved\n\nreply'));
});

it('keeps earlier replies, user prompts and accepted steering in their own copy buttons after reload', async () => {
  const messages: ChatMessage[] = [
    { id: 'prompt', role: 'user', content: 'Original prompt' },
    { ...reply, content: 'BeforeAfter', events: [
      { kind: 'text', text: 'Before' },
      { kind: 'steering_message', id: 'steer', text: 'Use blue', contentOffset: 6, createdAt: 1000 },
      { kind: 'text', text: 'After' },
    ] },
  ];
  for (const reloaded of [false, true]) {
    const view = render(<SharedChatRows messages={reloaded ? JSON.parse(JSON.stringify(messages)) : messages} t={key => key} />);
    const buttons = view.container.querySelectorAll('.user-copy-btn, .assistant-copy-button');
    expect(buttons).toHaveLength(4);
    for (const [index, expected] of ['Original prompt', 'Before', 'Use blue', 'After'].entries()) {
      fireEvent.click(buttons[index]!);
      await waitFor(() => expect(write).toHaveBeenLastCalledWith(expected));
    }
    view.unmount();
  }
});
