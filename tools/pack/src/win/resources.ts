import { createHash } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { BUNDLED_RESOURCE_TREES, copyBundledResourceTrees, winResources } from "../resources.js";
import {
  copyOptionalVelaCliBinary,
  resolveOptionalVelaCliBinary,
  resolveOptionalVelaCliOpenCodeCompanionTree,
} from "../vela-cli.js";
import type { WinPaths, ResourceTreeCacheMetadata } from "./types.js";
import { PRODUCT_BRIDGE_TRAY_MODE } from "./constants.js";

const RESOURCE_TREE_CACHE_SCHEMA_VERSION = 8;
const bridgeNodeVersion = "24.22.3";
const bridgeNodeFiles = [
  {
    name: "node.exe",
    url: `https://nodejs.org/dist/v${bridgeNodeVersion}/win-x64/node.exe`,
    sha256: "86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6",
  },
  {
    name: "node-LICENSE.txt",
    url: `https://raw.githubusercontent.com/nodejs/node/v${bridgeNodeVersion}/LICENSE`,
    sha256: "5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace",
  },
];

async function createResourceTreeCacheKey(config: ToolPackConfig): Promise<string> {
  const velaCliBin = await resolveOptionalVelaCliBinary({
    requireBundled: config.requireVelaCli,
  });
  const velaOpenCodeCompanion =
    velaCliBin == null
      ? null
      : await resolveOptionalVelaCliOpenCodeCompanionTree(velaCliBin);
  return hashJson({
    bundledResources: await Promise.all(BUNDLED_RESOURCE_TREES.map(async entry => ({
      from: entry.from,
      to: entry.to,
      hash: await hashPath(join(config.workspaceRoot, entry.from)),
    }))),
    node: "win.resource-tree",
    bridgeNode: PRODUCT_BRIDGE_TRAY_MODE ? bridgeNodeFiles : null,
    schemaVersion: RESOURCE_TREE_CACHE_SCHEMA_VERSION,
    proWebClone: process.env.PIXFLOW_DESIGN_PRO_ROOT
      ? await hashPath(join(resolve(process.env.PIXFLOW_DESIGN_PRO_ROOT), "skills", "web-clone"))
      : null,
    sevenZipDll: await hashPath(winResources.sevenZipDll),
    sevenZipExe: await hashPath(winResources.sevenZipExe),
    requireVelaCli: config.requireVelaCli,
    velaCliBin: velaCliBin ? await hashPath(velaCliBin) : null,
    velaOpenCodeCompanion: velaOpenCodeCompanion
      ? await hashPath(velaOpenCodeCompanion)
      : null,
  });
}

export type ResourceTreeResult = {
  key: string;
  resourceRoot: string;
};

export async function prepareResourceTree(
  config: ToolPackConfig,
  paths: WinPaths,
  cache: ToolPackCache,
  options: { materialize: boolean },
): Promise<ResourceTreeResult> {
  const key = await createResourceTreeCacheKey(config);
  const node = {
    id: "win.resource-tree",
    key,
    outputs: ["open-design"],
    invalidate: async () => null,
    build: async ({ entryRoot }: { entryRoot: string }): Promise<ResourceTreeCacheMetadata> => {
      const resourceRoot = join(entryRoot, "open-design");
      await mkdir(resourceRoot, { recursive: true });
      await copyBundledResourceTrees({
        workspaceRoot: config.workspaceRoot,
        resourceRoot,
      });
      await mkdir(join(resourceRoot, "bin"), { recursive: true });
      await cp(winResources.sevenZipExe, join(resourceRoot, "bin", "7z.exe"));
      await cp(winResources.sevenZipDll, join(resourceRoot, "bin", "7z.dll"));
      if (PRODUCT_BRIDGE_TRAY_MODE) {
        await Promise.all(bridgeNodeFiles.map(async ({ name, url, sha256 }) => {
          const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) throw new Error(`Could not download Bridge runtime file ${name}: HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
            throw new Error(`Bridge runtime checksum mismatch: ${name}`);
          }
          await writeFile(join(resourceRoot, "bin", name), bytes);
        }));
      }
      await copyOptionalVelaCliBinary({
        platform: "win",
        requireBundled: config.requireVelaCli,
        resourceRoot,
      });
      return { resourceName: "open-design" };
    },
  };
  const manifest = await cache.acquire({
    materialize: options.materialize ? [{ from: "open-design", to: paths.resourceRoot }] : [],
    node,
  });
  return {
    key,
    resourceRoot: options.materialize ? paths.resourceRoot : join(manifest.entryPath, "open-design"),
  };
}

export async function copyWinIcon(paths: WinPaths): Promise<void> {
  await mkdir(dirname(paths.winIconPath), { recursive: true });
  await cp(winResources.icon, paths.winIconPath);
}
