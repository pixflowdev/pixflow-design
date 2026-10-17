import { describe, expect, it } from "vitest";
import {
  access,
  chmod,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { copyBundledResourceTrees } from "../src/resources.js";
import { copyOptionalVelaCliBinary, resolveOptionalVelaCliBinary } from "../src/vela-cli.js";

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

describe("copyBundledResourceTrees", () => {
  it("bundles essential guidance at compatible targets without copying retired catalogues or personal data", async () => {
    const root = await mkdtemp(join(tmpdir(), "pixflow-tools-pack-resources-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "resources");
    const essential = [
      ["skills/agent-browser/SKILL.md", "skills/agent-browser/SKILL.md"],
      ["skills/export-download-debugging/SKILL.md", "skills/export-download-debugging/SKILL.md"],
      ["skills/web-design-guidelines/SKILL.md", "skills/web-design-guidelines/SKILL.md"],
      ["skills/writing-guidelines/SKILL.md", "skills/writing-guidelines/SKILL.md"],
      ["guidance/scenarios/od-default/open-design.json", "plugins/_official/scenarios/od-default/open-design.json"],
      ["guidance/examples/web-clone/open-design.json", "plugins/_official/examples/web-clone/open-design.json"],
      ["assets/frames/sample.txt", "frames/sample.txt"],
      ["assets/community-pets/sample/pet.json", "community-pets/sample/pet.json"],
      ["prompt-templates/image/sample.json", "prompt-templates/image/sample.json"],
      ["tools/pixflow-design-bridge/bricks-handoff-cli.mjs", "tools/pixflow-design-bridge/bricks-handoff-cli.mjs"],
    ];
    const excluded = ["craft/sample.md", "design-templates/sample/SKILL.md", "design-systems/sample/DESIGN.md",
      "plugins/_official/sample/open-design.json", "plugins/registry/community/manifest.json",
      "data/plugin-previews/manifest.json", "skills/retired/SKILL.md", ".od/app.sqlite", ".od/projects/customer/content.md"];
    try {
      for (const [source] of essential) {
        await mkdir(dirname(join(workspaceRoot, source)), { recursive: true });
        await writeFile(join(workspaceRoot, source), source);
      }
      for (const source of excluded) {
        await mkdir(dirname(join(workspaceRoot, source)), { recursive: true });
        await writeFile(join(workspaceRoot, source), source);
      }
      await mkdir(join(resourceRoot, ".od"), { recursive: true });
      await writeFile(join(resourceRoot, ".od/app.sqlite"), "existing customer data");
      await copyBundledResourceTrees({ workspaceRoot, resourceRoot, proRoot: "" });
      for (const [source, target] of essential) {
        await expect(readFile(join(resourceRoot, target), "utf8")).resolves.toBe(source);
        await expect(readFile(join(workspaceRoot, source), "utf8")).resolves.toBe(source);
      }
      for (const source of excluded) {
        if (source !== ".od/app.sqlite") await expect(access(join(resourceRoot, source))).rejects.toThrow();
        await expect(readFile(join(workspaceRoot, source), "utf8")).resolves.toBe(source);
      }
      await expect(readFile(join(resourceRoot, ".od/app.sqlite"), "utf8")).resolves.toBe("existing customer data");
      const proRoot = join(root, "private-checkout");
      for (const skill of ["web-clone", "retired"]) {
        await mkdir(join(proRoot, "skills", skill), { recursive: true });
        await writeFile(join(proRoot, "skills", skill, "SKILL.md"), skill);
      }
      await copyBundledResourceTrees({ workspaceRoot, resourceRoot, proRoot });
      await expect(readFile(join(resourceRoot, "skills/web-clone/SKILL.md"), "utf8")).resolves.toBe("web-clone");
      await expect(access(join(resourceRoot, "skills/retired/SKILL.md"))).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("copyOptionalVelaCliBinary", () => {
  it("copies the installed Vela CLI through the default npm resolver", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-installed-"));
    const resourceRoot = join(root, "resources", "open-design");
    const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";

    try {
      const copied = await copyOptionalVelaCliBinary({
        env: {},
        platform,
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", process.platform === "win32" ? "vela.exe" : "vela");
      expect(copied?.target).toBe(target);
      await expect(access(target)).resolves.toBeUndefined();
      await expect(access(join(resourceRoot, "bin", "libexec", "opencode", process.platform === "win32" ? "opencode.exe" : "opencode"))).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the POSIX resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "#!/bin/sh\necho opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "mac",
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe(
        "#!/bin/sh\necho opencode\n",
      );
      await expect(access(target, constants.X_OK)).resolves.toBeUndefined();
      await expect(access(companionTarget, constants.X_OK)).resolves.toBeUndefined();
      expect(copied).toEqual({ source, target });
      if (process.platform !== "win32") {
        expect((await stat(target)).mode & 0o111).not.toBe(0);
        expect((await stat(companionTarget)).mode & 0o111).not.toBe(0);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails strict mode when the OpenCode companion tree is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-strict-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");

      await expect(
        copyOptionalVelaCliBinary({
          env: { OPEN_DESIGN_VELA_CLI_BIN: source },
          platform: "mac",
          requireBundled: true,
          resourceRoot,
        }),
      ).rejects.toThrow(/OpenCode companion directory is missing.*OPEN_DESIGN_VELA_CLI_BIN/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies the Vela CLI binary without a companion tree in non-strict mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-nonstrict-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "mac",
        requireBundled: false,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(access(companionTarget)).rejects.toThrow();
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the Windows resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-win-"));
    const source = join(root, "source", "vela.exe");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake exe\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "fake opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "win",
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela.exe");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("fake exe\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe("fake opencode\n");
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a Vela CLI binary resolved from the npm package", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-npm-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "#!/bin/sh\necho opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => source,
        }),
        platform: "mac",
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe(
        "#!/bin/sh\necho opencode\n",
      );
      await expect(access(target, constants.X_OK)).resolves.toBeUndefined();
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("skips copying when the npm resolver reports an unsupported non-strict platform", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-skip-"));
    const resourceRoot = join(root, "resources", "open-design");

    try {
      const copied = await copyOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => null,
        }),
        platform: "linux",
        resourceRoot,
      });

      expect(copied).toBeNull();
      await expect(access(join(resourceRoot, "bin", "vela"))).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("resolveOptionalVelaCliBinary", () => {
  it("prefers OPEN_DESIGN_VELA_CLI_BIN over the npm resolver", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: "/tmp/local-vela" },
        importPackage: async () => ({
          resolveVelaCliBin: () => "/tmp/npm-vela",
        }),
      }),
    ).resolves.toBe("/tmp/local-vela");
  });

  it("fails strict mode when the resolver package is missing", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => {
          throw new Error("not installed");
        },
        requireBundled: true,
      }),
    ).rejects.toThrow(/@powerformer\/vela-cli.*OPEN_DESIGN_VELA_CLI_BIN/);
  });

  it("fails strict mode when the resolver returns no binary", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => ({ supported: false }),
        }),
        requireBundled: true,
      }),
    ).rejects.toThrow(/@powerformer\/vela-cli.*OPEN_DESIGN_VELA_CLI_BIN/);
  });

  it("returns null in non-strict mode when the resolver package is missing", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => {
          throw new Error("not installed");
        },
      }),
    ).resolves.toBeNull();
  });
});
