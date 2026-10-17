vi.mock('../../src/pixflow/composio-contribution', () => ({ composioAvailable: vi.fn(() => true) }));
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fetchConnectorCatalogSnapshot } from '../../src/components/connectors-state';
import { hasPixflowWordPressContext } from '../../src/pixflow/wordpress-context';
import { composioInferenceJson } from '../../src/providers/composio-inference';
import { fetchConnectors, fetchConnectorStatuses, fetchConnectorDiscovery } from '../../src/providers/registry';

vi.mock('../../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: vi.fn(() => true) }));
vi.mock('../../src/providers/composio-inference', () => ({ composioInferenceJson: vi.fn() }));
vi.mock('../../src/providers/registry', () => ({ fetchConnectors: vi.fn(), fetchConnectorStatuses: vi.fn(), fetchConnectorDiscovery: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('uses only effective WordPress accounts in every execution mode, without Bridge discovery', async () => {
  vi.mocked(composioInferenceJson).mockResolvedValue({ accounts: [
    { id: 'selected', name: 'GitHub', toolkit: 'github', enabled: true, status: 'ACTIVE', identity: { username: 'example' } },
    { id: 'paused', name: 'Gmail', toolkit: 'gmail', enabled: false, suspended: true, status: 'ACTIVE' },
    { id: 'expired', name: 'Slack', toolkit: 'slack', enabled: true, status: 'EXPIRED' },
  ] });
  expect(await fetchConnectorCatalogSnapshot({ refreshDiscovery: true })).toMatchObject([{ id: 'selected', accountLabel: 'example', status: 'connected' }]);
  expect(fetchConnectors).not.toHaveBeenCalled();
  expect(fetchConnectorStatuses).not.toHaveBeenCalled();
  expect(fetchConnectorDiscovery).not.toHaveBeenCalled();
});

it('never revives legacy Bridge accounts when WordPress discovery fails', async () => {
  vi.mocked(composioInferenceJson).mockRejectedValue(new Error('site unavailable'));
  expect(await fetchConnectorCatalogSnapshot()).toEqual([]);
  expect(fetchConnectors).not.toHaveBeenCalled();
});

it('preserves the separate standalone desktop catalogue outside WordPress', async () => {
  vi.mocked(hasPixflowWordPressContext).mockReturnValueOnce(false);
  vi.mocked(fetchConnectors).mockResolvedValue([]);
  vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
  expect(await fetchConnectorCatalogSnapshot()).toEqual([]);
  expect(composioInferenceJson).not.toHaveBeenCalled();
});
