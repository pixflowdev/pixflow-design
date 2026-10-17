// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { trackRunFailedToastSurfaceView } from '../../src/analytics/events';
import type { AppConfig, ChatMessage, Conversation } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (vars && Object.keys(vars).length > 0) {
      return `${key} ${Object.values(vars).join(' ')}`;
    }
    return key;
  },
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Chat selection now belongs to WorkspaceSidebar, not a second header menu.
describe('ChatPane header', () => {
  it('does not render the retired history switcher or search popup', () => {
    const view = renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Existing chat' })],
      activeConversationId: 'conv-1',
    });
    expect(screen.queryByTestId('conversation-history-trigger')).toBeNull();
    expect(screen.queryByTestId('conversation-history-menu')).toBeNull();
    expect(screen.queryByTestId('conversation-history-search')).toBeNull();
    expect(screen.getByTestId('composer')).toBeTruthy();
  });

  it('tracks run_failed_toast exposure for AMR balance guidance', async () => {
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-balance',
            runId: 'run-amr-balance',
            code: 'AMR_INSUFFICIENT_BALANCE',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectKindForTracking="prototype"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await waitFor(() => expect(trackRunFailedToastSurfaceView).toHaveBeenCalledTimes(1));
    expect(vi.mocked(trackRunFailedToastSurfaceView).mock.calls[0]![1]).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: 'AMR_INSUFFICIENT_BALANCE',
      project_id: 'project-1',
      project_kind: 'prototype',
      conversation_id: 'conv-1',
      assistant_message_id: 'msg-amr-balance',
      run_id: 'run-amr-balance',
    });
  });

  it('opens the profile-scoped wallet from the AMR recharge action', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-balance',
            runId: 'run-amr-balance',
            code: 'AMR_INSUFFICIENT_BALANCE',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } } } as unknown as AppConfig}
      />,
    );

    fireEvent.click(screen.getByText('chat.amrError.rechargeCta'));

    const [walletUrl, target, features] = openSpy.mock.calls[0] ?? [];
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    const parsedWalletUrl = new URL(String(walletUrl));
    expect(`${parsedWalletUrl.origin}${parsedWalletUrl.pathname}`).toBe(
      'https://vela.powerformer.net/wallet',
    );
    expect(parsedWalletUrl.searchParams.get('od_entry_source')).toBe('chat_error_recharge');
  });
});

function renderChatPane(props: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return render(chatPaneElement(props));
}

function chatPaneElement({
  conversations,
  activeConversationId,
  onSelectConversation,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return (
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId={activeConversationId}
      onSelectConversation={onSelectConversation ?? vi.fn()}
      onDeleteConversation={vi.fn()}
    />
  );
}

function conversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    projectId: 'project-1',
    title: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function failedAssistantMessage({
  id,
  runId,
  code,
  agentId,
}: {
  id: string;
  runId: string;
  code: string;
  agentId: string;
}): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId,
    runStatus: 'failed',
    agentId,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'AMR balance empty',
        code,
      },
    ],
  };
}
