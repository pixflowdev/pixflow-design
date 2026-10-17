// @vitest-environment jsdom

import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const bridgeMocks = vi.hoisted(() => ({ wordpress: false, probe: vi.fn(), ensure: vi.fn() }));
vi.mock('../../src/pixflow/onboarding-profile', () => ({
  fetchPixflowOnboardingProfile: vi.fn(async () => null),
  savePixflowOnboardingProgress: vi.fn(async () => undefined),
}));
vi.mock('../../src/pixflow/wordpress-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/pixflow/wordpress-context')>(),
  hasPixflowWordPressContext: () => bridgeMocks.wordpress,
}));
vi.mock('../../src/pixflow/optional-bridge', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/pixflow/optional-bridge')>(),
  probePixflowOptionalBridge: bridgeMocks.probe,
  ensurePixflowOptionalBridgeSiteContext: bridgeMocks.ensure,
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
      track: vi.fn(),
    }),
  };
});

vi.mock('../../src/components/PixflowLicensePanel', () => ({
  PixflowLicensePanel: () => <div>License ready</div>,
}));

vi.mock('../../src/components/PixflowFrameworkSetup', () => ({
  PixflowFrameworkSetup: ({ onReadyChange }: { onReadyChange: (ready: boolean) => void }) => {
    useEffect(() => onReadyChange(true), [onReadyChange]);
    return <div>Framework ready</div>;
  },
}));

const cliAgent: AgentInfo = {
  id: 'claude-code',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: '1.0.0',
  models: [{ id: 'sonnet', label: 'Sonnet' }],
};

function initialConfig(): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
  } as AppConfig;
}

async function renderConnectOnboarding({
  daemonLive = true,
  bridgeConnected = true,
}: {
  daemonLive?: boolean;
  bridgeConnected?: boolean;
} = {}) {
  window.history.replaceState(null, '', '/onboarding');
  const bridgeWindow = window as Window & { pixflowDesignBridgeStatus?: unknown };
  if (bridgeConnected) {
    bridgeWindow.pixflowDesignBridgeStatus = {
      checked: true,
      running: true,
      siteMismatch: false,
    };
  } else {
    delete bridgeWindow.pixflowDesignBridgeStatus;
  }
  const onCompleteOnboarding = vi.fn();

  function Harness() {
    const [config, setConfig] = useState(initialConfig());
    return (
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={config}
          agents={[cliAgent]}
          daemonLive={daemonLive}
          onModeChange={(mode) => setConfig((current) => ({ ...current, mode }))}
          onAgentChange={(agentId) => setConfig((current) => ({ ...current, agentId }))}
          onAgentModelChange={(agentId, choice) => setConfig((current) => ({
            ...current,
            agentModels: { ...current.agentModels, [agentId]: choice },
          }))}
          onApiProtocolChange={() => undefined}
          onApiModelChange={() => undefined}
          onConfigPersist={(next) => setConfig(next)}
          onRefreshAgents={() => [cliAgent]}
          onThemeChange={() => undefined}
          onCreateProject={() => undefined}
          onCreatePluginShareProject={async () => ({ ok: false, message: 'Not used in onboarding.' })}
          onImportClaudeDesign={() => undefined}
          onOpenProject={() => undefined}
          onOpenLiveArtifact={() => undefined}
          onDeleteProject={() => undefined}
          onRenameProject={() => undefined}
          onChangeDefaultDesignSystem={() => undefined}
          onOpenSettings={() => undefined}
          onCompleteOnboarding={onCompleteOnboarding}
          pixflowLicenseStatus={{ license: { valid: true } } as never}
        />
      </I18nProvider>
    );
  }

  render(<Harness />);
  await waitFor(() => expect((screen.getByRole('button', { name: /^Continue$/i }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  await screen.findByRole('button', { name: /Connect an AI subscription/ });

  return { onCompleteOnboarding };
}

afterEach(() => {
  bridgeMocks.wordpress = false;
  bridgeMocks.probe.mockReset();
  bridgeMocks.ensure.mockReset();
  cleanup();
  delete (window as Window & { pixflowDesignBridgeStatus?: unknown }).pixflowDesignBridgeStatus;
  delete (window as Window & { pixflowDesignShell?: unknown }).pixflowDesignShell;
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('Pixflow onboarding Connect step', () => {
  it('does not probe or connect the Bridge when choosing API mode', async () => {
    await renderConnectOnboarding();
    bridgeMocks.wordpress = true;
    fireEvent.click(screen.getByRole('button', { name: /Use an API key/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });
    expect(bridgeMocks.probe).not.toHaveBeenCalled();
    expect(bridgeMocks.ensure).not.toHaveBeenCalled();
  });

  it('automatically verifies and connects Local CLI without depending on a host status event', async () => {
    bridgeMocks.probe.mockResolvedValue({ available: true, status: 'ready', version: '2.0.4', requiredVersion: '2.0.4' });
    bridgeMocks.ensure.mockResolvedValue(undefined);
    await renderConnectOnboarding({ bridgeConnected: false });
    bridgeMocks.wordpress = true;
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Bridge connected');
    expect(bridgeMocks.probe).toHaveBeenCalledWith({ force: true });
    expect(bridgeMocks.ensure).toHaveBeenCalledWith({ allowSiteSwitch: true });
    expect(screen.queryByText('Connect Pixflow Design Bridge')).toBeNull();
  });

  it('shows a recoverable connection failure and retries without removing settings', async () => {
    bridgeMocks.probe.mockResolvedValueOnce({ available: false, error: 'Bridge is offline.' })
      .mockResolvedValue({ available: true, status: 'ready', version: '2.0.4', requiredVersion: '2.0.4' });
    bridgeMocks.ensure.mockResolvedValue(undefined);
    await renderConnectOnboarding({ bridgeConnected: false });
    bridgeMocks.wordpress = true;
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Bridge is offline.');
    expect(bridgeMocks.ensure).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await screen.findByText('Bridge connected');
    expect(bridgeMocks.ensure).toHaveBeenCalledTimes(1);
  });

  it('does not connect an outdated Bridge or launch a download automatically', async () => {
    bridgeMocks.probe.mockResolvedValue({ available: true, status: 'ready', version: '2.0.3', requiredVersion: '2.0.4' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderConnectOnboarding({ bridgeConnected: false });
    bridgeMocks.wordpress = true;
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Connect Pixflow Design Bridge')).toBeTruthy();
    expect(bridgeMocks.ensure).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ['Win32', 'Windows NT 10.0', 'https://example.test/bridge.exe'],
    ['MacIntel', 'Macintosh Safari', 'https://example.test/bridge.dmg'],
    ['Linux x86_64', 'X11 Linux', 'https://example.test/install.sh'],
  ])('downloads the native installer on %s with localized WordPress URLs', async (platform, userAgent, expected) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    (window as unknown as { pixflowDesignShell?: unknown }).pixflowDesignShell = {
      runtime: 'wordpress',
      bridgeInstallWindowsUrl: 'https://example.test/bridge.exe',
      bridgeInstallMacArm64Url: 'https://example.test/bridge.dmg',
      bridgeInstallUnixUrl: 'https://example.test/install.sh',
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderConnectOnboarding({ daemonLive: false, bridgeConnected: false });
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });
    fireEvent.click(screen.getByRole('button', { name: 'Download Pixflow Design Bridge' }));
    expect(open).toHaveBeenCalledWith(expected, '_blank', 'noopener,noreferrer');
  });

  it('continues after selecting a detected Local CLI without running the optional test', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await renderConnectOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });

    expect(screen.getByText('Why choose Local CLI?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download Pixflow Design Bridge' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(true);

    const cliButton = await screen.findByRole('button', { name: /Claude Code/i });
    fireEvent.click(cliButton);

    await waitFor(() => {
      expect(screen.getByText('Local CLI selected. You can continue.')).toBeTruthy();
      expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(false);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides Bridge installation guidance when the shared heartbeat reports a connection', async () => {
    globalThis.fetch = vi.fn() as typeof fetch;
    const watchEvents: boolean[] = [];
    const onWatch = (event: Event) => {
      watchEvents.push(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    };
    window.addEventListener('pixflow-design:bridge-onboarding-watch', onWatch);

    await renderConnectOnboarding({ daemonLive: false, bridgeConnected: false });
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });

    expect(screen.getByText('Connect Pixflow Design Bridge')).toBeTruthy();
    expect(screen.getByText(/Allow browser access when prompted/i)).toBeTruthy();

    window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', {
      detail: { checked: true, running: true, siteMismatch: false },
    }));

    await waitFor(() => {
      expect(screen.queryByText('Connect Pixflow Design Bridge')).toBeNull();
    });
    expect(watchEvents).toContain(true);
    expect(watchEvents.at(-1)).toBe(false);
    window.removeEventListener('pixflow-design:bridge-onboarding-watch', onWatch);
  });

  it('keeps the Local CLI connection test available as an optional diagnostic', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      model: 'sonnet',
      agentName: 'Claude Code',
      sample: 'Connected',
      detail: 'This test used the installed CLI at C:\\Program Files\\Agent\\agent.exe.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    await renderConnectOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /Connect an AI subscription/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });
    fireEvent.click(await screen.findByRole('button', { name: /Claude Code/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const details = await screen.findByRole('button', { name: 'Technical details' });
    const panel = document.getElementById(details.getAttribute('aria-controls')!);
    expect(details.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.getAttribute('aria-hidden')).toBe('false');
    expect(panel?.textContent).toContain('C:\\Program Files\\Agent\\agent.exe');
    fireEvent.click(details);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(false);
  });

  it('requires API configuration before continuing', async () => {
    await renderConnectOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /Use an API key/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: /Connect your/ });

    expect(screen.getByText('API usage is billed separately')).toBeTruthy();
    expect(screen.getByText(/requires an API key/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(true);
  });
});
