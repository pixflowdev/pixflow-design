import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectLogSource, findCrashDumps } from "../src/sources.js";
import { buildDiagnosticsZip } from "../src/zip.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-crash-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const RAW_DUMP_BYTES = Buffer.from([0x4d, 0x44, 0x4d, 0x50, 0x00, 0xff, 0xfe, 0x80, 0x81]);

describe("crash dump diagnostics", () => {
  it("finds only dmp files in Electron crash directories", async () => {
    await writeFile(join(tempDir, "a.dmp"), RAW_DUMP_BYTES);
    await mkdir(join(tempDir, "completed"), { recursive: true });
    await writeFile(join(tempDir, "completed", "b.dmp"), RAW_DUMP_BYTES);
    await writeFile(join(tempDir, "notes.txt"), "not a dump");

    const sources = await findCrashDumps({ dir: tempDir });
    expect(sources.map((source) => source.name).sort()).toEqual([
      "crash-dumps/a.dmp",
      "crash-dumps/b.dmp",
    ]);
    expect(sources.every((source) => source.kind === "binary")).toBe(true);
  });

  it("copies binary dump bytes verbatim", async () => {
    const dumpPath = join(tempDir, "crash.dmp");
    await writeFile(dumpPath, RAW_DUMP_BYTES);
    const collected = await collectLogSource({
      name: "crash-dumps/crash.dmp",
      absolutePath: dumpPath,
      kind: "binary",
    });
    expect(collected.content).toEqual(RAW_DUMP_BYTES);
  });

  it("includes intact minidumps in the diagnostics zip", async () => {
    await writeFile(join(tempDir, "renderer.dmp"), RAW_DUMP_BYTES);
    const result = await buildDiagnosticsZip({
      context: { app: { name: "pixflow-design", packaged: true }, source: "test" },
      sources: [],
      crashDumps: { dir: tempDir },
    });
    const zip = await JSZip.loadAsync(result.zip);
    const bytes = Buffer.from(await zip.file("crash-dumps/renderer.dmp")!.async("uint8array"));
    expect(bytes).toEqual(RAW_DUMP_BYTES);
  });
});
