import { randomUUID } from 'node:crypto';
import { access, lstat, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** Keep Next's generated CommonJS entry executable without changing the ESM
 * package scope used by the colocated sidecar cache handler. */
async function normalizeServerModule(root: string): Promise<void> {
  const app = await exists(join(root, 'apps/web/server.js')) ? join(root, 'apps/web') : root;
  if (!await exists(join(app, 'package.json'))) return;
  const manifest = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
  if (manifest.type !== 'module') return;
  const server = join(app, 'server.js');
  const source = await readFile(server, 'utf8');
  if (!/^const path = require\(['"]path['"]\)/.test(source)) return;
  const commonjs = join(app, 'server.cjs');
  if (await exists(commonjs)) throw new Error(`Refusing to overwrite an existing standalone CommonJS entry: ${commonjs}`);
  await rename(server, commonjs);
  await writeFile(server, "// Generated compatibility entry; Next's server remains unchanged.\nimport './server.cjs';\n");
}

/** Next traces a paired source build from the checkouts' common ancestor.
 * Retain the complete traced core tree at the established installer location;
 * refuse to discard additional traced roots or merge colliding directories. */
export async function normalizeStandaloneLayout(directory: string): Promise<void> {
  const root = resolve(directory);
  if (!await exists(root)) return; // The usual required-output check reports absence.
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Next standalone output must be a real directory.');
  let source = root;
  const ancestors: string[] = [];
  while (!await exists(join(source, 'apps/web/server.js')) && !await exists(join(source, 'server.js'))) {
    const entries = await readdir(source, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0]!.isDirectory() || entries[0]!.isSymbolicLink()) {
      throw new Error(`Cannot normalize Next standalone output with additional or missing traced roots: ${source}`);
    }
    ancestors.push(source);
    source = join(source, entries[0]!.name);
  }
  if (source === root) return normalizeServerModule(root);
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Next standalone app must be a real directory.');
  const temporary = join(dirname(root), `.standalone-layout-${randomUUID()}`);
  await rename(source, temporary);
  try {
    // Each ancestor was verified to contain only the next directory. rmdir is
    // deliberately nonrecursive: concurrent or unexpected files are preserved.
    for (const ancestor of ancestors.reverse()) await rmdir(ancestor);
    await rename(temporary, root);
  } catch (cause) {
    throw new Error(`Next standalone output is preserved at ${temporary}; layout normalization could not finish.`, { cause });
  }
  await normalizeServerModule(root);
}
