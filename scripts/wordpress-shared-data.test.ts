import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';
import { buildWordPressSharedData } from './wordpress-shared-data.ts';

const root = resolve(import.meta.dirname, '..');

test('independent WordPress bundles use one exact English dictionary without duplicating its strings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-shared-data-'));
  try {
    const plugin = await buildWordPressSharedData(root, directory);
    const result = await build({
      stdin: { contents: 'import { en } from "./apps/web/src/i18n/locales/en"; globalThis.consumer = en;', resolveDir: root },
      plugins: [plugin], bundle: true, write: false, format: 'iife', platform: 'browser',
    });
    const consumer = result.outputFiles[0]!.text;
    assert.ok(!consumer.includes('Compacting context'));
    const data = await readFile(join(directory, 'pixflow-english.js'), 'utf8');
    const page = createContext({});
    assert.throws(() => runInContext(consumer, page), /shared English data has not loaded/);
    runInContext(data, page);
    runInContext(consumer, page);
    const first = page.consumer;
    runInContext(consumer, page);
    assert.equal(page.consumer, first);
    assert.equal(page.consumer['assistant.compactingContext'], 'Compacting context…');
    // A cold editor iframe gets its own data dependency, never its parent's globals.
    const frame = createContext({});
    runInContext(data, frame); runInContext(consumer, frame);
    assert.equal(frame.consumer['assistant.compactingContext'], first['assistant.compactingContext']);
    assert.notEqual(frame.consumer, first);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
