import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { app, crashReporter } from "electron";

/** Start on-device minidump capture before any renderer is created. */
export function setUpDesktopCrashReporter(crashDumpsDir: string): void {
  try {
    mkdirSync(crashDumpsDir, { recursive: true });
    app.setPath("crashDumps", crashDumpsDir);
  } catch {
    // Best-effort diagnostics must never block desktop startup.
  }
  try {
    crashReporter.start({ uploadToServer: false, compress: false });
  } catch {
    // Dumps remain on-device and are only shared through explicit export.
  }
}

/** Snapshot GPU/runtime facts needed to diagnose native renderer crashes. */
export async function writeDesktopGpuInfo(path: string): Promise<void> {
  try {
    const gpuFeatureStatus = app.getGPUFeatureStatus();
    const gpuInfo = await app.getGPUInfo("basic").catch(() => null);
    const payload = {
      capturedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      gpuFeatureStatus,
      gpuInfo,
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // Best-effort diagnostics must never block desktop startup.
  }
}
