import {test} from 'node:test';
import assert from 'node:assert/strict';
import {showOnboardingPopup} from '../native-messaging/src/onboarding-popup';
function fixture() {
  const stored: any = {}, opened: any[] = [];
  const tab = {id: 1, windowId: 2, url: 'https://customer.example/wp-admin/'};
  let focused = true;
  const chrome = {tabs: {query: async () => [tab]}, windows: {get: async () => ({focused})},
    storage: {local: {get: async () => structuredClone(stored), set: async (value: any) => Object.assign(stored, value)}},
    action: {openPopup: async (value: any) => {opened.push(value);}}};
  return {chrome, stored, opened, tab, unfocus: () => {focused = false;}};
}
test('paired focused site opens once across calls and worker restarts without granting permission', async () => {
  const f = fixture();
  await showOnboardingPopup(f.chrome, 'https://customer.example');
  await showOnboardingPopup(f.chrome, 'https://customer.example');
  assert.deepEqual(f.opened, [{windowId: 2}]);
  assert.deepEqual(f.stored.onboardingShown, ['https://customer.example']);
});
test('foreign site, different port, hidden browser and direct preference never open', async () => {
  for (const mode of ['foreign', 'port', 'hidden', 'direct']) {
    const f = fixture();
    if (mode === 'foreign') f.tab.url = 'https://other.example/';
    if (mode === 'port') f.tab.url = 'https://customer.example:8443/';
    if (mode === 'hidden') f.unfocus();
    if (mode === 'direct') f.stored.directSites = ['https://customer.example'];
    await showOnboardingPopup(f.chrome, 'https://customer.example'); assert.equal(f.opened.length, 0);
  }
});
test('tab switching during storage write prevents opening on the unrelated tab', async () => {
  const f = fixture();
  f.chrome.storage.local.set = async value => {Object.assign(f.stored, value); f.tab.url = 'https://other.example/';};
  await showOnboardingPopup(f.chrome, 'https://customer.example'); assert.equal(f.opened.length, 0);
});
