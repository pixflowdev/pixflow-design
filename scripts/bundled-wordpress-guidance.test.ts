import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyBundledWordPressGuidance } from './bundled-wordpress-guidance.ts';

test('Every bundled Free skill and supporting reference is self-contained plain text', async () => {
  const target = await mkdtemp(join(tmpdir(), 'pixflow-guidance-'));
  try {
    const policy = JSON.parse(await readFile('wordpress/resources/skill-editions.json', 'utf8'));
    for (const skill of policy.skills.filter((entry: { edition: string; status: string }) => entry.edition === 'free' && entry.status === 'bundled')) {
      const source = join('skills', skill.folder);
      const destination = join(target, skill.folder);
      await copyBundledWordPressGuidance(source, destination);
      for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const relative = join(entry.parentPath, entry.name).slice(source.length + 1);
        assert.deepEqual(await readFile(join(destination, relative)), await readFile(join(source, relative)));
      }
    }
    for (const router of ['plugins/_official/scenarios/od-default', 'plugins/_official/examples/web-clone']) {
      await copyBundledWordPressGuidance(router, join(target, router));
      assert.deepEqual(await readFile(join(target, router, 'open-design.json')), await readFile(join(router, 'open-design.json')));
    }
    for (const name of ['unsafe.php', 'unsafe.php.md', 'unsafe.html', 'unsafe.mjs', 'unsafe.svg', '.htaccess']) {
      const source = join(target, 'rejected-' + name);
      await mkdir(source);
      await writeFile(join(source, name), 'Must remain in a private archive');
      await assert.rejects(copyBundledWordPressGuidance(source, join(target, 'output')), /Non-text file/);
    }
  } finally { await rm(target, { recursive: true, force: true }); }
});
