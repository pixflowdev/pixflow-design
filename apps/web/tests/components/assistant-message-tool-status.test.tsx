// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
  };
}

describe('AssistantMessage tool status', () => {
  afterEach(() => cleanup());

  it('renders active Pixflow research as the current shared activity with a shimmer', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([{
            kind: 'activity',
            id: 'research-1',
            origin: 'pixflow',
            phase: 'researching',
            status: 'progress',
            label: 'Researching current public sources…',
            detail: '2 sources found',
            sourceCount: 2,
          }]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    container.querySelectorAll('[data-activity-group] > button[aria-expanded="false"] ').forEach(button => fireEvent.click(button));
    const row = container.querySelector('[data-agent-activity-phase="researching"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Researching current public sources');
    expect(row?.textContent).toContain('2 sources found');
    expect(row?.querySelector('.shimmer-text')).not.toBeNull();
  });

  it('settles research activity and renders bounded source links without a shimmer', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([{
          kind: 'activity',
          id: 'research-1',
          origin: 'pixflow',
          phase: 'researching',
          status: 'succeeded',
          label: 'Researched 2 sources',
          sourceCount: 2,
          sources: [
            { title: 'WordPress Handbook', url: 'https://developer.wordpress.org/', provider: 'public-web' },
            { title: 'Plugin documentation', url: 'https://example.test/docs', provider: 'tavily' },
          ],
        }])}
        streaming={false}
        projectId="project-1"
      />,
    );

    container.querySelectorAll('[data-activity-group] > button[aria-expanded="false"] ').forEach(button => fireEvent.click(button));
    const row = container.querySelector('[data-agent-activity-phase="researching"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.shimmer-text')).toBeNull();
    expect(container.querySelector('a[href="https://developer.wordpress.org/"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://example.test/docs"]')).not.toBeNull();
  });

  it('never leaves the animated spinner on a completed preparing activity', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([{
          kind: 'activity',
          id: 'preparing-1',
          origin: 'pixflow',
          phase: 'preparing',
          status: 'succeeded',
          label: 'Request understood',
          startedAt: 1_000,
          endedAt: 2_000,
        }])}
        streaming={false}
        projectId="project-1"
      />,
    );

    container.querySelectorAll('[data-activity-group] > button[aria-expanded="false"] ').forEach(button => fireEvent.click(button));
    const row = container.querySelector('[data-agent-activity-phase="preparing"]');
    expect(row?.getAttribute('data-agent-activity-status')).toBe('succeeded');
    expect(row?.querySelector('.icon-spin')).toBeNull();
    expect(row?.querySelector('.shimmer-text')).toBeNull();
  });

  it('shows Done for a completed run tool use that has no tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Run guard' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.op-status-ok')).not.toBeNull();
    expect(container.querySelector('.op-status-running')).toBeNull();
  });

  it('keeps legacy completed messages without runStatus as Done', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: undefined,
        }}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.op-status-ok')).not.toBeNull();
    expect(container.querySelector('.op-status-running')).toBeNull();
  });

  it('shows Done in a grouped completed run when tool results are missing', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Execute guard' },
          },
          {
            kind: 'tool_use',
            id: 'tool-2',
            name: 'Bash',
            input: { command: 'pnpm typecheck', description: 'Execute typecheck' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.action-card-toggle.running')).toBeNull();
    expect(container.querySelector('.op-status-ok, .action-card-status.op-status-ok')).not.toBeNull();
  });

  it('does not show Done when a failed run is missing a tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: 'failed',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.op-status-error')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
  });

  it('does not show Done when a canceled run is missing a tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: 'canceled',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.op-status-error')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
  });

  it('keeps Running for a streaming tool use that has no tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Run guard' },
            },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    expect(container.querySelector('.op-status-running')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
  });

  it('renders URLs in JSON-like status details without trailing structural characters', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'status',
            label: 'publish repo',
            detail: '{"url":"https://github.com/nexu-io/example-plugin","nameWithOwner":"nexu-io/example-plugin"}',
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );
    container.querySelectorAll('[data-activity-group] > button').forEach(button => fireEvent.click(button));

    const link = container.querySelector('.status-detail a.md-link');
    expect(link?.getAttribute('href')).toBe('https://github.com/nexu-io/example-plugin');
    expect(link?.textContent).toBe('https://github.com/nexu-io/example-plugin');
    expect(container.querySelector('.status-detail')?.textContent).toContain('"}');
  });
});
