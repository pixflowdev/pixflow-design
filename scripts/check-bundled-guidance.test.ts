import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBundledGuidance } from './check-bundled-guidance.ts';

test('guidance guard preserves required sources and ignores personal runtime content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-guidance-'));
  async function put(path: string, value: string) {
    const target = join(root, path); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, value);
  }
  try {
    await put('wordpress/resources/skill-editions.json', JSON.stringify({ skills: [{ folder: 'essential', edition: 'free', status: 'bundled' }] }));
    await put('skills/essential/SKILL.md', '# Essential');
    await put('guidance/scenarios/od-default/SKILL.md', 'name: od-default');
    await put('.od/skills/personal/SKILL.md', '# Personal');
    assert.equal(await checkBundledGuidance(root), true);
    await put('plugins/community/retired/SKILL.md', '# Retired');
    assert.equal(await checkBundledGuidance(root), false);
    await rm(join(root, 'plugins'), { recursive: true });
    await rm(join(root, 'skills/essential/SKILL.md'));
    assert.equal(await checkBundledGuidance(root), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
