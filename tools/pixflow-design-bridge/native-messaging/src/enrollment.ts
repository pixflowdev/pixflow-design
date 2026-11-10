/** Discover only the origin already paired by Bridge; never accept a page-supplied origin. */
export async function discoverPairedSite(bridge: string, request: typeof fetch = fetch): Promise<string[]> {
  const base = new URL(bridge);
  if (base.origin !== bridge || base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) throw Error('Invalid local Bridge');
  const response = await request(bridge + '/api/pixflow/site-context', {
    redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error('Bridge pairing unavailable');
  const data = await response.json();
  if (data?.ok !== true || !data.site?.key || !data.site.origin) return [];
  const origin = new URL(data.site.origin);
  if (origin.origin !== data.site.origin || origin.username || origin.password
    || !(origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === '127.0.0.1'))) return [];
  return [origin.origin];
}

/** Only the extension popup/background invokes this control message, never a page. */
export function discoverNativeSites(runtime: any, hostName: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let port: any;
    let finished = false;
    const finish = (sites?: string[], error?: Error) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      try { port?.disconnect(); } catch {}
      if (error) reject(error); else resolve(sites || []);
    };
    const timer = setTimeout(() => finish(undefined, Error('Bridge discovery timed out')), 7000);
    try {
      port = runtime.connectNative(hostName);
      port.onDisconnect.addListener(() => finish(undefined, Error(runtime.lastError?.message || 'Bridge discovery disconnected')));
      port.onMessage.addListener((message: any) => {
        if (message.id === 'discover' && message.type === 'sites' && Array.isArray(message.sites)) finish(message.sites);
      });
      port.postMessage({ id: 'discover', type: 'discover' });
    } catch (error) { finish(undefined, error as Error); }
  });
}
