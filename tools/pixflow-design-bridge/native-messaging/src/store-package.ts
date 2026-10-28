/** Public browser configuration contains no customer origins or installer identity. */
export const storeConfiguration = {
  hostName: 'dev.pixflow.bridge',
  bridge: 'http://127.0.0.1:7456',
  sites: [] as string[],
  discoverPairedSite: true,
};
export const storeFiles = ['background.js', 'content.js', 'page.js', 'popup.js', 'popup.html', 'popup.css', 'brand.svg', 'icon.png', 'manifest.json', 'config.json'] as const;
export function storeManifest() {
  return {
    manifest_version: 3, name: 'Pixflow Design Bridge', version: '1.0.1',
    description: 'Connect Pixflow Design in WordPress to your installed Pixflow Bridge using an optional native connection.',
    minimum_chrome_version: '120',
    icons: {128: 'icon.png'},
    permissions: ['nativeMessaging', 'storage', 'scripting', 'tabs'],
    optional_host_permissions: ['https://*/*', 'http://127.0.0.1/*'],
    action: {default_title: 'Pixflow Bridge connection', default_popup: 'popup.html', default_icon: {128: 'icon.png'}},
    background: {service_worker: 'background.js'},
  };
}
export function nativeStoreConfiguration(extensionId: string) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw Error('An actual Chrome Web Store extension ID is required');
  return {...storeConfiguration, extensionOrigin: `chrome-extension://${extensionId}/`};
}
