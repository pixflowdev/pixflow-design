// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import queueStyles from '../../src/components/ComposerQueue.module.css';
import { ChatPane, buildRunErrorDiagnosticText, retryableAssistantMessage } from '../../src/components/ChatPane';
import { DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX } from '../../src/design-system-auto-prompt';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

const siteMocks = vi.hoisted(() => ({ wordpress: false }));
vi.mock('../../src/pixflow/wordpress-context', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/pixflow/wordpress-context')>(),
  hasPixflowWordPressContext: () => siteMocks.wordpress,
}));

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const clipboardMocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async (_text: string) => true),
}));

const translations: Record<string, string> = {
  'chat.mode.chat.label': 'Ask',
  'chat.mode.design.label': 'Design Agent',
  'chat.queuedHeader': 'Queued',
  'chat.queuedToSend': 'to Send',
  'chat.queuedEditQueuedTaskAria': 'Edit queued task',
  'chat.queuedSave': 'Save',
  'chat.queuedCancel': 'Cancel',
  'chat.queuedReorder': 'Drag to reorder',
  'chat.queuedEdit': 'Edit',
  'chat.queuedMore': 'more queued',
  'chat.queuedFollowUpFallback': 'Queued follow-up',
  'avatar.useLocal': 'Use Local CLI',
  'chat.copyErrorDiagnostic': 'Copy error diagnostics',
  'chat.copyDone': 'Copied!',
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => translations[key] ?? key,
  }),
  useT: () => (key: string) => translations[key] ?? key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({
    streaming,
    message,
    isLast,
    onShareToOpenDesign,
    shareToOpenDesignBusy,
    showConversationTodoCard,
    conversationTodoInput,
  }: {
    streaming: boolean;
    message: ChatMessage;
    isLast?: boolean;
    onShareToOpenDesign?: () => void;
    shareToOpenDesignBusy?: boolean;
    showConversationTodoCard?: boolean;
    conversationTodoInput?: {
      todos?: Array<{ content: string; status?: string }>;
      plan?: Array<{ content?: string; step?: string; status?: string }>;
    } | null;
  }) => (
    <>
      <output data-testid={`assistant-streaming-${message.id}`}>{streaming ? 'streaming' : 'idle'}</output>
      <output data-testid={`assistant-last-${message.id}`}>{isLast ? 'last' : 'not-last'}</output>
      {showConversationTodoCard && conversationTodoInput ? (
        <div className="op-card op-todo">
          {(conversationTodoInput.todos ?? conversationTodoInput.plan ?? []).map((todo, index) => {
            const content = 'content' in todo ? todo.content : todo.step;
            return (
              <div key={`${content}-${index}`} className={`todo-${todo.status ?? 'pending'}`}>
                <span className="todo-text">{content}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {onShareToOpenDesign ? (
        <button
          type="button"
          data-testid={`share-to-od-${message.id}`}
          disabled={shareToOpenDesignBusy}
          onClick={onShareToOpenDesign}
        >
          {shareToOpenDesignBusy ? 'Preparing package…' : 'Share to Pixflow Design'}
        </button>
      ) : null}
    </>
  ),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: clipboardMocks.copyToClipboard,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(({
    onSend,
    streaming,
    codexVoiceEnabled,
  }: {
    onSend?: (
      prompt: string,
      attachments: Array<{ path: string; name: string; kind: 'file' }>,
      commentAttachments: Array<{ id: string; order: number; filePath: string; comment: string }>,
    ) => void;
    streaming: boolean;
    codexVoiceEnabled?: boolean;
  }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return (
      <>
        <output data-testid="voice-available">{String(!!codexVoiceEnabled)}</output>
        <output data-testid="composer-streaming">{streaming ? 'streaming' : 'idle'}</output>
        <button
          type="button"
          data-testid="composer-submit"
          onClick={() => onSend?.(
            'Use a bolder export button',
            [{ path: 'edited.md', name: 'edited.md', kind: 'file' }],
            [{ id: 'edited-comment', order: 1, filePath: 'preview.html', comment: 'Bolder' }],
          )}
        >
          submit composer
        </button>
      </>
    );
  }),
}));

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  callback: ResizeObserverCallback;
  observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe = (target: Element) => {
    this.observed.add(target);
  };

  unobserve = (target: Element) => {
    this.observed.delete(target);
  };

  disconnect = () => {
    this.observed.clear();
  };

  trigger(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  static triggerObserved(target: Element) {
    for (const instance of MockResizeObserver.instances) {
      if (instance.observed.has(target)) instance.trigger(target);
    }
  }
}

function mockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) store.delete(type);
      else store.clear();
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, data: string) => {
      store.set(type, data);
    }),
    setDragImage: vi.fn(),
  };
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  siteMocks.wordpress = false;
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatPane streaming state', () => {
  it('preserves the reading position when an older history page is prepended', () => {
    const load = vi.fn(async () => {});
    const recent: ChatMessage[] = [{ id: 'recent', role: 'user', content: 'Recent message' }];
    const pane = (messages: ChatMessage[], loading = false) => <ChatPane messages={messages} streaming={false} error={null}
      projectId="history-scroll" projectFiles={[]} onEnsureProject={async () => 'history-scroll'} onSend={vi.fn()} onStop={vi.fn()}
      conversations={[]} activeConversationId="history-scroll" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
      olderHistory={{loading,error:false,load}} />;
    const view = render(pane(recent));
    const log = view.container.querySelector('.chat-log') as HTMLElement;
    let height = 800;
    Object.defineProperty(log,'scrollHeight',{get:()=>height,configurable:true});
    Object.defineProperty(log,'clientHeight',{get:()=>400,configurable:true});
    log.scrollTop = 80;
    fireEvent.click(screen.getByRole('button',{name:'history.loadEarlier'}));
    expect(load).toHaveBeenCalledOnce();
    view.rerender(pane(recent,true));
    height = 1400;
    view.rerender(pane([{id:'older',role:'user',content:'Older message'},...recent]));
    expect(log.scrollTop).toBe(680);
    expect(screen.getByText('Older message')).toBeTruthy();
    expect(screen.getByText('Recent message')).toBeTruthy();
  });

  it('updates Voice availability in the mounted composer without a reload', () => {
    const pane = (enabled: boolean) => <ChatPane messages={[]} streaming={false} error={null}
      projectId="project-1" projectFiles={[]} onEnsureProject={async () => "project-1"} onSend={vi.fn()} onStop={vi.fn()}
      conversations={[]} activeConversationId="conv-1" onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()} codexVoiceEnabled={enabled} />;
    const view = render(pane(false));
    expect(screen.getByTestId('voice-available').textContent).toBe('false');
    view.rerender(pane(true));
    expect(screen.getByTestId('voice-available').textContent).toBe('true');
    view.rerender(pane(false));
    expect(screen.getByTestId('voice-available').textContent).toBe('false');
  });

  it('uses floating-panel user rows in WordPress without legacy design/context chips', () => {
    siteMocks.wordpress = true;
    render(<ChatPane messages={[{
      id: 'user-shared', role: 'user', content: 'Keep this design', sessionMode: 'design',
      runContext: { workspaceItems: [{ id: 'current-design-files', label: 'Design Files', kind: 'file' }] } as unknown as ChatMessage['runContext'],
      attachments: [{ path: 'brief.md', name: 'brief.md', kind: 'file' }],
    }]} streaming={false} error={null} projectId="project-1" projectFiles={[]}
      onEnsureProject={async () => 'project-1'} onSend={vi.fn()} onStop={vi.fn()}
      conversations={conversations} activeConversationId="conv-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()} projectMetadata={projectMetadata} />);
    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByText('Design Files')).toBeNull();
    expect(screen.getByText('Keep this design')).toBeTruthy();
    expect(screen.getByText('brief.md')).toBeTruthy();
  });

  it('uses the floating-panel question card above the Workspace composer', () => {
    siteMocks.wordpress = true;
    const form = { id: 'shared-brief', title: 'Quick brief', questions: [{ id: 'name', label: 'Your studio name?', type: 'text', required: true }] };
    const send = vi.fn(async (_text: string) => true);
    const { container } = render(<ChatPane messages={[{ id: 'question', role: 'assistant', content: `<question-form>${JSON.stringify(form)}</question-form>`, runStatus: 'succeeded' }]}
      streaming={false} error={null} projectId="project-1" projectFiles={[]}
      onEnsureProject={async () => 'project-1'} onSend={send} onStop={vi.fn()}
      conversations={conversations} activeConversationId="conv-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()} projectMetadata={projectMetadata} />);
    const answer = screen.getByRole('textbox', { name: 'Your studio name?' });
    expect(container.querySelector('.chat-composer-slot')?.contains(answer)).toBe(true);
    fireEvent.change(answer, { target: { value: 'Fern Studio' } });
    fireEvent.keyDown(answer, { key: 'Enter' });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toContain('Fern Studio');
  });

  it('keeps composer popovers above the chat jump button', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.chat-jump-btn');
    expect(css).toContain('z-index: 6;');
    expect(css).toContain('.composer:has(.composer-tools-menu)');
    expect(css).toContain('.composer:has(.composer-design-toolbox-menu)');
    expect(css).toContain('.composer:has(.composer-import-menu)');
    expect(css).toContain('z-index: 80;');
  });

  it('exposes retry only for the last failed assistant when the pane is idle', () => {
    const failed: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Generation failed',
      createdAt: 1,
      runStatus: 'failed',
    };
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Create a login page', createdAt: 0 },
      failed,
    ];

    expect(retryableAssistantMessage(messages, failed.id, false)).toBe(failed);
    expect(retryableAssistantMessage(messages, failed.id, true)).toBeNull();
    expect(retryableAssistantMessage([...messages, { ...messages[0]!, id: 'user-2' }], failed.id, false))
      .toBeNull();
  });

  it('copies failed-run diagnostics with the trace id from the error card', async () => {
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Create a login page', createdAt: 0 },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Generation failed',
        agentId: 'amr',
        createdAt: 1,
        runId: 'run-trace-123',
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'json-rpc id 4: Connection reset by server',
            code: 'AGENT_EXECUTION_FAILED',
          },
        ],
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy error diagnostics' }));

    await waitFor(() => expect(clipboardMocks.copyToClipboard).toHaveBeenCalledTimes(1));
    const copied = clipboardMocks.copyToClipboard.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('trace_id: run-trace-123');
    expect(copied).toContain('run_id: run-trace-123');
    expect(copied).toContain('error_code: AGENT_EXECUTION_FAILED');
    expect(copied).toContain('project_id: project-1');
    expect(copied).toContain('conversation_id: conv-1');
    expect(copied).toContain('json-rpc id 4: Connection reset by server');
  });

  it('formats run error diagnostics with a raw error when guidance copy differs', () => {
    expect(buildRunErrorDiagnosticText({
      message: 'Service unavailable. Try again.',
      rawMessage: 'json-rpc id 4: Connection reset by server',
      errorCode: 'UPSTREAM_UNAVAILABLE',
      traceId: 'run-abc',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'amr',
    })).toContain('raw_error:\njson-rpc id 4: Connection reset by server');
  });

  it('renders user turns with the chat bubble styling hook', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate a simple sign-in page',
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const bubble = screen.getByText('Generate a simple sign-in page');
    expect(bubble.classList.contains('user-bubble')).toBe(true);
    expect(bubble.closest('.msg.user')).not.toBeNull();
  });

  it('offers a Local CLI recovery action on BYOK error states', () => {
    const onSwitchToLocalCli = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Create a login page',
        createdAt: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'Missing API key — open Settings and paste one in.',
          },
        ],
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        showByokRecoveryAction
        onSwitchToLocalCli={onSwitchToLocalCli}
        projectMetadata={projectMetadata}
      />,
    );

    const action = screen.getByRole('button', { name: 'Use Local CLI' });
    fireEvent.click(action);

    expect(onSwitchToLocalCli).toHaveBeenCalledTimes(1);
  });

  it('shows the sent mode and applied plugin context on user turns', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate the refinement glow-up deck',
        createdAt: 1,
        sessionMode: 'design',
        runContext: {
          workspaceItems: [
            {
              id: 'browser:tab-1',
              kind: 'browser',
              label: 'Dribbble',
              tabId: 'tab-1',
              url: 'https://dribbble.com/',
            },
          ],
        },
        appliedPluginSnapshot: {
          snapshotId: 'snap-refinement',
          pluginId: 'refinement-plugin',
          pluginVersion: '1.0.0',
          manifestSourceDigest: 'a'.repeat(64),
          inputs: {},
          resolvedContext: {
            items: [
              {
                kind: 'asset',
                path: 'template.json',
                label: 'template.json',
              },
            ],
          },
          capabilitiesGranted: ['prompt:inject'],
          capabilitiesRequired: ['prompt:inject'],
          assetsStaged: [],
          taskKind: 'new-generation',
          appliedAt: 1,
          connectorsRequired: [],
          connectorsResolved: [],
          mcpServers: [],
          status: 'fresh',
          pluginTitle: 'A Decade of Refinement Glow-Up',
        },
      },
    ];

    const onRequestOpenFile = vi.fn();
    const onRequestPluginDetails = vi.fn();
    const onRequestDesignSystemDetails = vi.fn();
    const activeDesignSystem = {
      id: 'neutral-modern',
      title: 'Neutral Modern',
      category: 'Starter',
      source: 'bundled',
      updatedAt: 1,
    } as never;

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
        onRequestOpenFile={onRequestOpenFile}
        onRequestPluginDetails={onRequestPluginDetails}
        onRequestDesignSystemDetails={onRequestDesignSystemDetails}
        activeDesignSystem={activeDesignSystem}
      />,
    );

    expect(screen.getByTestId('msg-session-mode-chip').textContent).toContain('Design Agent');
    expect(screen.getByTestId('msg-workspace-context-chip').textContent).toContain('Dribbble');
    expect(screen.getByTestId('msg-plugin-chip').textContent)
      .toContain('A Decade of Refinement Glow-Up');
    fireEvent.click(screen.getByTestId('msg-workspace-context-chip'));
    expect(onRequestOpenFile).toHaveBeenCalledWith('tab-1');
    fireEvent.click(screen.getByTestId('msg-plugin-chip'));
    expect(onRequestPluginDetails).toHaveBeenCalledWith('refinement-plugin');
    expect(screen.getByTestId('msg-design-system-chip').textContent).toContain('Neutral Modern');
    fireEvent.click(screen.getByTestId('msg-design-system-chip'));
    expect(onRequestDesignSystemDetails).toHaveBeenCalledWith(activeDesignSystem);
    // The plugin's resolved context is now collapsed into the single
    // plugin chip — the per-category (asset/design/skill) fan-out is no
    // longer rendered in the bubble, even though the full snapshot still
    // rides the run for the agent.
    expect(screen.queryByText('template.json')).toBeNull();
  });

  it('hides internal path ids from comment attachment chips', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '',
        createdAt: 1,
        commentAttachments: [
          {
            id: 'comment-1',
            order: 1,
            filePath: 'preview.html',
            elementId: 'path-0-0-0-0-1',
            selector: '[data-od-id="path-0-0-0-0-1"]',
            label: '',
            comment: '222',
            currentText: '',
            pagePosition: { x: 10, y: 20, width: 30, height: 40 },
            htmlHint: '<div>',
          },
        ],
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Annotation')).toBeTruthy();
    expect(screen.getByText('222')).toBeTruthy();
    expect(screen.queryByText('path-0-0-0-0-1')).toBeNull();
  });

  it('summarizes auto-sent design-system workspace prompts', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: `${DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX}
Use the files in this project as the design system source for future projects.
Expected output:
- A clear DESIGN.md with all generated rules.`,
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Creating design system workspace')).toBeTruthy();
    expect(screen.queryByText(DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: 'chat.copyPrompt' })).toBeNull();
  });

  it('keeps composer idle while active-run messages still render as streaming', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'still running',
        createdAt: 1,
        runId: 'run-1',
        runStatus: 'running',
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByTestId('composer-streaming').textContent).toBe('idle');
    expect(screen.getByTestId('assistant-streaming-assistant-1').textContent).toBe('streaming');
  });

  it('keeps a newly sent Workspace turn at the bottom without reserving blank space', () => {
    const pane = (messages: ChatMessage[], streaming = false) => <ChatPane bottomAligned
      messages={messages} streaming={streaming} error={null} projectId="project-1" projectFiles={[]}
      onEnsureProject={async () => 'project-1'} onSend={vi.fn()} onStop={vi.fn()} conversations={[]}
      activeConversationId="conv-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()} />;
    const view = render(pane([]));
    const log = view.container.querySelector<HTMLElement>('.chat-log')!;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 900 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 600 });
    log.scrollTo = vi.fn();
    fireEvent.click(screen.getByTestId('composer-submit'));
    view.rerender(pane([{ id: 'new-user', role: 'user', content: 'Hello', createdAt: 1 }], true));
    expect(log.scrollTo).not.toHaveBeenCalled();
    expect(log.scrollTop).toBe(900);
    expect(view.container.querySelector<HTMLElement>('.chat-log-tail-spacer')!.style.height).toBe('0px');
  });

  it('clears stale anchor spacer before sending another local turn', () => {
    const onSend = vi.fn();
    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={[
          { id: 'user-1', role: 'user', content: 'Make the landing page', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'Done', createdAt: 2 },
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const spacer = container.querySelector<HTMLElement>('.chat-log-tail-spacer');
    expect(spacer).not.toBeNull();
    spacer!.style.height = '320px';

    fireEvent.click(screen.getByTestId('composer-submit'));

    expect(onSend).toHaveBeenCalledOnce();
    expect(spacer!.style.height).toBe('0px');
  });

  it('passes a stopped inline todo after a terminal run without a final TodoWrite', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 1,
        startedAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                {
                  content: 'Build prototype',
                  status: 'in_progress',
                  activeForm: 'Building prototype',
                },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ],
      },
    ];

    const { container } = render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(container.querySelectorAll('.chat-log .op-card.op-todo')).toHaveLength(1);
    expect(container.querySelector('.todo-stopped .todo-text')?.textContent).toBe('Build prototype');
    expect(container.querySelector('.todo-pending .todo-text')?.textContent).toBe('Run QA');
    expect(container.querySelector('.chat-pinned-todo')).toBeNull();
  });
  it('offers non-interrupting steering instead of send-now for a supported active run', () => {
    const steer = vi.fn(), sendNow = vi.fn(), stop = vi.fn();
    render(<ChatPane messages={[]} streaming error={null} projectId="project-1" projectFiles={[]}
      queuedItems={[{ id: 'queued-steer', prompt: 'Use the new studio name' }]}
      onSteerQueuedSend={steer} onSendQueuedNow={sendNow} onStop={stop} onSend={vi.fn()}
      onEnsureProject={async () => 'project-1'} conversations={[]} activeConversationId="conv-1"
      onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'ui.composerQueue.steer' }));
    expect(steer).toHaveBeenCalledWith('queued-steer');
    expect(sendNow).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'chat.send' })).toBeNull();
  });

  it('rejoins bottom-follow when sending a new Workspace turn after reading older messages', () => {
    const pane = (messages: ChatMessage[]) => <ChatPane bottomAligned messages={messages} streaming={false} error={null}
      projectId="project-1" projectFiles={[]} onEnsureProject={async () => 'project-1'} onSend={vi.fn()}
      onStop={vi.fn()} conversations={[]} activeConversationId="conv-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()} />;
    const view = render(pane([{ id: 'old-turn', role: 'user', content: 'Earlier', createdAt: 0 }]));
    const log = view.container.querySelector<HTMLElement>('.chat-log')!;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 1600 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 600 });
    log.scrollTop = 200; fireEvent.scroll(log);
    fireEvent.click(screen.getByTestId('composer-submit'));
    view.rerender(pane([{ id: 'new-turn', role: 'user', content: 'Continue', createdAt: 1 }]));
    expect(log.scrollTop).toBe(1600);
  });

  it('shows several queued prompts above the composer with compact controls', () => {
    const onRemoveQueuedSend = vi.fn();
    const onSendQueuedNow = vi.fn();
    const onUpdateQueuedSend = vi.fn();
    const onReorderQueuedSends = vi.fn();
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[
          {
            id: 'queued-1',
            prompt: 'Make the export button larger and use a warmer accent',
            attachments: [{ path: 'brief.md', name: 'brief.md', kind: 'file' }],
            commentAttachments: [
              {
                id: 'comment-1',
                order: 1,
                filePath: 'preview.html',
                elementId: 'hero',
                selector: '#hero',
                label: 'Hero',
                comment: 'Use a warmer accent',
                currentText: 'Export',
                pagePosition: { x: 10, y: 20, width: 30, height: 40 },
                htmlHint: '<section id="hero">',
              },
            ],
          },
          { id: 'queued-2', prompt: 'Then adjust the title spacing' },
          { id: 'queued-3', prompt: 'Reduce the subtitle size' },
          { id: 'queued-4', prompt: 'Switch to a lighter font weight' },
          { id: 'queued-5', prompt: 'Add hover polish' },
        ]}
        onRemoveQueuedSend={onRemoveQueuedSend}
        onSendQueuedNow={onSendQueuedNow}
        onUpdateQueuedSend={onUpdateQueuedSend}
        onReorderQueuedSends={onReorderQueuedSends}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const strip = screen.getByTestId('chat-queued-send-strip');
    expect(strip).not.toBeNull();
    expect(strip.querySelector('section')?.className).toBe(queueStyles.queue);
    expect(strip?.textContent).not.toContain('5 Queued');
    expect(strip?.textContent).not.toContain('Start Multitasking');
    expect(container.querySelectorAll('[data-queue-id]')).toHaveLength(5);
    expect(strip?.textContent).toContain('Make the export button larger and use a warmer accent');
    expect(strip?.textContent).toContain('Then adjust the title spacing');
    expect(strip?.textContent).toContain('Reduce the subtitle size');
    expect(strip?.textContent).toContain('Switch to a lighter font weight');
    expect(strip?.textContent).toContain('Add hover polish');
    expect(strip.querySelector('ol')?.className).toBe(queueStyles.list);
    expect(screen.getAllByRole('button', { name: 'ui.composerQueue.reorderQueuedMessage' })).toHaveLength(5);

    const sendNowButtons = screen.getAllByRole('button', { name: 'chat.send' });
    fireEvent.click(sendNowButtons[1]!);
    expect(onSendQueuedNow).toHaveBeenCalledWith('queued-2');

    const editButtons = screen.getAllByRole('button', { name: 'ui.composerQueue.editQueuedMessage' });
    fireEvent.click(editButtons[0]!);
    expect(composerMocks.restoreDraft).toHaveBeenCalledWith({
      text: 'Make the export button larger and use a warmer accent',
      attachments: [{ path: 'brief.md', name: 'brief.md', kind: 'file' }],
      commentAttachments: [
        {
          id: 'comment-1',
          order: 1,
          filePath: 'preview.html',
          elementId: 'hero',
          selector: '#hero',
          label: 'Hero',
          comment: 'Use a warmer accent',
          currentText: 'Export',
          pagePosition: { x: 10, y: 20, width: 30, height: 40 },
          htmlHint: '<section id="hero">',
        },
      ],
    });
    expect(onUpdateQueuedSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('composer-submit'));
    expect(onUpdateQueuedSend).toHaveBeenCalledWith('queued-1', {
      prompt: 'Use a bolder export button',
      attachments: [{ path: 'edited.md', name: 'edited.md', kind: 'file' }],
      commentAttachments: [
        { id: 'edited-comment', order: 1, filePath: 'preview.html', comment: 'Bolder' },
      ],
    });

    const removeButtons = screen.getAllByRole('button', { name: 'ui.composerQueue.deleteQueuedMessage' });
    fireEvent.click(removeButtons[1]!);
    expect(onRemoveQueuedSend).toHaveBeenCalledWith('queued-2');
  });

  it('reorders queued prompts with the drag handle', () => {
    const onReorderQueuedSends = vi.fn();
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[
          { id: 'queued-1', prompt: 'First queued follow-up' },
          { id: 'queued-2', prompt: 'Second queued follow-up' },
          { id: 'queued-3', prompt: 'Third queued follow-up' },
        ]}
        onReorderQueuedSends={onReorderQueuedSends}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const rows = container.querySelectorAll('[data-queue-id]');
    const handles = screen.getAllByRole('button', { name: 'ui.composerQueue.reorderQueuedMessage' });
    const dataTransfer = mockDataTransfer();
    const targetRect = {
      top: 0,
      height: 30,
      bottom: 30,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    Object.defineProperty(rows[2]!, 'getBoundingClientRect', {
      configurable: true,
      value: () => targetRect,
    });

    fireEvent.dragStart(handles[0]!, { dataTransfer });
    fireEvent.dragOver(rows[2]!, { dataTransfer, clientY: 29 });
    fireEvent.drop(rows[2]!, { dataTransfer, clientY: 29 });

    expect(onReorderQueuedSends).toHaveBeenCalledWith([
      'queued-2',
      'queued-3',
      'queued-1',
    ]);
  });

  it('falls back to the localized queued follow-up label for blank prompts', () => {
    render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[{ id: 'queued-1', prompt: '   ' }]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Queued follow-up')).toBeTruthy();
  });

  it('auto-follows when the queued strip resizes while pinned to bottom', () => {
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[{ id: 'queued-1', prompt: 'First queued follow-up' }]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const log = container.querySelector('.chat-log') as HTMLDivElement | null;
    const strip = screen.getByTestId('chat-queued-send-strip');
    expect(log).not.toBeNull();
    expect(strip).toBeTruthy();

    Object.defineProperty(log!, 'scrollHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(log!, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(log!, 'scrollTop', {
      configurable: true,
      get() {
        return (this as HTMLDivElement).dataset.scrollTop
          ? Number((this as HTMLDivElement).dataset.scrollTop)
          : 400;
      },
      set(value: number) {
        (this as HTMLDivElement).dataset.scrollTop = String(value);
      },
    });

    MockResizeObserver.triggerObserved(strip);

    expect(log!.scrollTop).toBe(600);
  });
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Conversation 1',
    createdAt: 1,
    updatedAt: 1,
  },
];

const projectMetadata: ProjectMetadata = {
  kind: 'prototype',
};
