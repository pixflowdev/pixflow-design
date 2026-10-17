import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import type { StopProcessesResult, stopProcesses, waitForProcessExit } from "@open-design/platform";

import { inspectExistingDesktopForLauncher, waitForLauncherAfterQuit } from "../src/launcher-after-quit.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

function fakeStopResult(pid: number, options: { forced?: boolean; survived?: boolean } = {}): StopProcessesResult {
  return {
    alreadyStopped: false,
    forcedPids: options.forced ? [pid] : [],
    matchedPids: [pid],
    remainingPids: options.survived ? [pid] : [],
    stoppedPids: options.survived ? [] : [pid],
  };
}

const neverExits = (async () => false) as typeof waitForProcessExit;

function fakeStop(pid: number, options: { forced?: boolean; survived?: boolean } = {}) {
  return vi.fn(async () => fakeStopResult(pid, options)) as unknown as typeof stopProcesses;
}

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    desktopIdentityPath: join(root, "runtime", "desktop-root.json"),
    desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"),
    electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"),
    headlessIdentityPath: join(root, "runtime", "headless-root.json"),
    installationRoot: root,
    installerObservationRoot: join(root, "data", "observations", "installer"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources", "open-design"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

describe("waitForLauncherAfterQuit", () => {
  it("logs and returns when the old pid is already gone", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-"));
    try {
      const paths = fakePaths(root);

      await waitForLauncherAfterQuit({ targetPid: 999999, timeoutMs: 1000 }, paths);

      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("armed targetPid=999999 timeoutMs=1000");
      expect(log).toContain("observed-exit targetPid=999999");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("logs and warns on timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-timeout-"));
    const logger = { warn: vi.fn() };
    try {
      const paths = fakePaths(root);

      const stop = fakeStop(process.pid);
      await waitForLauncherAfterQuit({ targetPid: process.pid, timeoutMs: 1 }, paths, logger, {
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain(`armed targetPid=${process.pid} timeoutMs=1`);
      expect(log).toContain(`timed-out targetPid=${process.pid}; forcing stop`);
      expect(log).toContain(`force-stop after-quit-timeout pid=${process.pid} outcome=sigterm`);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`timed-out targetPid=${process.pid}`));
      expect(stop).toHaveBeenCalledWith([process.pid]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("inspectExistingDesktopForLauncher", () => {
  it("focuses an existing namespace desktop and exits", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-focus-"));
    const requests: Array<{ message: unknown; timeoutMs?: number }> = [];
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        paths,
        requestIpc: (async (ipcPath: string, message: unknown, options?: { timeoutMs?: number }) => {
          requests.push({ message, timeoutMs: options?.timeoutMs });
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon") || ipcPath.includes("web")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "exit", reason: "existing-focused" });
      expect(requests.map((request) => request.message)).toEqual([
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.SHOW },
      ]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("inspect-found-existing namespace=release-beta-win focus=accepted");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("continues when inspect cannot reach desktop", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-failed-"));
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        paths,
        requestIpc: (async () => {
          throw new Error("pipe closed");
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "continue", reason: "inspect-failed" });
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("inspect-unavailable namespace=release-beta-win action=continue error=pipe closed");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("exits without launching a duplicate when focus fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-focus-failed-"));
    const logger = { warn: vi.fn() };
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        logger,
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon") || ipcPath.includes("web")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          throw new Error("show rejected");
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "exit", reason: "existing-focus-failed" });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("focus=failed"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("restarts when an existing desktop has a stale sidecar", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-stale-"));
    const stop = fakeStop(1234, { forced: true });
    try {
      const paths = fakePaths(root);
      const result = await inspectExistingDesktopForLauncher("release-stable-win", {
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            if (ipcPath.includes("web")) throw new Error("web pipe missing");
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      expect(result).toEqual({ action: "continue", reason: "stale-sidecar" });
      expect(stop).toHaveBeenCalledWith([1234]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("action=restart reason=stale-sidecar apps=web pid=1234");
      expect(log).toContain("force-stop stale-sidecar pid=1234 outcome=sigkill");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

it("focuses a tray Bridge without probing nonexistent root sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "bridge-launch-focus-"));
  const requestIpc = vi.fn(async (_path: string, message: any) => {
    if (message.type === SIDECAR_MESSAGES.STATUS) return { state: "running", pid: 1234 };
    return { accepted: true };
  });
  try {
    const result = await inspectExistingDesktopForLauncher("bridge-test", {
      paths: fakePaths(root), bridgeTrayMode: true, requestIpc: requestIpc as any,
      waitForExit: vi.fn(async () => true), stopProcesses: vi.fn() as any,
    });
    expect(result).toEqual({ action: "exit", reason: "existing-focused" });
    expect(requestIpc.mock.calls.map(([, message]) => message.type)).toEqual([
      SIDECAR_MESSAGES.STATUS, SIDECAR_MESSAGES.SHOW,
    ]);
  } finally { await rm(root, { force: true, recursive: true }); }
});
