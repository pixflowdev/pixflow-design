import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createProcessStampArgs } from "@open-design/platform";
import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_MODES, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import type { ToolPackConfig } from "../src/config.js";

const mocks = vi.hoisted(() => ({ snapshots: vi.fn(), ipc: vi.fn(), stop: vi.fn() }));
vi.mock("@open-design/platform", async (original) => ({ ...await original<object>(), listProcessSnapshots: mocks.snapshots, stopProcesses: mocks.stop }));
vi.mock("@open-design/sidecar", async (original) => ({ ...await original<object>(), requestJsonIpc: mocks.ipc }));
const { stopPackedWinApp } = await import("../src/win/lifecycle.js");

it("waits for installed packaged processes and excludes a different namespace", async () => {
  const root = await mkdtemp(join(tmpdir(), "pixflow-stop-"));
  const processInfo = (pid: number, namespace: string) => ({ pid, ppid: 1, command: ["node", ...createProcessStampArgs({ app: APP_KEYS.DAEMON, ipc: "/tmp/test.sock", mode: SIDECAR_MODES.RUNTIME, namespace, source: SIDECAR_SOURCES.PACKAGED }, OPEN_DESIGN_SIDECAR_CONTRACT)].join(" ") });
  const owned = processInfo(100, "release-stable-win");
  const other = processInfo(200, "another-site");
  mocks.snapshots.mockResolvedValueOnce([owned, other]).mockResolvedValueOnce([owned, other]).mockResolvedValue([other]);
  mocks.ipc.mockResolvedValue({});
  try {
    const result = await stopPackedWinApp({ namespace: "release-stable-win", roots: { runtime: { namespaceRoot: root } } } as ToolPackConfig);
    expect(result.status).toBe("stopped");
    expect(result.stoppedPids).toEqual([100]);
    expect(mocks.snapshots).toHaveBeenCalledTimes(3);
    expect(mocks.stop).not.toHaveBeenCalled();
  } finally { await rm(root, { recursive: true, force: true }); }
});

