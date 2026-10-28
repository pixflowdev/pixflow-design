import {showOnboardingPopup} from './onboarding-popup';
/** Reconcile explicit browser consent with supported and remembered site candidates. */
export function automaticConnection(chrome: any, discover: () => Promise<{sites: string[]}>, activate: (origin: string) => Promise<void>, now = Date.now) {
  let running: Promise<void> | undefined;
  let requested = false;
  const requests = new Map<number, {pattern: string; at: number}>();
  return () => {
    requested = true;
    if (running) return running;
    running = (async () => {
      do {
        requested = false;
        const config = await discover();
        const stored = await chrome.storage.local.get('directSites');
        for (const origin of config.sites) {
          if ((stored.directSites || []).includes(origin)) continue;
          const url = new URL(origin);
          const pattern = url.protocol + '//' + url.hostname + '/*';
          if (await chrome.permissions.contains({origins: [pattern]})) {
            for (const [tabId, request] of requests) if (request.pattern === pattern) {
              await chrome.permissions.removeHostAccessRequest?.({tabId, pattern}).catch(() => {});
              requests.delete(tabId);
            }
            try { await activate(origin); } catch { /* A site or Bridge may be offline; retry on the next browser event/alarm. */ }
          } else {
            await showOnboardingPopup(chrome, origin);
            if (!chrome.permissions.addHostAccessRequest) continue;
            // Chrome checks the pattern against the tab. No tabs/history permission is needed.
            for (const tab of await chrome.tabs.query({active: true, lastFocusedWindow: true})) {
              if (typeof tab.id !== 'number') continue;
              const previous = requests.get(tab.id);
              if (previous?.pattern === pattern && now() - previous.at < 300000) continue;
              // Chrome can ignore a request when its menu UI is unavailable.
              // Do not treat resolution as approval or retry on every tab event.
              requests.set(tab.id, {pattern, at: now()});
              if (requests.size > 100) requests.delete(requests.keys().next().value!);
              await chrome.permissions.addHostAccessRequest({tabId: tab.id, pattern}).catch(() => {});
            }
          }
        }
      } while (requested);
    })().finally(() => { running = undefined; });
    return running;
  };
}
