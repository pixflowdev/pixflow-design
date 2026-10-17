// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canContinueOnboardingConnect,
  EntryShell,
  PIXFLOW_BYOK_ONBOARDING_NOTICE,
  PIXFLOW_LOCAL_CLI_ONBOARDING_COPY,
} from '../../src/components/EntryShell';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const originalFetch = globalThis.fetch;

describe('Pixflow onboarding Connect gate', () => {
  it('requires a detected Local CLI selection but not a connection test', () => {
    expect(canContinueOnboardingConnect(null, false)).toBe(false);
    expect(canContinueOnboardingConnect('local', false)).toBe(false);
    expect(canContinueOnboardingConnect('local', true)).toBe(true);
    expect(canContinueOnboardingConnect('byok', false)).toBe(true);
  });

  it('explains the Bridge, CLI subscription usage, and BYOK API billing tradeoff', () => {
    expect(PIXFLOW_LOCAL_CLI_ONBOARDING_COPY.body).toContain('connects that local CLI to WordPress');
    expect(PIXFLOW_LOCAL_CLI_ONBOARDING_COPY.benefits.join(' ')).toContain('weekly usage limits');
    expect(PIXFLOW_LOCAL_CLI_ONBOARDING_COPY.benefits.join(' ')).toContain('No separate API key');
    expect(PIXFLOW_BYOK_ONBOARDING_NOTICE.body).toContain('requires an API key');
    expect(PIXFLOW_BYOK_ONBOARDING_NOTICE.body).toContain('cost extra');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function amrAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'amr',
    name: 'AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'amr-model', label: 'AMR Model' }],
    ...overrides,
  };
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    ...overrides,
  } as AppConfig;
}

function renderOnboarding(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/onboarding');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [amrAgent(), cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    onThemeChange: vi.fn(),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => {
            props.onConfigPersist(next);
            setConfig(next as AppConfig);
          }}
        />
      </I18nProvider>
    );
  }

  render(
    <Harness />,
  );

  return props;
}

function renderHome(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig({
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
      theme: 'system',
    }),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onThemeChange: vi.fn(),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

function trackedEvents(name: string) {
  return analyticsMocks.track.mock.calls.filter(([eventName]) => eventName === name);
}

function latestTrackedEvent<T extends Record<string, unknown>>(name: string): T {
  const calls = trackedEvents(name);
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]?.[1] as T;
}

function findTrackedEvent<T extends Record<string, unknown>>(
  name: string,
  predicate: (payload: T) => boolean,
): T {
  const payload = trackedEvents(name)
    .map(([, eventPayload]) => eventPayload as T)
    .find(predicate);
  expect(payload).toBeTruthy();
  return payload as T;
}

function chooseDropdownOption(label: string, option: string | RegExp) {
  const field = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-view__select-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!field) throw new Error(`dropdown field not found: ${label}`);
  const trigger = field.querySelector('button');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`dropdown trigger not found: ${label}`);
  }
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('option', {
      name: option instanceof RegExp ? option : new RegExp(option, 'i'),
    }),
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  analyticsMocks.track.mockReset();
});

describe('EntryShell settings menu', () => {
  it('opens quick actions before opening the full settings dialog', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/community/discord')) {
        return jsonResponse({
          inviteCode: 'mHAjSMV6gz',
          inviteUrl: 'https://discord.gg/mHAjSMV6gz',
          onlineCount: 1234,
          memberCount: 4321,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      if (url.endsWith('/api/github/open-design')) {
        return jsonResponse({
          repo: 'nexu-io/open-design',
          stargazers_count: 56100,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      return jsonResponse({});
    }) as typeof fetch;
    const props = renderHome();

    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));

    expect(props.onOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-settings-menu')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    fireEvent.click(screen.getByTestId('entry-settings-open-details'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
  });
});

describe('Pixflow shared setup', () => {
  const licensed = { pixflowLicenseStatus: { license: { valid: true } } as never };
  async function next() {
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }
  it.each(['missing', 'expired'])('completes Free onboarding with a %s licence', async status => {
    const props = renderOnboarding({pixflowLicenseStatus:{requires_license:false,runtime_ready:true,license:{present:status==='expired',valid:false,status}} as never, config:baseConfig({agentId:'claude-code'})});
    expect(await screen.findByText('WordPress and Gutenberg editing are free. No licence or trial is required.')).toBeTruthy();
    expect(screen.queryByLabelText('License key')).toBeNull();
    await next();
    fireEvent.click(await screen.findByRole('button', {name:/Connect an AI subscription/}));
    await next();
    await next();
    fireEvent.click(await screen.findByRole('button', {name:'Open Pixflow Design'}));
    await waitFor(() => expect(props.onCompleteOnboarding).toHaveBeenCalledOnce());
  });
  it('offers only the two AI routes without requiring framework or resources', async () => {
    renderOnboarding(licensed);
    await next();
    await screen.findByRole('button', { name: /Use an API key/ });
    expect(screen.queryByRole('button', { name: /Continue without AI/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Connect an AI subscription/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Use an API key/ })).toBeTruthy();
    expect(screen.queryByText('Install resources')).toBeNull();
  });
  it('requires an AI route when resuming a legacy no-AI selection', async () => {
    const props = renderOnboarding({ ...licensed, config: baseConfig({ onboardingRoute: 'none' }), agents: [], daemonLive: false });
    await next();
    await screen.findByRole('button', { name: /Use an API key/ });
    expect(screen.queryByRole('button', { name: /Continue without AI/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
  });
  it('stays on setup and presents a retryable error when completion cannot be saved', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('Could not save setup'));
    renderOnboarding({ ...licensed, config: baseConfig({ agentId: 'claude-code' }), onCompleteOnboarding: complete });
    await next();
    fireEvent.click(await screen.findByRole('button', { name: /Connect an AI subscription/ }));
    await next();
    await next();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Pixflow Design' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save setup');
    expect((screen.getByRole('button', { name: 'Open Pixflow Design' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('returns from the ready summary to the connection step', async () => {
    renderOnboarding({ ...licensed, config: baseConfig({ agentId: 'claude-code' }) });
    await next();
    fireEvent.click(await screen.findByRole('button', { name: /Connect an AI subscription/ }));
    await next();
    await next();
    await screen.findByRole('button', { name: 'Open Pixflow Design' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Test connection' })).toBeTruthy();
  });
});
