import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { wordpressPackageVersion, writeWordPressPackageOutputs } from './wordpress-package-output.ts';

test('version comes from the plugin header and supports hotfix/prerelease versions', () => {
  for (const version of ['2.0.4', '2.0.5', '2.0.4.1', '2.1.0-rc.3']) {
    assert.equal(wordpressPackageVersion(`<?php\n/**\n * Version: ${version}\r\n */\n`), version);
  }
  for (const entry of ['', '* Version: ../outside', '* Version: 2.0.4/extra', '* Version: 2.0']) {
    assert.throws(() => wordpressPackageVersion(entry), /Version header/);
  }
});

test('Free and Pro builds write identical alias/versioned ZIPs and hashes, retaining older versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-package-output-'));
  try {
    for (const [alias, name] of [['pixflow-ai', 'pixflow-design'], ['pixflow-design-pro', 'pixflow-design-pro']] as const) {
      const old = join(root, `${name}-2.0.3.zip`);
      await writeFile(old, 'previous release');
      const bytes = Buffer.from(`archive bytes for ${alias}`);
      const output = await writeWordPressPackageOutputs(join(root, `${alias}.zip`), name, '* Version: 2.0.5', bytes);
      assert.equal(output, join(root, `${name}-2.0.5.zip`));
      for (const file of [output, join(root, `${alias}.zip`)]) {
        assert.deepEqual(await readFile(file), bytes);
        assert.equal(await readFile(`${file}.sha256`, 'utf8'), createHash('sha256').update(bytes).digest('hex') + '\n');
      }
      assert.equal(await readFile(old, 'utf8'), 'previous release');
    }
    const before = await readdir(root);
    await assert.rejects(writeWordPressPackageOutputs(join(root, 'invalid.zip'), 'pixflow-design', '* Version: ../escape', Buffer.from('bad')), /Version header/);
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
