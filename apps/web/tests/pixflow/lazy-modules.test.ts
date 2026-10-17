import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const asset = vi.hoisted(() => ({ base: '' }));
vi.mock('../../src/pixflow/public-assets', () => ({
  pixflowPublicAssetUrl: (path: string) => new URL(path, asset.base).href,
}));
import { loadPixflowLazyModule } from '../../src/pixflow/lazy-modules';

let directory = '';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pixflow-lazy-module-'));
  await mkdir(join(directory, 'lazy'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(join(directory, 'lazy/module-0-CURRENT.js'), 'export const release = "current";');
  asset.base = `${pathToFileURL(directory).href}/`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !target.includes('pixflow-lazy-module-')) throw new Error('Unexpected temporary fixture path');
  await rm(target, { recursive: true, force: true });
});

const manifest = (path = 'module-0-CURRENT.js') => ({ schema: 1, modules: { 'i18n/locales/fr': path } });
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('stable WordPress lazy resource identities', () => {
  it('shares one manifest request across simultaneous imports and resolves the current Core hash', async () => {
    const fetch = vi.fn().mockResolvedValue(response(manifest()));
    vi.stubGlobal('fetch', fetch);
    const [first, second] = await Promise.all([loadPixflowLazyModule('i18n/locales/fr'), loadPixflowLazyModule('i18n/locales/fr')]);
    expect(first.release).toBe('current');
    expect(second.release).toBe('current');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(new URL('lazy/manifest.json', asset.base).href, { cache: 'no-cache', credentials: 'same-origin' });
  });

  it('retries a rejected manifest fetch instead of retaining a rejected cache entry', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response(manifest()));
    vi.stubGlobal('fetch', fetch);
    await expect(loadPixflowLazyModule('i18n/locales/fr')).rejects.toThrow('Offline');
    await expect(loadPixflowLazyModule('i18n/locales/fr')).resolves.toMatchObject({ release: 'current' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['../outside.js', 'https://external.test/module.js', '/module-0-CURRENT.js', 'module-0-CURRENT.js?script=1', 'module-0-CURRENT.js#fragment'])('rejects a manifest path outside the generated module contract: %s', async (path) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(manifest(path))));
    await expect(loadPixflowLazyModule('i18n/locales/fr')).rejects.toThrow('Unknown Pixflow resource');
  });

  it('rejects malformed manifest schemas and allows a later valid response', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ schema: 2, modules: {} })).mockResolvedValueOnce(response(manifest()));
    vi.stubGlobal('fetch', fetch);
    await expect(loadPixflowLazyModule('i18n/locales/fr')).rejects.toThrow('Invalid Pixflow resource manifest');
    await expect(loadPixflowLazyModule('i18n/locales/fr')).resolves.toMatchObject({ release: 'current' });
  });

  it('does not coerce an array-valued manifest entry into executable module paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ schema: 1, modules: { 'i18n/locales/fr': ['module-0-CURRENT.js'] } })));
    await expect(loadPixflowLazyModule('i18n/locales/fr')).rejects.toThrow('Unknown Pixflow resource');
  });

  it('lets an older Pro logical key recover after Core replaces a hashed file', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(manifest('module-0-REMOVED.js'))).mockResolvedValueOnce(response(manifest()));
    vi.stubGlobal('fetch', fetch);
    await expect(loadPixflowLazyModule('i18n/locales/fr')).rejects.toThrow();
    await expect(loadPixflowLazyModule('i18n/locales/fr')).resolves.toMatchObject({ release: 'current' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
