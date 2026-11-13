import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execFileAsync } from "./commands.js";

export const MAC_BRIDGE_NODE_PATH = "open-design/bin/node";
const version = "24.22.3";

// https://nodejs.org/dist/v24.22.3/SHASUMS256.txt
const archiveChecksums = {
  arm64: "ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd",
  x64: "977614af0504c81045e7fd85596dbca0e5f951b96681516dadafedcca8c447f7",
} as const;

export async function bundleMacBridgeNode(resourceRoot: string, arch: string): Promise<void> {
  if (arch !== "arm64" && arch !== "x64") {
    throw new Error(`Unsupported Mac Bridge Node architecture: ${arch}`);
  }

  const distribution = `node-v${version}-darwin-${arch}`;
  const archiveName = `${distribution}.tar.gz`;
  const response = await fetch(`https://nodejs.org/dist/v${version}/${archiveName}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Could not download ${archiveName}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== archiveChecksums[arch]) {
    throw new Error(`Mac Bridge Node checksum mismatch: ${archiveName}`);
  }

  const staging = await mkdtemp(join(tmpdir(), "pixflow-mac-node-"));
  try {
    const archive = join(staging, archiveName);
    await writeFile(archive, bytes);
    await execFileAsync("tar", ["-xzf", archive, "-C", staging, `${distribution}/bin/node`, `${distribution}/LICENSE`]);
    const bin = join(resourceRoot, "bin");
    await mkdir(bin, { recursive: true });
    await copyFile(join(staging, distribution, "bin", "node"), join(bin, "node"));
    await chmod(join(bin, "node"), 0o755);
    await copyFile(join(staging, distribution, "LICENSE"), join(bin, "node-LICENSE.txt"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
