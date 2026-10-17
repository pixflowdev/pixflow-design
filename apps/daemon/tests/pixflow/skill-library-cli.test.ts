import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSkillLibraryCli } from '../../src/pixflow/skill-library-cli.js';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async (path: string) => path === 'headers.json' ? '{"X-WP-Nonce":"qa","Cookie":"private"}' : '{"id":"website-animation","digest":"abc"}') }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('site-owned skill library CLI', () => {
  it('previews the exact reviewed package with a read-only request', async () => {
    const fetcher = vi.fn(async () => new Response('{"files":{"SKILL.md":"Preview"}}'));
    vi.stubGlobal('fetch', fetcher); vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runSkillLibraryCli(['preview', '--site-url', 'https://example.com', '--headers-file', 'headers.json', '--id', 'website-animation', '--digest', 'a'.repeat(64), '--json']);
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('action')).toBe('preview');
    expect(url.searchParams.get('digest')).toBe('a'.repeat(64));
    expect(options.method).toBe('GET'); expect(options.body).toBeUndefined();
  });
  it('updates eligible installed skills through the same API and reports partial failures', async () => {
    const item = { id: 'one', installedVersion: '1.0.0', updateAvailable: true, canInstall: true, digest: 'a'.repeat(64) };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ pro: true, skills: [item,
      { ...item, id: 'two', digest: 'b'.repeat(64) }, { ...item, id: 'not-installed', installedVersion: null }, { ...item, id: 'blocked', canInstall: false }] })))
      .mockResolvedValueOnce(new Response('{"error":"Catalogue changed"}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher); const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await expect(runSkillLibraryCli(['update-all', '--site-url', 'https://example.com', '--headers-file', 'headers.json', '--json'])).rejects.toThrow('Some skills');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ id: 'one', action: 'install', digest: 'a'.repeat(64) });
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ id: 'two', action: 'install', digest: 'b'.repeat(64) });
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual({ ok: false, results: [{ id: 'one', ok: false, error: 'Catalogue changed' }, { id: 'two', ok: true }] });
  });
  it('does not mutate skills when Pro is unavailable', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"pro":false,"skills":[]}'));
    vi.stubGlobal('fetch', fetcher);
    await expect(runSkillLibraryCli(['update-all', '--site-url', 'https://example.com', '--headers-file', 'headers.json'])).rejects.toThrow('Pro is required');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('uses the same WordPress route and never follows credential-bearing redirects', async () => {
    const fetcher = vi.fn(async () => new Response('{"skills":[]}'));
    vi.stubGlobal('fetch', fetcher); const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runSkillLibraryCli(['list', '--site-url', 'https://example.com/site', '--headers-file', 'headers.json', '--json']);
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('rest_route')).toBe('/pixflow-design/v1/skill-library');
    expect(url.pathname).toBe('/site/'); expect(options.redirect).toBe('error'); expect(options.method).toBe('GET');
    expect(output).toHaveBeenCalledWith('{"skills":[]}\n');
  });
  it('supports explicit reviewed mutations from a file', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher); vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await runSkillLibraryCli(['install', '--site-url', 'http://127.0.0.1:8088', '--headers-file', 'headers.json', '--prompt-file', 'mutation.json']);
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'POST', body: '{"id":"website-animation","digest":"abc","action":"install"}' }));
  });
  it('rejects remote cleartext before reading credentials or making requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(runSkillLibraryCli(['list', '--site-url', 'http://example.com', '--headers-file', 'headers.json'])).rejects.toThrow('HTTPS');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
