// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import type { AgentInfo, AppConfig, ExecMode } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.134.0',
  models: [{ id: 'default', label: 'Default (CLI config)' }],
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'high', label: 'High' },
  ],
};

const claudeAgent: AgentInfo = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: '2.1.131',
  models: [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'sonnet', label: 'Sonnet (alias)' },
  ],
};

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  model: 'claude-sonnet-4-5',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'default', reasoning: 'default' } },
  agentCliEnv: {},
};

type ModeChangeHandler = (mode: ExecMode) => void;
type AgentChangeHandler = (id: string) => void;
type AgentModelChangeHandler = (
  id: string,
  choice: { model?: string; reasoning?: string; fastMode?: boolean },
) => void;
type VoidHandler = () => void;
type OpenSettingsHandler = (section?: 'execution') => void;

function renderMenu({
  config = baseConfig,
  agents = [codexAgent, claudeAgent],
  daemonLive = true,
  onModeChange = vi.fn<ModeChangeHandler>(),
  onAgentChange = vi.fn<AgentChangeHandler>(),
  onAgentModelChange = vi.fn<AgentModelChangeHandler>(),
  onOpenSettings = vi.fn<OpenSettingsHandler>(),
  onRefreshAgents = vi.fn<VoidHandler>(),
}: {
  config?: AppConfig;
  agents?: AgentInfo[];
  daemonLive?: boolean;
  onModeChange?: ReturnType<typeof vi.fn<ModeChangeHandler>>;
  onAgentChange?: ReturnType<typeof vi.fn<AgentChangeHandler>>;
  onAgentModelChange?: ReturnType<typeof vi.fn<AgentModelChangeHandler>>;
  onOpenSettings?: ReturnType<typeof vi.fn<OpenSettingsHandler>>;
  onRefreshAgents?: ReturnType<typeof vi.fn<VoidHandler>>;
} = {}) {
  render(
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
    />,
  );
  return {
    onModeChange,
    onAgentChange,
    onAgentModelChange,
    onOpenSettings,
    onRefreshAgents,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'avatar.title' }));
  return screen.getByRole('dialog', { name: 'avatar.title' });
}

describe('AvatarMenu', () => {
  it('does not claim the direct API key is missing when Composio is selected with a configured direct API', () => {
    renderMenu({ config: { ...baseConfig, mode: 'api', apiTransport: 'composio', apiKey: 'configured', composioProvider: 'ca_test', composioModel: 'connected-model' } });
    const menu = openMenu();
    const api = within(menu).getByRole('button', { name: 'avatar.useApi' });
    expect(api.textContent).not.toContain('inlineSwitcher.missingApiKey');
    expect(within(menu).getByText('Composio')).toBeTruthy();
  });

  it('keeps missing-key guidance inside the API option and opens settings', () => {
    const { onOpenSettings } = renderMenu();
    const menu = openMenu();
    const api = within(menu).getByRole('button', { name: /avatar.useApi/ });
    expect(within(api).getByText('inlineSwitcher.missingApiKey')).toBeTruthy();
    fireEvent.click(api);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the API provider brand instead of a stale CLI icon after switching to api mode', () => {
    const trigger = () => screen.getByRole('button', { name: 'avatar.title' });
    const { rerender } = render(
      <AvatarMenu
        config={baseConfig}
        agents={[codexAgent, claudeAgent]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    expect(trigger().querySelector('img.agent-icon')).toBeTruthy();
    expect(trigger().querySelector('.ri-link')).toBeNull();

    rerender(
      <AvatarMenu
        config={{ ...baseConfig, mode: 'api' }}
        agents={[codexAgent, claudeAgent]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    expect(trigger().querySelector('img.agent-icon')?.getAttribute('src')).toContain('anthropic-api');
    expect(trigger().querySelector('.ri-link')).toBeNull();
  });

  it('opens execution settings when Local CLI is selected while the daemon is offline', () => {
    const onOpenSettings = vi.fn();
    renderMenu({
      daemonLive: false,
      onOpenSettings,
    });

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /avatar.useLocal/i }));

    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('opens execution settings from the popover action', () => {
    const onOpenSettings = vi.fn<OpenSettingsHandler>();
    renderMenu({ onOpenSettings });

    openMenu();
    fireEvent.click(
      screen.getByRole('button', { name: 'inlineSwitcher.openFullSettings' }),
    );

    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('does not present an unconfigured BYOK mode as an active connection', () => {
    const onModeChange = vi.fn<ModeChangeHandler>();
    const onOpenSettings = vi.fn<OpenSettingsHandler>();
    renderMenu({
      config: { ...baseConfig, mode: 'api', apiKey: '' },
      onModeChange,
      onOpenSettings,
    });

    const dialog = openMenu();
    const byokButton = within(dialog).getByRole('button', { name: /avatar.useApi/i });

    expect(byokButton.getAttribute('aria-current')).toBeNull();
    expect(within(byokButton).queryByText('avatar.metaActive')).toBeNull();

    fireEvent.click(byokButton);

    expect(onModeChange).not.toHaveBeenCalled();
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('rescans agents and re-renders newly available CLI entries', async () => {
    function Harness() {
      const [agents, setAgents] = useState<AgentInfo[]>([
        codexAgent,
        { ...claudeAgent, available: false },
      ]);
      return (
        <AvatarMenu
          config={baseConfig}
          agents={agents}
          daemonLive={true}
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
          onRefreshAgents={() => {
            setAgents([codexAgent, claudeAgent]);
          }}
        />
      );
    }

    render(<Harness />);

    openMenu();
    expect(screen.queryByRole('button', { name: /Claude Code/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'avatar.rescan' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Claude Code/i })).toBeTruthy();
    });
  });

  it('routes reasoning selection changes through onAgentModelChange', () => {
    const onAgentModelChange = vi.fn();
    renderMenu({ onAgentModelChange });

    openMenu();
    const selects = screen.getAllByRole('combobox');
    fireEvent.click(selects[1]!);
    fireEvent.click(screen.getByRole('option', { name: /^High$/ }));

    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      reasoning: 'high',
    });
  });

  it('shows Fast only for a Codex model advertised as eligible and persists the toggle', () => {
    const onAgentModelChange = vi.fn();
    const fastCodex: AgentInfo = {
      ...codexAgent,
      models: [
        { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', metadata: { serviceTiers: ['fast'] } },
        { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      ],
    };
    renderMenu({
      agents: [fastCodex],
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'gpt-5.6-luna', reasoning: 'medium' } },
      },
      onAgentModelChange,
    });

    openMenu();
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    expect(onAgentModelChange).toHaveBeenCalledWith('codex', { fastMode: true });
  });

  it('does not show Fast for an ineligible Codex model', () => {
    renderMenu({
      agents: [{ ...codexAgent, models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' }] }],
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'gpt-5.4-mini', reasoning: 'medium' } },
      },
    });

    openMenu();
    expect(screen.queryByText('Fast mode')).toBeNull();
  });

  it('keeps a custom saved model visible when it is not in the declared agent model list', () => {
    renderMenu({
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'custom-codex-model', reasoning: 'default' } },
      },
    });

    openMenu();
    // The model picker is a SearchableModelSelect: a combobox button whose
    // label shows the active selection, backed by a popover listbox. A custom
    // saved model that isn't in the agent's declared list is injected as an
    // additional option so it stays selectable instead of silently dropping.
    const modelCombobox = screen.getAllByRole('combobox')[0] as HTMLButtonElement;
    expect(modelCombobox.textContent).toContain('custom-codex-model');

    fireEvent.click(modelCombobox);
    const popover = screen.getByTestId('avatar-model-popover');
    expect(
      within(popover).getByRole('option', { name: /custom-codex-model/i }),
    ).toBeTruthy();
  });

  it.skip('routes the retired AMR account shortcut through the active AMR profile', () => {
    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        agentCliEnv: {
          amr: {
            OPEN_DESIGN_AMR_PROFILE: 'test',
          },
        },
      },
      agents: [
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    openMenu();

    expect(
      screen
        .getByRole('link', { name: 'avatar.amrConsoleavatar.amrConsoleMeta' })
        .getAttribute('href'),
    ).toBe('https://vela.powerformer.net/wallet?source=open_design');
  });
});

it('labels cached discovery, prevents duplicate rescan, and offers retry on failure', async () => {
  const { beginProviderDiscovery } = await import('../../src/pixflow/provider-discovery-state');
  renderMenu();
  const menu = openMenu();
  let finish!: (success: boolean) => void;
  act(() => { finish = beginProviderDiscovery(true); });
  expect(screen.getByRole('button', {name:'avatar.title'}).getAttribute('aria-busy')).toBe('true');
  expect(within(menu).getByRole('status').getAttribute('title')).toBe('avatar.savedProviders');
  expect(within(menu).getByRole('button',{name:'avatar.refreshing'}).hasAttribute('disabled')).toBe(true);
  expect(within(menu).getByRole('button',{name:/Claude Code/})).toBeTruthy();
  act(() => finish(false));
  expect(within(menu).getByText('avatar.refreshFailed')).toBeTruthy();
  expect(within(menu).getByRole('button',{name:'avatar.rescan'}).hasAttribute('disabled')).toBe(false);
  act(() => { finish = beginProviderDiscovery(false); finish(true); });
  expect(within(menu).getByText('avatar.providersUpdated')).toBeTruthy();
  cleanup();
});


afterEach(() => cleanup());

describe('composer portal theme', () => {
  it('carries the trigger theme across a differently themed workspace portal', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'avatar.title' });
    trigger.style.setProperty('--text', '#e8e4dc');
    trigger.style.setProperty('--border', '#444444');
    fireEvent.click(trigger);
    const popup = screen.getByRole('dialog', { name: 'avatar.title' });
    expect(popup.style.getPropertyValue('--text')).toBe('#e8e4dc');
    expect(popup.style.getPropertyValue('--border')).toBe('#444444');
  });
});


it('carries theme tokens into the nested model picker and keeps its parent open', () => {
  renderMenu();
  fireEvent.click(screen.getByRole('button', { name:'avatar.title' }));
  const model = screen.getAllByRole('combobox')[0]!;
  model.style.setProperty('--accent-tint', '#333333');
  model.style.setProperty('--text', '#e8e4dc');
  fireEvent.click(model);
  const popup = screen.getByTestId('avatar-model-popover');
  expect(popup.style.getPropertyValue('--accent-tint')).toBe('#333333');
  expect(popup.style.getPropertyValue('--text')).toBe('#e8e4dc');
  fireEvent.keyDown(popup, { key:'Escape' });
  expect(screen.queryByTestId('avatar-model-popover')).toBeNull();
  expect(screen.queryByRole('dialog', { name:'avatar.title' })).not.toBeNull();
});

it('shows connection recovery guidance and clears it after successful discovery', async () => {
  const {beginProviderDiscovery}=await import('../../src/pixflow/provider-discovery-state');
  renderMenu();openMenu();
  act(()=>{beginProviderDiscovery(true)(false,'Check Bridge status and rescan Local CLI.');});
  expect(screen.getByRole('alert').textContent).toContain('Check Bridge status');
  act(()=>{beginProviderDiscovery(true)(true);});
  expect(screen.queryByRole('alert')).toBeNull();
});
