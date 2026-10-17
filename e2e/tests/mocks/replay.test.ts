import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const recordings = join(root, 'mocks/recordings');

function replay(agent: string, trace: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [join(root, 'mocks/mock-agent.mjs'), '--as', agent], {
      env: { ...process.env, OD_MOCKS_RECORDINGS_DIR: recordings, OD_MOCKS_TRACE: trace, OD_MOCKS_NO_DELAY: '1' },
      timeout: 10_000,
    }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    child.stdin?.end('synthetic prompt');
  });
}

describe('repository-owned replay fixtures', () => {
  it('ships exactly the reviewed synthetic fixtures with matching integrity and provenance', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'mocks/manifest.json'), 'utf8')) as {
      entries: Array<{ trace_id: string; sha256: string; bytes: number; license: string }>;
    };
    const files = (await readdir(recordings)).filter(file => file.endsWith('.jsonl')).sort();
    expect(files).toEqual(manifest.entries.map(entry => `${entry.trace_id}.jsonl`).sort());
    for (const entry of manifest.entries) {
      expect(entry.trace_id).toMatch(/^synthetic-(success|failure|empty)$/);
      expect(entry.license).toBe('Apache-2.0');
      const bytes = await readFile(join(recordings, `${entry.trace_id}.jsonl`));
      expect(bytes.byteLength).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      const meta = JSON.parse(bytes.toString('utf8').split('\n')[0]!) as {
        source: { provider: string; trace_id: string; author: string };
      };
      expect(meta.source).toMatchObject({ provider: 'synthetic', trace_id: entry.trace_id });
      expect(meta.source.author).toBe('Pixflow Design contributors');
    }
  });

  it('replays every streaming protocol offline and fails explicitly for an unknown fixture', async () => {
    const cases = [
      ['claude', 'system'], ['codex', 'thread.started'], ['opencode', 'step_start'],
      ['gemini', 'init'], ['cursor-agent', 'system'],
    ] as const;
    await Promise.all(cases.map(async ([agent, firstEvent]) => {
      const result = await replay(agent, 'synthetic-success');
      const events = result.stdout.trim().split('\n').map(line => JSON.parse(line) as { type: string });
      expect(events[0]?.type).toBe(firstEvent);
      expect(result.stdout).toContain('Synthetic fixture complete.');
      expect(result.stderr).toContain('via fixed');
    }));
    await expect(replay('claude', 'missing-fixture')).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('no matching recording') });
  }, 15_000);
});
