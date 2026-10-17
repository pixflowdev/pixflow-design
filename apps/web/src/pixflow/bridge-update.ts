import { isPixflowWordPressEmbed, requestWordPressRest } from './license';

export type PixflowBridgeReleaseAsset = {
  platform: string;
  arch: string;
  format: string;
  url: string;
  sha256?: string;
  size?: number;
};

export type PixflowBridgeReleaseManifest = {
  schemaVersion: number;
  product: string;
  version: string;
  channel?: string;
  releasedAt?: string;
  assets: PixflowBridgeReleaseAsset[];
  installers?: {
    windows?: string;
    macos?: string;
    macosArm64?: string;
    macosX64?: string;
    linux?: string;
  };
};

export const PIXFLOW_BRIDGE_MANIFEST_URL = 'https://pixflow.dev/downloads/pixflow-design-bridge/latest.json';
export const PIXFLOW_BRIDGE_WINDOWS_INSTALLER_URL =
  'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe';
// Keep platform-specific fallbacks available before the public release
// manifest finishes loading. This prevents a macOS user who opens Downloads
// immediately from being offered the generic Unix installer.
export const PIXFLOW_BRIDGE_MAC_ARM64_INSTALLER_URL =
  'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg';

const BRIDGE_RELEASE_CACHE_MS = 10 * 60 * 1000;
let bridgeReleaseCache: { checkedAt: number; value: PixflowBridgeReleaseManifest } | null = null;
let bridgeReleaseRequest: Promise<PixflowBridgeReleaseManifest> | null = null;

// Pixflow-owned: hosted bridge release metadata lets the WordPress plugin
// guide non-technical users through install/update without bundling the bridge.
export async function fetchPixflowBridgeReleaseManifest(): Promise<PixflowBridgeReleaseManifest> {
  if (bridgeReleaseCache && Date.now() - bridgeReleaseCache.checkedAt < BRIDGE_RELEASE_CACHE_MS) {
    return bridgeReleaseCache.value;
  }
  if (bridgeReleaseRequest) {
    return bridgeReleaseRequest;
  }

  bridgeReleaseRequest = (async () => {
  if (isPixflowWordPressEmbed()) {
    const response = await requestWordPressRest<PixflowBridgeReleaseManifest & { message?: string }>('bridge/release');
    if (!response.ok) {
      throw new Error(response.body?.message ?? `Could not load bridge release manifest: HTTP ${response.status}`);
    }
    return response.body;
  }

  const response = await fetch(PIXFLOW_BRIDGE_MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load bridge release manifest: HTTP ${response.status}`);
  }
  return response.json();
  })()
    .then((manifest) => {
      bridgeReleaseCache = { checkedAt: Date.now(), value: manifest };
      return manifest;
    })
    .finally(() => {
      bridgeReleaseRequest = null;
    });

  return bridgeReleaseRequest;
}

export function installerUrlForPlatform(
  platform?: string,
  manifest?: PixflowBridgeReleaseManifest | null,
  localized?: PixflowBridgeReleaseManifest['installers'],
): string {
  const normalized = (platform || '').toLowerCase();
  if (/\bwin32\b|windows/.test(normalized)) return manifest?.installers?.windows ?? localized?.windows ?? PIXFLOW_BRIDGE_WINDOWS_INSTALLER_URL;
  if (normalized === 'darwin' || normalized.includes('mac')) {
    return manifest?.installers?.macosArm64
      ?? manifest?.installers?.macosX64
      ?? manifest?.installers?.macos
      ?? localized?.macosArm64
      ?? PIXFLOW_BRIDGE_MAC_ARM64_INSTALLER_URL;
  }
  return manifest?.installers?.linux ?? localized?.linux ?? 'https://pixflow.dev/downloads/pixflow-design-bridge/install.sh';
}

export function macInstallerUrls(manifest?: PixflowBridgeReleaseManifest | null): { arm64?: string; x64?: string } {
  return {
    arm64: manifest?.installers?.macosArm64 ?? PIXFLOW_BRIDGE_MAC_ARM64_INSTALLER_URL,
    // Intel downloads are available only when explicitly published in release metadata.
    x64: manifest?.installers?.macosX64,
  };
}
