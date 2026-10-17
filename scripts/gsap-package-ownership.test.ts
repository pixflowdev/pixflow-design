import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

test('only Pro packages the exact saved-page motion runtimes, including its integrity inventory', async () => {
  const output = process.env.PIXFLOW_DESIGN_PACKAGE_OUTPUT_DIR || 'dist';
  const free = await JSZip.loadAsync(await readFile(join(output, 'pixflow-ai.zip')));
  const pro = await JSZip.loadAsync(await readFile(join(output, 'pixflow-design-pro.zip')));
  assert.equal(Object.keys(free.files).some(path => path.startsWith('pixflow-ai/assets/vendor/gsap/')), false);
  const inventory = JSON.parse(await pro.file('pixflow-design-pro/package-integrity.json')!.async('string'));
  for (const filename of ['gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js']) {
    const path = `assets/vendor/gsap/${filename}`;
    const expected = await readFile(join('node_modules/gsap/dist', filename));
    const file = pro.file(`pixflow-design-pro/${path}`);
    assert.ok(file, `Missing Pro runtime ${path}`);
    assert.deepEqual(await file.async('nodebuffer'), expected);
    assert.equal(inventory.files[path], createHash('sha256').update(expected).digest('hex'));
  }
});
