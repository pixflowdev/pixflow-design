import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type LogoAsset = {
  target: string; file: string; sha256: string; source: string; license: string;
  kind: 'brand' | 'neutral'; revision?: string; sourceSha256?: string;
};
type LogoSource = { licenseFile: string; licenseSha256: string; license: string };
export type DirectoryLogoManifest = {
  schema: number; assets: LogoAsset[]; sources: LogoSource[]; trademarkNotice: string;
};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const targetPattern = /^(agent-icons|model-icons)\/[a-z0-9-]+\.(svg|png)$/;

/** Directory assets come from pinned compatible artwork, never inherited favicons.
 * Validate the entire graph before copying so a missing/changed mark fails closed.
 * Copyright provenance is recorded separately from trademark-use conditions. */
export async function validateDirectoryLogoAssets(root: string): Promise<DirectoryLogoManifest> {
  const vendor = join(root, 'wordpress/directory/vendor/provider-icons');
  const manifest: DirectoryLogoManifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.assets) || !Array.isArray(manifest.sources)) throw new Error('Invalid directory logo provenance manifest.');
  const expected: string[] = [];
  for (const group of ['agent-icons', 'model-icons']) {
    for (const file of await readdir(join(root, 'apps/web/public', group))) {
      if (/\.(svg|png)$/.test(file)) expected.push(`${group}/${file}`);
    }
  }
  const targets = manifest.assets.map(asset => asset.target);
  if (new Set(targets).size !== targets.length || JSON.stringify(targets.slice().sort()) !== JSON.stringify(expected.sort())) {
    throw new Error('Directory logo manifest must cover every runtime asset exactly once.');
  }
  for (const source of manifest.sources) {
    if (!/^LICENSE-[a-z-]+\.txt$/.test(source.licenseFile) || source.license !== 'MIT') throw new Error('Unreviewed logo source licence.');
    if (digest(await readFile(join(vendor, source.licenseFile))) !== source.licenseSha256) throw new Error(`Logo licence changed: ${source.licenseFile}`);
  }
  for (const asset of manifest.assets) {
    if (!targetPattern.test(asset.target) || asset.file !== asset.target || asset.license !== 'MIT') throw new Error('Unsafe or unreviewed logo asset.');
    if (asset.kind === 'brand') {
      if (!/^[a-f0-9]{40}$/.test(asset.revision ?? '') || !asset.source.startsWith(`https://raw.githubusercontent.com/lobehub/lobe-icons/${asset.revision}/packages/static-`)) {
        throw new Error(`Unpinned logo source: ${asset.target}`);
      }
    } else if (asset.kind === 'neutral') {
      if (asset.source !== 'original-neutral.svg' || digest(await readFile(join(vendor, asset.source))) !== asset.sourceSha256) throw new Error(`Neutral logo source changed: ${asset.target}`);
    } else throw new Error(`Unknown logo provenance: ${asset.target}`);
    const bytes = await readFile(join(vendor, asset.file));
    if (digest(bytes) !== asset.sha256) throw new Error(`Logo asset changed: ${asset.target}`);
    if (asset.target.endsWith('.svg')) {
      const svg = bytes.toString('utf8');
      if (!svg.includes('<svg') || /<script\b|<foreignObject\b|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(svg)) throw new Error(`Unsafe logo SVG: ${asset.target}`);
    } else if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid logo PNG: ${asset.target}`);
  }
  return manifest;
}

export async function copyDirectoryLogoAssets(root: string, appDirectory: string): Promise<void> {
  const manifest = await validateDirectoryLogoAssets(root);
  const vendor = join(root, 'wordpress/directory/vendor/provider-icons');
  for (const asset of manifest.assets) {
    const destination = join(appDirectory, asset.target);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(vendor, asset.file), destination);
  }
  const notices = join(appDirectory, 'brand-licences');
  await mkdir(notices, { recursive: true });
  for (const source of manifest.sources) await cp(join(vendor, source.licenseFile), join(notices, source.licenseFile));
  await cp(join(vendor, 'original-neutral.svg'), join(notices, 'original-neutral.svg'));
  await writeFile(join(appDirectory, 'provider-asset-sources.json'), JSON.stringify(manifest, null, 2) + '\n');
}
