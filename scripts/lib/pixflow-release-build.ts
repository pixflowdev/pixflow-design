import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import JSZip from 'jszip';
import { check, compareVersions, contained, fileDigest, manifestPaths, object, validateSnapshot, version } from './pixflow-release-store.ts';
import type { Artifact, Base, Json, Plan, Product, ReleaseFile, Target } from './pixflow-release-store.ts';

const slugs = ['plugins', 'design-templates', 'design-systems'];
const publicOrigin = 'https://pixflow.dev';
export interface BuildOptions { product: Product; target: Target; source: string; edition?: 'bundled' | 'free'; proSource?: string; allowWindowsOnly?: boolean; notes?: string }

/** Prepare one component from already built bytes. Building and activating are separate operations. */
export async function prepareRelease(base: Base, options: BuildOptions): Promise<Plan> {
  const snapshot = structuredClone(base.snapshot);
  snapshot.release_id = `${options.product}-${randomUUID()}`;
  const files: ReleaseFile[] = [];
  const put = async (source: string, destination: string, visibility: 'private' | 'public') => {
    const info = await fileDigest(source);
    const previous = files.find(f => f.visibility === visibility && f.destination === destination);
    if (previous) check(previous.sha256 === info.sha256, 'Conflicting input files');
    else files.push({ source: resolve(source), destination, visibility, ...info });
    return info;
  };
  const addArtifact = (artifact: Artifact) => {
    const existing = snapshot.artifacts.find(a => a.type === artifact.type && a.slug === artifact.slug && a.version === artifact.version);
    if (existing) check(existing.sha256 === artifact.sha256, 'A published version cannot change bytes');
    for (const old of snapshot.artifacts) if (old.type === artifact.type && old.slug === artifact.slug) old.current = false;
    if (existing) existing.current = true;
    else snapshot.artifacts.push(artifact);
    return existing ?? artifact;
  };
  check(options.edition === undefined || (options.product === 'plugin' && ['bundled', 'free'].includes(options.edition)), 'Edition applies only to the core plugin');
  check(options.proSource === undefined || (options.product === 'plugin' && options.edition === 'free'), 'A paired Pro source requires a Free core release');
  const addPlugin = async (source: string, pro: boolean) => {
    const slug = pro ? 'pixflow-design-pro' : 'pixflow-design';
    const entryPath = pro ? 'pixflow-design-pro/pixflow-design-pro.php' : 'pixflow-ai/pixflow-ai.php';
    const zip = await JSZip.loadAsync(await readFile(source));
    const entry = zip.file(entryPath);
    check(entry, `Plugin ZIP must contain ${entryPath}`);
    const header = await entry.async('string');
    const field = (key: string) => header.match(new RegExp('^\\s*\\*?\\s*' + key + ':\\s*(.+)$', 'mi'))?.[1]?.trim();
    if (pro) check(field('Requires Plugins')?.split(',').map(x => x.trim()).includes('pixflow-ai'), 'Pro must declare its core dependency');
    const v = version(field('Version')), info = await fileDigest(source);
    const filename = `${slug}-${v}-${info.sha256.slice(0, 16)}.zip`;
    const metadata: Json = !pro && options.edition ? { edition: options.edition } : {};
    metadata.icons = { svg: `${publicOrigin}/icon.svg` };
    for (const [label, key] of [['Requires at least','requires'], ['Tested up to','tested'], ['Requires PHP','requires_php']] as const) {
      const value = field(label); if (value) { check(/^\d+(?:\.\d+){0,2}$/.test(value), 'Invalid plugin requirements'); metadata[key] = value; }
    }
    if (options.notes) metadata.sections = { changelog: await readFile(options.notes, 'utf8') };
    const artifact = addArtifact({ artifact_id: `${pro ? 'plugin-pro' : 'plugin'}-${v}-${info.sha256.slice(0, 16)}`, type: 'plugin', slug, name: pro ? 'Pixflow Design Pro' : 'Pixflow Design', version: v, filename, ...info, channel: 'stable', current: true, ...metadata });
    await put(source, artifact.filename, 'private');
  };
  if (options.product === 'plugin' || options.product === 'pro') {
    await addPlugin(options.source, options.product === 'pro');
    if (options.proSource) await addPlugin(options.proSource, true);
  } else if (options.product === 'resources') {
    const manifest = object(JSON.parse(await readFile(resolve(options.source, 'latest.json'), 'utf8')));
    check(Array.isArray(manifest.packs), 'Resource manifest needs packs');
    check(manifest.packs.length === 3 && new Set(manifest.packs.map(p => object(p).slug)).size === 3, 'Build all three supported resource packs');
    for (const input of manifest.packs) {
      const pack = object(input), slug = String(pack.slug), v = version(pack.version);
      check(slugs.includes(slug), 'Unknown resource pack');
      const url = new URL(String(pack.archiveUrl));
      check(url.origin === publicOrigin && url.pathname.startsWith('/downloads/pixflow-design/resources/packages/'), 'Invalid resource archive URL');
      const source = await contained(resolve(options.source), 'packages/' + basename(url.pathname));
      const info = await fileDigest(source);
      check(pack.size === info.bytes && pack.checksum === 'sha256:' + info.sha256, 'Resource checksum mismatch');
      const zip = await JSZip.loadAsync(await readFile(source));
      const entry = zip.file('pixflow-pack.json'); check(entry, 'Missing resource pack identity');
      const identity = object(JSON.parse(await entry.async('string')));
      check(identity.slug === slug && identity.version === v && identity.revision === pack.revision, 'Resource ZIP identity mismatch');
      const filename = `resource-${slug}-${v}-${info.sha256.slice(0, 16)}.zip`;
      const artifact = addArtifact({ artifact_id: `resource-${slug}-${v}-${info.sha256.slice(0, 16)}`, type: 'resource-pack', slug, name: String(pack.name), version: v, filename, ...info, channel: 'stable', current: true });
      await put(source, artifact.filename, 'private');
      delete pack.archiveUrl;
      pack.artifact_id = artifact.artifact_id; pack.licenseRequired = true;
      const compatibility = object(pack.compatibility ?? {});
      compatibility.minPluginVersion = compareVersions(String(compatibility.minPluginVersion ?? '0.0.0'), '2.0.0') < 0 ? '2.0.0' : compatibility.minPluginVersion;
      pack.compatibility = compatibility;
    }
    manifest.minimumPluginVersion = compareVersions(String(manifest.minimumPluginVersion ?? '0.0.0'), '2.0.0') < 0 ? '2.0.0' : manifest.minimumPluginVersion;
    manifest.sourceUrl = publicOrigin + '/api/catalogs/v1/resources';
    // The snapshot key is internal; v2.0.0 reads /api/catalogs/v1/resources.
    // The old public latest.json stays on disk for pre-v2.0.0 clients.
    snapshot.public_manifests[manifestPaths[0]] = manifest;
  } else {
    const manifest = object(JSON.parse(await readFile(resolve(options.source, 'latest.json'), 'utf8')));
    const v = version(manifest.version); check(manifest.channel === 'stable', 'Expected stable bridge channel');
    check(Array.isArray(manifest.assets) && Array.isArray(manifest.installerAssets), 'Incomplete bridge manifest');
    const assets = [...manifest.assets, ...manifest.installerAssets].map(object);
    check(assets.some(a => a.platform === 'win32' && a.arch === 'x64'), 'Windows installer missing');
    check(options.allowWindowsOnly || assets.some(a => a.platform === 'darwin' && a.arch === 'arm64'), 'macOS ARM installer missing; use --allow-windows-only only for an intentional Windows-only release');
    check(options.allowWindowsOnly || assets.some(a => a.platform === 'darwin' && a.arch === 'x64'), 'macOS Intel installer missing');
    for (const asset of assets) {
      const url = new URL(String(asset.url));
      check(url.origin === publicOrigin && url.pathname.startsWith('/downloads/pixflow-design-bridge/packages/') && basename(url.pathname).includes(v), 'Bridge assets must have versioned public URLs');
      const relativePath = url.pathname.slice('/downloads/pixflow-design-bridge/'.length);
      const source = await contained(resolve(options.source), relativePath);
      const info = await put(source, url.pathname.slice(1), 'public');
      check(info.sha256 === asset.sha256 && info.bytes === asset.size, 'Bridge checksum mismatch');
    }
    const installers = object(manifest.installers ?? {});
    for (const [key, platform, arch] of [['windows','win32','x64'], ['macos','darwin','x64'], ['macosX64','darwin','x64'], ['macosArm64','darwin','arm64']] as const) {
      const asset = assets.find(a => a.platform === platform && a.arch === arch);
      if (asset) installers[key] = asset.url;
      else delete installers[key];
    }
    if (installers.linux) {
      const source = await contained(resolve(options.source), 'install.sh'), info = await fileDigest(source);
      const path = `downloads/pixflow-design-bridge/releases/${v}-${info.sha256.slice(0, 16)}/install.sh`;
      await put(source, path, 'public'); installers.linux = publicOrigin + '/' + path;
    }
    manifest.installers = installers;
    snapshot.public_manifests[manifestPaths[1]] = manifest;
  }
  validateSnapshot(snapshot);
  return { product: options.product, target: options.target, baseHash: base.hash, snapshot, files };
}
