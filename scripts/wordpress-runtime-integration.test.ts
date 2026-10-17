import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildWordPressSharedRuntime } from './wordpress-shared-runtime.ts';

const root = resolve(import.meta.dirname, '..');
const { JSDOM } = createRequire(join(root, 'apps/web/package.json'))('jsdom');

test('independently bundled hosts share React hooks, context, Motion and validation without remounting drafts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-runtime-integration-'));
  const page = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://site.test' });
  const frame = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://site.test/frame' });
  try {
    const plugin = await buildWordPressSharedRuntime(root, directory);
    async function consumer(contents: string): Promise<string> {
      const result = await build({
        stdin: { contents, resolveDir: join(root, 'apps/web'), loader: 'tsx' },
        plugins: [plugin], bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
      });
      return result.outputFiles![0]!.text;
    }
    const first = await consumer(`
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { motion, MotionConfig } from 'motion/react';
      import { z } from 'zod';
      import { ContextItemSchema, ResolvedContextSchema } from '../../packages/contracts/src/plugins/context';
      globalThis.host = { React, createRoot, flushSync, motion, MotionConfig, z, ContextItemSchema, ResolvedContextSchema, Context: React.createContext('missing') };
    `);
    const second = await consumer(`
      import React, { useContext, useState } from 'react';
      import { motion, MotionConfig } from 'motion/react';
      import { z } from 'zod';
      function Child() {
        const label = useContext(globalThis.host.Context);
        const [count, setCount] = useState(0);
        return <motion.section initial={false}><input defaultValue="unsent draft"/><button onClick={() => setCount(value => value + 1)}>{label + count}</button></motion.section>;
      }
      globalThis.contribution = { React, motion, MotionConfig, z, Child };
    `);
    const runtime = await readFile(join(directory, 'pixflow-shared-runtime.js'), 'utf8');
    await assert.rejects(consumer("import { useSpring } from 'motion/react'; console.log(useSpring);"), /No matching export/);
    await assert.rejects(consumer("import { ZodObject } from 'zod'; console.log(ZodObject);"), /No matching export/);
    // A missing script must fail explicitly. Loading it permits a clean retry.
    assert.throws(() => page.window.eval(first), /shared runtime has not loaded/);
    page.window.eval(runtime); page.window.eval(first); page.window.eval(second);
    assert.equal(page.window.host.React, page.window.contribution.React);
    assert.equal(page.window.host.motion, page.window.contribution.motion);
    assert.equal(page.window.host.MotionConfig, page.window.contribution.MotionConfig);
    assert.equal(page.window.host.z, page.window.contribution.z);
    page.window.eval(`
      globalThis.renderRoot = host.createRoot(document.getElementById('root'));
      host.flushSync(() => renderRoot.render(host.React.createElement(host.Context.Provider, { value: 'shared:' }, host.React.createElement(contribution.Child))));
    `);
    const input = page.window.document.querySelector('input');
    const button = page.window.document.querySelector('button');
    assert.equal(button.textContent, 'shared:0');
    input.value = 'keep my work';
    page.window.host.flushSync(() => button.click());
    assert.equal(button.textContent, 'shared:1');
    assert.equal(page.window.document.querySelector('input'), input);
    assert.equal(input.value, 'keep my work');
    const schema = page.window.host.z.object({ count: page.window.host.z.number().int().min(1), name: page.window.host.z.string().trim() });
    assert.equal(schema.parse({ count: 2, name: '  Saved  ' }).name, 'Saved');
    assert.equal(schema.safeParse({ count: 0, name: 'Keep' }).success, false);
    const context = { items: [{ kind: 'skill', id: 'saved-skill', label: 'My saved skill' }], promptFragments: { 'saved-skill': 'Keep the original text' } };
    assert.equal(JSON.stringify(page.window.host.ResolvedContextSchema.parse(context)), JSON.stringify(context));
    assert.equal(page.window.host.ContextItemSchema.safeParse({ kind: 'skill', label: 'Missing saved identifier' }).success, false);
    // Bricks' cold document needs its own initialized runtime, not parent globals.
    assert.throws(() => frame.window.eval(first), /shared runtime has not loaded/);
    frame.window.eval(runtime); frame.window.eval(first); frame.window.eval(second);
    assert.equal(frame.window.host.React, frame.window.contribution.React);
    assert.notEqual(frame.window.host.React, page.window.host.React);
    page.window.host.flushSync(() => page.window.renderRoot.unmount());
  } finally {
    page.window.close(); frame.window.close();
    await rm(directory, { recursive: true, force: true });
  }
});
