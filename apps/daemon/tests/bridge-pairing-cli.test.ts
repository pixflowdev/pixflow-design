import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runBridgePairingCli } from '../src/bridge-pairing-cli.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses the shared start endpoint and emits machine-readable public challenge data', async () => {
  const result = { requestId: 'request', challenge: 'public', siteUrl: 'https://qa.test', expiresAt: 123 };
  const transport = vi.fn<typeof fetch>(async () => Response.json(result)); vi.stubGlobal('fetch', transport);
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await runBridgePairingCli(['start', '--daemon-url', 'http://127.0.0.1:17457', '--site-url', 'https://qa.test', '--json']);
  expect(String(transport.mock.calls[0]?.[0])).toBe('http://127.0.0.1:17457/api/pixflow/pairing/start');
  expect(output).toHaveBeenCalledWith(`${JSON.stringify(result)}\n`);
});
it('completes with a prompt file and never prints the input code', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-cli-'));
  try {
    const file = join(root, 'input.json'); writeFileSync(file, JSON.stringify({ requestId: 'request', code: 'one-time-code' }));
    const transport = vi.fn<typeof fetch>(async () => Response.json({ ok: true, valid: true })); vi.stubGlobal('fetch', transport);
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runBridgePairingCli(['complete', '--daemon-url', 'http://127.0.0.1:17457', '--prompt-file', file, '--json']);
    expect(String(transport.mock.calls[0]?.[0])).toContain('/pairing/complete');
    expect(output).toHaveBeenCalledWith('{"ok":true,"valid":true}\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('rejects remote bridge targets before sending a code', async () => {
  const transport = vi.fn(); vi.stubGlobal('fetch', transport);
  await expect(runBridgePairingCli(['start', '--daemon-url', 'https://unrelated.test'])).rejects.toThrow('local bridge');
  expect(transport).not.toHaveBeenCalled();
});
it('reports the same classified failure as the browser', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({code:'pairing_https_required',stage:'bridge_start'}, {status:403})));
  await expect(runBridgePairingCli(['start','--daemon-url','http://127.0.0.1:17457'])).rejects.toThrow('require trusted HTTPS');
});
