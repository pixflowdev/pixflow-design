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
it('clears recovery guidance on a new scan and success, ignoring stale failures', () => {
 const old=beginProviderDiscovery(true);old(false,'Connection timed out');
 expect(getProviderDiscoveryState().error).toBe('Connection timed out');
 const current=beginProviderDiscovery(true);
 expect(getProviderDiscoveryState().error).toBeUndefined();
 old(false,'Stale error');current(true);
 expect(getProviderDiscoveryState()).toEqual({phase:'ready',hasCached:true});
});
