import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('website hotfix versions preserve the compatible standalone Bridge and directory candidate', () => {
  const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const main = read('pixflow-design.php');
  const version = main.match(/Version: (\S+)/)?.[1];
  assert.equal(version, '2.0.8');
  assert.ok(main.includes("define('PIXFLOW_DESIGN_VERSION', '" + version + "')"));
  const bridgeVersion = main.match(/define\('PIXFLOW_DESIGN_BRIDGE_VERSION', '([^']+)'\)/)?.[1];
  assert.equal(bridgeVersion, '2.0.6');
  assert.ok(read('tools/pixflow-design-bridge/pixflow-design-bridge.mjs').includes("const VERSION = '" + bridgeVersion + "'"));
  assert.ok(read('readme.txt').includes('Stable tag: ' + version));
  assert.ok(read('wordpress/directory/readme.txt').includes('Stable tag: 2.0.6'));
});
