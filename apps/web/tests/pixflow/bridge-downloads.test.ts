import { describe, expect, it } from 'vitest';
import { installerUrlForPlatform, macInstallerUrls, PIXFLOW_BRIDGE_MAC_ARM64_INSTALLER_URL } from '../../src/pixflow/bridge-update';

describe('Bridge installer selection', () => {
  const manifest = {
    schemaVersion: 1, product: 'pixflow-design-bridge', version: '2.0.1', assets: [],
    installers: {
      windows: 'https://example.test/releases/2.0.1/windows.exe',
      macosArm64: 'https://example.test/releases/2.0.1/mac.dmg',
      linux: 'https://example.test/releases/2.0.1/install.sh',
    },
  };
  const localized = {
    windows: 'https://example.test/current/windows.exe',
    macosArm64: 'https://example.test/current/mac.dmg',
    linux: 'https://example.test/current/install.sh',
  };

  it.each([
    ['win32', 'windows'], ['Win32 Windows NT', 'windows'],
    ['darwin', 'macosArm64'], ['MacIntel Macintosh Safari', 'macosArm64'],
    ['MacIntel Macintosh Chrome', 'macosArm64'], ['linux', 'linux'],
  ] as const)('preserves release-specific %s downloads over localized fallbacks', (platform, key) => {
    expect(installerUrlForPlatform(platform, manifest, localized)).toBe(manifest.installers[key]);
  });
  it('uses a native Mac fallback with older WordPress configuration', () => {
    expect(installerUrlForPlatform('MacIntel Safari', null, { linux: localized.linux })).toBe(PIXFLOW_BRIDGE_MAC_ARM64_INSTALLER_URL);
  });
  it('does not invent an Intel Mac download or infer the chip from MacIntel', () => {
    expect(macInstallerUrls(manifest)).toEqual({ arm64: manifest.installers.macosArm64, x64: undefined });
    const intel = { ...manifest, installers: { macosX64: 'https://example.test/intel.dmg' } };
    expect(macInstallerUrls(intel).x64).toBe(intel.installers.macosX64);
    expect(installerUrlForPlatform('darwin', intel)).toBe(intel.installers.macosX64);
  });
});
