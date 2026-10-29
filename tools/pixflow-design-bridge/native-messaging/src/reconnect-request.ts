import {validateBrowserSite, type BrowserSite} from './browser-sites';

/** External pages may request connection UI, never relay requests or grant consent. */
export function reconnectRequest(chrome: any, activate: () => Promise<void>, rememberCandidate: (site: BrowserSite) => void, now = Date.now) {
  const recent = new Map<number, number>();
  return async (message: any, sender: any): Promise<{state: string}> => {
    if (message?.type !== 'pixflow-bridge-reconnect' || sender?.frameId !== 0 || typeof sender.tab?.id !== 'number') return {state: 'rejected'};
    let origin: string;
    try { origin = new URL(sender.url).origin; } catch { return {state: 'rejected'}; }
    const site = validateBrowserSite(message.site, origin);
    if (!site || sender.origin !== origin) return {state: 'rejected'};
    const focused = async () => {
      const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      return tab?.id === sender.tab.id && tab.url === sender.url && (await chrome.windows.get(tab.windowId)).focused;
    };
    if (!await focused()) return {state: 'rejected'};
    const last = recent.get(sender.tab.id);
    if (last !== undefined && now() - last < 3000) return {state: 'busy'};
    recent.set(sender.tab.id, now());
    if (recent.size > 100) recent.delete(recent.keys().next().value!);
    const stored = await chrome.storage.local.get('directSites');
    // Explicit reconnect may offer UI, but only the popup can change this preference.
    const prefersDirect = (stored.directSites || []).includes(origin);
    rememberCandidate(site); // In-memory metadata only; native enrollment still verifies the site.
    const u = new URL(origin);
    if (!prefersDirect && await chrome.permissions.contains({origins: [u.protocol + '//' + u.hostname + '/*']})) {
      await activate();
      return {state: 'reconnecting'};
    }
    if (!await focused() || !chrome.action?.openPopup) return {state: 'unavailable'};
    await chrome.action.openPopup({windowId: sender.tab.windowId});
    return {state: 'approval'};
  };
}
