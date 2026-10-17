import type { AppConfig } from '../types';
import { isPixflowWordPressEmbed, requestWordPressRest } from './license';

export type PixflowOnboardingProfile = {
  completed: boolean;
  completedAt?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  runtimeMode?: string | null;
  step?: number;
  /**
   * Legacy profile fields. Provider/CLI settings now live in app-config /
   * provider settings so the workspace, settings modal, and Bricks floating
   * panel share one live source of truth.
   */
  agentId?: string | null;
  skillId?: string | null;
  designSystemId?: string | null;
  theme?: string | null;
  accentColor?: string | null;
  agentModels?: AppConfig['agentModels'];
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
};

type PixflowOnboardingProfileResponse = {
  ok?: boolean;
  profile?: PixflowOnboardingProfile;
  userId?: number;
  message?: string;
};

const ONBOARDING_PROFILE_CACHE_MS = 60_000;
let onboardingProfileCache: { checkedAt: number; value: PixflowOnboardingProfile | null } | null = null;
let onboardingProfileRequest: Promise<PixflowOnboardingProfile | null> | null = null;

function notifyParentBuilderOnboardingProfile(profile: PixflowOnboardingProfile): void {
  if (typeof window === 'undefined') return;
  const message = {
    source: 'pixflow-design',
    type: 'pixflow-design:onboarding-completed',
    completed: profile.completed === true,
    route: profile.runtimeMode,
  };
  // Settings can be mounted inside the WordPress app frame, which itself can
  // sit inside a Bricks workspace shell. Notify both ancestors so the
  // top-level toolbar changes immediately after completing *or resetting*
  // onboarding. Set deduplication keeps the ordinary one-frame case quiet.
  // The WordPress app can be mounted directly in the Bricks document as well
  // as inside one or two nested frames. Include the current window so a
  // same-document Settings reset reaches the builder listener too.
  const targets = new Set<WindowProxy>([window]);
  if (window.parent !== window) targets.add(window.parent);
  if (window.top && window.top !== window) targets.add(window.top);
  targets.forEach((target) => target.postMessage(message, '*'));
}

export function buildPixflowOnboardingProfile(
  config: AppConfig,
  source = 'web-app',
): PixflowOnboardingProfile {
  return {
    completed: config.onboardingCompleted === true,
    source,
    runtimeMode: config.mode === 'api' ? 'byok' : 'local-cli',
    skillId: config.skillId ?? null,
    designSystemId: config.designSystemId ?? null,
    theme: config.theme ?? null,
    accentColor: config.accentColor ?? null,
    agentModels: {},
    disabledSkills: config.disabledSkills ?? [],
    disabledDesignSystems: config.disabledDesignSystems ?? [],
  };
}

export function applyPixflowOnboardingProfile(
  config: AppConfig,
  profile: PixflowOnboardingProfile | null | undefined,
): AppConfig {
  if (!profile) {
    return config;
  }

  // Retire the old workspace-only route without discarding any saved preferences.
  if (profile.runtimeMode === 'none') {
    return { ...config, onboardingCompleted: false, onboardingRoute: undefined };
  }

  const next: AppConfig = {
    ...config,
    // The WordPress user profile is authoritative for first-run state. This
    // deliberately clears a stale same-origin browser preference after the
    // plugin's settings have been reset, while a failed profile request
    // (represented by null) still preserves the local preference.
    onboardingCompleted: profile.completed === true,
    onboardingRoute: profile.runtimeMode === 'byok' ? 'byok' : profile.runtimeMode === 'local-cli' ? 'local' : config.onboardingRoute,
  };

  // A resumed setup must use its saved route even if another surface last
  // selected a different execution provider. Completed sessions keep their
  // independent provider selection.
  if (!next.onboardingCompleted) {
    if (next.onboardingRoute === 'local') next.mode = 'daemon';
    if (next.onboardingRoute === 'byok') next.mode = 'api';
    return next;
  }

  if (profile.skillId !== undefined) next.skillId = profile.skillId;
  if (profile.designSystemId !== undefined) next.designSystemId = profile.designSystemId;
  if (profile.theme) next.theme = profile.theme as AppConfig['theme'];
  if (profile.accentColor) next.accentColor = profile.accentColor;
  if (Array.isArray(profile.disabledSkills)) {
    next.disabledSkills = profile.disabledSkills;
  }
  if (Array.isArray(profile.disabledDesignSystems)) {
    next.disabledDesignSystems = profile.disabledDesignSystems;
  }

  return next;
}

export async function fetchPixflowOnboardingProfile(): Promise<PixflowOnboardingProfile | null> {
  if (!isPixflowWordPressEmbed()) return null;
  if (onboardingProfileCache && Date.now() - onboardingProfileCache.checkedAt < ONBOARDING_PROFILE_CACHE_MS) {
    return onboardingProfileCache.value;
  }
  if (onboardingProfileRequest) {
    return onboardingProfileRequest;
  }

  onboardingProfileRequest = (async () => {
    try {
      const response = await requestWordPressRest<PixflowOnboardingProfileResponse>('onboarding/profile');
      if (!response.ok) return null;

      return response.body.profile ?? null;
    } catch {
      return null;
    }
  })()
    .then((profile) => {
      onboardingProfileCache = { checkedAt: Date.now(), value: profile };
      return profile;
    })
    .finally(() => {
      onboardingProfileRequest = null;
    });

  return onboardingProfileRequest;
}

export async function syncPixflowOnboardingProfile(config: AppConfig, source = 'web-app'): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;
  if (config.onboardingCompleted !== true) return;

  const profile = buildPixflowOnboardingProfile(config, source);
  // Pixflow-owned: bootstrap can run before the async design-system catalog
  // has auto-selected the default route. Do not let that early null overwrite
  // a later/user-chosen value in the WordPress user profile.
  if (source === 'bootstrap' && profile.designSystemId == null) {
    delete profile.designSystemId;
  }

  await requestWordPressRest<PixflowOnboardingProfileResponse>('onboarding/profile', {
    method: 'PUT',
    body: { profile },
  }).then((response) => {
    if (!response.ok) throw new Error(response.body.message ?? 'Could not save setup. Please try again.');
    const persistedProfile = response.body.profile ?? profile;
    onboardingProfileCache = {
      checkedAt: Date.now(),
      value: persistedProfile,
    };
    notifyParentBuilderOnboardingProfile(persistedProfile);
  }).catch((error) => {
    // Explicit completion must stay on the setup screen until saved. Later
    // background preference sync retains its best-effort behavior.
    if (source === 'onboarding-complete') throw error;
  });
}

/** Persist non-secret setup progress on the WP user, across both entry surfaces. */
export async function savePixflowOnboardingProgress(step: number, route: 'local' | 'byok' | 'none' | null): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;
  const response = await requestWordPressRest<PixflowOnboardingProfileResponse>('onboarding/profile', {
    method: 'PUT', body: { profile: { step, runtimeMode: route === 'local' ? 'local-cli' : route, source: 'setup-progress' } },
  });
  if (!response.ok) throw new Error(response.body.message ?? 'Could not save setup progress.');
  onboardingProfileCache = { checkedAt: Date.now(), value: response.body.profile ?? null };
}

export async function resetPixflowOnboardingProfile(): Promise<PixflowOnboardingProfile> {
  if (!isPixflowWordPressEmbed()) {
    throw new Error('Onboarding can only be reset from Pixflow Design in WordPress.');
  }

  const response = await requestWordPressRest<PixflowOnboardingProfileResponse>('onboarding/profile', {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(response.body.message ?? 'Could not reset onboarding.');
  }

  const profile = response.body.profile ?? { completed: false, source: 'settings-reset' };
  onboardingProfileCache = { checkedAt: Date.now(), value: profile };
  notifyParentBuilderOnboardingProfile(profile);
  return profile;
}
