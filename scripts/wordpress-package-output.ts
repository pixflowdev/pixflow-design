import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Name release copies from the plugin header, never the workspace/Bridge version. */
export function wordpressPackageVersion(entry: string): string {
  const version = entry.match(/^\s*\*?\s*Version:\s*(\S+)\s*$/mi)?.[1];
  if (!version || !/^\d+(?:\.\d+){2,3}(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(version)) {
    throw new Error('Cannot create versioned ZIP: missing or invalid WordPress plugin Version header.');
  }
  return version;
}

/** Both build outputs and their checksums describe the exact same archive bytes. */
export async function writeWordPressPackageOutputs(
  aliasPath: string,
  releaseName: 'pixflow-design' | 'pixflow-design-pro',
  entry: string,
  bytes: Uint8Array,
): Promise<string> {
  const versionedPath = join(dirname(aliasPath), `${releaseName}-${wordpressPackageVersion(entry)}.zip`);
  const digest = createHash('sha256').update(bytes).digest('hex') + '\n';
  await mkdir(dirname(aliasPath), { recursive: true });
  for (const path of new Set([aliasPath, versionedPath])) {
    await writeFile(path, bytes);
    await writeFile(`${path}.sha256`, digest);
  }
  return versionedPath;
}
