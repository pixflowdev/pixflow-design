import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const configuredProRoot = process.env.PIXFLOW_DESIGN_PRO_ROOT;
export const proPackagePath = process.env.PIXFLOW_PRO_PACKAGE
  || (configuredProRoot ? join(configuredProRoot, 'dist/pixflow-design-pro.zip') : undefined);

export async function freeWordPressPackage(): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(resolve(root, process.env.PIXFLOW_FREE_PACKAGE || 'dist/pixflow-ai.zip')));
}

export async function proWordPressPackage(): Promise<JSZip> {
  if (!proPackagePath) throw new Error('Set PIXFLOW_PRO_PACKAGE or PIXFLOW_DESIGN_PRO_ROOT for paired package validation.');
  return JSZip.loadAsync(await readFile(resolve(root, proPackagePath)));
}

/** Free checks always run; paired assertions require an explicitly configured private package. */
export function testWordPressPackages(name: string, verify: (pro: JSZip | null) => Promise<void>): void {
  it(`${name} (Free independent)`, () => verify(null));
  it.skipIf(!proPackagePath)(`${name} (explicit Pro package)`, async () => verify(await proWordPressPackage()));
}
