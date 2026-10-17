import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Only unmodified registry sources may be restored by the pinned standalone npm build. */
export async function sourceRegistryDependency(root: string, original: string, captured: Buffer) {
  if (!original.startsWith('node_modules/')) return undefined;
  const match = /^(.*\/node_modules\/)((?:@[^/]+\/)?[^/]+)\/(.+)$/.exec(original);
  const [, base, name, file] = match ?? [];
  if (!base || !name || !file || file.split('/').some(part => part === '..' || part === '.')) return undefined;
  const manifest = JSON.parse(await readFile(join(root, base, name, 'package.json'), 'utf8'));
  if (manifest.name !== name || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) return undefined;
  if (!(await readFile(join(root, original))).equals(captured)) return undefined;
  return { name: manifest.name as string, version: manifest.version as string, path: file,
    sha256: createHash('sha256').update(captured).digest('hex') };
}
