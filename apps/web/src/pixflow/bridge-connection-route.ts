import { useEffect, useState } from 'react';
export type BridgeConnectionRoute = 'direct' | 'chrome-extension';
type Status = { state?: string; running?: boolean; error?: unknown; connectionRoute?: unknown };
/** Only a successful current connection can name its route; cached/unknown status stays quiet. */
export function bridgeConnectionRoute(status?: Status): BridgeConnectionRoute | null {
  if (!status || status.state !== 'connected' || status.running !== true || status.error) return null;
  return status.connectionRoute === 'direct' || status.connectionRoute === 'chrome-extension' ? status.connectionRoute : null;
}
export function useBridgeConnectionRoute(): BridgeConnectionRoute | null {
  const read = () => typeof window === 'undefined' ? null : bridgeConnectionRoute((window as Window & { pixflowDesignBridgeStatus?: Status }).pixflowDesignBridgeStatus);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = (event: Event) => setRoute(bridgeConnectionRoute((event as CustomEvent<Status>).detail));
    setRoute(read());
    window.addEventListener('pixflow-design:bridge-status', update);
    return () => window.removeEventListener('pixflow-design:bridge-status', update);
  }, []);
  return route;
}
