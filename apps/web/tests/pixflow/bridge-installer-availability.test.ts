import { expect, it } from 'vitest';
import { macInstallerUrls, type PixflowBridgeReleaseManifest } from '../../src/pixflow/bridge-update';

it('does not advertise an unpublished Intel Mac installer before metadata arrives', () => {
  expect(macInstallerUrls().x64).toBeUndefined();
});
it('does not invent an Intel installer absent from the release manifest', () => {
  const manifest: PixflowBridgeReleaseManifest = { schemaVersion: 1, product: 'pixflow-design-bridge', version: '1.1.6', assets: [], installers: { macosArm64: 'https://example.test/arm.dmg' } };
  expect(macInstallerUrls(manifest)).toEqual({ arm64: 'https://example.test/arm.dmg', x64: undefined });
});
it('offers Intel when release metadata explicitly publishes it', () => {
  const manifest: PixflowBridgeReleaseManifest = { schemaVersion: 1, product: 'pixflow-design-bridge', version: '1.1.6', assets: [], installers: { macosX64: 'https://example.test/intel.dmg' } };
  expect(macInstallerUrls(manifest).x64).toBe('https://example.test/intel.dmg');
});
