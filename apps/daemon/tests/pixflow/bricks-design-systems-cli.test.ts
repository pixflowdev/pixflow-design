import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBricksDesignSystemsCli } from '../../src/pixflow/bricks-design-systems-cli.js';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async (path: string) => path === 'private.json' ? '{"X-WP-Nonce":"test-nonce"}' : '{"title":"Studio","profile":{}}') }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Bricks design-system CLI', () => {
  it('lists through the same authenticated WordPress endpoint as the UI', async () => {
    const fetcher = vi.fn(async () => new Response('{"designSystems":[]}'));
    vi.stubGlobal('fetch', fetcher); const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runBricksDesignSystemsCli(['list', '--site-url', 'http://127.0.0.1:8088', '--headers-file', 'private.json', '--json']);
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8088/wp-json/pixflow-design/v1/od/design-systems/bricks', expect.objectContaining({ method: 'GET', redirect: 'error' }));
    expect(output).toHaveBeenCalledWith('{"designSystems":[]}\n');
  });
  it('requires a revision for apply and leaves Theme Styles opt-in', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher); vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const args = ['apply', '--id', 'pds-abcdef123456', '--site-url', 'https://example.com', '--headers-file', 'private.json'];
    await expect(runBricksDesignSystemsCli(args)).rejects.toThrow('--revision');
    expect(fetcher).not.toHaveBeenCalled();
    await runBricksDesignSystemsCli([...args, '--revision', '2']);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/pds-abcdef123456/apply'), expect.objectContaining({ body: '{"revision":2,"themeStyles":false}' }));
  });
});
