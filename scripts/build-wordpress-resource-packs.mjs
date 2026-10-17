import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertZipProductIsolation } from './product-isolation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const outputRoot = resolve(process.env.PIXFLOW_DESIGN_RESOURCE_OUTPUT_DIR || join(distDir, 'wordpress-resource-packs'));
if (!outputRoot.startsWith(distDir + '/') && !outputRoot.startsWith(distDir + '\\')) {
  throw new Error('Resource output must be a child of dist.');
}
const packagesRoot = join(outputRoot, 'packages');
const baseUrl = process.env.PIXFLOW_DESIGN_RESOURCE_BASE_URL || 'https://pixflow.dev/downloads/pixflow-design/resources';
const resourceRelease = JSON.parse(await readFile(join(root, 'wordpress', 'resource-packs-release.json'), 'utf8'));
// Fail before touching artifacts: the inherited catalogue is not the future Resource Hub.
if (resourceRelease.retired) throw new Error('The Community resource catalogue is retired. Existing archives are preserved; no replacement pack is built.');
const version = process.env.PIXFLOW_DESIGN_RESOURCE_VERSION || String(resourceRelease.version || '').trim();
const minPluginVersion = process.env.PIXFLOW_DESIGN_MIN_PLUGIN_VERSION
  || String(resourceRelease.minimumPluginVersion || version).trim();
if (!version || !minPluginVersion) {
  throw new Error('wordpress/resource-packs-release.json must declare version and minimumPluginVersion.');
}

const packs = [
  {
    slug: 'plugins',
    type: 'plugins',
    name: 'Creative Resources',
    description: 'Optional image, video and web design recipes with preview assets.',
    sourcePath: 'plugins',
    contentRoots: {
      plugins: 'plugins',
    },
    licenseRequired: false,
    optional: true,
    recommended: true,
    installPriority: 25,
  },
  {
    slug: 'design-templates',
    type: 'design-templates',
    name: 'Design Templates',
    description: 'Pixflow Design template metadata and bundled preview assets.',
    sourcePath: 'design-templates',
    contentRoots: {
      'design-templates': 'design-templates',
    },
    licenseRequired: false,
    optional: true,
    recommended: true,
    installPriority: 35,
  },
  {
    slug: 'design-systems',
    type: 'design-systems',
    name: 'Style References',
    description: 'Optional visual style references. Native saved site systems are managed separately.',
    sourcePath: 'design-systems',
    contentRoots: {
      'design-systems': 'design-systems',
    },
    licenseRequired: false,
    optional: true,
    recommended: true,
    installPriority: 40,
  },
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(packagesRoot, { recursive: true });

const manifestPacks = [];
for (const pack of packs) {
  const source = join(root, pack.sourcePath);
  if (!existsSync(source)) {
    console.warn(`Skipping missing resource pack source: ${pack.sourcePath}`);
    continue;
  }

  const contentRevision = `sha256:${await directoryContentRevision(source)}`;

  const archiveName = `pixflow-design-resource-${pack.slug}-${version}.zip`;
  const archivePath = join(packagesRoot, archiveName);
  await buildPackArchive(pack, archivePath, contentRevision);

  const archiveStat = await stat(archivePath);
  const checksum = await sha256(archivePath);
  const checksumQuery = checksum.slice(0, 16);
  manifestPacks.push({
    slug: pack.slug,
    type: pack.type,
    name: pack.name,
    description: pack.description,
    channel: 'stable',
    version,
    revision: contentRevision,
    size: archiveStat.size,
    checksum: `sha256:${checksum}`,
    checksumAlgorithm: 'sha256',
    archiveUrl: `${baseUrl}/packages/${archiveName}?v=${checksumQuery}`,
    licenseRequired: pack.licenseRequired,
    optional: pack.optional,
    recommended: pack.recommended,
    installPriority: pack.installPriority,
    compatibility: {
      minPluginVersion,
    },
    dependencies: [],
    contentRoots: pack.contentRoots,
  });

  console.log(`Created ${relative(root, archivePath).replaceAll('\\', '/')} (${archiveStat.size} bytes)`);
}

const manifest = {
  schemaVersion: '1.0',
  product: 'pixflow-design-resources',
  generatedAt: new Date().toISOString(),
  minimumPluginVersion: minPluginVersion,
  sourceUrl: `${baseUrl}/latest.json`,
  packs: manifestPacks,
};

await writeFile(join(outputRoot, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Created ${relative(root, join(outputRoot, 'latest.json')).replaceAll('\\', '/')}`);

async function buildPackArchive(pack, destination, contentRevision) {
  const zip = new JSZip();
  zip.file('pixflow-pack.json', `${JSON.stringify({
    slug: pack.slug,
    type: pack.type,
    name: pack.name,
    version,
    revision: contentRevision,
    schemaVersion: '1.0',
    contentRoots: pack.contentRoots,
    migration: {
      preserves: [
        'projects',
        'onboarding',
        'design-system-settings',
        'local-memory',
        'bridge-site-folders',
        'uploaded-user-assets',
      ],
    },
  }, null, 2)}\n`);

  await addDirectoryToZip(zip, join(root, pack.sourcePath), pack.sourcePath);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  await assertZipProductIsolation(await JSZip.loadAsync(zipBuffer), `WordPress resource archive ${pack.slug}`);
  await writeFile(destination, zipBuffer);
}

async function addDirectoryToZip(zip, absoluteDir, zipDir) {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry.name);
    const zipPathname = `${zipDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, absolutePath, zipPathname);
      continue;
    }
    if (entry.isFile()) {
      zip.file(zipPathname, await readFile(absolutePath));
    }
  }
}

async function directoryContentRevision(absoluteDir) {
  const hash = createHash('sha256');
  await appendDirectoryRevision(hash, absoluteDir, absoluteDir);
  return hash.digest('hex');
}

async function appendDirectoryRevision(hash, rootDir, currentDir) {
  const entries = (await readdir(currentDir, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await appendDirectoryRevision(hash, rootDir, absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;
    hash.update(relative(rootDir, absolutePath).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(absolutePath));
    hash.update('\0');
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}
