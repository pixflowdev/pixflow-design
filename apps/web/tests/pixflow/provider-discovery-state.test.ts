import { expect, it } from 'vitest';
import { beginProviderDiscovery, getProviderDiscoveryState } from '../../src/pixflow/provider-discovery-state';
it('ignores an old scan finishing after a newer scan starts', () => {
 const old = beginProviderDiscovery(true);
 const current = beginProviderDiscovery(true);
 old(false);
 expect(getProviderDiscoveryState().phase).toBe('refreshing');
 current(true);
 expect(getProviderDiscoveryState().phase).toBe('ready');
});
