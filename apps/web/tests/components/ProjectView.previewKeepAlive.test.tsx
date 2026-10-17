// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navigate } from '../../src/router';
import { ProjectView } from '../../src/components/ProjectView';
import { stageWorkspaceFirstTurn, readWorkspaceFirstTurn, clearWorkspaceFirstTurn } from '../../src/components/workspace-first-turn';
import { useIframeKeepAlivePool } from '../../src/components/IframeKeepAlivePool';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments } from '../../src/providers/registry';

const evictProjectMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
  }),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/components/IframeKeepAlivePool', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/IframeKeepAlivePool')>(
    '../../src/components/IframeKeepAlivePool',
  );
  return {
    ...actual,
    useIframeKeepAlivePool: vi.fn(),
  };
});

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn(),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: ({ headerActions }: { headerActions?: ReactNode }) => <div data-testid="file-workspace">{headerActions}</div>,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ headerActions, onRequestOpenFile, onOpenQuestions, codexVoiceStartRequested }: { codexVoiceStartRequested?: boolean; headerActions?: ReactNode; onRequestOpenFile: (name: string) => void; onOpenQuestions: () => void }) => <div data-testid="chat-pane" data-voice-start={codexVoiceStartRequested}>{headerActions}<button onClick={() => onRequestOpenFile("index.html")}>Open artifact</button><button onClick={() => onOpenQuestions()}>Open question</button></div>,
}));

const mockedUseIframeKeepAlivePool = vi.mocked(useIframeKeepAlivePool);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: 'skill-1',
  designSystemId: 'ds-1',
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-1',
  projectId: project.id,
  title: null,
  createdAt: 1,
  updatedAt: 1,
};

const skill: SkillSummary = {
  id: 'skill-1',
  name: 'Prompt skill',
  description: 'Old prompt context',
  triggers: ['prompt'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Create a prototype.',
  aggregatesExamples: false,
};

const designSystem: DesignSystemSummary = {
  id: 'ds-1',
  title: 'Design System',
  category: 'product',
  summary: 'Old system context',
};

function renderProjectView(props?: {
  routeFileName?: string;
  skills?: SkillSummary[];
  designSystems?: DesignSystemSummary[];
}) {
  return render(
    <ProjectView
      project={project}
      routeFileName={props?.routeFileName ?? null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={props?.skills ?? [skill]}
      designTemplates={[] as SkillSummary[]}
      designSystems={props?.designSystems ?? [designSystem]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

describe('ProjectView preview keep-alive invalidation', () => {
  it('hands a Home voice request to the destination composer exactly once', async () => {
    stageWorkspaceFirstTurn(project.id, { prompt: 'Voice conversation', attachments: [], comments: [], sessionMode: 'chat', startVoice: true });
    const view = renderProjectView();
    await waitFor(() => expect(view.getByTestId('chat-pane').getAttribute('data-voice-start')).toBe('true'));
    expect(readWorkspaceFirstTurn(project.id)).toBeNull();
    view.unmount();
    const reopened = renderProjectView();
    await waitFor(() => expect(reopened.getByTestId('chat-pane').getAttribute('data-voice-start')).toBe('false'));
    clearWorkspaceFirstTurn(project.id);
  });
  beforeEach(() => {
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: evictProjectMock,
      evictMatching: vi.fn(),
    });
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    mockedFetchPreviewComments.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('evicts the active preview when registry prompt context changes for the open project', async () => {
    const view = renderProjectView();

    view.rerender(
      <ProjectView
        project={project}
        routeFileName={null}
        config={config}
        agents={[] as AgentInfo[]}
        skills={[{ ...skill, description: 'Fresh prompt context' }]}
        designTemplates={[] as SkillSummary[]}
        designSystems={[designSystem]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(evictProjectMock).toHaveBeenCalledWith('project-1', { includeActive: true });
    });
  });
  it('opens existing chats without the retired workspace and toggles the summary', async () => {
    const view = renderProjectView({});
    await waitFor(() => expect(view.queryByTestId('chat-pane')).not.toBeNull());
    const panel = view.getByTestId('workspace-summary');
    expect(view.queryByTestId('file-workspace')).toBeNull();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.parentElement?.style.gridTemplateColumns).toBe('');
    fireEvent.click(view.getByRole('button', { name: 'workspace.summary' }));
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    fireEvent.click(view.getByRole('button', { name: 'common.close' }));
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(view.getByTestId('workspace-summary')).toBe(panel);
    expect(mockedCreateConversation).not.toHaveBeenCalled();
  });

  it('opens the summary for artifacts while questions stay in chat', async () => {
    const view = renderProjectView({});
    await waitFor(() => expect(view.queryByTestId('chat-pane')).not.toBeNull());
    const chat = view.getByTestId('chat-pane');
    fireEvent.click(view.getByRole('button', { name: 'Open artifact' }));
    expect(view.getByTestId('workspace-summary').getAttribute('aria-hidden')).toBe('false');
    fireEvent.click(view.getByRole('button', { name: 'common.close' }));
    fireEvent.click(view.getByRole('button', { name: 'Open question' }));
    expect(view.getByTestId('workspace-summary').getAttribute('aria-hidden')).toBe('true');
    expect(view.getByTestId('chat-pane')).toBe(chat);
  });

  it('honours file deep links while retiring the old default split layout', async () => {
    const view = renderProjectView({ routeFileName: 'index.html' });
    expect(view.getByTestId('workspace-summary').getAttribute('aria-hidden')).toBe('false');
    view.unmount();
    const standalone = renderProjectView();
    expect(standalone.getByTestId('workspace-summary').getAttribute('aria-hidden')).toBe('true');
    expect(standalone.container.querySelector('.split')).toBeNull();
  });

  it('does not promote a restored file tab into the chat route', async () => {
    mockedLoadTabs.mockResolvedValue({ tabs: ['index.html'], active: 'index.html' });
    const view = renderProjectView({});
    await waitFor(() => expect(view.queryByTestId('chat-pane')).not.toBeNull());
    expect(view.getByTestId('workspace-summary').getAttribute('aria-hidden')).toBe('true');
    expect(vi.mocked(navigate).mock.calls.every(([route]) => route.kind !== 'project' || route.fileName === null)).toBe(true);
  });

});
