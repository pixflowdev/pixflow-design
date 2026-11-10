import { existsSync, readFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stageNativeTransport } from './native-transport.js';

function resolveToolsPackRoot(startDir: string): string {
  const maxDepth = 6;
  let current = startDir;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    try {
      const raw = readFileSync(join(current, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as { name?: unknown };
      if (parsed.name === "@open-design/tools-pack") {
        return current;
      }
    } catch {
      // Keep walking until we find the tools-pack package root.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`tools-pack: unable to resolve package root from ${startDir}`);
}

export const toolsPackRoot = resolveToolsPackRoot(dirname(fileURLToPath(import.meta.url)));
export const resourcesRoot = join(toolsPackRoot, "resources");

export const macResources = {
  entitlements: join(resourcesRoot, "mac", "entitlements.mac.plist"),
  entitlementsInherit: join(resourcesRoot, "mac", "entitlements.mac.inherit.plist"),
  icon: process.env.PIXFLOW_DESIGN_PACK_MAC_ICON?.trim()
    ? resolve(process.env.PIXFLOW_DESIGN_PACK_MAC_ICON.trim())
    : join(resourcesRoot, "mac", "icon.icns"),
  iconPng: process.env.PIXFLOW_DESIGN_PACK_MAC_ICON_PNG?.trim()
    ? resolve(process.env.PIXFLOW_DESIGN_PACK_MAC_ICON_PNG.trim())
    : join(resourcesRoot, "mac", "icon.png"),
  notarizeHook: join(resourcesRoot, "mac", "notarize.cjs"),
  webStandaloneAfterPackHook: join(resourcesRoot, "web-standalone-after-pack.cjs"),
} as const;

export const winResources = {
  icon: process.env.PIXFLOW_DESIGN_PACK_WIN_ICON?.trim()
    ? resolve(process.env.PIXFLOW_DESIGN_PACK_WIN_ICON.trim())
    : join(resourcesRoot, "win", "icon.ico"),
  sevenZipDll: join(resourcesRoot, "win", "7zip", "7z.dll"),
  sevenZipExe: join(resourcesRoot, "win", "7zip", "7z.exe"),
  webStandaloneAfterPackHook: join(resourcesRoot, "web-standalone-after-pack.cjs"),
} as const;

export const linuxResources = {
  icon: join(resourcesRoot, "linux", "icon.png"),
  desktopTemplate: join(resourcesRoot, "linux", "open-design.desktop.template"),
} as const;

// Source guidance is intentionally separate from the retired catalogue. Keep
// package paths stable for saved workflow identifiers and installed runtimes.
export const BUNDLED_RESOURCE_TREES = [
  ...["agent-browser", "export-download-debugging", "web-design-guidelines", "writing-guidelines"]
    .map(name => ({ from: join("skills", name), to: join("skills", name) })),
  { from: join("guidance", "scenarios", "od-default"), to: join("plugins", "_official", "scenarios", "od-default") },
  { from: join("guidance", "examples", "web-clone"), to: join("plugins", "_official", "examples", "web-clone") },
  { from: join("assets", "frames"), to: "frames" },
  { from: join("assets", "community-pets"), to: "community-pets" },
  { from: "prompt-templates", to: "prompt-templates" },
  // The Bridge daemon uses the same relative runner path in source and packages.
  { from: join("tools", "pixflow-design-bridge"), to: join("tools", "pixflow-design-bridge") },
] as const;

export async function copyBundledResourceTrees({
  workspaceRoot,
  resourceRoot,
  proRoot = process.env.PIXFLOW_DESIGN_PRO_ROOT,
}: {
  workspaceRoot: string;
  resourceRoot: string;
  proRoot?: string;
}): Promise<void> {
  for (const entry of BUNDLED_RESOURCE_TREES) {
    await cp(join(workspaceRoot, entry.from), join(resourceRoot, entry.to), {
      recursive: true,
      // Development extension configuration is never an installer payload.
      // Native runtime staging is explicit; retain existing Bridge entrypoints.
      filter: source => {
        const path = relative(join(workspaceRoot, "tools", "pixflow-design-bridge"), source).replaceAll("\\", "/");
        return !/^(native-messaging|tests)(\/|$)/.test(path);
      },
    });
  }
  await stageNativeTransport(resourceRoot);
  if (proRoot) {
    const source = join(resolve(proRoot), 'skills', 'web-clone');
    if (!existsSync(source)) throw new Error(`The paired Pro checkout is missing Bridge workflow skills: ${source}`);
    await cp(source, join(resourceRoot, 'skills', 'web-clone'), { recursive: true });
  }
}
