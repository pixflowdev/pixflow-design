import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readPromptTemplate } from '../src/prompt-templates.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('readPromptTemplate', () => {
  it('returns null for a path-traversal id instead of reading outside the surface directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-prompt-templates-'));
    cleanup.push(root);
    await mkdir(path.join(root, 'image'));
    await writeFile(path.join(root, 'secret.json'), JSON.stringify({
      id: '../secret',
      surface: 'image',
      title: 'Secret',
      summary: '',
      category: 'General',
      tags: [],
      prompt: 'This valid prompt must not be readable outside its surface directory.',
      source: { repo: 'test', license: 'MIT' },
    }));

    expect(await readPromptTemplate(root, 'image', '../secret')).toBeNull();
  });
});
