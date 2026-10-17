// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { SharedChatRows, normalizeSharedChatMessage } from '../../src/components/shared-chat/SharedChatRows';
import type { Dict } from '../../src/i18n/types';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message, projectId, streaming, nextUserContent, footerAction, conversationUnfinishedTodos }: { projectId?: string; message: ChatMessage; streaming: boolean; nextUserContent?: string; footerAction?: ReactNode; conversationUnfinishedTodos?: unknown[] | null }) => (
    <article
      className="msg assistant"
      data-testid={`assistant-${message.id}`}
      data-project-id={projectId}
      data-streaming={streaming ? 'true' : 'false'}
      data-run-status={message.runStatus ?? ''}
      data-next-user-content={nextUserContent}
      data-events={JSON.stringify(message.events ?? [])}
      data-unfinished={JSON.stringify(conversationUnfinishedTodos ?? [])}
    >
      {message.content}
      {footerAction}
    </article>
  ),
}));

afterEach(() => cleanup());

const translations: Partial<Record<keyof Dict, string>> = {
  'chat.you': 'You',
  'chat.copyPrompt': 'Copy prompt',
  'chat.copyDone': 'Copied',
  'chat.mode.chat.label': 'Ask',
  'chat.mode.plan.label': 'Plan',
  'chat.mode.design.label': 'Design',
};
const t = (key: keyof Dict) => translations[key] ?? key;

describe('SharedChatRows', () => {
  it('defers a steering bubble until the native reply ends and never inserts an empty assistant restart', () => {
    const events: NonNullable<ChatMessage['events']> = [
      { kind: 'assistant_message_boundary', phase: 'started', messageId: 'reply', contentOffset: 0 },
      { kind: 'text', text: 'A partial reply' },
      { kind: 'steering_message', id: 'guidance', text: 'Use blue', contentOffset: 15, createdAt: 1 },
    ];
    const view = render(<SharedChatRows t={t} paneStreaming messages={[{ id: 'run', role: 'assistant', content: 'A partial reply', runStatus: 'running', events }]} />);
    expect(screen.queryByText('Use blue')).toBeNull();
    expect(view.container.querySelectorAll('.msg.assistant')).toHaveLength(1);
    view.rerender(<SharedChatRows t={t} paneStreaming messages={[{ id: 'run', role: 'assistant', content: 'A partial reply completed.', runStatus: 'running', events: [...events,
      { kind: 'text', text: ' completed.' }, { kind: 'assistant_message_boundary', phase: 'completed', messageId: 'reply', contentOffset: 26 },
    ] }]} />);
    expect(screen.getByText('Use blue')).toBeTruthy();
    expect(view.container.querySelectorAll('.msg.assistant')).toHaveLength(1);
    expect(screen.getByTestId('assistant-run').getAttribute('data-streaming')).toBe('true');
  });
  it('preserves paragraph breaks in copied user bubbles without rewriting their content', () => {
    const content = 'First paragraph.\n\nSecond paragraph.\nA separate line.';
    const view = render(<SharedChatRows t={t} paneStreaming={false} messages={[{ id: 'paragraphs', role: 'user', content }]} />);
    expect(view.container.querySelector('.user-bubble')?.textContent).toBe(content);
  });
  it('resolves copied generated media against its original authorized project', () => {
    render(<SharedChatRows t={t} paneStreaming={false} projectId="fork" assistantPropsForMessage={() => ({ projectId: 'fork' })} messages={[{ id: 'copy', role: 'assistant', content: 'Image ready', historyOrigin: { projectId: 'source', conversationId: 'original', messageId: 'original-reply' } }]} />);
    expect(screen.getByTestId('assistant-copy').getAttribute('data-project-id')).toBe('source');
  });
  it('shows the prompt without a redundant You heading, preserving its copy action', () => {
    render(<SharedChatRows t={t} paneStreaming={false} messages={[{ id: 'prompt', role: 'user', content: 'Keep our existing page.' }]} />);
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.getByText('Keep our existing page.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeTruthy();
  });
  it.each([false, true])('ends an empty canceled preparation even when paneStreaming is %s', paneStreaming => {
    render(<SharedChatRows t={t} paneStreaming={paneStreaming} messages={[{
      id: 'canceled-preparation', role: 'assistant', content: '', status: 'streaming',
      runStatus: 'canceled', startedAt: 10, endedAt: 20,
      events: [{ kind: 'status', label: 'compacting' }],
    }]}/>);
    const row = screen.getByTestId('assistant-canceled-preparation');
    expect(row.getAttribute('data-streaming')).toBe('false');
    expect(row.getAttribute('data-run-status')).toBe('canceled');
  });

  it('preserves a terminal cancellation over a stale display streaming flag', () => {
    expect(normalizeSharedChatMessage({ id: 'stopped', role: 'assistant', status: 'streaming', runStatus: 'canceled', endedAt: 20 }, 0))
      .toMatchObject({ runStatus: 'canceled', endedAt: 20 });
  });

  it('preserves Workspace media and timestamps through shared normalization', () => {
    const message: ChatMessage = { id: 'media', role: 'assistant', content: 'Image ready', runStatus: 'succeeded',
      producedFiles: [{ name: 'courtyard.png', kind: 'image', mime: 'image/png', size: 1024, mtime: 10 }], createdAt: 10, endedAt: 20 };
    const normalized = normalizeSharedChatMessage(message, 0);
    expect(normalized.producedFiles).toEqual(message.producedFiles);
    expect(normalized.createdAt).toBe(10);
    expect(normalized.endedAt).toBe(20);
  });
  it('does not keep a completed silent voice call running', () => {
    render(<SharedChatRows t={t} paneStreaming={false} messages={[{
      id: 'quiet-voice', role: 'assistant', content: '', status: 'complete',
      runStatus: 'succeeded', endedAt: 100,
      events: [{ kind: 'status', code: 'voice_connection', label: 'ending' }],
    }]}/>);
    expect(screen.getByTestId('assistant-quiet-voice').getAttribute('data-streaming')).toBe('false');
    expect(screen.getByTestId('assistant-quiet-voice').getAttribute('data-run-status')).toBe('succeeded');
  });
  it('does not attach canceled work to a later completed answer', () => {
    render(<SharedChatRows t={t} messages={[
      { id: 'stopped', role: 'assistant', content: 'Reviewing', runStatus: 'canceled', endedAt: 20, events: [{ kind: 'tool_use', name: 'TodoWrite', id: 'todo', input: { todos: [{ content: 'Review pages', status: 'in_progress' }] } }] },
      { id: 'question', role: 'user', content: 'Leave that stopped. Who was the audience?' },
      { id: 'answer', role: 'assistant', content: 'Solo beginners.', runStatus: 'succeeded', endedAt: 30 },
    ]} />);
    expect(screen.getByTestId('assistant-answer').getAttribute('data-unfinished')).toBe('[]');
  });
  it('renders voice speakers as alternating user bubbles and assistant rows in floating panels', () => {
    const view = render(<SharedChatRows t={t} paneStreaming messages={[{ id: 'voice', role: 'assistant', status: 'streaming', events: [
      { kind: 'voice_transcript', id: 'u1', role: 'user', text: 'Can you build a plugin?' },
      { kind: 'text', text: 'Yes, what should it do?' },
      { kind: 'voice_transcript', id: 'u2', role: 'user', text: 'Should I use a snippet?' },
      { kind: 'text', text: 'For a small feature, yes.' },
    ] }]}/>);
    expect(view.container.querySelectorAll('.msg.user')).toHaveLength(2);
    expect(view.container.querySelectorAll('.msg.assistant')).toHaveLength(2);
    expect(screen.getByText('Can you build a plugin?')).toBeTruthy();
    expect(screen.getByText('Should I use a snippet?')).toBeTruthy();
    expect(view.container.querySelectorAll('[data-streaming="true"]')).toHaveLength(1);
  });
  it('renders every assistant turn as its own canonical message block', () => {
    render(
      <SharedChatRows
        messages={[
          {
            id: 'assistant-one',
            role: 'assistant',
            content: 'First response',
            createdAt: 10,
            endedAt: 20,
          },
          {
            id: 'user-two',
            role: 'user',
            content: 'Follow up',
            createdAt: 30,
            endedAt: 30,
            sessionMode: 'plan',
          },
          {
            id: 'assistant-two',
            role: 'assistant',
            content: 'Second response',
            createdAt: 40,
            status: 'streaming',
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByTestId('assistant-assistant-one').getAttribute('data-streaming')).toBe('false');
    expect(screen.getByTestId('assistant-assistant-two').getAttribute('data-streaming')).toBe('true');
    expect(document.querySelectorAll('.msg.assistant')).toHaveLength(2);
    expect(screen.getByTestId('msg-session-mode-chip').textContent).toContain('Plan');
  });

  it('keeps a terminal-looking row in Working while the host run is still active', () => {
    render(
      <SharedChatRows
        paneStreaming
        messages={[{
          id: 'assistant-transient-error',
          role: 'assistant',
          content: 'The provider handoff is still being prepared.',
          status: 'error',
          runStatus: 'failed',
          startedAt: 10,
          endedAt: 20,
          events: [{ kind: 'error', code: 'bricks_agent_stream_error', message: 'transport closed' }],
        }]}
        t={t}
      />,
    );

    const row = screen.getByTestId('assistant-assistant-transient-error');
    expect(row.getAttribute('data-streaming')).toBe('true');
    expect(row.getAttribute('data-run-status')).toBe('running');
  });

  it('passes the following form-answer message to the question banner renderer', () => {
    render(
      <SharedChatRows
        messages={[
          {
            id: 'assistant-question',
            role: 'assistant',
            content: '<question-form id="page-media-choice">{"questions":[]}</question-form>',
            endedAt: 20,
          },
          {
            id: 'user-answer',
            role: 'user',
            content: '[form answers for page-media-choice]\n- Image source: Placeholder images [value: placeholder]',
            endedAt: 30,
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByTestId('assistant-assistant-question').getAttribute('data-next-user-content'))
      .toContain('[form answers for page-media-choice]');
  });

  it('renders a legacy pending semantic-preflight placeholder through the shared activity card', () => {
    render(
      <SharedChatRows
        messages={[
          {
            id: 'legacy-bricks-assistant:test',
            role: 'assistant',
            content: 'Understanding what you want me to do…',
            status: 'streaming',
          },
        ]}
        t={t}
      />,
    );

    expect(document.querySelector('[data-semantic-preflight="pending"]')).not.toBeNull();
    const row = screen.getByTestId('assistant-legacy-bricks-assistant:test');
    const events = JSON.parse(String(row.getAttribute('data-events') || '[]')) as Array<Record<string, unknown>>;
    expect(events).toContainEqual(expect.objectContaining({
      kind: 'activity',
      phase: 'preparing',
      status: 'started',
      label: 'Request understood',
    }));
    expect(row.textContent)
      .not.toContain('Understanding what you want me to do…');
  });

  it('keeps the semantic-preflight row mounted while the host changes its message id', () => {
    const view = render(
      <SharedChatRows
        messages={[{
          id: 'semantic-preflight-assistant:test',
          role: 'assistant',
          content: 'Understanding what you want me to do…',
          clarificationKind: 'semantic_preflight_pending',
          status: 'streaming',
        }]}
        t={t}
      />,
    );
    const firstRow = document.querySelector('[data-semantic-preflight="pending"]');

    view.rerender(
      <SharedChatRows
        messages={[{
          id: 'assistant:pending:test',
          role: 'assistant',
          content: 'Understanding what you want me to do…',
          clarificationKind: 'semantic_preflight_pending',
          status: 'streaming',
        }]}
        t={t}
      />,
    );

    expect(document.querySelector('[data-semantic-preflight="pending"]')).toBe(firstRow);
  });

  it('passes a host-owned footer action only to its selected assistant run', () => {
    render(
      <SharedChatRows
        messages={[
          { id: 'assistant-old', role: 'assistant', content: 'Old action', endedAt: 20 },
          { id: 'assistant-new', role: 'assistant', content: 'New action', endedAt: 40 },
        ]}
        footerActionForMessage={(message) => message.id === 'assistant-new' ? <button type="button">Undo run</button> : null}
        t={t}
      />,
    );
    expect(screen.getByTestId('assistant-assistant-old').querySelector('button')).toBeNull();
    expect(screen.getByTestId('assistant-assistant-new').querySelector('button')?.textContent).toBe('Undo run');
  });

  it('removes legacy internal semantic-preflight text when persisted messages are hydrated', () => {
    render(
      <SharedChatRows
        messages={[{
          id: 'semantic-preflight-assistant:legacy',
          role: 'assistant',
          content: 'Request understood',
          status: 'done',
          events: [
            { kind: 'raw', raw: '{"decision":"internal-contract"}' },
            { kind: 'text', text: '{"decision":"internal-contract"}' },
            {
              kind: 'activity',
              id: 'semantic-preflight:legacy',
              origin: 'pixflow',
              phase: 'preparing',
              status: 'succeeded',
              label: 'Request understood',
              startedAt: 10,
              endedAt: 20,
            },
          ],
        }]}
        t={t}
      />,
    );

    const row = screen.getByTestId('assistant-semantic-preflight-assistant:legacy');
    const events = String(row.getAttribute('data-events') || '');
    expect(events).not.toContain('internal-contract');
    expect(events).toContain('semantic-preflight:legacy');
    expect(events).toContain('Request understood');
  });

  it('does not render a terminal empty Ask handoff as Done before its response arrives', () => {
    render(
      <SharedChatRows
        messages={[
          {
            id: 'assistant:pending:test',
            role: 'assistant',
            content: '',
            status: 'done',
            runStatus: 'succeeded',
            startedAt: 10,
            endedAt: 20,
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByTestId('assistant-assistant:pending:test').getAttribute('data-streaming'))
      .toBe('true');
  });
});
