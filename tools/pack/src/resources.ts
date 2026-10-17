import { existsSync, readFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const BUNDLED_RESOURCE_TREES = [
  { from: "skills", to: "skills" },
  // After the skills/design-templates split (specs/current/skills-and-design-templates.md)
  // the rendering catalogue lives under its own root and the daemon
  // resolves it via DESIGN_TEMPLATES_DIR. Bundle it like any other
  // first-class resource so packaged builds carry the full template set.
  { from: "design-templates", to: "design-templates" },
  { from: "design-systems", to: "design-systems" },
  { from: "craft", to: "craft" },
  { from: join("plugins", "_official"), to: join("plugins", "_official") },
  { from: join("plugins", "registry"), to: join("plugins", "registry") },
  { from: join("assets", "frames"), to: "frames" },
  { from: join("assets", "community-pets"), to: "community-pets" },
  { from: "prompt-templates", to: "prompt-templates" },
  // Pixflow-owned: the packaged bridge daemon shells out to this runner for
  // Bricks Ask/Design, HTML-to-Bricks, and Pixflow Library handoff flows.
  // Keep it in the same relative tools/ path the dev daemon uses so packaged
  // installs do not silently lose the CLI runner.
  { from: join("tools", "pixflow-design-bridge"), to: join("tools", "pixflow-design-bridge") },
  // Baked plugin-preview manifest. The gallery's pre-rendered hover-pan clips
  // live on R2; the daemon needs this checked-in manifest to map each plugin to
  // its clip (it serves clips from R2 when the files aren't on disk, which is the
  // packaged case). Without it the packaged daemon reads an empty manifest and the
  // gallery falls back to live, GPU-expensive iframes instead of the baked clips.
  { from: join("data", "plugin-previews"), to: join("data", "plugin-previews") },
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
    });
  }
  if (proRoot) {
    const source = join(resolve(proRoot), 'skills');
    if (!existsSync(source)) throw new Error(`The paired Pro checkout is missing Bridge workflow skills: ${source}`);
    await cp(source, join(resourceRoot, 'skills'), { recursive: true });
  }
}
