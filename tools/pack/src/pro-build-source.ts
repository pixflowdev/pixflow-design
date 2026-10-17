import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Every packaging cache layer must distinguish the explicitly paired private
 * source tree, including version-family aliases and installer intermediates. */
export function proBuildCacheRoot(cacheRoot: string, configuredRoot: string | undefined): string {
  if (!configuredRoot?.trim()) return cacheRoot;
  const proRoot = resolve(configuredRoot);
  const hash = createHash('sha256');
  hash.update(proRoot);
  function visit(path: string): void {
    hash.update(relative(proRoot, path));
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) { hash.update(readlinkSync(path)); return; }
    if (!metadata.isDirectory()) { hash.update(readFileSync(path)); return; }
    for (const name of readdirSync(path).sort()) {
      if (['node_modules', '.tmp', '.next', 'dist', 'out'].includes(name)) continue;
      visit(join(path, name));
    }
  }
  visit(join(proRoot, 'apps/web/src'));
  if (existsSync(join(proRoot, 'skills'))) visit(join(proRoot, 'skills'));
  for (const name of ['pixflow-pro.json', 'package.json', 'pnpm-lock.yaml']) {
    const path = join(proRoot, name);
    if (existsSync(path)) visit(path);
  }
  return join(cacheRoot, 'pro-source', hash.digest('hex'));
}
