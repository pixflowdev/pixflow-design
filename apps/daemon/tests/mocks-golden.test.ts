// Golden daemon-event snapshots — addresses the regression-signal point
// from review on #3241: smoke-testing that mocks RUN catches only crashes
// or protocol-level garbage; it does NOT catch a parser change that
// semantically reshapes the events the daemon emits to the UI.
//
// This test replays representative recordings through the actual daemon
// stream handlers and asserts the emitted event sequence matches a
// committed `mocks/golden/<trace>.events.json`. A parser tweak that
// drops a tool_result, changes a usage shape, or renames an event type
// fails this test loudly.
//
// Update flow when a parser change is INTENTIONAL:
//   MOCKS_GOLDEN_UPDATE=1 pnpm --filter @open-design/daemon test mocks-golden
// then `git diff mocks/golden/` and commit the new shapes.
//
// Synthetic fixtures are committed and must always be present.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClaudeStreamHandler } from '../src/claude-stream.js';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const MOCK_AGENT = join(REPO, 'mocks/mock-agent.mjs');
const GOLDEN_DIR = join(REPO, 'mocks/golden');
const RECORDINGS_DIR = join(REPO, 'mocks/recordings');

// Exercise each protocol with the same locally authored tool and text fixture.
const CASES = (['claude', 'codex', 'opencode'] as const).flatMap(agent =>
  ['synthetic-success', 'synthetic-failure', 'synthetic-empty'].map(trace => ({ agent, trace })),
);

// Replace per-spawn-volatile fields with stable sentinels so the
// snapshot stays diffable across runs. Currently only `sessionId` —
// claude's mock emits a fresh UUID every spawn. Opencode/codex carry
// the recording's own session/thread id so they're already stable.
function normalizeVolatile(events: unknown[]): unknown[] {
  return events.map(e => {
    if (!e || typeof e !== 'object') return e;
    const rec = e as Record<string, unknown>;
    const out: Record<string, unknown> = { ...rec };
    if ('sessionId' in out) out.sessionId = '<normalized>';
    return out;
  });
}

function runMockAndCollectEvents(agent: string, trace: string): unknown[] {
  // Force no-delay so the spawn returns quickly + deterministically.
  const proc = spawnSync(
    process.execPath,
    [MOCK_AGENT, '--as', agent, '--no-delay'],
    {
      env: { ...process.env, OD_MOCKS_TRACE: trace, OD_MOCKS_NO_DELAY: '1' },
      input: 'golden-test-prompt',
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  if (proc.status !== 0) {
    throw new Error(
      `mock-agent --as ${agent} exit ${proc.status}: ${proc.stderr.slice(0, 500)}`,
    );
  }

  const events: unknown[] = [];
  const sink = (e: unknown) => events.push(e);
  const handler =
    agent === 'claude'
      ? createClaudeStreamHandler(sink)
      : createJsonEventStreamHandler(agent, sink);
  handler.feed(proc.stdout);
  return normalizeVolatile(events);
}

const recordingsAvailable =
  existsSync(RECORDINGS_DIR) &&
  CASES.every(c => existsSync(join(RECORDINGS_DIR, `${c.trace}.jsonl`)));

describe(
  'mocks goldens — daemon event shape regression',
  () => {
    it('ships all synthetic replay fixtures', () => {
      expect(recordingsAvailable).toBe(true);
    });
    for (const { agent, trace } of CASES) {
      it(`${agent} ${trace}`, () => {
        const events = runMockAndCollectEvents(agent, trace);
        const goldenPath = join(GOLDEN_DIR, `${agent}-${trace}.events.json`);

        if (process.env.MOCKS_GOLDEN_UPDATE === '1') {
          mkdirSync(GOLDEN_DIR, { recursive: true });
          writeFileSync(
            goldenPath,
            JSON.stringify({ agent, trace, events }, null, 2) + '\n',
          );
          return;
        }

        const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
        expect({ agent, trace, events }).toEqual(golden);
      });
    }
  },
);
