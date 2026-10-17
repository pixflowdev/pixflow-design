import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../src/state/config';
import { applyPixflowOnboardingProfile } from '../../src/pixflow/onboarding-profile';

describe('Pixflow WordPress onboarding profile', () => {
  it('clears stale browser completion when WordPress reports a first-run user', () => {
    const config = { ...DEFAULT_CONFIG, onboardingCompleted: true };

    expect(applyPixflowOnboardingProfile(config, { completed: false }).onboardingCompleted).toBe(false);
  });

  it('preserves browser completion when the WordPress profile cannot be loaded', () => {
    const config = { ...DEFAULT_CONFIG, onboardingCompleted: true };

    expect(applyPixflowOnboardingProfile(config, null).onboardingCompleted).toBe(true);
  });

  it('hydrates completed WordPress profile choices', () => {
    const result = applyPixflowOnboardingProfile(DEFAULT_CONFIG, {
      completed: true,
      skillId: 'pixflow-design',
      designSystemId: 'pixflow-native-bricks',
    });

    expect(result.onboardingCompleted).toBe(true);
    expect(result.skillId).toBe('pixflow-design');
    expect(result.designSystemId).toBe('pixflow-native-bricks');
  });
});
