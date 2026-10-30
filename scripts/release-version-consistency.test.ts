import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('release versions align the plugin and standalone Bridge without changing the directory candidate', () => {
  const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const main = read('pixflow-design.php');
  const version = main.match(/Version: (\S+)/)?.[1];
  assert.equal(version, '2.1.3');
  assert.ok(main.includes("define('PIXFLOW_DESIGN_VERSION', '" + version + "')"));
  const bridgeVersion = main.match(/define\('PIXFLOW_DESIGN_BRIDGE_VERSION', '([^']+)'\)/)?.[1];
  assert.equal(bridgeVersion, '2.1.3');
  assert.ok(read('tools/pixflow-design-bridge/pixflow-design-bridge.mjs').includes("const VERSION = '" + bridgeVersion + "'"));
  assert.ok(read('readme.txt').includes('Stable tag: ' + version));
  assert.ok(read('wordpress/directory/readme.txt').includes('Stable tag: 2.0.6'));
});

