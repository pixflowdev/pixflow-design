import type { AppConfig } from '../types';
import { sanitizeApiProtocolConfigsForPrefs } from '../state/config';

export function buildPixflowWordPressAppConfigPrefs(config: AppConfig, changed?: Partial<AppConfig>): Record<string, unknown> {
  const prefs: Record<string, unknown> = {
    theme: config.theme ?? 'dark',
    accentColor: config.accentColor,
    mode: config.mode,
    apiTransport: config.apiTransport,
    composioProvider: config.composioProvider,
    composioModel: config.composioModel,
    apiProtocol: config.apiProtocol,
    apiVersion: config.apiVersion,
    baseUrl: config.baseUrl,
    model: config.model,
    apiProviderBaseUrl: config.apiProviderBaseUrl,
    apiProtocolConfigs: sanitizeApiProtocolConfigsForPrefs(config.apiProtocolConfigs),
    byokImageModel: config.byokImageModel,
    byokVideoModel: config.byokVideoModel,
    byokSpeechModel: config.byokSpeechModel,
    byokSpeechVoice: config.byokSpeechVoice,
    maxTokens: config.maxTokens,
    allowVisualReviewerFallback: config.allowVisualReviewerFallback,
    codexImagegenOverride: config.codexImagegenOverride,
    disableBricksEmptyDivMinimumSize: config.disableBricksEmptyDivMinimumSize,
    bricksAbilitiesEnabled: config.bricksAbilitiesEnabled,
    bricksExtensions: config.bricksExtensions,
    // Keep a site-level legacy completion marker as a fallback while the
    // per-user onboarding profile is being written. Existing installs can
    // migrate this marker into the authoritative user profile on the next
    // load if the profile request is interrupted during a refresh.
    onboardingCompleted: config.onboardingCompleted === true,
    customInstructions: config.customInstructions ?? null,
    disabledSkills: config.disabledSkills,
    disabledDesignSystems: config.disabledDesignSystems,
    agentId: config.agentId,
    agentModels: config.agentModels,
    bricksUseSiteStyles: config.bricksUseSiteStyles,
    enhancedDesignGuidance: config.enhancedDesignGuidance,
    skillId: config.skillId,
    designSystemId: config.designSystemId,
  };
  // A composer selection owns only its changed fields, never the rest of a
  // potentially stale mounted panel's settings snapshot.
  return changed === undefined ? prefs : Object.fromEntries(
    Object.entries(prefs).filter(([key]) => Object.prototype.hasOwnProperty.call(changed, key)),
  );
}
