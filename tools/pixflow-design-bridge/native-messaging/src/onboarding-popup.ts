/** Show first-time setup only in the focused, exactly paired site. Never grants access. */
export async function showOnboardingPopup(chrome: any, origin: string) {
  if (!chrome.action?.openPopup) return;
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab?.url || typeof tab.windowId !== 'number') return;
  const expectedUrl = tab.url, expectedId = tab.id;
  try { if (new URL(tab.url).origin !== origin) return; } catch { return; }
  if (!(await chrome.windows.get(tab.windowId)).focused) return;
  const stored = await chrome.storage.local.get(['onboardingShown', 'directSites']);
  if ((stored.onboardingShown || []).includes(origin) || (stored.directSites || []).includes(origin)) return;
  // Persist before opening: dismissal, worker suspension and navigation must not nag.
  await chrome.storage.local.set({onboardingShown: [...(stored.onboardingShown || []), origin]});
  const [current] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (current?.id !== expectedId || current.url !== expectedUrl) return;
  await chrome.action.openPopup({windowId: tab.windowId}).catch(() => {});
}
