import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CachedRouteKind as K, IncrementalCacheKind as I } from 'next/dist/server/response-cache';

const require = createRequire(import.meta.url);
import Cache, { createExternalCacheFs, pruneImageCache } from '../sidecar/next-cache-handler';
const roots: string[] = [];
afterEach(async () => {
  delete process.env.OD_WEB_CACHE_ROOT;
  delete process.env.OD_WEB_CACHE_REQUIRED;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-cache-'));
  roots.push(root);
  const dist = join(root, 'signed-app', '.next');
  await mkdir(join(dist, 'server', 'app'), { recursive: true });
  await writeFile(join(dist, 'BUILD_ID'), 'build-one');
  const options = { fs: require('next/dist/server/lib/node-fs-methods').nodeFs, serverDistDir: join(dist, 'server'), flushToDisk: true, revalidatedTags: [], maxMemoryCacheSize: 0, _requestHeaders: {} };
  process.env.OD_WEB_CACHE_ROOT = join(root, 'namespace-a', 'cache', 'web');
  return { root, dist, options, cache: new Cache(options) };
}

describe('packaged Next cache', () => {
  it('writes route responses outside immutable packaged resources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-cache-'));
    roots.push(root);
    const dist = join(root, 'signed-app', '.next');
    await mkdir(join(dist, 'server'), { recursive: true });
    await writeFile(join(dist, 'BUILD_ID'), 'build-one');
    process.env.OD_WEB_CACHE_ROOT = join(root, 'namespace', 'cache', 'web');
    const fs = require('next/dist/server/lib/node-fs-methods').nodeFs;
    const cache = new Cache({ fs, serverDistDir: join(dist, 'server'), flushToDisk: true, revalidatedTags: [], maxMemoryCacheSize: 0, _requestHeaders: {} });
    await cache.set('/route-cache/APP_PAGE/owner/$/index', {
      kind: 'APP_PAGE' as K.APP_PAGE, html: '<h1>Preserved page</h1>', rscData: Buffer.from('rsc'),
      headers: {}, status: 200, postponed: undefined, segmentData: new Map([['/_tree', Buffer.from('tree')]]),
    }, { isFallback: false });
    expect(await readdir(join(dist, 'server'), { recursive: true })).toEqual([]);
    const entry = await cache.get('/route-cache/APP_PAGE/owner/$/index', { kind: 'APP_PAGE' as I.APP_PAGE, isFallback: false });
    expect(entry?.value).toMatchObject({ html: '<h1>Preserved page</h1>', rscData: Buffer.from('rsc'), segmentData: new Map([['/_tree', Buffer.from('tree')]]) });
    expect(await readFile(join(dist, 'BUILD_ID'), 'utf8')).toBe('build-one');
  });

  it('reads immutable prerender seeds and preserves them when replacing cached content', async () => {
    const { dist, cache } = await fixture();
    await writeFile(join(dist, 'server/app/index.html'), 'original seed');
    await writeFile(join(dist, 'server/app/index.meta'), '{"status":200}');
    await writeFile(join(dist, 'server/app/index.rsc'), 'seed-rsc');
    const context = { kind: 'APP_PAGE' as I.APP_PAGE, isFallback: false };
    expect((await cache.get('/index', context))?.value).toMatchObject({ html: 'original seed' });
    await cache.set('/index', { kind: 'APP_PAGE' as K.APP_PAGE, html: 'updated cache', rscData: Buffer.from('new'), headers: {}, postponed: undefined, status: 200, segmentData: undefined }, { isFallback: false });
    expect((await cache.get('/index', context))?.value).toMatchObject({ html: 'updated cache' });
    expect(await readFile(join(dist, 'server/app/index.html'), 'utf8')).toBe('original seed');
  });

  it('preserves fetch tag invalidation and cached route bodies', async () => {
    const { cache } = await fixture();
    await cache.set('data', { kind: 'FETCH' as K.FETCH, data: { headers: {}, body: 'payload', status: 200, url: 'https://example.test' }, revalidate: 60 }, { fetchCache: true, tags: ['cache-test-tag'] });
    expect(await cache.get('data', { kind: 'FETCH' as I.FETCH, tags: ['cache-test-tag'] })).not.toBeNull();
    // Next deliberately expires only entries strictly older than the tag timestamp.
    await new Promise(resolve => setTimeout(resolve, 10));
    await cache.revalidateTag('cache-test-tag');
    expect(await cache.get('data', { kind: 'FETCH' as I.FETCH, tags: ['cache-test-tag'] })).toBeNull();
    await cache.set('/route', { kind: 'APP_ROUTE' as K.APP_ROUTE, body: Buffer.from('response'), status: 201, headers: {} }, { isFallback: false });
    expect((await cache.get('/route', { kind: 'APP_ROUTE' as I.APP_ROUTE, isFallback: false }))?.value).toMatchObject({ body: Buffer.from('response'), status: 201 });
  });

  it('persists images across restarts and isolates builds and namespaces', async () => {
    const { root, dist, options, cache } = await fixture();
    const image = { kind: 'IMAGE' as K.IMAGE, buffer: Buffer.from('image bytes'), etag: 'etag', upstreamEtag: 'upstream', extension: 'png', revalidate: 120 };
    await cache.set('../../image-key', image, { kind: 'IMAGE' as I.IMAGE, isFallback: false });
    expect((await new Cache(options).get('../../image-key', { kind: 'IMAGE' as I.IMAGE, isFallback: false }))?.value).toEqual(image);
    process.env.OD_WEB_CACHE_ROOT = join(root, 'namespace-b/cache/web');
    expect(await new Cache(options).get('../../image-key', { kind: 'IMAGE' as I.IMAGE, isFallback: false })).toBeNull();
    process.env.OD_WEB_CACHE_ROOT = join(root, 'namespace-a/cache/web');
    await writeFile(join(dist, 'BUILD_ID'), 'build-two');
    expect(await new Cache(options).get('../../image-key', { kind: 'IMAGE' as I.IMAGE, isFallback: false })).toBeNull();
    expect(await readdir(join(dist, 'server'), { recursive: true })).toEqual(['app']);
  });

  it('fails closed for missing, relative or in-bundle runtime cache paths', async () => {
    const { dist, options } = await fixture();
    process.env.OD_WEB_CACHE_REQUIRED = '1';
    delete process.env.OD_WEB_CACHE_ROOT;
    expect(() => new Cache(options)).toThrow('requires an external cache');
    process.env.OD_WEB_CACHE_ROOT = 'relative-cache';
    expect(() => new Cache(options)).toThrow('must be absolute');
    process.env.OD_WEB_CACHE_ROOT = join(dist, 'cache');
    expect(() => new Cache(options)).toThrow('outside the application');
  });

  it('rejects symlinked destinations into the immutable tree before creating files', async () => {
    const { root, dist, options } = await fixture();
    const alias = join(root, 'alias');
    await symlink(dirname(dist), alias, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.OD_WEB_CACHE_ROOT = join(alias, 'new-cache');
    expect(() => new Cache(options)).toThrow('outside the application');
    expect(await readdir(dirname(dist))).toEqual(['.next']);
    const fs = createExternalCacheFs(dist, join(root, 'safe-cache'), options.fs);
    expect(() => fs.writeFile(join(root, 'escape'), 'bad')).toThrow('escapes');
  });

  it('supports a symlinked application path while preserving its physical resources', async () => {
    const { root, dist, options } = await fixture();
    const alias = join(root, 'application-alias');
    await symlink(dirname(dist), alias, process.platform === 'win32' ? 'junction' : 'dir');
    const cache = new Cache({ ...options, serverDistDir: join(alias, '.next/server') });
    await cache.set('/route', { kind: 'APP_ROUTE' as K.APP_ROUTE, body: Buffer.from('alias'), status: 200, headers: {} }, { isFallback: false });
    expect((await cache.get('/route', { kind: 'APP_ROUTE' as I.APP_ROUTE, isFallback: false }))?.value).toMatchObject({ body: Buffer.from('alias') });
    expect(await readdir(join(dist, 'server'), { recursive: true })).toEqual(['app']);
  });

  it('bounds image cache storage without deleting unrelated files', async () => {
    const { root } = await fixture();
    const images = join(root, 'images');
    await mkdir(images);
    await writeFile(join(images, 'a'.repeat(64)), 'older');
    await utimes(join(images, 'a'.repeat(64)), new Date(0), new Date(0));
    await writeFile(join(images, 'b'.repeat(64)), 'newer');
    await writeFile(join(images, 'unrelated.txt'), 'preserved');
    await pruneImageCache(images, 5);
    expect((await readdir(images)).sort()).toEqual(['b'.repeat(64), 'unrelated.txt']);
  });
});
