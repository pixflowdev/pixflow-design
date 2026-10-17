import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash, randomBytes } from 'node:crypto';
import { isProcessAlive } from '@open-design/platform';

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  normalizeDesktopSidecarMessage,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

import type { PackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity, writePackagedWebIdentity } from "./identity.js";
import { confirmPackagedLauncherRuntime } from "./launcher-runtime.js";
import type { PackagedLauncherRuntime } from "./launcher-runtime.js";
import { applyPackagedElectronPathOverrides, ensurePackagedNamespacePaths } from "./launch.js";
import type { PackagedNamespacePaths } from "./paths.js";
import { resolvePackagedNamespacePaths } from './paths.js';
import { BridgeSiteRuntimes } from './bridge-site-runtimes.js';
import { startPixflowBridgeHttpGateway, type PixflowBridgeGatewayHandle } from "./pixflow-bridge-http.js";
import { startPackagedSidecars, type PackagedSidecarHandle, type PixflowPackagedSiteContext } from "./sidecars.js";
import { createBridgeLifecycleQueue } from './bridge-lifecycle-queue.js';
import { syncWindowsUninstallDisplayVersion } from "./windows-lifecycle.js";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { Menu, Tray, app, nativeImage } = electron;

type BridgeTrayState = "starting" | "running" | "stopped" | "stopping" | "failed";

function writeBridgeTrayLog(message: string, meta: Record<string, unknown> = {}): void {
  try {
    const root = join(app.getPath("appData"), "Pixflow Design Bridge", "startup");
    mkdirSync(root, { recursive: true });
    appendFileSync(
      join(root, "latest.log"),
      `${JSON.stringify({ message, timestamp: new Date().toISOString(), meta })}\n`,
      "utf8",
    );
  } catch {
    // Startup diagnostics must never affect launch.
  }
}

function createPackagedDesktopStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function applyLaunchEnv(base: string, stamp: SidecarStamp): void {
  const env = createSidecarLaunchEnv({
    base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    stamp,
  });

  for (const [key, value] of Object.entries(env)) {
    if (value != null) process.env[key] = value;
  }
}

function createTrayIcon(paths: PackagedNamespacePaths): Electron.NativeImage {
  const candidates = [
    ...(process.platform === "darwin"
      ? [
        join(process.resourcesPath, "icon.icns"),
        join(process.resourcesPath, "icon.png"),
        join(process.resourcesPath, "Pixflow Design Bridge.icns"),
        join(process.resourcesPath, "Pixflow Design Bridge.png"),
        join(process.resourcesPath, "open-design", "icon.icns"),
        join(process.resourcesPath, "open-design", "icon.png"),
        join(paths.resourceRoot, "icon.icns"),
        join(paths.resourceRoot, "icon.png"),
      ]
      : []),
    join(process.resourcesPath, "icon.ico"),
    join(process.resourcesPath, "open-design", "icon.ico"),
    join(paths.resourceRoot, "icon.ico"),
  ];
  for (const candidate of candidates) {
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) {
      writeBridgeTrayLog("bridge tray icon loaded", {
        path: candidate,
        size: image.getSize(),
      });
      if (process.platform === "darwin") {
        const resized = image.resize({ height: 18 });
        resized.setTemplateImage(false);
        return resized;
      }
      return image;
    }
  }
  const fallback = nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8," + encodeURIComponent([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
      '<rect width="32" height="32" rx="8" fill="#1f1f1f"/>',
      '<path d="M8 22V7h8.4c4 0 6.8 2.5 6.8 6.1s-2.8 6.1-6.8 6.1h-3.6V22H8Zm4.8-6.7h3.2c1.5 0 2.4-.8 2.4-2.2s-.9-2.2-2.4-2.2h-3.2v4.4Z" fill="#fff"/>',
      '</svg>',
    ].join("")),
  );
  writeBridgeTrayLog("bridge tray icon fallback used", {
    empty: fallback.isEmpty(),
    size: fallback.getSize(),
  });
  if (!fallback.isEmpty() && process.platform === "darwin") {
    const resized = fallback.resize({ height: 18 });
    resized.setTemplateImage(false);
    return resized;
  }
  return fallback.isEmpty() ? nativeImage.createEmpty() : fallback;
}

export async function runPixflowBridgeTray({
  activeConfig,
  launcherRuntime,
  namespace,
  paths,
}: {
  activeConfig: PackagedConfig;
  launcherRuntime: PackagedLauncherRuntime;
  namespace: string;
  paths: PackagedNamespacePaths;
}): Promise<void> {
  const stamp = createPackagedDesktopStamp(namespace);
  await ensurePackagedNamespacePaths(paths);
  applyPackagedElectronPathOverrides(paths);
  applyLaunchEnv(paths.runtimeRoot, stamp);

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });
  const identity = await writePackagedDesktopIdentity({ paths, stamp });
  let sidecars: PackagedSidecarHandle | null = null;
  let unselectedSidecars: PackagedSidecarHandle | null = null;
  const runtimeTokens = new WeakMap<PackagedSidecarHandle, string>();
  const inspectIdle = async (handle: PackagedSidecarHandle, method = 'GET') => {
    const token = runtimeTokens.get(handle);
    if (!token || !handle.daemon.url) throw new Error('Runtime cannot confirm idle state.');
    const response = await fetch(new URL('/api/pixflow/runtime-idle', handle.daemon.url), {
      method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Runtime idle check failed.');
    return await response.json() as { ok: boolean; busy: boolean };
  };
  const createSitePool = () => new BridgeSiteRuntimes<PackagedSidecarHandle>({
    alive: handle => isProcessAlive(handle.daemon.pid),
    busy: async handle => (await inspectIdle(handle)).busy,
    drain: async handle => { const result = await inspectIdle(handle, 'POST'); return result.ok && !result.busy; },
  });
  let siteRuntimes = createSitePool();
  const connectedSites = new Map<string, { site: PixflowPackagedSiteContext; handle: PackagedSidecarHandle }>();
  let ipcServer: JsonIpcServerHandle | null = null;
  let httpGateway: PixflowBridgeGatewayHandle | null = null;
  let activeSite: PixflowPackagedSiteContext | null = null;
  let state: BridgeTrayState = "stopped";
  let lastError: string | null = null;
  let tray: Electron.Tray | null = null;
  const lifecycle = createBridgeLifecycleQueue();
  let allowQuit = false;

  const setState = (next: BridgeTrayState, error: string | null = null): void => {
    state = next;
    lastError = error;
    writeBridgeTrayLog("bridge tray state changed", { error, state });
    const suffix = error == null ? "" : `: ${error}`;
    tray?.setToolTip(`Pixflow Design Bridge - ${state}${suffix}`);
    updateTrayMenu();
  };

  const stopBridge = async (): Promise<void> => {
    if (state === "stopping" || state === "stopped") return;
    setState("stopping");
    await siteRuntimes.close();
    await unselectedSidecars?.close();
    unselectedSidecars = null;
    connectedSites.clear();
    siteRuntimes = createSitePool();
    sidecars = null;
    activeSite = null;
    setState("stopped");
  };

  const startBridge = async (): Promise<void> => {
    if (state === "starting" || state === "running") return;
    setState("starting");
    try {
      sidecars = await startPackagedSidecars(runtime, paths, {
        appVersion: activeConfig.appVersion,
        amrProfile: activeConfig.amrProfile,
        daemonCliEntry: activeConfig.daemonCliEntry,
        daemonSidecarEntry: activeConfig.daemonSidecarEntry,
        nodeCommand: activeConfig.nodeCommand,
        telemetryRelayUrl: activeConfig.telemetryRelayUrl,
        pixflowSite: activeSite,
        requireDesktopAuth: false,
        webSidecarEntry: activeConfig.webSidecarEntry,
        webStandaloneRoot: activeConfig.webStandaloneRoot,
        webOutputMode: activeConfig.webOutputMode,
      });
      unselectedSidecars = sidecars;
      writeBridgeTrayLog("bridge tray sidecars ready", {
        daemonUrl: sidecars.daemon.url,
        webUrl: sidecars.web.url,
      });
      if (sidecars.web.url == null) throw new Error("web sidecar did not report a URL");
      await writePackagedWebIdentity({ paths, pid: process.pid, url: sidecars.web.url });
      await confirmPackagedLauncherRuntime(launcherRuntime);
      await syncWindowsUninstallDisplayVersion({ namespace, productName: "Pixflow Design Bridge", version: activeConfig.appVersion }).catch(() => undefined);
      setState("running");
    } catch (error) {
      await sidecars?.close().catch(() => undefined);
      sidecars = null;
      setState("failed", error instanceof Error ? error.message : String(error));
    }
  };

  const switchSite = async (site: {
    siteKey: string;
    siteLabel?: string;
    siteOrigin?: string;
    siteUrl?: string;
  }): Promise<unknown> => lifecycle.run(async () => {
    const key = site.siteKey.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._-]{8,128}$/.test(key)) {
      return { ok: false, error: "Invalid Pixflow Design site key." };
    }
    const existing = connectedSites.get(key);
    if (existing) {
      if (existing.site.origin !== (site.siteOrigin?.trim() ?? '') || existing.site.url !== (site.siteUrl?.trim() ?? '')) {
        return { ok: false, error: 'This site key is already connected with a different address.' };
      }
      activeSite = existing.site;
      sidecars = await siteRuntimes.connect(key);
      existing.handle = sidecars;
      return { ok: await waitForDaemonSite(sidecars.daemon.url, key, 1500), status: 'already-active', site: activeSite };
    }
    const siteDataDir = join(paths.dataRoot, "sites", key);
    const nextSite: PixflowPackagedSiteContext = {
      key,
      dataDir: siteDataDir,
      odDataDir: join(siteDataDir, "od"),
      syncRoot: join(siteDataDir, "sync"),
      origin: site.siteOrigin?.trim() ?? "",
      url: site.siteUrl?.trim() ?? "",
      label: site.siteLabel?.trim() ?? "",
    };
    await mkdir(nextSite.odDataDir, { recursive: true });
    await mkdir(nextSite.syncRoot, { recursive: true });
    // Each site gets independent IPC, ports and logs while retaining its existing
    // database location. The desktop remains the owner of every child runtime.
    const siteNamespace = `pf-site-${createHash('sha256').update(`${namespace}:${key}`).digest('hex').slice(0, 24)}`;
    const sitePaths = resolvePackagedNamespacePaths({ ...activeConfig, namespaceBaseRoot: join(paths.namespaceRoot, 'sites') }, siteNamespace);
    sitePaths.dataRoot = paths.dataRoot;
    sitePaths.installationRoot = paths.installationRoot;
    const siteStamp = createPackagedDesktopStamp(siteNamespace);
    const siteRuntime = bootstrapSidecarRuntime(siteStamp, {}, { app: APP_KEYS.DESKTOP, base: sitePaths.runtimeRoot, contract: OPEN_DESIGN_SIDECAR_CONTRACT });
    const handle = await siteRuntimes.connect(key, async () => {
      const runtimeControlToken = randomBytes(32).toString('hex');
      const started = await startPackagedSidecars(siteRuntime, sitePaths, {
        appVersion: activeConfig.appVersion, amrProfile: activeConfig.amrProfile,
        daemonCliEntry: activeConfig.daemonCliEntry, daemonSidecarEntry: activeConfig.daemonSidecarEntry,
        nodeCommand: activeConfig.nodeCommand, telemetryRelayUrl: activeConfig.telemetryRelayUrl,
        pixflowSite: nextSite, requireDesktopAuth: false, runtimeControlToken,
        webSidecarEntry: activeConfig.webSidecarEntry, webStandaloneRoot: activeConfig.webStandaloneRoot,
        webOutputMode: activeConfig.webOutputMode,
      });
      if (!await waitForDaemonSite(started.daemon.url, key, 25_000)) {
        await started.close();
        throw new Error('Pixflow Design Bridge did not confirm the requested site before timeout.');
      }
      runtimeTokens.set(started, runtimeControlToken);
      return started;
    });
    connectedSites.set(key, { site: nextSite, handle });
    activeSite = nextSite;
    sidecars = handle;
    setState('running');
    await unselectedSidecars?.close();
    unselectedSidecars = null;
    await writePackagedWebIdentity({ paths, pid: process.pid, url: handle.web.url! });
    return {
      ok: true,
      status: 'connected',
      site: activeSite,
    };
  });

  const shutdown = async (): Promise<void> => {
    clearInterval(idleTimer);
    await lifecycle.close(async () => {
      await httpGateway?.close().catch(() => undefined);
      await ipcServer?.close().catch(() => undefined);
      await stopBridge();
      await identity.close().catch(() => undefined);
      allowQuit = true;
      app.quit();
    });
  };

  let collectingIdle = false;
  const idleTimer = setInterval(() => {
    if (state !== 'running' || collectingIdle) return;
    collectingIdle = true;
    void siteRuntimes.releaseExcess().catch(error => writeBridgeTrayLog('site memory release failed', { error: String(error) }))
      .finally(() => { collectingIdle = false; });
  }, 30_000);
  idleTimer.unref();

  const restartApp = async (): Promise<void> => {
    app.relaunch();
    await shutdown();
  };

  const updateTrayMenu = (): void => {
    if (tray == null) return;
    const status = lastError == null ? `Status: ${state}` : `Status: ${state} (${lastError})`;
    tray.setContextMenu(Menu.buildFromTemplate([
      { enabled: false, label: "Pixflow Design Bridge" },
      { enabled: false, label: status },
      { type: "separator" },
      { click: () => void lifecycle.run(startBridge).catch(() => undefined), enabled: state === "stopped" || state === "failed", label: "Start Bridge" },
      { click: () => void lifecycle.run(stopBridge).catch(() => undefined), enabled: state === "running", label: "Stop Bridge" },
      { click: () => void restartApp(), enabled: state !== "starting" && state !== "stopping", label: "Restart Bridge" },
      { type: "separator" },
      { click: () => void shutdown(), label: "Exit" },
    ]));
  };

  await app.whenReady();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
  httpGateway = await startPixflowBridgeHttpGateway({
    version: activeConfig.appVersion ?? "0.0.0",
    getState: () => state,
    getDaemonUrl: () => sidecars?.daemon.url ?? null,
    getWebUrl: () => sidecars?.web.url ?? null,
    getSite: () => activeSite,
    resolveSite: (key, origin) => {
      const candidates = [...connectedSites.values()].filter(entry =>
        (!key || entry.site.key === key) && (!origin || entry.site.origin === origin));
      if (candidates.length !== 1) return null;
      const entry = candidates[0]!;
      return { getState: () => state, getDaemonUrl: () => siteRuntimes.get(entry.site.key)?.daemon.url ?? null,
        getWebUrl: () => siteRuntimes.get(entry.site.key)?.web.url ?? null, getSite: () => entry.site,
        getRuntimeState: () => siteRuntimes.snapshot(entry.site.key)?.state ?? 'unavailable',
        acquire: active => siteRuntimes.acquire(entry.site.key, active) };
    },
    listSites: async () => ({
      warmIdleLimit: siteRuntimes.warmIdleLimit, idleGraceMs: siteRuntimes.idleGraceMs,
      sites: await Promise.all([...connectedSites.values()].map(async ({ site }) => ({
        key: site.key, label: site.label, url: site.url,
        ...(await siteRuntimes.status(site.key) ?? { state: 'unavailable' as const, lastUsedAt: 0 }),
      }))),
    }),
    sleepSite: key => siteRuntimes.sleep(key),
    wakeSite: async key => { await siteRuntimes.connect(key); },
    switchSite,
  });
  tray = new Tray(createTrayIcon(paths));
  tray.setTitle("");
  tray.setToolTip("Pixflow Design Bridge");
  updateTrayMenu();

  ipcServer = await createJsonIpcServer({
    socketPath: stamp.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDesktopSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          return {
            pid: process.pid,
            state,
            url: sidecars?.web.url ?? null,
            updatedAt: new Date().toISOString(),
          };
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            void shutdown();
          });
          return { accepted: true };
        case SIDECAR_MESSAGES.SHOW:
          // Tray mode has no window to focus. A successful acknowledgement
          // still lets a second launch exit cleanly without reporting a
          // misleading focus failure.
          if (process.platform === "win32") {
            tray?.displayBalloon({
              title: "Pixflow Design Bridge",
              content: state === "running" ? "The bridge is running." : `Bridge status: ${state}.`,
            });
          }
          return { accepted: true };
      }
    },
  });

  app.on("before-quit", (event) => {
    if (allowQuit) return;
    event.preventDefault();
    void shutdown();
  });

  void lifecycle.run(startBridge).catch(() => undefined);
  await new Promise<void>((resolve) => {
    app.once("will-quit", () => resolve());
  });
}

async function waitForDaemonSite(daemonUrl: string | null, siteKey: string, timeoutMs: number): Promise<boolean> {
  if (daemonUrl == null) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/pixflow/site-context", `${daemonUrl.replace(/\/+$/, "")}/`), {
        signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - Date.now()))),
      });
      if (response.ok) {
        const payload = await response.json() as { site?: { key?: string } | null };
        if (payload.site?.key === siteKey) return true;
      }
    } catch {
      // Keep polling while the daemon restarts.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
