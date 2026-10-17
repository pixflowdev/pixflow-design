import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import type { CacheFs } from 'next/dist/shared/lib/utils.js';
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from 'next/dist/server/lib/incremental-cache/index.js';

const require = createRequire(import.meta.url);
// Keep Next's seed promotion, RSC/segment encoding and tag revalidation intact.
// This adapter is tested against the pinned Next version, including real HTTP requests.
const FileSystemCache = require('next/dist/server/lib/incremental-cache/file-system-cache.js').default as new (context: CacheHandlerContext) => CacheHandler;
const nodeFs = require('next/dist/server/lib/node-fs-methods.js').nodeFs as CacheFs;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const IMAGE_CACHE_BYTES = 256 * 1024 * 1024;

/** Bound generated images on disk; eviction never touches site content or build seeds. */
export async function pruneImageCache(root: string, budget = IMAGE_CACHE_BYTES): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = (await Promise.all(entries.filter(entry => entry.isFile() && /^[a-f0-9]{64}$/.test(entry.name)).map(async entry => {
    const path = join(root, entry.name);
    const info = await stat(path).catch(() => null);
    return info ? { path, size: info.size, used: info.mtimeMs } : null;
  }))).filter(entry => entry !== null).sort((a, b) => a.used - b.used);
  let size = files.reduce((total, file) => total + file.size, 0);
  for (const file of files) {
    if (size <= budget) break;
    await rm(file.path, { force: true });
    size -= file.size;
  }
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function canonicalDestination(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw new Error('Packaged cache path has no accessible parent');
  return join(canonicalDestination(parent), relative(parent, path));
}

function immutableRoot(webRoot: string): string {
  for (let current = webRoot; dirname(current) !== current; current = dirname(current)) {
    if (basename(current).toLowerCase().endsWith('.app')) return current;
  }
  return webRoot;
}

/** Read immutable build seeds, but direct every cache write to this namespace/build. */
export function createExternalCacheFs(buildRoot: string, cacheRoot: string, source: CacheFs): CacheFs {
  const writable = (path: string): string => {
    const absolute = resolve(path);
    if (!within(buildRoot, absolute)) throw new Error('Next cache path escapes its build directory');
    return join(cacheRoot, relative(buildRoot, absolute));
  };
  const readable = (path: string): string => {
    const external = writable(path);
    return existsSync(external) ? external : path;
  };
  return {
    existsSync: ((path: string) => source.existsSync(readable(path))) as CacheFs['existsSync'],
    readFile: ((path: string, ...args: unknown[]) => (source.readFile as Function)(readable(path), ...args)) as CacheFs['readFile'],
    readFileSync: ((path: string, ...args: unknown[]) => (source.readFileSync as Function)(readable(path), ...args)) as CacheFs['readFileSync'],
    stat: path => source.stat(readable(path)),
    mkdir: path => source.mkdir(writable(path)),
    writeFile: (path, data) => source.writeFile(writable(path), data),
    ...(source.writeFileAtomic ? { writeFileAtomic: (path: string, data: unknown) => source.writeFileAtomic!(writable(path), data) } : {}),
  };
}

export default class PackagedNextCache implements CacheHandler {
  private readonly cache: CacheHandler;
  private readonly imageRoot: string | null;

  constructor(context: CacheHandlerContext) {
    if (!context.serverDistDir) throw new Error('Next cache requires a server build directory');
    // macOS /var and /tmp aliases must not make valid cache reads look like escapes.
    const serverDistDir = realpathSync(context.serverDistDir);
    const buildRoot = dirname(serverDistDir);
    const immutable = immutableRoot(dirname(buildRoot));
    const configured = process.env.OD_WEB_CACHE_ROOT;
    if (!configured && process.env.OD_WEB_CACHE_REQUIRED === '1') {
      throw new Error('Packaged web runtime requires an external cache directory');
    }
    let fs = context.fs ?? nodeFs;
    let root: string | null = null;
    if (configured) {
      if (!isAbsolute(configured)) throw new Error('Packaged web cache directory must be absolute');
      // Fail before creating anything if the configured path points into the build.
      if (within(immutable, canonicalDestination(resolve(configured)))) throw new Error('Packaged web cache must be outside the application');
      mkdirSync(configured, { recursive: true });
      const canonical = realpathSync(configured);
      if (within(immutable, canonical)) throw new Error('Packaged web cache must be outside the application');
      const buildId = readFileSync(join(buildRoot, 'BUILD_ID'), 'utf8');
      root = join(canonical, digest(buildId));
      fs = createExternalCacheFs(buildRoot, root, fs);
    }
    // Without the runtime env this is the ordinary build-time Next cache.
    this.cache = new FileSystemCache({ ...context, fs, serverDistDir });
    this.imageRoot = root ? join(root, 'cache', 'images') : null;
  }

  resetRequestCache(): void { this.cache.resetRequestCache(); }
  revalidateTag(...args: Parameters<CacheHandler['revalidateTag']>): Promise<void> { return this.cache.revalidateTag(...args); }

  async get(...[key, context]: Parameters<CacheHandler['get']>): Promise<CacheHandlerValue | null> {
    if (context.kind !== 'IMAGE') return this.cache.get(key, context);
    if (!this.imageRoot) return null;
    try {
      const path = join(this.imageRoot, digest(key));
      const entry = deserialize(await readFile(path)) as CacheHandlerValue;
      if (entry?.value?.kind !== 'IMAGE' || !Number.isFinite(entry.lastModified)) return null;
      const now = new Date();
      await utimes(path, now, now).catch(() => undefined);
      return entry;
    } catch { return null; } // Missing/corrupt cache entries can always be regenerated.
  }

  async set(...[key, value, context]: Parameters<CacheHandler['set']>): Promise<void> {
    if (value?.kind !== 'IMAGE') {
      await this.cache.set(key, value, context);
      return;
    }
    if (!this.imageRoot) return;
    const payload = serialize({ value, lastModified: Date.now() });
    if (payload.byteLength > IMAGE_CACHE_BYTES) return;
    await mkdir(this.imageRoot, { recursive: true });
    const target = join(this.imageRoot, digest(key));
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { mode: 0o600 });
      await rename(temporary, target);
      await pruneImageCache(this.imageRoot);
    } finally { await rm(temporary, { force: true }); }
  }
}
