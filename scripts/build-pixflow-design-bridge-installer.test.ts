import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (await readFile(
  new URL("./build-pixflow-design-bridge-installer.mjs", import.meta.url),
  "utf8",
)).replace(/\r\n/g, "\n");

test("stops the previous unpacked bridge namespace before deleting build output", () => {
  const toolsPackBuild = source.indexOf(
    "runChecked('pnpm', ['--filter', '@open-design/tools-pack', 'build']",
  );
  const namespaceStop = source.indexOf("'stop',\n  '--dir',\n  packRoot,\n  '--namespace',\n  namespace");
  const namespaceCleanup = source.indexOf("await removeTree(namespaceRoot)");

  assert.ok(toolsPackBuild >= 0, "tools-pack must be built before lifecycle use");
  assert.ok(namespaceStop > toolsPackBuild, "the namespace stop must use the freshly built tool");
  assert.ok(namespaceCleanup > namespaceStop, "the namespace must be stopped before output cleanup");
});

test("uses extended Windows deletion retries for transient filesystem locks", () => {
  assert.match(source, /maxRetries:\s*20/);
  assert.match(source, /retryDelay:\s*250/);
  assert.match(source, /'EACCES'.*'EBUSY'.*'ENOTEMPTY'.*'EPERM'.*'UNKNOWN'/s);
});

test("short pack roots apply consistently to stop, build and output cleanup", () => {
  assert.match(source, /process\.env\.PIXFLOW_DESIGN_BRIDGE_PACK_DIR/);
  assert.equal(source.match(/'--dir',\n  packRoot,/g)?.length, 2);
  assert.match(source, /const namespaceRoot = join\(packRoot, 'out'/);
});