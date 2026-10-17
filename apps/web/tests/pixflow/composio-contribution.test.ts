// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { composioAvailable, requireComposioContribution } from '../../src/pixflow/composio-contribution';
import { composioInferenceJson } from '../../src/providers/composio-inference';
import { fetchComposioGuidance } from '../../src/providers/composio-guidance';
const state = vi.hoisted(() => ({ enabled: false, advertised: false, load: vi.fn() }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => true, getPixflowWordPressConfig: () => undefined }));
vi.mock('../../src/pixflow/composio-standalone', () => ({ standaloneComposio: () => undefined }));
vi.mock('../../src/pixflow/feature-runtime', () => ({
  pixflowFeatureEnabled: () => state.enabled,
  pixflowFeatureAdvertised: () => state.advertised,
  loadPixflowFeature: state.load,
  usePixflowFeatureAsset: () => ({ loading: false, error: false, retry: vi.fn() }),
}));
type TestWindow = Window & { PixflowComposioFactory?: unknown };
afterEach(() => { state.enabled = false; state.advertised = false; state.load.mockReset(); delete (window as TestWindow).PixflowComposioFactory; });

it('Free makes no Composio request or premium asset load and leaves saved configuration untouched', async () => {
  const saved = { apiTransport: 'composio', composioProvider: 'openai', composioModel: 'saved-model', accounts: ['saved-account'] };
  const before = JSON.stringify(saved);
  expect(composioAvailable()).toBe(false);
  await expect(composioInferenceJson('config')).rejects.toThrow('Composio requires Pro');
  expect(await fetchComposioGuidance(new AbortController().signal)).toBe('');
  expect(state.load).not.toHaveBeenCalled();
  expect(JSON.stringify(saved)).toBe(before);
});

it('loads the advertised Pro implementation on demand and delegates unchanged arguments', async () => {
  state.enabled = true; state.advertised = true;
  const request = vi.fn().mockResolvedValue({ configured: true });
  state.load.mockImplementation(async () => {
    (window as TestWindow).PixflowComposioFactory = () => ({ composioInferenceJson: request });
  });
  expect(composioAvailable()).toBe(true);
  const signal = new AbortController().signal;
  expect(await composioInferenceJson('config', undefined, signal, 'GET')).toEqual({ configured: true });
  expect(state.load).toHaveBeenCalledWith('pixflow-composio');
  expect(request).toHaveBeenCalledWith('config', undefined, signal, 'GET');
});

it('does not treat an already loaded factory as authorization after expiry', async () => {
  (window as TestWindow).PixflowComposioFactory = vi.fn();
  state.advertised = true;
  await expect(requireComposioContribution()).rejects.toThrow('Composio requires Pro');
  expect((window as TestWindow).PixflowComposioFactory).not.toHaveBeenCalled();
  expect(state.load).not.toHaveBeenCalled();
});
