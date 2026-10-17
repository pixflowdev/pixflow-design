import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { WIN_PREBUNDLE_RUNTIME_DEPENDENCIES } from "../../../tools/pack/src/win-prebundle.js";
import { MAC_PREBUNDLE_RUNTIME_DEPENDENCIES } from "../../../tools/pack/src/mac-prebundle.js";

const root = new URL("../../../", import.meta.url);
const manifest = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const packRequire = createRequire(new URL("tools/pack/package.json", root));
const rebuildRequire = createRequire(packRequire.resolve("@electron/rebuild"));

describe("packaged Electron compatibility", () => {
  it("[P1] ships the same native SQLite version that the daemon tests use", () => {
    const version = manifest("apps/daemon/package.json").dependencies["better-sqlite3"];
    expect(WIN_PREBUNDLE_RUNTIME_DEPENDENCIES["better-sqlite3"]).toBe(version);
    expect(MAC_PREBUNDLE_RUNTIME_DEPENDENCIES["better-sqlite3"]).toBe(version);
  });
  it("[P1] uses the same exact runtime in the desktop and packaged shell", () => {
    const desktop = manifest("apps/desktop/package.json").devDependencies.electron;
    const packaged = manifest("apps/packaged/package.json").devDependencies.electron;
    expect(desktop).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packaged).toBe(desktop);
  });

  it("[P1] can resolve the selected Electron ABI before rebuilding native SQLite", async () => {
    const { getAbi } = await import(pathToFileURL(rebuildRequire.resolve("node-abi")).href);
    const version = manifest("apps/desktop/package.json").devDependencies.electron;
    expect(getAbi(version, "electron")).toMatch(/^\d+$/);
  });
});
