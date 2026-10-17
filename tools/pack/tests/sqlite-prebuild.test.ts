import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageSqlitePrebuild } from "../src/sqlite-prebuild.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(version = "13.0.3") {
  const root = await mkdtemp(join(tmpdir(), "pixflow-sqlite-prebuild-"));
  roots.push(root);
  const module = join(root, "node_modules", "better-sqlite3");
  await mkdir(join(module, "prebuilds"), { recursive: true });
  await writeFile(join(module, "package.json"), JSON.stringify({ version }));
  for (const target of ["win32-x64", "darwin-x64", "darwin-arm64", "linux-x64"]) {
    await writeFile(join(module, "prebuilds", `${target}.node`), Buffer.alloc(100_001, target.length));
  }
  return { root, module };
}

describe("SQLite Node-API packaging", () => {
  it.each([["win32", "x64"], ["darwin", "x64"], ["darwin", "arm64"]] as const)(
    "stages only %s/%s and preserves the verified output path", async (platform, arch) => {
      const { root, module } = await fixture();
      const target = `${platform}-${arch}.node`;
      const before = await readFile(join(module, "prebuilds", target));
      expect(await stageSqlitePrebuild(root, platform, arch)).toBe(true);
      expect(await readdir(join(module, "prebuilds"))).toEqual([target]);
      expect(await readFile(join(module, "build", "Release", "better_sqlite3.node"))).toEqual(before);
      expect(await stageSqlitePrebuild(root, platform, arch)).toBe(true);
    },
  );
  it("fails without discarding other binaries if the target is absent", async () => {
    const { root, module } = await fixture();
    await expect(stageSqlitePrebuild(root, "win32", "arm64")).rejects.toThrow();
    expect(await readdir(join(module, "prebuilds"))).toHaveLength(4);
  });
  it("rejects a truncated target and unsupported architectures", async () => {
    const { root, module } = await fixture();
    await writeFile(join(module, "prebuilds", "win32-x64.node"), "broken");
    await expect(stageSqlitePrebuild(root, "win32", "x64")).rejects.toThrow("invalid");
    await expect(stageSqlitePrebuild(root, "darwin", "ia32")).rejects.toThrow("Unsupported");
  });
  it("leaves older ABI-based packages to the existing rebuilder", async () => {
    const { root, module } = await fixture("12.10.0");
    expect(await stageSqlitePrebuild(root, "win32", "x64")).toBe(false);
    expect(await readdir(join(module, "prebuilds"))).toHaveLength(4);
  });
});
