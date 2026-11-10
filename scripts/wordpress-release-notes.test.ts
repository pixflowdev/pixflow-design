import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('the packaged Free README documents every current customer changelog item', async () => {
  const root = new URL('../', import.meta.url);
  const header = await readFile(new URL('pixflow-design.php', root), 'utf8');
  const readme = await readFile(new URL('readme.txt', root), 'utf8');
  const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
  const version = header.match(/Version: (\S+)/)?.[1];
  assert.ok(version);
  assert.equal(readme.match(/^Stable tag: (\S+)/m)?.[1], version);
  const current = changelog.split(`## [${version}]`)[1]?.split('\n## [')[0] ?? '';
  const readmeCurrent = readme.split(`= ${version} =`)[1]?.split('\n= ')[0] ?? '';
  const bullets = current.split(/\r?\n/).filter(line => line.startsWith('- '));
  assert.ok(bullets.length > 0);
  for (const bullet of bullets) assert.ok(readmeCurrent.includes('* ' + bullet.slice(2)), `Missing README change: ${bullet}`);
});
