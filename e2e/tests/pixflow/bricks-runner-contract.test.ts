import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const bridgeCli = resolve(repoRoot, 'tools/pixflow-design-bridge/bricks-handoff-cli.mjs');
const scratch: string[] = [];

type RunnerId = 'codex' | 'claude' | 'antigravity' | 'opencode' | 'cursor-agent' | 'qwen';

const commandNames: Record<RunnerId, string> = {
  codex: 'codex',
  claude: 'claude',
  antigravity: 'antigravity',
  opencode: 'opencode-cli',
  'cursor-agent': 'cursor-agent',
  qwen: 'qwen',
};

function createRunnerFixture(root: string): string {
  const fixture = join(root, 'runner-fixture.cjs');
  writeFileSync(fixture, String.raw`
const fs = require('node:fs');
const runner = process.argv[2];
const args = process.argv.slice(3);
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.PIXFLOW_RUNNER_ARGS_FILE, JSON.stringify({ runner, args, stdin }));
  if (runner === 'claude' && process.env.PIXFLOW_FAKE_FAILURE === 'auth') {
    console.log(JSON.stringify({ type: 'system', subtype: 'api_retry', error: { message: 'authentication_failed' } }));
    console.log(JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Failed to authenticate. API Error: 401 Invalid authentication credentials',
    }));
    process.exitCode = 1;
    return;
  }
  const answer = runner + ' contract passed.';
  const payload = process.env.PIXFLOW_FAKE_ACTION === 'insert'
    ? {
        action: 'insert',
        answer: runner + ' mutation prepared.',
        changeSummary: 'Insert a native Bricks heading.',
        elements: [{ name: 'heading', settings: { text: 'Runner contract hero' } }],
        position: { mode: 'append' },
      }
    : { action: 'answer', answer };
  if (runner === 'codex') {
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(payload) } }));
  } else if (runner === 'claude') {
    console.log(JSON.stringify({ type: 'assistant', message: { id: 'claude-message', content: [{ type: 'text', text: JSON.stringify(payload) }] } }));
    console.log(JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify(payload) }));
  } else if (runner === 'opencode') {
    console.log(JSON.stringify({ type: 'step_start', sessionID: 'fixture-session', part: { type: 'step-start' } }));
    const encoded = JSON.stringify(payload);
    const splitAt = Math.max(1, Math.floor(encoded.length / 2));
    console.log(JSON.stringify({ type: 'text', sessionID: 'fixture-session', part: { type: 'text', text: encoded.slice(0, splitAt) } }));
    console.log(JSON.stringify({ type: 'text', sessionID: 'fixture-session', part: { type: 'text', text: encoded.slice(splitAt) } }));
    console.log(JSON.stringify({ type: 'step_finish', sessionID: 'fixture-session', part: { type: 'step-finish' } }));
  } else if (runner === 'cursor-agent') {
    console.log(JSON.stringify({ type: 'assistant', message: { id: 'cursor-message', content: [{ type: 'text', text: JSON.stringify(payload) }] } }));
    console.log(JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify(payload) }));
  } else {
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
});
`);
  return fixture;
}

function createRunnerCommand(binDir: string, fixture: string, runner: RunnerId): void {
  const names = runner === 'antigravity' ? ['antigravity', 'agy'] : [commandNames[runner]];
  for (const name of names) {
  if (process.platform === 'win32') {
    writeFileSync(
      join(binDir, `${name}.cmd`),
      `@echo off\r\n"${process.execPath}" "${fixture}" "${runner}" %*\r\n`,
    );
    continue;
  }
  const command = join(binDir, name);
  writeFileSync(command, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "${runner}" "$@"\n`);
  chmodSync(command, 0o755);
  }
}

function runFixture(
  runner: RunnerId,
  action: 'answer' | 'insert' = 'answer',
): { result: Record<string, unknown>; invocation: { args: string[]; stdin: string } } {
  const root = mkdtempSync(join(tmpdir(), `pixflow-${runner}-contract-`));
  scratch.push(root);
  const binDir = join(root, 'bin');
  const workspace = join(root, 'workspace');
  const requestFile = join(root, 'request.json');
  const argsFile = join(root, 'args.json');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const fixture = createRunnerFixture(root);
  createRunnerCommand(binDir, fixture, runner);
  writeFileSync(requestFile, JSON.stringify({
    mode: action === 'insert' ? 'design' : 'ask',
    prompt: `Verify the ${runner} Bricks runner contract.`,
    targetLabel: 'current Bricks page',
    bricksContext: { postId: 123, pageTitle: 'Runner contract page', selectedId: '' },
    targets: [],
  }));

  execFileSync(process.execPath, [
    bridgeCli,
    'quick-text-edit',
    '--input', requestFile,
    '--workspace', workspace,
    '--runner', runner,
    '--json',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      LOCALAPPDATA: join(root, 'localappdata'),
      PIXFLOW_RUNNER_ARGS_FILE: argsFile,
      PIXFLOW_FAKE_ACTION: action,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    result: JSON.parse(readFileSync(join(workspace, 'quick-text-edit-result.json'), 'utf8')),
    invocation: JSON.parse(readFileSync(argsFile, 'utf8')),
  };
}

function runClaudeAuthFailureFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'pixflow-claude-auth-contract-'));
  scratch.push(root);
  const binDir = join(root, 'bin');
  const workspace = join(root, 'workspace');
  const requestFile = join(root, 'request.json');
  const argsFile = join(root, 'args.json');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const fixture = createRunnerFixture(root);
  createRunnerCommand(binDir, fixture, 'claude');
  writeFileSync(requestFile, JSON.stringify({
    mode: 'ask',
    prompt: 'What page are we in?',
    targetLabel: 'current Bricks page',
    bricksContext: { postId: 123, pageTitle: 'Runner contract page', selectedId: '' },
    targets: [],
  }));

  try {
    execFileSync(process.execPath, [
      bridgeCli,
      'quick-text-edit',
      '--input', requestFile,
      '--workspace', workspace,
      '--runner', 'claude',
      '--json',
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        LOCALAPPDATA: join(root, 'localappdata'),
        PIXFLOW_RUNNER_ARGS_FILE: argsFile,
        PIXFLOW_FAKE_FAILURE: 'auth',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (error) {
    const failure = error as { stderr?: Buffer | string; message?: string };
    return String(failure.stderr || failure.message || '');
  }
}

afterEach(() => {
  while (scratch.length > 0) {
    rmSync(scratch.pop()!, { recursive: true, force: true });
  }
});

describe('Pixflow Bricks floating-panel runner contract', () => {
  for (const runner of Object.keys(commandNames) as RunnerId[]) {
    it(`normalizes ${runner} output into one structured terminal answer`, () => {
      const { result, invocation } = runFixture(runner);

      expect(result).toMatchObject({
        status: 'answered',
        action: 'answer',
        answer: `${runner} contract passed.`,
      });
      if (runner === 'antigravity') {
        expect(invocation.stdin).toBe('');
        expect(invocation.args.join(' ')).toContain('quick-text-edit-prompt.txt');
      } else {
        expect(invocation.stdin).toContain(`Verify the ${runner} Bricks runner contract.`);
      }
    });
  }

  for (const runner of Object.keys(commandNames) as RunnerId[]) {
    it(`normalizes ${runner} output into a controlled Bricks mutation`, () => {
      const { result } = runFixture(runner, 'insert');

      expect(result).toMatchObject({
        status: 'completed',
        action: 'insert',
        elements: [{ name: 'heading', settings: { text: 'Runner contract hero' } }],
      });
    });
  }

  it('launches each provider through its non-interactive structured-output mode', () => {
    const invocations = Object.fromEntries(
      (Object.keys(commandNames) as RunnerId[]).map((runner) => [runner, runFixture(runner).invocation.args]),
    );

    expect(invocations.codex).toEqual(expect.arrayContaining(['exec', '--json']));
    expect(invocations.claude).toEqual(expect.arrayContaining([
      '-p',
      '--input-format',
      'text',
      '--output-format',
      'stream-json',
    ]));
    expect(invocations.antigravity).toEqual(expect.arrayContaining([
      '-p',
      '--dangerously-skip-permissions',
      '--add-dir',
    ]));
    expect(invocations.antigravity).not.toContain('-');
    expect(invocations.opencode).toEqual(expect.arrayContaining(['run', '--format', 'json']));
    expect(invocations['cursor-agent']).toEqual(expect.arrayContaining(['--print', '--output-format', 'stream-json']));
    expect(invocations.qwen).toEqual(expect.arrayContaining(['--yolo']));
  });

  it('surfaces Claude authentication failures instead of a JSON input parser error', () => {
    const failure = runClaudeAuthFailureFixture();

    expect(failure).toContain('Failed to authenticate');
    expect(failure).not.toContain('Unexpected non-whitespace character after JSON');
  });
});
