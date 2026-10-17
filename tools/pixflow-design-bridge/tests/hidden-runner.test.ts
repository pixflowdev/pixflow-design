import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the compatibility runner without executing its CLI or a paid agent.
const source = readFileSync(new URL('../bricks-handoff-cli.mjs', import.meta.url), 'utf8');
const capture = source.slice(source.indexOf('async function runLocalInvocationCapture('), source.indexOf('async function buildLibraryTaskInvocation('));
for (const shell of [false, true]) {
  test(`background runner hides its console and retains output (shell=${shell})`, async () => {
    let options: Record<string, unknown> | undefined;
    const run = runInNewContext(`${capture}; runLocalInvocationCapture`, {
      process: { env: {}, stderr: { write() {} } },
      commandLineForShellInvocation: () => 'test-command',
      spawn: (...args: unknown[]) => {
        options = args.at(-1) as Record<string, unknown>;
        const child = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
        });
        queueMicrotask(() => { child.stdout.write('result'); child.emit('close', 0, null); });
        return child;
      },
    });
    const result = await run({ shell, command: 'test-command', args: [], stdin: 'request' }, '.', 'test');
    assert.equal(result.stdoutText, 'result');
    assert.equal(options?.windowsHide, true);
    assert.deepEqual(Array.from(options?.stdio as string[]), ['pipe', 'pipe', 'pipe']);
  });
}
