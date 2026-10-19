import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('release plugin and required Bridge versions agree with the standalone Bridge', () => {
  const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const main = read('pixflow-design.php');
  const version = main.match(/Version: (\S+)/)?.[1];
  assert.equal(version, '2.0.6');
  assert.ok(main.includes("define('PIXFLOW_DESIGN_VERSION', '" + version + "')"));
  assert.ok(main.includes("define('PIXFLOW_DESIGN_BRIDGE_VERSION', '" + version + "')"));
  assert.ok(read('tools/pixflow-design-bridge/pixflow-design-bridge.mjs').includes("const VERSION = '" + version + "'"));
  for (const file of ['readme.txt', 'wordpress/directory/readme.txt']) assert.ok(read(file).includes('Stable tag: ' + version));
});
