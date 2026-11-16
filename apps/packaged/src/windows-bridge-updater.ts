import type { WindowsBridgeUpdateWindow } from './windows-bridge-update-launcher.js';
import { createDesktopUpdater } from '@open-design/desktop/main';
import type { PixflowBridgeUpdateStatus } from '@open-design/contracts';
import { DESKTOP_UPDATE_STATES as states, SIDECAR_SOURCES } from '@open-design/sidecar-proto';

const feed = 'https://pixflow.dev/downloads/pixflow-design-bridge/latest.json';
const packages = '/downloads/pixflow-design-bridge/packages/';
type InstallerAsset = { platform: string; arch: string; url: string; sha256: string; size?: number };

function verifiedFeed(raw: unknown, arch: string) {
  const manifest = raw as { product?: string; channel?: string; version?: string; installerAssets?: InstallerAsset[] } | null;
  if (manifest?.product !== 'pixflow-design-bridge' || manifest.channel !== 'stable' ||
      typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !Array.isArray(manifest.installerAssets)) {
    throw new Error('Unrecognised Bridge release manifest.');
  }
  const asset = manifest.installerAssets.find(item => item?.platform === 'win32' && item.arch === arch);
  if (!asset || typeof asset.url !== 'string' || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
    throw new Error('The release has no verified Windows installer for this computer.');
  }
  const url = new URL(asset.url);
  if (url.origin !== new URL(feed).origin || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith(packages) || url.pathname.slice(packages.length) !== `pixflow-design-bridge-${manifest.version}-win-${arch}-setup.exe`) {
    throw new Error('The release installer location is invalid.');
  }
  const installer = { url: url.href, sha256: asset.sha256, size: asset.size };
  return { channel: 'stable', stableVersion: manifest.version, platforms: { [arch === 'x64' ? 'win' : 'winArm64']: { enabled: true, artifacts: { installer } } } };
}

export function createWindowsBridgeUpdater(options: {
  version: string;
  downloadRoot: string;
  arch: string;
  canInstall(): Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  openWindow(): Promise<WindowsBridgeUpdateWindow>;
  shutdown(): Promise<void>;
}) {
  const fetchImpl = options.fetch ?? fetch;
  let status: PixflowBridgeUpdateStatus = { state: 'idle' };
  let working = false;
  let installLock = false;
  let updateWindow: WindowsBridgeUpdateWindow | undefined;
  function setStatus(next: PixflowBridgeUpdateStatus) {
    if (status.state === next.state && status.percent === next.percent) return;
    status = next;
    try { updateWindow?.publish(next); } catch { /* The active update does not depend on drawing progress. */ }
  }
  const updater = createDesktopUpdater({
    currentVersion: options.version, downloadRoot: options.downloadRoot,
    source: SIDECAR_SOURCES.PACKAGED, platform: 'win32', arch: options.arch,
    env: { OD_UPDATE_METADATA_URL: feed },
  }, {
    fetch: async (input, init) => {
      const response = await fetchImpl(input, {
        ...init, redirect: 'error',
        signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(String(input) === feed ? 15_000 : 15 * 60_000)]),
      });
      if (String(input) !== feed || !response.ok) return response;
      return Response.json(verifiedFeed(await response.json(), options.arch));
    },
    scheduleWindowsInstaller: (path, version) => {
      if (!updateWindow) throw new Error('The local update window is unavailable.');
      return updateWindow.install(path, version);
    },
  });
  updater.subscribe(() => {
    const snapshot = updater.snapshot();
    if (snapshot.state === states.DOWNLOADING) {
      const progress = snapshot.progress;
      setStatus({ state: 'downloading', ...(progress?.totalBytes ? { percent: Math.min(100, Math.round(100 * progress.receivedBytes / progress.totalBytes)) } : {}) });
    }
  });

  async function run() {
    updateWindow = await options.openWindow();
    const release = await updater.checkForUpdates({ autoDownload: false });
    if (release.state === states.NOT_AVAILABLE) { setStatus({ state: 'up-to-date' }); return; }
    if (release.state !== states.AVAILABLE && release.state !== states.DOWNLOADED) throw new Error('Bridge update check failed.');
    setStatus({ state: 'downloading' });
    const download = await updater.downloadUpdate();
    if (download.state !== states.DOWNLOADED) throw new Error('Bridge update download failed.');
    // Block new runs before checking existing work, including other paired sites.
    installLock = true;
    if (!await options.canInstall()) {
      installLock = false;
      setStatus({ state: 'busy' });
      return;
    }
    setStatus({ state: 'opening' });
    const installation = await updater.installUpdate();
    if (installation.state !== states.DOWNLOADED) throw new Error('Bridge installation did not start.');
    setStatus({ state: 'installing' });
    await options.shutdown();
  }

  return {
    status: () => status,
    isInstalling: () => installLock,
    start(): PixflowBridgeUpdateStatus {
      if (working || installLock) return status;
      working = true;
      updateWindow = undefined;
      setStatus({ state: 'checking' });
      void run().catch(() => {
        installLock = false;
        setStatus({ state: 'failed' });
      }).finally(() => { working = false; });
      return status;
    },
  };
}
export type WindowsBridgeUpdater = ReturnType<typeof createWindowsBridgeUpdater>;
