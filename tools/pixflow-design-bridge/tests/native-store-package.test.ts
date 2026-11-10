import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storeConfiguration, storeManifest, storeFiles, nativeStoreConfiguration} from '../native-messaging/src/store-package';
test('Store browser package has no development identity or customer configuration', () => {
  const manifest = storeManifest();
  assert.equal(manifest.name, 'Pixflow Design Bridge');
  assert.equal(manifest.permissions.includes('activeTab'), true, 'popup gesture permits supported-site metadata discovery before persistent host consent');
  assert.equal(manifest.permissions.includes('alarms'), true, 'remembered sites retry after Bridge returns without replaying requests');
  assert.equal('key' in manifest, false);
  assert.equal('extensionOrigin' in storeConfiguration, false);
  assert.deepEqual(storeConfiguration.sites, []);
  assert.equal(storeConfiguration.discoverPairedSite, true);
  assert.equal(storeConfiguration.bridge, 'http://127.0.0.1:7456');
  assert.equal(/prototype|18364|17467|localhost/i.test(JSON.stringify({manifest, storeConfiguration})), false);
  assert.equal(storeFiles.some(file => /host|install|private|session|\.map/.test(file)), false);
});
test('native payload requires explicit Store identity and keeps exact-origin authorization', () => {
  for (const id of ['', 'placeholder', 'A'.repeat(32), 'a'.repeat(31)]) assert.throws(() => nativeStoreConfiguration(id));
  assert.equal(nativeStoreConfiguration('a'.repeat(32)).extensionOrigin, `chrome-extension://${'a'.repeat(32)}/`);
});
