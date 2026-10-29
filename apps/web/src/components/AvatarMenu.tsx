import { agentReasoningOptions } from '../utils/agentReasoning';
import { LanguageUpdateDot } from './LanguageUpdateDot';
import { useBridgeConnectionRoute } from '../pixflow/bridge-connection-route';
import { composioAvailable } from '../pixflow/composio-contribution';
import { usePixflowFeatureRuntime } from '../pixflow/feature-runtime';
import { useT as usePixflowUiTranslation } from '../i18n';
import { apiExecutionAgentId } from '../utils/apiProtocol';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getProviderDiscoveryState, subscribeProviderDiscovery } from '../pixflow/provider-discovery-state';
import discoveryStyles from './ProviderDiscovery.module.css';
import styles from './AvatarMenu.module.css';
import { ComposioExecution } from './ComposioExecution';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { RemixIcon } from './RemixIcon';
import { SearchableModelSelect } from './modelOptions';
import type { AgentInfo, AgentModelChoice, AppConfig, ExecMode, ProviderModelOption } from '../types';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { isByokExecutionConfigured, KNOWN_PROVIDERS } from '../state/config';
import { mergeProviderModelOptions, providerModelsCacheKey } from './SettingsDialog';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { fetchProviderModels } from '../providers/provider-models';
import { isMacPlatform } from '../utils/platform';
import { amrConsoleUrlForProfile } from '../runtime/amr-guidance';
import { workspacePortalTarget, workspacePortalThemeStyle } from './workspacePortalTarget';
import { codexModelSupportsFastMode } from '../utils/codexFastMode';

interface Props {
  composerLabel?: boolean;
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: AgentModelChoice,
  ) => void;
  onApiModelChange?: (model: string) => void;
  onExecutionChange?: (patch: Partial<AppConfig>) => void;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onOpenSettings: (section?: 'execution') => void;
  onRefreshAgents: (options?: { useOptionalBridge?: boolean }) => void;
  onBack?: () => void;
  placement?: 'down' | 'up';
  popoverZIndex?: number;
  popoverClassName?: string;
  /** Fired when the dropdown transitions from closed to open. */
  onOpen?: () => void;
}

function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'AMR' : agent.name;
}

/**
 * Compact runtime control. Click opens a dropdown with current execution mode
 * and the agent picker (when in daemon mode).
 */
export function AvatarMenu({
  composerLabel = false,
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  onExecutionChange,
  providerModelsCache,
  onOpenSettings,
  onRefreshAgents,
  onBack,
  placement = 'down',
  popoverZIndex = 1000,
  popoverClassName,
  onOpen,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  usePixflowFeatureRuntime();
  const t = useT();
  const discovery = useSyncExternalStore(subscribeProviderDiscovery, getProviderDiscoveryState, getProviderDiscoveryState);
  const refreshing = config.mode === 'daemon' && discovery.phase === 'refreshing';
  const [open, setOpen] = useState(false);
  // Toggle that reports the closed→open transition (for analytics) without
  // firing on close.
  function toggleOpen() {
    setOpen((v) => {
      if (!v) onOpen?.();
      return !v;
    });
  }
  const [discoveredProviderModels, setDiscoveredProviderModels] = useState<Record<string, ProviderModelOption[]>>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const margin = 16;
      const gap = 8;
      const width = Math.min(344, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, margin),
        window.innerWidth - width - margin,
      );

      const above = Math.max(0, rect.top - margin - gap);
      const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap);
      const openAbove = placement === 'up' ? above >= 160 || above >= below : below < 160 && above > below;
      if (openAbove) {
        const available = above;
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: Math.max(margin, window.innerHeight - rect.top + gap),
          left,
          right: 'auto',
          width,
          maxHeight: Math.min(520, available),
          overflow: 'hidden',
          zIndex: popoverZIndex,
        });
        return;
      }

      const top = rect.bottom + gap;
      const available = below;
      setPopoverStyle({
        position: 'fixed',
        top,
        bottom: 'auto',
        left,
        right: 'auto',
        width,
        maxHeight: Math.min(520, available),
        overflow: 'hidden',
        zIndex: popoverZIndex,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, placement]);

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const installedAgents = agents.filter((a) => a.available);
  const connectionRoute = useBridgeConnectionRoute();
  const localCliAvailable = daemonLive && installedAgents.length > 0;
  const localCliActive = config.mode === 'daemon' && localCliAvailable;
  const localCliUnavailable = config.mode === 'daemon' && !localCliAvailable;
  const composioActive = config.mode === 'api' && config.apiTransport === 'composio';
  const byokConfigured = isByokExecutionConfigured({ ...config, apiTransport: 'direct' });
  const byokActive = config.mode === 'api' && !composioActive && byokConfigured;
  const portalTarget = open ? workspacePortalTarget(triggerRef.current) : null;
  const amrAvailable = installedAgents.some((a) => a.id === 'amr');
  const showAmrAccountShortcut =
    localCliActive && currentAgent?.id === 'amr' && amrAvailable;
  const amrProfile = config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE;
  const amrConsoleUrl = amrConsoleUrlForProfile(amrProfile);

  // Resolve the user's model + reasoning pick for the active agent. Falls
  // back to the agent's first declared option (`'default'`) when the user
  // hasn't touched the picker yet so the labels don't read as empty.
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
  const reasoningOptions = agentReasoningOptions(currentAgent, currentModelId);
  const currentReasoningId =
    (reasoningOptions.some(option => option.id === currentChoice.reasoning) ? currentChoice.reasoning : reasoningOptions[0]?.id) ?? null;
  const currentModelLabel = currentAgent?.models?.find(
    (m) => m.id === currentModelId,
  )?.label;
  const fastModeAvailable = codexModelSupportsFastMode(currentAgent, currentModelId);

  const apiProtocol = config.apiProtocol ?? 'openai';
  const byokProvider = KNOWN_PROVIDERS.find((provider) => provider.protocol === apiProtocol);
  const byokProviderModelsKey = providerModelsCacheKey(
    apiProtocol,
    config.baseUrl ?? '',
    config.apiKey ?? '',
    config.apiVersion ?? '',
  );
  const fetchedByokModels = providerModelsCache?.[byokProviderModelsKey] ?? discoveredProviderModels[byokProviderModelsKey] ?? [];

  useEffect(() => {
    if (!open || config.mode !== 'api' || config.apiTransport === 'composio') return;
    if (fetchedByokModels.length > 0) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    const baseUrl = config.baseUrl?.trim() ?? '';
    const apiKey = config.apiKey?.trim() ?? '';
    if (!baseUrl || !apiKey) return;
    let cancelled = false;
    void fetchProviderModels({
      protocol: apiProtocol,
      baseUrl,
      apiKey,
    }).then((result) => {
      if (cancelled || !result.ok || !result.models?.length) return;
      setDiscoveredProviderModels((current) => ({
        ...current,
        [byokProviderModelsKey]: result.models ?? [],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    config.mode,
    config.apiTransport,
    apiProtocol,
    config.baseUrl,
    config.apiKey,
    byokProviderModelsKey,
    fetchedByokModels.length,
  ]);

  const byokModelOptions = mergeProviderModelOptions(
    fetchedByokModels,
    SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol] ?? [],
  );

  return (
    <div className={`avatar-menu avatar-menu--${placement}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="avatar-agent-trigger"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={t('avatar.title')}
        title={t('avatar.title')}
        aria-label={t('avatar.title')}
        aria-busy={refreshing}
      >
        {composerLabel ? null : config.mode === 'daemon' && currentAgent ? (
          <AgentIcon id={currentAgent.id} size={20} />
        ) : (
          <AgentIcon id={apiExecutionAgentId(config)} size={20} />
        )}
        {composerLabel ? <span className="avatar-agent-trigger__model">{config.mode === 'daemon' ? currentModelLabel || currentModelId || currentAgent?.name || translateUi("ui.avatarMenu.selectProvider") : composioActive ? config.composioModel || 'Composio' : config.model || translateUi("settings.modeApi")}</span> : null}
        {refreshing ? <span className={discoveryStyles.spinner} aria-label={t('avatar.refreshing')}/> : <RemixIcon name="arrow-down-s-line" size={14} />}
      </button>
      {open && popoverStyle && portalTarget ? createPortal(
        <div
          ref={popoverRef}
          className={`avatar-popover ${styles.popover}${popoverClassName ? ` ${popoverClassName}` : ''}`}
          role="dialog"
          aria-label={t('avatar.title')}
          style={{ ...workspacePortalThemeStyle(triggerRef.current), ...popoverStyle }}
        >
          <div className="avatar-popover-head">
            <div className={styles.headingRow}>
            <span className="who">
              {config.mode === 'daemon'
                ? t('avatar.localCli')
                : composioActive ? 'Composio' : apiProtocolLabel(config.apiProtocol)}
            </span>
            {config.mode === 'daemon' && discovery.phase !== 'idle' && (
              <span className={styles.statusBadge} role="status" aria-live="polite"
                title={t(discovery.phase === 'sleeping' ? 'avatar.siteWakeHint' : discovery.phase === 'error' ? 'avatar.refreshRetry' : discovery.hasCached ? 'avatar.savedProviders' : 'avatar.findingProviders')}>
                {refreshing ? <span className={discoveryStyles.spinner} aria-hidden="true"/> : <RemixIcon name={discovery.phase === 'sleeping' ? 'moon-line' : discovery.phase === 'error' ? 'information-line' : 'check-line'} size={12}/>}
                <span>{t(refreshing ? 'avatar.refreshing' : discovery.phase === 'sleeping' ? 'avatar.siteSleeping' : discovery.phase === 'error' ? 'avatar.refreshFailed' : 'avatar.providersUpdated')}</span>
              </span>
            )}
            </div>
            <span className="where">
              {composioActive ? translateUi("ui.avatarMenu.connectedThroughWordpress") : config.mode === 'api'
                ? byokConfigured
                  ? safeHost(config.baseUrl)
                  : t('inlineSwitcher.missingApiKey')
                : localCliUnavailable
                  ? t('avatar.metaOffline')
                : currentAgent
                  ? `${displayAgentName(currentAgent)}${
                      currentAgent.id !== 'amr' && currentAgent.version
                        ? ` · ${currentAgent.version}`
                        : ''
                    }${
                      currentModelLabel && currentModelId !== 'default'
                        ? ` · ${currentModelLabel}`
                        : ''
                    }`
                  : t('avatar.noAgentSelected')}
            </span>
            {config.mode === 'daemon' && connectionRoute && <span className={styles.connectionRoute}>
              {t(connectionRoute === 'chrome-extension' ? 'bridge.connectedExtension' : 'bridge.connectedDirect')}
            </span>}
          </div>
          <div className={styles.scrollArea}>
            {config.mode === 'daemon' && discovery.phase === 'error' && discovery.error && (
              <p className={styles.connectionError} role="alert">{discovery.error}</p>
            )}

          {showAmrAccountShortcut ? (
            <a
              className="avatar-amr-account-link"
              href={amrConsoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <span className="avatar-amr-account-link__icon" aria-hidden>
                <RemixIcon name="wallet-3-line" size={15} />
              </span>
              <span className="avatar-amr-account-link__copy">
                <span>{t('avatar.amrConsole')}</span>
                <span>{t('avatar.amrConsoleMeta')}</span>
              </span>
              <RemixIcon name="external-link-line" size={13} />
            </a>
          ) : null}

          <button
            type="button"
            className={`avatar-item ${styles.modeRow}${localCliActive ? ' active' : ''}`}
            aria-current={localCliActive ? 'true' : undefined}
            onClick={() => {
              if (config.mode === 'daemon') {
                setOpen(false);
                if (!localCliAvailable) {
                  onOpenSettings('execution');
                }
                return;
              }
              if (!localCliAvailable) {
                setOpen(false);
                onOpenSettings('execution');
                return;
              }
              onModeChange('daemon');
            }}
            disabled={!localCliAvailable && config.mode !== 'daemon'}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="file-code-line" size={15} />
            </span>
            <span className={styles.modeCopy}><span>{t('avatar.useLocal')}</span>
              {!localCliAvailable && <span className={styles.modeHint}>{t('avatar.metaOffline')}</span>}
            </span>
            {localCliActive ? (
              <RemixIcon name="check-line" size={14} className="avatar-item-check" />
            ) : null}
          </button>
          <button
            type="button"
            className={`avatar-item ${styles.modeRow}${byokActive ? ' active' : ''}`}
            aria-current={byokActive ? 'true' : undefined}
            onClick={() => {
              if (!byokConfigured) {
                setOpen(false);
                onOpenSettings('execution');
                return;
              }
              if (onExecutionChange) onExecutionChange({ mode: 'api', apiTransport: 'direct' });
              else onModeChange('api');
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <AgentIcon id={apiExecutionAgentId({ ...config, apiTransport: "direct" })} size={18} />
            </span>
            <span className={styles.modeCopy}><span>{t('avatar.useApi')}</span>
              {!byokConfigured && <span className={styles.modeHint}>{t('inlineSwitcher.missingApiKey')}</span>}
            </span>
            {byokActive ? (
              <RemixIcon name="check-line" size={14} className="avatar-item-check" />
            ) : null}
          </button>

          {hasPixflowWordPressContext() && composioAvailable() && onExecutionChange && <button type="button" className={`avatar-item ${styles.modeRow}${composioActive ? ' active' : ''}`} aria-current={composioActive ? 'true' : undefined} onClick={() => onExecutionChange({ mode: 'api', apiTransport: 'composio' })}>
            <span className="avatar-item-icon" aria-hidden><AgentIcon id="composio" size={18}/></span>
            <span className={styles.modeCopy}><span>Composio</span></span>
            {composioActive && <RemixIcon name="check-line" size={15} className="avatar-item-check"/>}
          </button>}
          {config.mode === 'daemon' && localCliAvailable ? (
            <>
              <div className="avatar-section-label">{t('avatar.codeAgent')}</div>
              {installedAgents.map((a) => {
                const selected = config.agentId === a.id;
                return (
                  <button
                    type="button"
                    key={a.id}
                    className={`avatar-item${selected ? ' active' : ''}`}
                    data-testid={`avatar-agent-option-${a.id}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      onAgentChange(a.id);
                      // Keep the popover open so the user can immediately
                      // pick a model for the agent they just chose.
                    }}
                  >
                    <AgentIcon id={a.id} size={18} />
                    <span>{displayAgentName(a)}</span>
                    {selected ? (
                      <span className="avatar-item-meta">
                        {t('avatar.metaSelected')}
                      </span>
                    ) : a.id !== 'amr' && a.version ? (
                      <span className="avatar-item-meta">{a.version}</span>
                    ) : null}
                    {selected ? (
                      <RemixIcon name="check-line" size={14} className="avatar-item-check" />
                    ) : null}
                  </button>
                );
              })}
              {currentAgent &&
              currentAgent.available &&
              ((currentAgent.models && currentAgent.models.length > 0) ||
                (reasoningOptions &&
                  reasoningOptions.length > 0)) ? (
                <div className="avatar-model-section">
                  {currentAgent.models && currentAgent.models.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.modelLabel')}
                      </span>
                      <SearchableModelSelect
                        className="inline-switcher__select avatar-select"
                        value={currentModelId ?? ''}
                        onChange={(value) =>
                          onAgentModelChange(currentAgent.id, {
                            model: value,
                            ...(!codexModelSupportsFastMode(currentAgent, value)
                              ? { fastMode: false }
                              : {}),
                          })
                        }
                        models={currentAgent.models}
                        additionalOptions={
                          currentModelId &&
                          !currentAgent.models.some((m) => m.id === currentModelId)
                            ? [
                                {
                                  value: currentModelId,
                                  label: `${currentModelId} ${t('avatar.customSuffix')}` ,
                                },
                              ]
                            : undefined
                        }
                        searchPlaceholder={t('newproj.modelSearch')}
                        searchInputTestId="avatar-model-search"
                        popoverTestId="avatar-model-popover"
                        popoverClassName="avatar-model-select-popover"
                        minSearchableOptions={5}
                      />
                    </label>
                  ) : null}
                  {reasoningOptions &&
                  reasoningOptions.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.reasoningLabel')}
                      </span>
                      <SearchableModelSelect
                        className="inline-switcher__select avatar-select"
                        aria-label={t('avatar.reasoningLabel')}
                        value={currentReasoningId ?? ''}
                        onChange={(value) => onAgentModelChange(currentAgent.id, { reasoning: value })}
                        models={reasoningOptions}
                        searchPlaceholder={t('avatar.reasoningLabel')}
                        popoverTestId="avatar-reasoning-popover"
                        popoverClassName="avatar-model-select-popover"
                        minSearchableOptions={20}
                      />
                    </label>
                  ) : null}
                  {fastModeAvailable ? (
                    <label className="avatar-fast-mode-row">
                      <span className="avatar-fast-mode-copy">
                        <span className="avatar-select-label">{translateUi("ui.avatarMenu.fastMode")}</span>
                        <span className="avatar-fast-mode-hint">{translateUi("ui.avatarMenu.fasterWithIncreasedUsage")}</span>
                      </span>
                      <span className="toggle-switch toggle-switch-sm">
                        <input
                          type="checkbox"
                          aria-label={translateUi("ui.avatarMenu.fastMode")}
                          checked={currentChoice.fastMode === true}
                          onChange={(event) =>
                            onAgentModelChange(currentAgent.id, {
                              fastMode: event.target.checked,
                            })
                          }
                        />
                        <span className="toggle-slider" />
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {config.mode === 'daemon' ? (
            <button
              type="button"
              className="avatar-item"
              onClick={() => {
                onRefreshAgents({ useOptionalBridge: true });
              }}
              disabled={refreshing}
            >
              <span className="avatar-item-icon" aria-hidden>
                <RemixIcon name="refresh-line" size={15} />
              </span>
              <span>{t(refreshing ? 'avatar.refreshing' : 'avatar.rescan')}</span>
            </button>
          ) : null}


          {composioActive && onExecutionChange && <ComposioExecution compact config={config} onChange={onExecutionChange}/>}
          {config.mode === 'api' && !composioActive ? (
            <div className="avatar-model-section">
              <label className="avatar-select-row">
                <span className="avatar-select-label">
                  {t('avatar.modelLabel')}
                </span>
                <SearchableModelSelect
                  className="inline-switcher__select avatar-select"
                  value={config.model ?? ''}
                  onChange={(value) => onApiModelChange?.(value)}
                  models={byokModelOptions.map((m) => ({ id: m.id, label: m.label }))}
                  additionalOptions={
                    config.model && !byokModelOptions.some((m) => m.id === config.model)
                      ? [
                          {
                            value: config.model,
                            label: byokProvider?.models?.includes(config.model)
                              ? config.model
                              : `${config.model} ${t('avatar.customSuffix')}`,
                          },
                        ]
                      : undefined
                  }
                  searchPlaceholder={t('newproj.modelSearch')}
                  searchInputTestId="avatar-byok-model-search"
                  popoverTestId="avatar-byok-model-popover"
                  popoverClassName="avatar-model-select-popover"
                  minSearchableOptions={5}
                />
              </label>
            </div>
          ) : null}

          </div>
          <div className={styles.footer}>

          <button
            type="button"
            className="avatar-item avatar-item--execution-settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings('execution');
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="settings-3-line" size={15} />
            </span>
            <span>{t('inlineSwitcher.openFullSettings')}<LanguageUpdateDot /></span>
          </button>

          {onBack ? (
            <>
              <button
                type="button"
                className="avatar-item"
                onClick={() => {
                  setOpen(false);
                  onBack();
                }}
              >
                <span className="avatar-item-icon" aria-hidden>
                  <RemixIcon name="arrow-left-line" size={15} />
                </span>
                <span>{t('avatar.backToProjects')}</span>
              </button>
            </>
          ) : null}
          </div>
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
