import { TranslatedText } from '../i18n/TranslatedText';
import { useT as usePixflowUiTranslation } from '../i18n';
import { fetchPixflowOnboardingProfile, savePixflowOnboardingProgress } from '../pixflow/onboarding-profile';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SetStateAction } from 'react';
import { Button } from '@open-design/components';
import { ensurePixflowOptionalBridgeSiteContext, probePixflowOptionalBridge, readPublishedBridgeStatus } from '../pixflow/optional-bridge';
import { bridgeUpdateRequiredForProps } from '../pixflow/bridge-update-gate';
import { useT } from '../i18n';
import type { AgentInfo, ApiProtocol, ApiProtocolConfig, AppConfig, ConnectionTestResponse, ExecMode, ProviderModelOption, ProviderModelsResponse } from '../types';
import { Icon } from './Icon';
import { IconCheck, IconCircle, IconCircleCheck, IconHammer, IconAdjustmentsHorizontal, IconRefresh, IconLoader2, IconInfoCircle, IconX } from '@tabler/icons-react';
import { AgentIcon } from './AgentIcon';
import { modelTradeoffLabel, orderModelOptionsByAvailability } from './modelOptions';
import { PixflowLicensePanel } from './PixflowLicensePanel';
import { API_KEY_PLACEHOLDERS, API_PROTOCOL_TABS, SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import type { KnownProvider } from '../state/config';
import { testAgent, testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';
import { providerModelsCacheKey, type ProviderModelsCache } from './providerModelsCache';
import type { PixflowLicenseStatus } from '../pixflow/license';
import { installerUrlForPlatform } from '../pixflow/bridge-update';
import { pixflowPublicAssetUrl } from '../pixflow/public-assets';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import onboardingStyles from './EntryShellOnboarding.module.css';

/** Shared Free onboarding; independent of the Pro Workspace shell. */
const ONBOARDING_DROPDOWN_OPEN_EVENT = 'open-design:onboarding-dropdown-open';

export const PIXFLOW_LOCAL_CLI_ONBOARDING_COPY = {
  title: 'Why choose Local CLI?',
  body: 'Pixflow Design uses an AI coding CLI installed and signed in on this computer. The Pixflow Design Bridge securely connects that local CLI to WordPress.',
  benefits: [
    'Better results from the full coding-agent workflow.',
    'Uses your CLI subscription and included weekly usage limits.',
    'No separate API key or per-request API charges.',
    'Runs from your computer while you keep working in WordPress.',
  ],
} as const;

export const PIXFLOW_BYOK_ONBOARDING_NOTICE = {
  title: 'API usage is billed separately',
  body: 'BYOK requires an API key. Your AI provider charges API usage separately from its CLI subscription, so this can cost extra instead of consuming the CLI account\'s included or weekly usage limits.',
} as const;

export function canContinueOnboardingConnect(
  runtime: 'local' | 'byok' | null,
  localCliSelected: boolean,
): boolean {
  return runtime === 'byok' || (runtime === 'local' && localCliSelected);
}

function resolveOnboardingBridgeInstallerUrl(): string {
  const wordpressConfig = getPixflowWordPressConfig();
  const platform = typeof navigator === 'undefined'
    ? ''
    : `${navigator.platform || ''} ${navigator.userAgent || ''}`;
  return installerUrlForPlatform(platform, null, {
    windows: wordpressConfig?.bridgeInstallWindowsUrl,
    macosArm64: wordpressConfig?.bridgeInstallMacArm64Url,
    linux: wordpressConfig?.bridgeInstallUnixUrl,
  });
}

export function OnboardingView({
  config,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onFinish,
  pixflowLicenseStatus,
  onPixflowLicenseStatusChange,
}: {
  config: AppConfig;
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; fastMode?: boolean },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  onRefreshAgents: (options?: { useOptionalBridge?: boolean }) => Promise<AgentInfo[]> | AgentInfo[];
  onFinish: () => void | Promise<void>;
  pixflowLicenseStatus?: PixflowLicenseStatus | null;
  onPixflowLicenseStatusChange?: (status: PixflowLicenseStatus) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const [step, setStep] = useState(0);
  const [runtime, setRuntime] = useState<'local' | 'byok' | null>(config.onboardingRoute === 'none' ? null : config.onboardingRoute ?? null);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const scanInFlight = useRef(false);
  const [bridgeDownloadStarted, setBridgeDownloadStarted] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [cliScanStatus, setCliScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [providerTestState, setProviderTestState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse }
  >({ status: 'idle' });
  const [agentTestState, setAgentTestState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse }
  >({ status: 'idle' });
  const [providerModelsState, setProviderModelsState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ProviderModelsResponse }
  >({ status: 'idle' });
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerTestInputKey = [
    apiProtocol,
    config.baseUrl.trim(),
    config.model.trim(),
    config.apiKey.trim(),
    config.apiVersion?.trim() ?? '',
  ].join('\n');
  const providerModelsInputKey = providerModelsCacheKey(
    apiProtocol,
    config.baseUrl,
    config.apiKey,
    config.apiVersion ?? '',
  );
  const canTestProvider =
    (apiProtocol === 'ollama' || Boolean(config.apiKey.trim())) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim());
  const canFetchProviderModels =
    apiProtocol !== 'azure' &&
    apiProtocol !== 'ollama' &&
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    isLikelyHttpUrl(config.baseUrl);
  const visibleProviderTestState =
    providerTestState.status !== 'idle' &&
    providerTestState.inputKey === providerTestInputKey
      ? providerTestState
      : { status: 'idle' as const };
  const visibleProviderModelsState =
    providerModelsState.status !== 'idle' &&
    providerModelsState.inputKey === providerModelsInputKey
      ? providerModelsState
      : { status: 'idle' as const };
  const selectedProvider = KNOWN_PROVIDERS.find(
    (provider) =>
      provider.protocol === apiProtocol &&
      provider.baseUrl === (config.apiProviderBaseUrl ?? config.baseUrl),
  ) ?? null;
  const visibleAgents = agents.filter(
    (agent) => agent.available && agent.id !== 'amr',
  );
  const selectedAgent = visibleAgents.find((agent) => agent.id === config.agentId) ?? null;
  const selectedAgentChoice = selectedAgent ? (config.agentModels?.[selectedAgent.id] ?? {}) : {};
  const selectedAgentTestModel = selectedAgentChoice.model ?? selectedAgent?.models?.[0]?.id ?? '';
  const selectedAgentTestReasoning = selectedAgentChoice.reasoning ?? '';
  const agentTestInputKey = [
    selectedAgent?.id ?? '',
    selectedAgentTestModel,
    selectedAgentTestReasoning,
    JSON.stringify(config.agentCliEnv ?? {}),
  ].join('\n');
  const visibleAgentTestState =
    agentTestState.status === 'running' ||
    (agentTestState.status !== 'idle' && agentTestState.inputKey === agentTestInputKey)
      ? agentTestState
      : { status: 'idle' as const };

  const localCliSelected = Boolean(selectedAgent) && daemonLive;
  const canTestAgent = localCliSelected;
  const freeAccess = pixflowLicenseStatus?.requires_license === false;
  const pixflowLicenseValid = freeAccess || pixflowLicenseStatus?.license.valid === true;
  const byokProviderOptions = [
    { value: '', label: t('settings.customProvider') },
    ...KNOWN_PROVIDERS.filter((provider) => provider.protocol === apiProtocol).map((provider) => ({
      value: provider.baseUrl,
      label: provider.label,
    })),
  ];
  const agentModelOptions =
    orderModelOptionsByAvailability(selectedAgent?.models ?? []).map((model) => ({
      value: model.id,
      label: model.label ?? model.id,
      enabled: model.enabled !== false,
      meta: modelTradeoffLabel(model, t) || undefined,
    }));
  const fetchedProviderModels =
    activeProviderModelsCache[providerModelsInputKey] ?? [];
  const byokModelOptions = mergeOnboardingProviderModelOptions(
    fetchedProviderModels,
    SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    config.model,
  ).map((model) => ({
    value: model.id,
    label: onboardingProviderModelLabel(model),
  }));

  function updateApiConfig(patch: Partial<ApiProtocolConfig>) {
    const protocol = config.apiProtocol ?? 'anthropic';
    const currentConfig: ApiProtocolConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      apiVersion: config.apiVersion ?? '',
      apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
    };
    const nextProtocolConfig: ApiProtocolConfig = {
      ...currentConfig,
      ...patch,
    };
    const nextConfig: AppConfig = {
      ...config,
      mode: 'api',
      apiProtocol: protocol,
      apiKey: nextProtocolConfig.apiKey,
      baseUrl: nextProtocolConfig.baseUrl,
      model: nextProtocolConfig.model,
      apiVersion: protocol === 'azure' ? (nextProtocolConfig.apiVersion ?? '') : '',
      apiProviderBaseUrl: nextProtocolConfig.apiProviderBaseUrl ?? null,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextProtocolConfig,
      },
    };
    void onConfigPersist(nextConfig);
  }


  useEffect(() => {
    let live = true;
    void fetchPixflowOnboardingProfile().then(profile => {
      if (!live) return;
      if (profile && (!profile.completed || profile.runtimeMode === 'none')) {
        setStep(profile.runtimeMode === 'none' ? 1 : profile.runtimeMode ? Math.max(0, Math.min(3, profile.step ?? 0)) : Math.min(1, profile.step ?? 0));
        setRuntime(profile.runtimeMode === 'byok' ? 'byok' : profile.runtimeMode === 'local-cli' ? 'local' : null);
      }
      setHydrated(true);
    });
    return () => { live = false; };
  }, []);

  async function scanCliAgents() {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    setCliScanStatus('scanning');
    try { await onRefreshAgents({ useOptionalBridge: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : translateUi("ui.entryShell.feedback37")); }
    finally { scanInFlight.current = false; setCliScanStatus('done'); }
  }

  const refreshRef = useRef(scanCliAgents);
  refreshRef.current = scanCliAgents;
  useEffect(() => {
    if (!hydrated || step !== 2 || runtime !== 'local' || (daemonLive && visibleAgents.length > 0)) return;
    void refreshRef.current();
    const refresh = () => { if (!document.hidden) void refreshRef.current(); };
    const timer = window.setInterval(refresh, 12000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [hydrated, step, runtime, daemonLive, visibleAgents.length]);

  async function move(next: number) {
    setError(''); setSaving(true);
    try {
      if (runtime) await onConfigPersist({ ...config, onboardingRoute: runtime, mode: runtime === 'byok' ? 'api' as const : 'daemon' as const });
      await savePixflowOnboardingProgress(next, runtime);
      setStep(next);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : translateUi("ui.entryShell.feedback38")); }
    finally { setSaving(false); }
  }
  async function choose(route: 'local' | 'byok') {
    setError(''); setSaving(true);
    try {
      await onConfigPersist({ ...config, onboardingRoute: route, mode: route === 'byok' ? 'api' as const : 'daemon' as const });
      await savePixflowOnboardingProgress(1, route);
      setRuntime(route);
    } catch (reason) { setError(reason instanceof Error ? reason.message : translateUi("ui.entryShell.feedback39")); }
    finally { setSaving(false); }
  }
  async function finish() {
    setError(''); setSaving(true);
    try { await onFinish(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : translateUi("ui.entryShell.feedback40")); }
    finally { setSaving(false); }
  }
  async function testProviderInline() {
    if (!canTestProvider || providerTestState.status === 'running') return;
    const inputKey = providerTestInputKey;
    setProviderTestState({ status: 'running', inputKey });
    try {
      const result = await testApiProvider({
        protocol: apiProtocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        apiVersion:
          apiProtocol === 'azure'
            ? config.apiVersion?.trim() || undefined
            : undefined,
      });
      setProviderTestState({ status: 'done', inputKey, result });
    } catch (error) {
      setProviderTestState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: config.model,
          detail: error instanceof Error ? error.message : 'Test request failed',
        },
      });
    }
  }

  async function testAgentInline() {
    if (!selectedAgent || !canTestAgent || agentTestState.status === 'running') return;
    const inputKey = agentTestInputKey;
    const agent = selectedAgent;
    const model = selectedAgentTestModel;
    setAgentTestState({ status: 'running', inputKey });
    try {
      const result = await testAgent({
        agentId: agent.id,
        model: model || undefined,
        reasoning: selectedAgentTestReasoning || undefined,
        agentCliEnv: config.agentCliEnv ?? {},
      });
      setAgentTestState({ status: 'done', inputKey, result });
    } catch (error) {
      setAgentTestState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: model || 'default',
          agentName: agent.name,
          detail: error instanceof Error ? error.message : 'Test request failed',
        },
      });
    }
  }

  async function fetchProviderModelsInline() {
    if (!canFetchProviderModels || providerModelsState.status === 'running') return;
    const inputKey = providerModelsInputKey;
    const cachedModels = activeProviderModelsCache[inputKey];
    if (cachedModels) {
      setProviderModelsState({
        status: 'done',
        inputKey,
        result: {
          ok: true,
          kind: 'success',
          latencyMs: 0,
          models: cachedModels,
        },
      });
      return;
    }
    setProviderModelsState({ status: 'running', inputKey });
    try {
      const result = await fetchProviderModels({
        protocol: apiProtocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      if (result.ok && result.models?.length) {
        activeSetProviderModelsCache((current) => ({
          ...current,
          [inputKey]: result.models ?? [],
        }));
      }
      setProviderModelsState({ status: 'done', inputKey, result });
    } catch (error) {
      setProviderModelsState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          detail: error instanceof Error ? error.message : 'Model list request failed',
        },
      });
    }
  }


  const displayedStep = !pixflowLicenseValid ? 0 : step;
  const labels = [freeAccess ? translateUi("settings.welcomeTitle") : translateUi("ui.pluginMetaSections.license"), translateUi("ui.finalOnboarding.f54f5d4bcd"), translateUi("connectors.connect"), translateUi("fileViewer.deployLinkReady")];
  const titles = [translateUi("ui.wpAdminOnboardingHost.welcomeToPixflowDesign"), translateUi("ui.finalOnboarding.7d2d594053"), runtime === 'byok' ? translateUi("ui.finalOnboarding.bdf73477f9") : translateUi("ui.finalOnboarding.28edc3b8f2"), translateUi("ui.finalOnboarding.f9573d1164")];
  const descriptions = [freeAccess ? translateUi("ui.finalOnboarding.45ddd1221b") : translateUi("ui.finalOnboarding.6072f06060"), translateUi("ui.finalOnboarding.ae83bc42b4"), runtime === 'byok' ? translateUi("ui.finalOnboarding.c9e2eb7fcb") : translateUi("ui.finalOnboarding.5add76d77c"), translateUi("ui.finalOnboarding.fbcd710247")];
  const ready = displayedStep === 0 ? pixflowLicenseValid : displayedStep === 1 ? runtime !== null : displayedStep === 2 ? runtime === 'local' ? localCliSelected : canTestProvider : true;
  return (
    <section className={onboardingStyles.flow} aria-labelledby="pixflow-setup-title" aria-busy={!hydrated || saving}>
      <header className={onboardingStyles.header}>
        <div className={onboardingStyles.brand}><span aria-hidden="true" className={onboardingStyles.brandMark} style={{ maskImage: `url("${pixflowPublicAssetUrl('app-icon.svg')}")`, WebkitMaskImage: `url("${pixflowPublicAssetUrl('app-icon.svg')}")` }} />Pixflow Design</div>
        <span>{translateUi("ui.entryShell.setUpOnceCreateYourWay")}</span>
        {hasPixflowWordPressContext() && <Button variant="ghost" className={onboardingStyles.flowClose} aria-label={translateUi("ui.entryShell.closeSetup")} onClick={() => window.postMessage({ source: 'pixflow-design', type: 'pixflow-design:close-workspace' }, window.location.origin)}><IconX size={18} stroke={1.75} aria-hidden="true" /></Button>}
      </header>
      <ol className={onboardingStyles.progress} aria-label={translateUi("ui.entryShell.setupProgress")}>{labels.map((label, index) => {
        const actual = index;
        return <li key={label} aria-current={actual === displayedStep ? 'step' : undefined}><span>{actual < displayedStep ? <IconCheck size={15} stroke={1.75} aria-hidden="true" /> : index + 1}</span>{label}</li>;
      })}</ol>
      <div className={onboardingStyles.scroll}>
        <h1 id="pixflow-setup-title">{titles[displayedStep]}</h1><p className={onboardingStyles.intro}>{descriptions[displayedStep]}</p>
        {!hydrated ? <p role="status">{translateUi("ui.entryShell.loadingYourSetup")}</p> : <>
          {displayedStep === 0 && !freeAccess && <PixflowLicensePanel mode="onboarding" status={pixflowLicenseStatus} onStatusChange={onPixflowLicenseStatusChange} />}
          {displayedStep === 1 && <div className={onboardingStyles.choices}>{([
            ['local', translateUi("ui.finalOnboarding.24fba6f166"), translateUi("ui.finalOnboarding.82d6b8daef"), IconHammer],
            ['byok', translateUi("ui.finalOnboarding.894f66ba11"), translateUi("ui.finalOnboarding.e76c3bfd0e"), IconAdjustmentsHorizontal],
          ] as const).map(([id, title, description, ChoiceIcon]) => <button type="button" key={id} className={onboardingStyles.choice} aria-pressed={runtime === id} disabled={saving} onClick={() => void choose(id)}><ChoiceIcon size={22} stroke={1.75} aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true" className={onboardingStyles.radio}>{runtime === id ? <IconCircleCheck size={20} stroke={1.75} /> : <IconCircle size={20} stroke={1.5} />}</span></button>)}</div>}
          {displayedStep === 2 && <div className={onboardingStyles.connection}>
                {runtime === 'local' ? (
                  <OnboardingCliSetupPanel
                    agents={visibleAgents}
                    daemonLive={daemonLive}
                    selectedAgentId={config.agentId}
                    selectedAgent={selectedAgent}
                    selectedModel={selectedAgentChoice.model ?? selectedAgent?.models?.[0]?.id ?? ''}
                    modelOptions={agentModelOptions}
                    scanStatus={cliScanStatus}
                    bridgeInstallerUrl={resolveOnboardingBridgeInstallerUrl()}
                    bridgeDownloadStarted={bridgeDownloadStarted}
                    cliSelected={localCliSelected}
                    onDownloadBridge={(url) => {
                      window.open(url, '_blank', 'noopener,noreferrer');
                      setBridgeDownloadStarted(true);
                    }}
                    onRefresh={() => void scanCliAgents()}
                    onSelectAgent={(agentId) => {
                      onModeChange('daemon');
                      onAgentChange(agentId);
                    }}
                    onSelectModel={(model) => {
                      if (!selectedAgent) return;
                      onAgentModelChange(selectedAgent.id, { model });
                    }}
                    testState={visibleAgentTestState}
                    canTest={canTestAgent}
                    onTest={() => void testAgentInline()}
                  />
                ) : null}
                {runtime === 'byok' ? (
                  <OnboardingByokSetupPanel
                    apiProtocol={apiProtocol}
                    apiKey={config.apiKey}
                    baseUrl={config.baseUrl}
                    model={config.model}
                    selectedProvider={selectedProvider}
                    providerOptions={byokProviderOptions}
                    apiKeyVisible={apiKeyVisible}
                    onToggleApiKey={() => setApiKeyVisible((current) => !current)}
                    onProtocolChange={(protocol) => {
                      onApiProtocolChange(protocol);
                    }}
                    onProviderChange={(baseUrl) => {
                      const provider = KNOWN_PROVIDERS.find(
                        (item) => item.protocol === apiProtocol && item.baseUrl === baseUrl,
                      );
                      updateApiConfig({
                        baseUrl: provider?.baseUrl ?? '',
                        model: provider?.model ?? '',
                        apiProviderBaseUrl: provider?.baseUrl ?? null,
                      });
                    }}
                    onApiKeyChange={(apiKey) => updateApiConfig({ apiKey })}
                    onModelChange={(model) => {
                      onApiModelChange(model);
                      updateApiConfig({ model });
                    }}
                    onBaseUrlChange={(baseUrl) =>
                      updateApiConfig({ baseUrl, apiProviderBaseUrl: null })
                    }
                    modelOptions={byokModelOptions}
                    testState={visibleProviderTestState}
                    canTest={canTestProvider}
                    onTest={() => void testProviderInline()}
                    modelsState={visibleProviderModelsState}
                    canFetchModels={canFetchProviderModels}
                    onFetchModels={() => void fetchProviderModelsInline()}
                  />
                ) : null}

          </div>}
          {displayedStep === 3 && <div className={onboardingStyles.summary}>
            <div><IconCheck size={22} stroke={1.75} aria-hidden="true" /><span><strong>{freeAccess ? translateUi("ui.entryShell.freeIsReady") : translateUi("ui.entryShell.licenseActivated")}</strong><small>{translateUi("ui.entryShell.yourExistingSiteConfigurationIsPreserved")}</small></span></div>
            <div><IconCheck size={22} stroke={1.75} aria-hidden="true" /><span><strong>{runtime === 'byok' ? translateUi("ui.entryShell.apiProviderConfigured") : selectedAgent?.name ?? translateUi("ui.entryShell.aiSubscriptionConnected")}</strong><small>{translateUi("ui.entryShell.providerUsageLimitsAndBillingStillApply")}</small></span></div>
            {!freeAccess && <p>{translateUi("ui.entryShell.frameworksExtraResourcesMediaProvidersAndDictation")}</p>}
          </div>}
        </>}
        {error && <p role="alert" className={onboardingStyles.error}>{error}</p>}
      </div>
      <footer className={onboardingStyles.footer}>
        <Button variant="ghost" disabled={saving || displayedStep === 0} onClick={() => void move(displayedStep - 1)}>{translateUi("settings.onboardingBack")}</Button>
        <a href="https://docs.pixflow.dev/plugin/bridge/" target="_blank" rel="noopener noreferrer">{translateUi("ui.entryShell.setupHelp")}</a>
        <Button disabled={!hydrated || saving || !ready} onClick={() => void (displayedStep === 3 ? finish() : move(displayedStep + 1))}>{saving ? translateUi("routines.saving") : displayedStep === 3 ? translateUi("ui.entryShell.openPixflowDesign") : translateUi("settings.onboardingContinue")}</Button>
      </footer>
    </section>
  );
}

type OnboardingBridgeStatusPayload = {
  checked?: boolean;
  running?: boolean;
  state?: string;
  status?: string;
  updateRequired?: boolean;
  siteMismatch?: boolean;
  reconnecting?: boolean;
  error?: unknown;
};

function onboardingBridgeIsConnected(payload: OnboardingBridgeStatusPayload | null | undefined): boolean {
  if (!payload) return false;
  const explicitState = String(payload.state ?? payload.status ?? '').trim().toLowerCase();
  const running = payload.running === true || explicitState === 'connected';
  return running
    && payload.updateRequired !== true
    && explicitState !== 'update'
    && payload.siteMismatch !== true
    && explicitState !== 'mismatch'
    && !payload.error;
}

function OnboardingCliSetupPanel({
  agents,
  daemonLive,
  selectedAgentId,
  selectedAgent,
  selectedModel,
  modelOptions,
  scanStatus,
  bridgeInstallerUrl,
  bridgeDownloadStarted,
  cliSelected,
  onDownloadBridge,
  onRefresh,
  onSelectAgent,
  onSelectModel,
  testState,
  canTest,
  onTest,
}: {
  agents: AgentInfo[];
  daemonLive: boolean;
  selectedAgentId: string | null;
  selectedAgent: AgentInfo | null;
  selectedModel: string;
  modelOptions: Array<{ value: string; label: string }>;
  scanStatus: 'idle' | 'scanning' | 'done';
  bridgeInstallerUrl: string;
  bridgeDownloadStarted: boolean;
  cliSelected: boolean;
  onDownloadBridge: (url: string) => void;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectModel: (model: string) => void;
  testState:
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse };
  canTest: boolean;
  onTest: () => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const scanning = scanStatus === 'scanning';
  const running = testState.status === 'running';
  const showEmpty = scanStatus === 'done' && agents.length === 0;
  const [bridgeConnected, setBridgeConnected] = useState(() => {
    return onboardingBridgeIsConnected(readPublishedBridgeStatus());
  });
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [bridgeRetry, setBridgeRetry] = useState(0);
  const refreshAgents = useRef(onRefresh);
  refreshAgents.current = onRefresh;

  // Entering Local CLI is an explicit connection request. A cached agent list
  // or the WordPress API being alive is not evidence of a connected Bridge.
  useEffect(() => {
    if (!hasPixflowWordPressContext()) return;
    let cancelled = false;
    setBridgeChecking(true);
    setBridgeError('');
    void (async () => {
      const health = await probePixflowOptionalBridge({ force: true });
      if (cancelled) return;
      if (!health.available) throw new Error(health.error || t('ui.finalAnnotation.bridgeDisconnected'));
      const update = bridgeUpdateRequiredForProps({ active: true, mode: 'daemon', installedVersion: health.version, requiredVersion: health.requiredVersion }, {});
      if (update.required) throw new Error(t('ui.finalAnnotation.bridgeUpdate'));
      await ensurePixflowOptionalBridgeSiteContext({ allowSiteSwitch: true });
      if (cancelled) return;
      setBridgeConnected(true);
      refreshAgents.current();
    })().catch((error: unknown) => {
      if (cancelled) return;
      setBridgeConnected(false);
      setBridgeError(error instanceof Error ? error.message : t('ui.finalAnnotation.bridgeDisconnected'));
    }).finally(() => { if (!cancelled) setBridgeChecking(false); });
    return () => { cancelled = true; };
  }, [bridgeRetry, t]);

  useEffect(() => {
    function onBridgeStatus(event: Event) {
      const detail = event instanceof CustomEvent
        ? event.detail as OnboardingBridgeStatusPayload
        : null;
      setBridgeConnected(onboardingBridgeIsConnected(detail));
      if (onboardingBridgeIsConnected(detail)) setBridgeError('');
    }

    window.addEventListener('pixflow-design:bridge-status', onBridgeStatus);
    return () => window.removeEventListener('pixflow-design:bridge-status', onBridgeStatus);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pixflow-design:bridge-onboarding-watch', {
      detail: { active: !bridgeConnected },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('pixflow-design:bridge-onboarding-watch', {
        detail: { active: false },
      }));
    };
  }, [bridgeConnected]);

  return (
    <div className="onboarding-view__setup-panel">
      <a className={onboardingStyles.articleLink} href="https://pixflow.dev/blog/what-is-pixflow-design-bridge" target="_blank" rel="noopener noreferrer">
        {t("ui.finalOnboarding.105e56e56f")}
      </a>
      {bridgeChecking ? (
        <p className={onboardingStyles.connectionGate} role="status">{t('ui.finalAnnotation.bridgeChecking')}</p>
      ) : bridgeConnected ? (
        <p className={onboardingStyles.connectionGate} role="status">{t('ui.finalAnnotation.bridgeConnected')}</p>
      ) : (
        <section className={onboardingStyles.bridgeSetup} aria-labelledby="pixflow-bridge-setup-title">
          <div>
            <strong id="pixflow-bridge-setup-title">{translateUi("ui.entryShell.connectPixflowDesignBridge")}</strong>
            <p>
              {translateUi("ui.entryShell.theBridgeIsASmallAppThat")} </p>
          </div>
          <ol className={onboardingStyles.bridgeSteps}>
            <li>{translateUi("ui.entryShell.downloadAndInstallPixflowDesignBridge")}</li>
            <li>{translateUi("ui.entryShell.openTheBridgeAndKeepItRunning")}</li>
            <li>{translateUi("ui.entryShell.allowBrowserAccessWhenPromptedInFirefox")}</li>
            <li>{translateUi("ui.entryShell.installAndSignInToYourPreferred")}</li>
          </ol>
          <div className={onboardingStyles.bridgeActions}>
            <Button onClick={() => setBridgeRetry((value) => value + 1)}>{t('ui.direct-site.retryConnection')}</Button>
            <Button
              variant="primary"
              className={onboardingStyles.bridgeDownload}
              onClick={() => onDownloadBridge(bridgeInstallerUrl)}
            >
              {translateUi("ui.entryShell.downloadPixflowDesignBridge")} </Button>
            {bridgeDownloadStarted ? (
              <span role="status">{translateUi("ui.entryShell.openTheInstalledBridgeWeLlLook")}</span>
            ) : null}
          </div>
          {bridgeError ? <p className={onboardingStyles.resourceError} role="alert">{bridgeError}</p> : null}
          {typeof navigator !== 'undefined' && /mac|darwin/i.test(`${navigator.platform} ${navigator.userAgent}`) ? (
            <p>
              <TranslatedText id="ui.entryShell.theMacDmgIsForAppleSilicon" values={{ account: <a href="https://pixflow.dev/account" target="_blank" rel="noopener noreferrer">{translateUi('ui.entryShell.yourAccount')}</a> }} /> </p>
          ) : null}
        </section>
      )}
      <p className={onboardingStyles.help}>{translateUi("ui.entryShell.useChromeEdgeOrFirefoxForThe")} <a href="https://docs.pixflow.dev/plugin/bridge/browser-access/" target="_blank" rel="noopener noreferrer">{translateUi("ui.entryShell.accidentallyBlockedAccess")}</a> · <a href="https://docs.pixflow.dev/plugin/bridge/agents-and-providers/" target="_blank" rel="noopener noreferrer">{translateUi("ui.entryShell.installOrSignInToAnAgent")}</a></p>
      <div className="onboarding-view__setup-head">
        <div>
          <strong>{translateUi("ui.entryShell.findAndSelectYourLocalCli")}</strong>
          <p>{daemonLive ? t('settings.codeAgentHint') : t('settings.modeDaemonOffline')}</p>
        </div>
        <div className="onboarding-view__setup-head-actions">
          <button
            type="button"
            className={`onboarding-view__mini-button${scanning ? ' is-loading' : ''}`}
            onClick={onRefresh}
            disabled={scanning}
          >
            <IconRefresh size={14} stroke={1.75} aria-hidden="true" className={scanning ? "icon-spin" : undefined} />
            {scanning ? t('settings.rescanRunning') : t('settings.rescan').replace(/^↻\s*/, '')}
          </button>
          <button
            type="button"
            className={`onboarding-view__mini-button${running ? ' is-loading' : ''}`}
            onClick={onTest}
            disabled={running || !canTest}
            title={t('settings.testTitle')}
          >
            {running ? translateUi("ui.entryShell.testing") : translateUi("ui.entryShell.testConnection")}
          </button>
        </div>
      </div>
      {scanning ? (
        <div className="onboarding-view__scan-copy" role="status">
          <p className="onboarding-view__scan-status">
            <IconLoader2 size={13} stroke={1.75} className="icon-spin" aria-hidden="true" />
            <span>{t('settings.rescanRunning')}</span>
          </p>
          <p className="onboarding-view__scan-hint">
            {t('settings.onboardingCliScanHint')}
          </p>
        </div>
      ) : null}
      {agents.length > 0 ? (
        <div className="onboarding-view__agent-strip">
          {agents.map((agent, index) => (
            <button
              key={agent.id}
              type="button"
              className={`onboarding-view__agent-chip${
                selectedAgentId === agent.id ? ' is-selected' : ''
              }`}
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => onSelectAgent(agent.id)}
              aria-pressed={selectedAgentId === agent.id}
            >
              <AgentIcon id={agent.id} size={22} />
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.version ?? t('common.installed')}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {showEmpty ? (
        <div className="onboarding-view__empty-slice">
          {t('settings.noAgentsDetected')}
        </div>
      ) : null}
      {selectedAgent && modelOptions.length > 0 ? (
        <OnboardingDropdown
          label={`${t('settings.modelPicker')} · ${selectedAgent.name}`}
          placeholder={t('settings.modelSourceFallback')}
          value={selectedModel}
          options={modelOptions}
          onChange={onSelectModel}
          searchable
          searchPlaceholder={t('newproj.modelSearch')}
        />
      ) : null}
      {testState.status === 'running' ? (
        <p className="onboarding-view__test-status is-running" role="status">
          {t('settings.testRunning')}
        </p>
      ) : testState.status === 'done' ? (
        <div
          className={`onboarding-view__test-status is-${onboardingTestVariant(testState.result)}`}
          role={testState.result.ok ? 'status' : 'alert'}
        >
          {renderOnboardingAgentTestMessage(t, testState.result, selectedAgent?.name ?? '')}
          {testState.result.ok && testState.result.detail ? (
            <OnboardingTestDetails detail={testState.result.detail} />
          ) : null}
        </div>
      ) : null}
      <p
        className={`${onboardingStyles.connectionGate}${cliSelected ? ` ${onboardingStyles.connected}` : ''}`}
        role="status"
      >
        {cliSelected
          ? translateUi("ui.entryShell.localCliSelectedYouCanContinue")
          : translateUi("ui.entryShell.selectADetectedLocalCliToContinue")}
      </p>
    </div>
  );
}

function OnboardingAmrModelSelect({
  models,
  modelsSource,
  selectedModel,
  onSelectModel,
}: {
  models: NonNullable<AgentInfo['models']>;
  modelsSource: AgentInfo['modelsSource'];
  selectedModel: string;
  onSelectModel: (model: string) => void;
}) {
  const t = useT();
  const modelSource = modelsSource ?? 'fallback';
  const displayModels = models.map((model) => ({
    value: model.id,
    label: formatOnboardingAmrModelLabel(model),
  }));
  const modelSourceLabel = t('settings.onboardingAmrModelSourceLabel');
  return (
    <div
      className="onboarding-view__model-picker"
      onClick={(event) => event.stopPropagation()}
    >
      <OnboardingDropdown
        label={`${t('settings.modelPicker')} · ${modelSourceLabel}`}
        placeholder={t('settings.modelSourceFallback')}
        value={selectedModel}
        options={displayModels}
        onChange={onSelectModel}
        searchable
        searchPlaceholder={t('newproj.modelSearch')}
        sourceTone={modelSource}
      />
    </div>
  );
}

function formatOnboardingAmrModelLabel(
  model: NonNullable<AgentInfo['models']>[number],
): string {
  const label = model.label?.trim();
  if (label && label !== model.id && !/^[a-z0-9._-]+$/.test(label)) {
    return label;
  }
  return model.id
    .split('-')
    .filter(Boolean)
    .map(formatModelToken)
    .join(' ');
}

function formatModelToken(token: string): string {
  const lower = token.toLowerCase();
  const known: Record<string, string> = {
    claude: 'Claude',
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    glm: 'GLM',
    gpt: 'GPT',
    oss: 'OSS',
    kimi: 'Kimi',
    minimax: 'MiniMax',
    mimo: 'MiMo',
    qwen3: 'Qwen3',
    seed: 'Seed',
  };
  if (known[lower]) return known[lower];
  if (/^v\d/i.test(token)) return token.toUpperCase();
  if (/^\d+b$/i.test(token) || /^a\d+b$/i.test(token)) return token.toUpperCase();
  if (/^\d+(\.\d+)*$/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function OnboardingByokSetupPanel({
  apiProtocol,
  apiKey,
  baseUrl,
  model,
  selectedProvider,
  providerOptions,
  apiKeyVisible,
  onToggleApiKey,
  onProtocolChange,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  onBaseUrlChange,
  modelOptions,
  testState,
  canTest,
  onTest,
  modelsState,
  canFetchModels,
  onFetchModels,
}: {
  apiProtocol: ApiProtocol;
  apiKey: string;
  baseUrl: string;
  model: string;
  selectedProvider: KnownProvider | null;
  providerOptions: Array<{ value: string; label: string }>;
  modelOptions: Array<{ value: string; label: string }>;
  apiKeyVisible: boolean;
  onToggleApiKey: () => void;
  onProtocolChange: (protocol: ApiProtocol) => void;
  onProviderChange: (baseUrl: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onModelChange: (model: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  testState:
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse };
  canTest: boolean;
  onTest: () => void;
  modelsState:
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ProviderModelsResponse };
  canFetchModels: boolean;
  onFetchModels: () => void;
}) {
  const t = useT();
  const running = testState.status === 'running';
  const fetchingModels = modelsState.status === 'running';
  return (
    <div className="onboarding-view__setup-panel">
      <aside className={onboardingStyles.byokNotice} role="note">
        <IconInfoCircle size={16} stroke={1.75} aria-hidden="true" />
        <div>
          <strong>{t("ui.finalOnboarding.5df057fcd7")}</strong>
          <p>{t("ui.finalOnboarding.44e30ed15f")}</p>
        </div>
      </aside>
      <div className="onboarding-view__setup-head">
        <div>
          <strong>{t('settings.modeApiMeta')}</strong>
          <p>{t('settings.modeApi')}</p>
        </div>
        <div className="onboarding-view__setup-head-actions">
          <button
            type="button"
            className={`onboarding-view__mini-button${fetchingModels ? ' is-loading' : ''}`}
            onClick={onFetchModels}
            disabled={fetchingModels || !canFetchModels}
            title={t('settings.fetchModelsTitle')}
          >
            {fetchingModels ? t('settings.fetchModelsRunning') : t('settings.fetchModels')}
          </button>
          <button
            type="button"
            className={`onboarding-view__mini-button${running ? ' is-loading' : ''}`}
            onClick={onTest}
            disabled={running || !canTest}
            title={t('settings.testTitle')}
          >
            {running ? t('settings.testRunning') : t('settings.test')}
          </button>
        </div>
      </div>
      <div
        className="onboarding-view__protocol-strip"
        role="tablist"
        aria-label={t('settings.protocolAria')}
      >
        {API_PROTOCOL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={apiProtocol === tab.id}
            className={apiProtocol === tab.id ? 'is-selected' : ''}
            onClick={() => onProtocolChange(tab.id)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <OnboardingDropdown
        label={t('settings.quickFillProvider')}
        placeholder={t('settings.customProvider')}
        value={selectedProvider?.baseUrl ?? ''}
        options={providerOptions}
        onChange={onProviderChange}
        searchable
        searchPlaceholder={t('settings.quickFillProvider')}
      />
      <label className="onboarding-view__inline-field">
        <span>{t('settings.apiKey')}</span>
        <span className="onboarding-view__field-row">
          <input
            type={apiKeyVisible ? 'text' : 'password'}
            placeholder={API_KEY_PLACEHOLDERS[apiProtocol]}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <button type="button" onClick={onToggleApiKey}>
            {apiKeyVisible ? t('settings.hide') : t('settings.show')}
          </button>
        </span>
      </label>
      <div className="onboarding-view__compact-fields">
        <label className="onboarding-view__inline-field">
          <span>{t('settings.baseUrl')}</span>
          <input
            type="url"
            inputMode="url"
            value={baseUrl}
            placeholder={selectedProvider?.baseUrl ?? 'https://api.anthropic.com'}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
        </label>
        {modelOptions.length > 0 ? (
          <OnboardingDropdown
            label={t('settings.model')}
            placeholder={selectedProvider?.model ?? 'claude-sonnet-4-5'}
            value={model}
            options={modelOptions}
            onChange={onModelChange}
            placement="top"
            searchable
            searchPlaceholder={t('newproj.modelSearch')}
          />
        ) : (
          <label className="onboarding-view__inline-field">
            <span>{t('settings.model')}</span>
            <input
              type="text"
              value={model}
              placeholder={selectedProvider?.model ?? 'claude-sonnet-4-5'}
              onChange={(event) => onModelChange(event.target.value.trim())}
            />
          </label>
        )}
      </div>
      {modelsState.status === 'running' ? (
        <p className="onboarding-view__test-status is-running" role="status">
          {t('settings.fetchModelsRunning')}
        </p>
      ) : modelsState.status === 'done' ? (
        <p
          className={`onboarding-view__test-status is-${onboardingProviderModelsVariant(
            modelsState.result,
          )}`}
          role={modelsState.result.ok ? 'status' : 'alert'}
        >
          {renderOnboardingProviderModelsMessage(t, modelsState.result)}
        </p>
      ) : null}
      {testState.status === 'running' ? (
        <p className="onboarding-view__test-status is-running" role="status">
          {t('settings.testRunning')}
        </p>
      ) : testState.status === 'done' ? (
        <div
          className={`onboarding-view__test-status is-${onboardingTestVariant(
            testState.result,
          )}`}
          role={testState.result.ok ? 'status' : 'alert'}
        >
          {renderOnboardingProviderTestMessage(t, testState.result, model)}
          {testState.result.ok && testState.result.detail ? (
            <OnboardingTestDetails detail={testState.result.detail} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OnboardingTestDetails({ detail }: { detail: string }) {
  const t = useT();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={onboardingStyles.testDetails}>
      <Button variant="ghost" className={onboardingStyles.detailsToggle}
        aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {t('ui.direct-site.technicalDetails')}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </Button>
      <div id={id} className={onboardingStyles.detailsBody} data-expanded={expanded} aria-hidden={!expanded}>
        <div><p>{detail}</p></div>
      </div>
    </div>
  );
}

function onboardingTestVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

function onboardingProviderModelsVariant(
  result: ProviderModelsResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited' || result.kind === 'no_models') return 'warn';
  return 'error';
}

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function mergeOnboardingProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
  currentModel: string,
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  if (currentModel.trim()) add({ id: currentModel.trim(), label: currentModel.trim() });
  return out;
}

function onboardingProviderModelLabel(model: ProviderModelOption): string {
  return model.label && model.label !== model.id
    ? `${model.label} (${model.id})`
    : model.id;
}

function renderOnboardingProviderTestMessage(
  t: ReturnType<typeof useT>,
  result: ConnectionTestResponse,
  fallbackModel: string,
): string {
  const ms = Math.max(0, Math.round(result.latencyMs));
  const sample = result.sample ?? '';
  const testedModel = result.model ?? fallbackModel;
  if (result.ok) {
    const baseMessage = t('settings.testSuccessApi', { ms, sample });
    return baseMessage;
  }
  switch (result.kind) {
    case 'auth_failed':
      return t('settings.testAuthFailed');
    case 'forbidden':
      return result.detail || t('settings.testForbidden');
    case 'not_found_model':
      return t('settings.testNotFoundModel', { model: testedModel });
    case 'invalid_model_id':
      return t('settings.testInvalidModelId', { model: testedModel });
    case 'invalid_base_url':
      return t('settings.testInvalidBaseUrl');
    case 'rate_limited':
      return t('settings.testRateLimited');
    case 'upstream_unavailable':
      return t('settings.testUpstream', { status: result.status ?? 0 });
    case 'timeout':
      return t('settings.testTimeout', { ms });
    default:
      return t('settings.testUnknown', { detail: result.detail ?? '' });
  }
}

function renderOnboardingAgentTestMessage(
  t: ReturnType<typeof useT>,
  result: ConnectionTestResponse,
  fallbackAgentName: string,
): string {
  const ms = Math.max(0, Math.round(result.latencyMs));
  const agentName = result.agentName ?? fallbackAgentName;
  if (result.ok) {
    const message = t('settings.testSuccessCli', {
      agentName,
      ms,
      sample: result.sample ?? '',
    });
    return message;
  }
  switch (result.kind) {
    case 'agent_not_installed':
      return t('settings.testAgentMissing', { agentName });
    case 'agent_spawn_failed':
      return t('settings.testAgentSpawn', { agentName, detail: result.detail ?? '' });
    case 'rate_limited':
      return t('settings.testRateLimited');
    case 'timeout':
      return t('settings.testTimeout', { ms });
    default:
      return t('settings.testUnknown', { detail: result.detail ?? '' });
  }
}

function renderOnboardingProviderModelsMessage(
  t: ReturnType<typeof useT>,
  result: ProviderModelsResponse,
): string {
  if (result.ok) {
    return t('settings.fetchModelsSuccess', {
      count: result.models?.length ?? 0,
    });
  }
  switch (result.kind) {
    case 'auth_failed':
      return t('settings.testAuthFailed');
    case 'forbidden':
      return result.detail || t('settings.testForbidden');
    case 'invalid_base_url':
      return t('settings.testInvalidBaseUrl');
    case 'rate_limited':
      return t('settings.testRateLimited');
    case 'upstream_unavailable':
      return t('settings.testUpstream', { status: result.status ?? 0 });
    case 'timeout':
      return t('settings.testTimeout', {
        ms: Math.max(0, Math.round(result.latencyMs)),
      });
    case 'no_models':
      return t('settings.fetchModelsEmpty');
    case 'unsupported_protocol':
      return t('settings.fetchModelsUnsupported');
    default:
      return t('settings.fetchModelsFailed', { detail: result.detail ?? '' });
  }
}

function OnboardingPanelHeader({ title, body }: { title: string; body: string }) {
  return (
    <div className="onboarding-view__panel-head">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

type OnboardingDropdownBaseProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; enabled?: boolean; meta?: string }>;
  placement?: 'bottom' | 'top';
  searchable?: boolean;
  searchPlaceholder?: string;
  sourceTone?: string;
};

type OnboardingDropdownProps =
  | (OnboardingDropdownBaseProps & {
      value: string;
      onChange: (value: string) => void;
      multiple?: false;
    })
  | (OnboardingDropdownBaseProps & {
      value: string[];
      onChange: (value: string[]) => void;
      multiple: true;
    });

export function OnboardingDropdown(props: OnboardingDropdownProps) {
  const t = useT();
  const {
    label,
    placeholder,
    value,
    options,
    placement = 'bottom',
    multiple = false,
    searchable = false,
    searchPlaceholder,
    sourceTone,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);
  const [menuMaxHeight, setMenuMaxHeight] = useState(240);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownIdRef = useRef(`onboarding-dropdown-${Math.random().toString(36).slice(2)}`);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const selectedOption = selectedOptions[0];
  const hasValue = selectedOptions.length > 0;
  const selectedLabel = multiple
    ? selectedOptions.map((option) => option.label).join(', ')
    : selectedOption?.label;
  const triggerLabel = selectedLabel || placeholder;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions =
    searchable && normalizedQuery
      ? options.filter((option) =>
          `${option.label} ${option.value} ${option.meta ?? ''}`.toLowerCase().includes(normalizedQuery),
        )
      : options;
  const emptyMessage = searchable ? t('homeHero.footer.noMatches') : t('settings.fetchModelsEmpty');

  useLayoutEffect(() => {
    if (!open) return;

    function measureMenu() {
      const root = rootRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const nextPlacement =
        placement === 'top' || (spaceBelow < 260 && spaceAbove > spaceBelow)
          ? 'top'
          : 'bottom';
      const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
      setResolvedPlacement(nextPlacement);
      setMenuMaxHeight(Math.max(48, Math.min(240, availableSpace - 16)));
    }

    measureMenu();
    window.addEventListener('resize', measureMenu);
    window.addEventListener('scroll', measureMenu, true);
    return () => {
      window.removeEventListener('resize', measureMenu);
      window.removeEventListener('scroll', measureMenu, true);
    };
  }, [open, placement, options.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    function handlePeerOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== dropdownIdRef.current) {
        setOpen(false);
      }
    }

    window.addEventListener(ONBOARDING_DROPDOWN_OPEN_EVENT, handlePeerOpen);
    return () => {
      window.removeEventListener(ONBOARDING_DROPDOWN_OPEN_EVENT, handlePeerOpen);
    };
  }, []);

  function toggleOpen() {
    setOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        window.dispatchEvent(
          new CustomEvent(ONBOARDING_DROPDOWN_OPEN_EVENT, {
            detail: dropdownIdRef.current,
          }),
        );
      }
      return nextOpen;
    });
  }

  return (
    <div
      className="onboarding-view__select-field"
      data-placement={resolvedPlacement}
      data-open={open || undefined}
      ref={rootRef}
    >
      <span
        className="onboarding-view__select-label"
        data-source-tone={sourceTone || undefined}
      >
        {label}
      </span>
      <button
        type="button"
        className={`onboarding-view__select-trigger${open ? ' is-open' : ''}${
          hasValue ? ' has-value' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={triggerLabel}
        onClick={toggleOpen}
      >
        <span>{triggerLabel}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      {open ? (
        <div
          className="onboarding-view__select-menu"
          data-searchable={searchable || undefined}
          style={{ '--onboarding-select-menu-max-height': `${menuMaxHeight}px` } as CSSProperties}
        >
          {searchable ? (
            <label
              className="onboarding-view__select-search"
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="search" size={14} />
              <input
                type="search"
                value={query}
                placeholder={searchPlaceholder || placeholder}
                aria-label={searchPlaceholder || label}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    event.stopPropagation();
                  }
                }}
              />
            </label>
          ) : null}
          <div
            className="onboarding-view__select-options"
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple || undefined}
          >
            {visibleOptions.map((option) => {
              const selected = selectedValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`onboarding-view__select-option${selected ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.enabled === false || undefined}
                  disabled={option.enabled === false}
                  onClick={() => {
                    if (props.multiple) {
                      props.onChange(
                        selected
                          ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                          : [...selectedValues, option.value],
                      );
                      return;
                    }
                    (props as OnboardingDropdownBaseProps & {
                      value: string;
                      onChange: (value: string) => void;
                      multiple?: false;
                    }).onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>
                    {option.label}
                    {option.meta ? <small className="onboarding-view__select-option-meta">{option.meta}</small> : null}
                  </span>
                  {selected ? <Icon name="check" size={15} /> : null}
                </button>
              );
            })}
            {visibleOptions.length === 0 ? (
              <div className="onboarding-view__select-empty">{emptyMessage}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OnboardingChoiceCard({
  icon,
  agentIconId,
  title,
  body,
  benefits,
  upcomingLabel,
  upcomingBenefits,
  benefitPlacement = 'copy',
  metaLabel,
  modelSlot,
  actionLabel,
  selected,
  badge,
  statusSlot,
  featured,
  variant,
  onClick,
}: {
  icon: 'orbit' | 'hammer' | 'sliders' | 'github' | 'upload' | 'sparkles';
  agentIconId?: string;
  title: string;
  body: string;
  benefits?: string[];
  upcomingLabel?: string;
  upcomingBenefits?: string[];
  benefitPlacement?: 'copy' | 'aside';
  metaLabel?: string;
  modelSlot?: ReactNode;
  actionLabel?: string;
  selected: boolean;
  badge?: string;
  statusSlot?: ReactNode;
  featured?: boolean;
  variant?: 'amr';
  onClick: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onClick();
  }

  const hasBenefits =
    (benefits && benefits.length > 0) ||
    (upcomingBenefits && upcomingBenefits.length > 0);
  const benefitStack = hasBenefits ? (
    <span className="onboarding-view__benefit-stack">
      {benefits && benefits.length > 0 ? (
        <span className="onboarding-view__benefits">
          {benefits.map((item, index) => (
            <span
              key={item}
              className={`onboarding-view__benefit${
                index >= 2 ? ' onboarding-view__benefit--hero' : ''
              }`}
            >
              {item}
            </span>
          ))}
        </span>
      ) : null}
      {upcomingBenefits && upcomingBenefits.length > 0 ? (
        <span className="onboarding-view__upcoming-benefits">
          {upcomingLabel ? (
            <span className="onboarding-view__upcoming-label">{upcomingLabel}</span>
          ) : null}
          {upcomingBenefits.map((item) => (
            <span key={item} className="onboarding-view__benefit onboarding-view__benefit--upcoming">
              {item}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  ) : null;
  const modelUnderLogo = variant === 'amr' && modelSlot;
  const iconNode = (
    <span
      className={
        'onboarding-view__icon' +
        (agentIconId ? ' onboarding-view__icon--asset' : '')
      }
    >
      {agentIconId ? (
        <AgentIcon
          id={agentIconId}
          size={featured ? 52 : 40}
          className="onboarding-view__agent-logo"
        />
      ) : (
        <Icon name={icon} size={18} />
      )}
    </span>
  );
  const copyNode = (
    <span className="onboarding-view__card-copy">
      <span className="onboarding-view__card-top">
        <strong>{title}</strong>
        {badge ? <span className="onboarding-view__badge">{badge}</span> : null}
      </span>
      {metaLabel ? <span className="onboarding-view__card-meta">{metaLabel}</span> : null}
      {modelUnderLogo ? null : modelSlot}
      {benefitPlacement === 'copy' && benefitStack ? (
        benefitStack
      ) : !modelSlot ? (
        <small>{body}</small>
      ) : null}
    </span>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`onboarding-view__card${selected ? ' is-selected' : ''}${
        featured ? ' onboarding-view__card--featured' : ''
      }${variant ? ` onboarding-view__card--${variant}` : ''}${
        benefitPlacement === 'aside' ? ' onboarding-view__card--benefit-aside' : ''
      }`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
    >
      {variant === 'amr' ? (
        <span className="onboarding-view__identity">
          {iconNode}
          {copyNode}
        </span>
      ) : (
        <>
          {iconNode}
          {copyNode}
        </>
      )}
      {modelUnderLogo ? (
        <span className="onboarding-view__card-model">
          {modelSlot}
        </span>
      ) : null}
      {benefitPlacement === 'aside' && benefitStack ? (
        <span className="onboarding-view__benefit-aside">{benefitStack}</span>
      ) : null}
      {statusSlot ? (
        <span className="onboarding-view__card-status">
          {statusSlot}
        </span>
      ) : null}
      {actionLabel ? <span className="onboarding-view__card-action">{actionLabel}</span> : null}
      {selected ? (
        <span className="onboarding-view__check">
          <Icon name="check" size={14} />
        </span>
      ) : null}
    </div>
  );
}
