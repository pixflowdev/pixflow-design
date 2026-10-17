/** Shared discovery state: cached providers remain visible while their refresh runs. */
export type ProviderDiscoveryState = { phase: 'idle' | 'refreshing' | 'ready' | 'error' | 'sleeping'; hasCached: boolean };
let snapshot: ProviderDiscoveryState = { phase: 'idle', hasCached: false };
let generation = 0;
const listeners = new Set<() => void>();
export const getProviderDiscoveryState = () => snapshot;
export const subscribeProviderDiscovery = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(next: ProviderDiscoveryState) { snapshot = next; listeners.forEach(listener => listener()); }
export function beginProviderDiscovery(hasCached: boolean) {
  const id = ++generation;
  publish({ phase: 'refreshing', hasCached });
  return (success: boolean | 'sleeping') => { if (id === generation) publish({ phase: success === 'sleeping' ? 'sleeping' : success ? 'ready' : 'error', hasCached }); };
}
