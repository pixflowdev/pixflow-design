import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { prepareResourceTree } from "../src/win/resources.js";
import type { WinPaths } from "../src/win/types.js";

async function writeFakeOpenCodeCompanion(
  source: string,
  content = "#!/bin/sh\nexit 0\n",
): Promise<string> {
  const companion = join(dirname(source), "libexec", "opencode", "opencode");
  await mkdir(dirname(companion), { recursive: true });
  await writeFile(companion, content, "utf8");
  await chmod(companion, 0o755);
  return companion;
}

async function createWorkspaceFixture(workspaceRoot: string): Promise<void> {
  for (const source of ["skills/agent-browser", "skills/export-download-debugging", "skills/web-design-guidelines", "skills/writing-guidelines", "guidance/scenarios/od-default", "guidance/examples/web-clone"]) {
    await mkdir(join(workspaceRoot, source), { recursive: true });
  }
  await mkdir(join(workspaceRoot, "assets", "frames"), { recursive: true });
  await mkdir(join(workspaceRoot, "assets", "community-pets", "sample"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "prompt-templates", "image"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "tools", "pixflow-design-bridge"), {
    recursive: true,
  });
  await writeFile(
    join(workspaceRoot, "tools", "pixflow-design-bridge", "bricks-handoff-cli.mjs"),
    "#!/usr/bin/env node\n",
    "utf8",
  );
  await mkdir(join(workspaceRoot, "data", "plugin-previews"), {
    recursive: true,
  });
  await writeFile(
    join(workspaceRoot, "data", "plugin-previews", "manifest.json"),
    "{\"previews\":{}}\n",
    "utf8",
  );
  await mkdir(join(workspaceRoot, "plugins", "registry", "official"), {
    recursive: true,
  });
}

describe("prepareResourceTree", () => {
  it("invalidates the Windows resource cache when essential guidance changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "pixflow-win-guidance-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const source = join(workspaceRoot, "guidance/examples/web-clone/open-design.json");
    const target = join(resourceRoot, "plugins/_official/examples/web-clone/open-design.json");
    try {
      await createWorkspaceFixture(workspaceRoot);
      await writeFile(source, "version one");
      await prepareResourceTree(config, paths, cache, { materialize: true });
      await expect(readFile(target, "utf8")).resolves.toBe("version one");
      await writeFile(source, "version two");
      await prepareResourceTree(config, paths, cache, { materialize: true });
      await expect(readFile(target, "utf8")).resolves.toBe("version two");
      expect(cache.report().entries.map(entry => entry.status)).toEqual(["miss", "miss"]);
    } finally { await rm(root, { force: true, recursive: true }); }
  });

  it("ignores retired catalogues in the Windows resource cache and package", async () => {
    const root = await mkdtemp(join(tmpdir(), "pixflow-win-retired-resources-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const retired = ["craft/sample.md", "design-templates/sample/SKILL.md", "design-systems/sample/DESIGN.md",
      "plugins/_official/sample/open-design.json", "plugins/registry/sample.json", "data/plugin-previews/manifest.json", "skills/retired/SKILL.md"];
    try {
      await createWorkspaceFixture(workspaceRoot);
      for (const source of retired) {
        await mkdir(dirname(join(workspaceRoot, source)), { recursive: true });
        await writeFile(join(workspaceRoot, source), "version one");
      }
      await prepareResourceTree(config, paths, cache, { materialize: true });
      for (const source of retired) await writeFile(join(workspaceRoot, source), "version two");
      await prepareResourceTree(config, paths, cache, { materialize: true });
      for (const source of retired) {
        await expect(access(join(resourceRoot, source))).rejects.toThrow();
        await expect(readFile(join(workspaceRoot, source), "utf8")).resolves.toBe("version two");
      }
      expect(cache.report().entries.map(entry => entry.status)).toEqual(["miss", "hit"]);
    } finally { await rm(root, { force: true, recursive: true }); }
  });

  it("invalidates only for the explicitly paired Pro Bridge skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "pixflow-win-pro-guidance-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const proRoot = join(root, "private");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalProRoot = process.env.PIXFLOW_DESIGN_PRO_ROOT;
    try {
      await createWorkspaceFixture(workspaceRoot);
      for (const skill of ["web-clone", "retired"]) {
        await mkdir(join(proRoot, "skills", skill), { recursive: true });
        await writeFile(join(proRoot, "skills", skill, "SKILL.md"), "version one");
      }
      process.env.PIXFLOW_DESIGN_PRO_ROOT = proRoot;
      await prepareResourceTree(config, paths, cache, { materialize: true });
      await writeFile(join(proRoot, "skills/retired/SKILL.md"), "version two");
      await prepareResourceTree(config, paths, cache, { materialize: true });
      await writeFile(join(proRoot, "skills/web-clone/SKILL.md"), "version two");
      await prepareResourceTree(config, paths, cache, { materialize: true });
      await expect(readFile(join(resourceRoot, "skills/web-clone/SKILL.md"), "utf8")).resolves.toBe("version two");
      await expect(access(join(resourceRoot, "skills/retired/SKILL.md"))).rejects.toThrow();
      expect(cache.report().entries.map(entry => entry.status)).toEqual(["miss", "hit", "miss"]);
    } finally {
      if (originalProRoot == null) delete process.env.PIXFLOW_DESIGN_PRO_ROOT;
      else process.env.PIXFLOW_DESIGN_PRO_ROOT = originalProRoot;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the Windows resource tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const source = join(root, "source", "vela.exe");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;

    try {
      await createWorkspaceFixture(workspaceRoot);
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake vela exe\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "fake opencode\n");
      process.env.OPEN_DESIGN_VELA_CLI_BIN = source;

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(join(resourceRoot, "bin", "vela.exe"), "utf8")).resolves.toBe(
        "fake vela exe\n",
      );
      await expect(
        readFile(join(resourceRoot, "bin", "libexec", "opencode", "opencode"), "utf8"),
      ).resolves.toBe("fake opencode\n");
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails strict Windows resource preparation when configured Vela CLI is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-strict-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = {
      workspaceRoot,
      requireVelaCli: true,
    } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;

    try {
      await createWorkspaceFixture(workspaceRoot);
      process.env.OPEN_DESIGN_VELA_CLI_BIN = join(root, "missing", "vela.exe");
      await expect(
        prepareResourceTree(config, paths, cache, { materialize: true }),
      ).rejects.toThrow();
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invalidates the Windows resource tree cache when the Vela companion changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-companion-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const source = join(root, "source", "vela.exe");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;
    const materializedCompanion = join(
      resourceRoot,
      "bin",
      "libexec",
      "opencode",
      "opencode",
    );

    try {
      await createWorkspaceFixture(workspaceRoot);
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake vela exe\n", "utf8");
      const sourceCompanion = await writeFakeOpenCodeCompanion(source, "companion one\n");
      process.env.OPEN_DESIGN_VELA_CLI_BIN = source;

      await prepareResourceTree(config, paths, cache, { materialize: true });
      await expect(readFile(materializedCompanion, "utf8")).resolves.toBe(
        "companion one\n",
      );

      await writeFile(sourceCompanion, "companion two\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedCompanion, "utf8")).resolves.toBe(
        "companion two\n",
      );
      expect(cache.report().entries.map((entry) => entry.status)).toEqual([
        "miss",
        "miss",
      ]);
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  });
});
