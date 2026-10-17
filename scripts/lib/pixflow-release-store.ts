import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm, rmdir, statfs } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const manifestPaths = [
  'downloads/pixflow-design/resources/latest.json',
  'downloads/pixflow-design-bridge/latest.json',
  'downloads/pixflow-design-bridge/resources/latest.json',
] as const;
export type Product = 'plugin' | 'pro' | 'bridge' | 'resources';
export type Target = 'production' | 'staging';
export type Json = Record<string, unknown>;
export interface Artifact extends Json {
  artifact_id: string; type: 'plugin' | 'resource-pack'; slug: string; name: string;
  version: string; sha256: string; bytes: number; filename: string; channel: 'stable'; current: boolean;
}
export interface Snapshot { schemaVersion: 1; release_id: string; artifacts: Artifact[]; public_manifests: Record<string, Json> }
export interface Store { target: Target; privateRoot: string; publicRoot: string }
export interface Base { hash: string; snapshot: Snapshot }
export interface ReleaseFile { source: string; destination: string; visibility: 'private' | 'public'; sha256: string; bytes: number }
export interface Plan { product: Product; target: Target; baseHash: string; snapshot: Snapshot; files: ReleaseFile[] }
const digest = /^[a-f0-9]{64}$/;
const safeId = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function object(value: unknown): Json { check(value && typeof value === 'object' && !Array.isArray(value), 'Expected JSON object'); return value as Json; }
export function version(value: unknown): string { check(typeof value === 'string' && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value), 'Use a stable x.y.z or x.y.z.hotfix release version'); return value; }
export function compareVersions(a: string, b: string): number {
  const left = version(a).split('.').map(Number), right = version(b).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
export async function fileDigest(file: string): Promise<{sha256: string; bytes: number}> {
  const info = await lstat(file); check(info.isFile() && !info.isSymbolicLink(), 'Release inputs must be regular files');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { sha256: hash.digest('hex'), bytes: info.size };
}
/** Reject links in every path component; release inputs may never escape the configured roots. */
export async function contained(root: string, name: string): Promise<string> {
  check(isAbsolute(root), 'Release roots must be absolute');
  check(name !== '' && !isAbsolute(name) && !name.includes('\\') && name.split('/').every(x => x && x !== '.' && x !== '..'), 'Invalid release path');
  const absolute = resolve(root, name), rel = relative(root, absolute);
  check(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'Release path escapes its root');
  // Including root ancestors prevents a configured symlink mount from hiding a second root.
  let current = absolute;
  while (true) {
    try { check(!(await lstat(current)).isSymbolicLink(), 'Symlinks are not release paths'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
  return absolute;
}
async function optional(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function validateSnapshot(snapshot: Snapshot): void {
  check(Buffer.byteLength(serialize(snapshot)) <= 2_000_000, 'Release snapshot is too large');
  check(Object.keys(snapshot).every(k => ['schemaVersion','release_id','artifacts','public_manifests'].includes(k)), 'Unknown snapshot property');
  check(snapshot.schemaVersion === 1 && typeof snapshot.release_id === 'string' && safeId.test(snapshot.release_id), 'Invalid release snapshot identity');
  check(Array.isArray(snapshot.artifacts) && snapshot.artifacts.length <= 100, 'Invalid artifact catalog');
  const ids = new Set<string>(), current = new Set<string>(), filenames = new Map<string, string>();
  for (const a of snapshot.artifacts) {
    check(typeof a.artifact_id === 'string' && safeId.test(a.artifact_id) && !ids.has(a.artifact_id), 'Duplicate or invalid artifact ID'); ids.add(a.artifact_id);
    check(Object.keys(a).every(k => ['artifact_id','type','slug','name','version','sha256','bytes','filename','channel','current','edition','requires','tested','requires_php','homepage','author','sections','icons','banners'].includes(k)), 'Unknown artifact property');
    for (const key of ['requires','tested','requires_php']) if (a[key] !== undefined) check(typeof a[key] === 'string' && /^\d+(\.\d+){1,2}$/.test(a[key]), 'Invalid plugin requirements');
    const https = (value: unknown) => { check(typeof value === 'string' && value.length <= 2048 && new URL(value).protocol === 'https:', 'Invalid release metadata URL'); };
    if (a.homepage !== undefined) https(a.homepage);
    if (a.author !== undefined) check(typeof a.author === 'string' && a.author.length <= 1000, 'Invalid release author');
    for (const [key, keys] of [['sections',['description','installation','changelog','faq','screenshots','other_notes']],['icons',['1x','2x','svg']],['banners',['low','high']]] as const) {
      if (a[key] === undefined) continue;
      for (const [name, value] of Object.entries(object(a[key]))) {
        check((keys as readonly string[]).includes(name), 'Unknown plugin metadata property');
        if (key === 'sections') check(typeof value === 'string' && value.length <= 80000, 'Release section is too long'); else https(value);
      }
    }
    check(['plugin', 'resource-pack'].includes(a.type) && ['pixflow-design','pixflow-design-pro','plugins','design-templates','design-systems'].includes(a.slug), 'Invalid artifact type/slug');
    check((a.type === 'plugin') === ['pixflow-design', 'pixflow-design-pro'].includes(a.slug), 'Artifact type/slug mismatch');
    if (a.edition !== undefined) check(a.slug === 'pixflow-design' && ['bundled', 'free'].includes(String(a.edition)), 'Edition belongs to the core plugin');
    version(a.version);
    check(a.channel === 'stable' && typeof a.current === 'boolean', 'Invalid release channel');
    check(digest.test(a.sha256) && Number.isSafeInteger(a.bytes) && a.bytes > 0 && /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(a.filename), 'Invalid private artifact');
    check(typeof a.name === 'string' && a.name.length > 0 && a.name.length <= 200, 'Invalid artifact name');
    check(!filenames.has(a.filename), 'Conflicting artifact filename'); filenames.set(a.filename, a.sha256);
    if (a.current) { const key = a.type + ':' + a.slug; check(!current.has(key), 'Ambiguous current artifact'); current.add(key); }
  }
  check(!snapshot.artifacts.some(a => a.type === 'plugin') || snapshot.artifacts.filter(a => a.type === 'plugin' && a.slug === 'pixflow-design' && a.current).length === 1, 'Select one current core plugin');
  check(!snapshot.artifacts.some(a => a.current && a.slug === 'pixflow-design' && a.edition === 'free') || snapshot.artifacts.some(a => a.current && a.slug === 'pixflow-design-pro'), 'The Free migration requires a current Pro download');
  object(snapshot.public_manifests);
  for (const [key, manifest] of Object.entries(snapshot.public_manifests)) {
    check((manifestPaths as readonly string[]).includes(key), 'Unknown public manifest'); object(manifest);
    validatePublicUrls(manifest);
    if (key === manifestPaths[0]) {
      check(Array.isArray(manifest.packs) && manifest.packs.length <= 30, 'Missing resource packs');
      const packSlugs = new Set();
      for (const value of manifest.packs) {
        const pack = object(value);
        check(['plugins','design-templates','design-systems'].includes(String(pack.slug)) && !packSlugs.has(pack.slug), 'Invalid or duplicate resource slug'); packSlugs.add(pack.slug);
        version(pack.version);
        check(Number.isSafeInteger(pack.size) && Number(pack.size) > 0 && /^sha256:[a-f0-9]{64}$/.test(String(pack.checksum)) && typeof pack.licenseRequired === 'boolean', 'Invalid resource metadata');
        if (pack.licenseRequired !== true && pack.artifact_id === undefined) continue;
        const artifact = snapshot.artifacts.find(a => a.artifact_id === pack.artifact_id && a.current && a.type === 'resource-pack');
        check(artifact && artifact.slug === pack.slug && artifact.version === pack.version && artifact.bytes === pack.size && 'sha256:' + artifact.sha256 === pack.checksum, 'Resource metadata does not match its current artifact');
        check(pack.licenseRequired === true && pack.archiveUrl === undefined && compareVersions(String(object(pack.compatibility).minPluginVersion), '1.1.6') >= 0 && compareVersions(String(manifest.minimumPluginVersion), '1.1.6') >= 0, 'Protected resources require the signed client and no public archive URL');
      }
    }
  }
  const packs = snapshot.public_manifests[manifestPaths[0]]?.packs as Json[] | undefined;
  for (const artifact of snapshot.artifacts.filter(a => a.type === 'resource-pack' && a.current)) {
    const pack = packs?.find(p => p.slug === artifact.slug);
    check(pack && pack.version === artifact.version && pack.size === artifact.bytes && pack.checksum === 'sha256:' + artifact.sha256, 'Resource discovery/catalog mismatch');
  }
}
function validatePublicUrls(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(validatePublicUrls); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:url|archiveUrl|sourceUrl|windows|linux|macos|macosArm64|macosX64)$/i.test(key) && typeof child === 'string') {
      const url = new URL(child), discovery = key === 'sourceUrl' && url.pathname === '/api/catalogs/v1/resources' && !url.search;
      check(url.origin === 'https://pixflow.dev' && !url.username && !url.password && (url.pathname.startsWith('/downloads/') || discovery) && [...url.searchParams.keys()].every(k => k === 'v'), 'Unsafe public release URL');
    }
    validatePublicUrls(child);
  }
}
export async function readBase(store: Store): Promise<Base> {
  check(['production','staging'].includes(store.target), 'Choose production or staging explicitly');
  const pointer = await optional(await contained(store.privateRoot, `current-release.${store.target}.json`));
  if (pointer !== null) {
    const p = object(JSON.parse(pointer)); check(p.schemaVersion === 1 && safeId.test(String(p.release_id)) && digest.test(String(p.sha256)), 'Invalid release pointer');
    const raw = await readFile(await contained(store.privateRoot, `releases/${p.release_id}.json`), 'utf8');
    check(sha256(raw) === p.sha256, 'Release snapshot checksum mismatch');
    const snapshot = JSON.parse(raw) as Snapshot; validateSnapshot(snapshot); check(snapshot.release_id === p.release_id, 'Release pointer identity mismatch');
    return { hash: sha256(pointer), snapshot };
  }
  const rawCatalog = await optional(await contained(store.privateRoot, 'manifest.json'));
  const artifacts = (JSON.parse(rawCatalog ?? '[]') as Artifact[]).map(a => ({ ...a, channel: a.channel ?? 'stable', current: a.current ?? true,
    slug: a.slug || (a.type === 'plugin' ? 'pixflow-design' : ['plugins','design-templates','design-systems'].find(s => a.artifact_id.startsWith('resource-' + s + '-'))!) }));
  const public_manifests: Record<string, Json> = {}, rawPublic: Record<string, string | null> = {};
  for (const name of manifestPaths) { const raw = await optional(await contained(store.publicRoot, name)); rawPublic[name] = raw; if (raw !== null) public_manifests[name] = object(JSON.parse(raw)); }
  const snapshot: Snapshot = { schemaVersion: 1, release_id: 'legacy', artifacts, public_manifests }; validateSnapshot(snapshot);
  return { hash: sha256(serialize({ catalog: rawCatalog, public: rawPublic })), snapshot };
}
async function atomicWrite(file: string, bytes: string): Promise<void> {
  const temp = file + '.' + randomUUID() + '.tmp'; await mkdir(dirname(file), { recursive: true });
  const handle = await open(temp, 'wx', 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, file); } finally { await rm(temp, { force: true }); }
}
function validateTransition(base: Snapshot, plan: Plan): void {
  check(['plugin', 'pro', 'bridge', 'resources'].includes(plan.product), 'Invalid release product');
  validateSnapshot(plan.snapshot);
  const owns = (a: Artifact) => plan.product === 'plugin' ? a.type === 'plugin' : plan.product === 'pro' ? a.type === 'plugin' && a.slug === 'pixflow-design-pro' : plan.product === 'resources' && a.type === 'resource-pack';
  check(serialize(base.artifacts.filter(a => !owns(a))) === serialize(plan.snapshot.artifacts.filter(a => !owns(a))), 'Unrelated artifacts must be preserved');
  for (const old of base.artifacts) {
    const retained = plan.snapshot.artifacts.find(a => a.artifact_id === old.artifact_id);
    check(retained && serialize({ ...old, current: false }) === serialize({ ...retained, current: false }), 'Published artifact history is immutable');
    if (old.current) {
      const next = plan.snapshot.artifacts.find(a => a.current && a.type === old.type && a.slug === old.slug);
      check(next && compareVersions(next.version, old.version) >= 0, 'Refusing release downgrade');
      if (next.version === old.version) check(next.sha256 === old.sha256, 'A published version cannot change bytes');
    }
  }
  for (const next of plan.snapshot.artifacts) {
    const prior = base.artifacts.find(a => a.type === next.type && a.slug === next.slug && a.version === next.version);
    if (prior) check(prior.sha256 === next.sha256, 'A published version cannot change bytes');
  }
  for (const name of manifestPaths) {
    const old = base.public_manifests[name], next = plan.snapshot.public_manifests[name];
    const owned = plan.product === 'bridge' ? name !== manifestPaths[0] : plan.product === 'resources' && name === manifestPaths[0];
    if (!owned) check(JSON.stringify(old) === JSON.stringify(next), 'Unrelated public manifests must be preserved');
    if (!old) continue; check(next, 'Unrelated public manifests must be preserved');
    if (name === manifestPaths[1]) {
      check(compareVersions(String(next.version), String(old.version)) >= 0, 'Refusing bridge downgrade');
      if (next.version === old.version) check(serialize(next) === serialize(old), 'A published bridge version is immutable');
    }
  }
}
/** The pointer is the only activation write; failures leave the previous release readable. */
export async function publishPlan(store: Store, plan: Plan, apply = false): Promise<Json> {
  const privatePath = resolve(store.privateRoot), publicPath = resolve(store.publicRoot);
  check(privatePath !== publicPath && !privatePath.startsWith(publicPath + sep) && !publicPath.startsWith(privatePath + sep), 'Private and public roots must not overlap');
  check(plan.target === store.target, 'Plan target mismatch');
  const base = await readBase(store); check(plan.baseHash === base.hash, 'Release base changed; prepare again'); validateTransition(base.snapshot, plan);
  const destinations = new Set<string>();
  for (const file of plan.files) {
    check(file.visibility === 'private' || file.visibility === 'public', 'Invalid artifact visibility');
    check(plan.product === 'bridge' ? file.visibility === 'public' : file.visibility === 'private', 'Product visibility mismatch');
    const destination = await contained(file.visibility === 'private' ? store.privateRoot : store.publicRoot, file.destination);
    check(!destinations.has(destination), 'Duplicate upload destination'); destinations.add(destination);
    check(file.visibility === 'private' ? /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(file.destination) : /^downloads\/pixflow-design-bridge\/(?:packages|releases)\/[A-Za-z0-9._/-]+$/.test(file.destination), 'Only immutable component assets may be uploaded');
    const actual = await fileDigest(file.source); check(actual.sha256 === file.sha256 && actual.bytes === file.bytes, 'Upload source checksum mismatch');
    try { const existing = await fileDigest(destination); check(existing.sha256 === file.sha256 && existing.bytes === file.bytes, 'Immutable destination already has different bytes'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  // A dry run must prove the entire retained catalog can still be served too.
  for (const artifact of plan.snapshot.artifacts) {
    const upload = plan.files.find(f => f.visibility === 'private' && f.destination === artifact.filename);
    const actual = upload ?? await fileDigest(await contained(store.privateRoot, artifact.filename));
    check(actual.sha256 === artifact.sha256 && actual.bytes === artifact.bytes, 'Catalog artifact is absent or corrupt');
  }
  if (!apply) return { applied: false, target: store.target, release_id: plan.snapshot.release_id, files: plan.files.length, bytes: plan.files.reduce((sum, f) => sum + f.bytes, 0), baseHash: base.hash };
  await mkdir(store.privateRoot, { recursive: true }); await mkdir(store.publicRoot, { recursive: true });
  const lock = await contained(store.privateRoot, '.publish-lock');
  await mkdir(lock); // Atomic across both targets because immutable files share these roots.
  try {
    check((await readBase(store)).hash === plan.baseHash, 'Release base changed while acquiring publication lock');
    for (const [visibility, root] of [['private', store.privateRoot], ['public', store.publicRoot]] as const) {
      const disk = await statfs(root); const needed = plan.files.filter(f => f.visibility === visibility).reduce((sum, f) => sum + f.bytes, 0);
      check(disk.bavail * disk.bsize > needed + 64 * 1024 * 1024, 'Insufficient release storage');
    }
    for (const file of plan.files) {
      const dest = await contained(file.visibility === 'private' ? store.privateRoot : store.publicRoot, file.destination);
      await mkdir(dirname(dest), { recursive: true });
      try { const existing = await fileDigest(dest); check(existing.sha256 === file.sha256 && existing.bytes === file.bytes, 'Immutable destination conflict'); continue; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const temp = dest + '.' + randomUUID() + '.tmp';
      try { await copyFile(file.source, temp); const copied = await fileDigest(temp); check(copied.sha256 === file.sha256 && copied.bytes === file.bytes, 'Copied artifact checksum mismatch'); await rename(temp, dest); }
      finally { await rm(temp, { force: true }); }
    }
    // Confirm the full catalog is deliverable, including retained historical account downloads.
    for (const artifact of plan.snapshot.artifacts) {
      const bytes = await fileDigest(await contained(store.privateRoot, artifact.filename));
      check(bytes.sha256 === artifact.sha256 && bytes.bytes === artifact.bytes, 'Catalog artifact is absent or corrupt');
    }
    const raw = serialize(plan.snapshot), snapshotPath = await contained(store.privateRoot, `releases/${plan.snapshot.release_id}.json`);
    const oldSnapshot = await optional(snapshotPath); check(oldSnapshot === null || oldSnapshot === raw, 'Snapshot identity already exists with different content');
    if (oldSnapshot === null) await atomicWrite(snapshotPath, raw);
    const pointerPath = await contained(store.privateRoot, `current-release.${store.target}.json`), previous = await optional(pointerPath);
    if (previous !== null) await atomicWrite(await contained(store.privateRoot, `previous-release.${store.target}.json`), previous);
    else {
      const legacy = { ...base.snapshot, release_id: 'legacy-' + base.hash.slice(0, 24) };
      const legacyRaw = serialize(legacy); await atomicWrite(await contained(store.privateRoot, `releases/${legacy.release_id}.json`), legacyRaw);
      await atomicWrite(await contained(store.privateRoot, `previous-release.${store.target}.json`), serialize({ schemaVersion: 1, release_id: legacy.release_id, sha256: sha256(legacyRaw) }));
    }
    await atomicWrite(pointerPath, serialize({ schemaVersion: 1, release_id: plan.snapshot.release_id, sha256: sha256(raw) }));
    const confirmed = await readBase(store); check(confirmed.snapshot.release_id === plan.snapshot.release_id, 'Release activation verification failed');
    return { applied: true, target: store.target, release_id: plan.snapshot.release_id, snapshotSha256: sha256(raw) };
  } finally { await rmdir(lock); }
}

// Standalone runner copied into a pinned, network-disabled Node container by the SSH client.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const input = JSON.parse(await readFile(process.argv[3]!, 'utf8')) as { store: Store; plan?: Plan; apply?: boolean };
    if (process.argv[2] === 'read') process.stdout.write(serialize(await readBase(input.store)));
    else if (process.argv[2] === 'publish' && input.plan) {
      // Uploaded sources are bundle-relative identifiers, never arbitrary host filesystem paths.
      const bundleRoot = await realpath(dirname(process.argv[3]!));
      for (const file of input.plan.files) file.source = await contained(bundleRoot, file.source);
      process.stdout.write(serialize(await publishPlan(input.store, input.plan, input.apply === true)));
    } else throw new Error('Invalid publisher operation');
  } catch (error) { process.stderr.write((error as Error).message + '\n'); process.exitCode = 1; }
}
