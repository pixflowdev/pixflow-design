import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/** Stage the official Node-API binding for the target, never a host/foreign binary.
 * SQLite 13 ships its prebuilds in the npm package; Electron ABI rebuilds are
 * unnecessary. Retain the established output path used by package verification.
 */
export async function stageSqlitePrebuild(appRoot: string, platform: "win32" | "darwin", arch: string): Promise<boolean> {
  const moduleRoot = join(appRoot, "node_modules", "better-sqlite3");
  let manifest: { version?: string };
  try {
    manifest = JSON.parse(await readFile(join(moduleRoot, "package.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (Number(manifest.version?.split(".")[0]) < 13 || !manifest.version) return false;
  if (arch !== "x64" && arch !== "arm64") throw new Error(`Unsupported SQLite prebuild architecture: ${arch}`);
  const prebuilds = join(moduleRoot, "prebuilds");
  const selected = `${platform}-${arch}.node`;
  const source = join(prebuilds, selected);
  const metadata = await stat(source);
  if (!metadata.isFile() || metadata.size < 100_000) throw new Error(`SQLite prebuild is missing or invalid: ${source}`);
  const output = join(moduleRoot, "build", "Release");
  await mkdir(output, { recursive: true });
  await copyFile(source, join(output, "better_sqlite3.node"));
  for (const entry of await readdir(prebuilds, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".node") && entry.name !== selected) await rm(join(prebuilds, entry.name));
  }
  return true;
}
