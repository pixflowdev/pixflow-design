// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/state/config';

const rest = vi.hoisted(() => vi.fn());
vi.mock('../../src/pixflow/license', () => ({ isPixflowWordPressEmbed: () => true, requestWordPressRest: rest }));

beforeEach(() => { vi.resetModules(); rest.mockReset(); });
describe('onboarding persistence', () => {
  it('resumes the saved setup route over a stale execution mode', async () => {
    const api = await import('../../src/pixflow/onboarding-profile');
    expect(api.applyPixflowOnboardingProfile({ ...DEFAULT_CONFIG, mode: 'api' }, { completed: false, runtimeMode: 'local-cli', step: 2 })).toMatchObject({ mode: 'daemon', onboardingRoute: 'local' });
    expect(api.applyPixflowOnboardingProfile({ ...DEFAULT_CONFIG, mode: 'daemon' }, { completed: false, runtimeMode: 'byok', step: 2 })).toMatchObject({ mode: 'api', onboardingRoute: 'byok' });
  });
  it('saves no-AI progress without completing setup or sending credentials', async () => {
    const api = await import('../../src/pixflow/onboarding-profile');
    rest.mockResolvedValue({ ok: true, body: { profile: { completed: false, step: 3, runtimeMode: 'none' } } });
    await api.savePixflowOnboardingProgress(3, 'none');
    expect(rest).toHaveBeenCalledWith('onboarding/profile', { method: 'PUT', body: { profile: { step: 3, runtimeMode: 'none', source: 'setup-progress' } } });
    expect(await api.fetchPixflowOnboardingProfile()).toMatchObject({ completed: false, step: 3, runtimeMode: 'none' });
  });
  it('does not cache completion or notify the shell when saving fails', async () => {
    const api = await import('../../src/pixflow/onboarding-profile');
    rest.mockResolvedValueOnce({ ok: true, body: { profile: { completed: false } } });
    await api.fetchPixflowOnboardingProfile();
    rest.mockResolvedValueOnce({ ok: false, body: { message: 'Try again' } });
    const post = vi.spyOn(window, 'postMessage');
    await expect(api.syncPixflowOnboardingProfile({ ...DEFAULT_CONFIG, onboardingCompleted: true }, 'onboarding-complete')).rejects.toThrow('Try again');
    expect(await api.fetchPixflowOnboardingProfile()).toMatchObject({ completed: false });
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });
  it.each([false, true])('retires legacy no-AI profiles (completed: %s) without altering settings', async completed => {
    const api = await import('../../src/pixflow/onboarding-profile');
    const original = { ...DEFAULT_CONFIG, onboardingRoute: 'none' as const, onboardingCompleted: completed, apiKey: 'preserved-key', designSystemId: 'custom-design' };
    const config = api.applyPixflowOnboardingProfile(original, { completed, runtimeMode: 'none', step: 3 });
    expect(config).toEqual({ ...original, onboardingCompleted: false, onboardingRoute: undefined });
    expect(api.buildPixflowOnboardingProfile({ ...config, onboardingCompleted: true }).runtimeMode).not.toBe('none');
  });
});
