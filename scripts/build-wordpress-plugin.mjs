import JSZip from 'jszip';
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertZipProductIsolation } from './product-isolation.mjs';
import { buildWordPressTranslations } from './build-wordpress-translations.ts';
import { writeWordPressPackageOutputs } from './wordpress-package-output.ts';
import { copyBundledWordPressGuidance } from './bundled-wordpress-guidance.ts';
import { assertDistributionAssets, prepareDirectoryPhp, wordpressDistribution } from './wordpress-directory-package.ts';
import { writeDirectoryNotices } from './wordpress-directory-notices.ts';
import { packageDirectorySources } from './wordpress-directory-source.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const outputDir = resolve(process.env.PIXFLOW_DESIGN_PACKAGE_OUTPUT_DIR || distDir);
const distribution = wordpressDistribution(process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION);
const directoryBuild = distribution === 'directory';
// Separate output roots prevent a submission candidate replacing the approved
// website update package or its staged files, even when both builds run locally.
const stageRoot = join(outputDir, directoryBuild ? 'wordpress-directory/stage' : 'wordpress-plugin');
const packageSlug = process.env.PIXFLOW_DESIGN_WORDPRESS_PACKAGE_SLUG || 'pixflow-ai';
const entryFile = process.env.PIXFLOW_DESIGN_WORDPRESS_ENTRY_FILE || (packageSlug === 'pixflow-ai' ? 'pixflow-ai.php' : 'pixflow-design.php');
const pluginDir = join(stageRoot, packageSlug);
if (directoryBuild && (packageSlug !== 'pixflow-ai' || entryFile !== 'pixflow-ai.php')) {
  throw new Error('Directory candidate identity must remain pixflow-ai/pixflow-ai.php until an explicit approved-slug migration.');
}
const zipPath = join(outputDir, ...(directoryBuild ? ['wordpress-directory'] : []), `${packageSlug}.zip`);
const appAssets = process.env.PIXFLOW_DESIGN_WORDPRESS_ASSET_DIR
  ? resolve(process.env.PIXFLOW_DESIGN_WORDPRESS_ASSET_DIR)
  : directoryBuild ? join(root, '.tmp/wordpress-directory/assets/app') : join(root, 'wordpress/assets/app');
await assertDistributionAssets(appAssets, distribution);
const languageRoot = join(root, '.tmp/wordpress-package-translations', `${process.pid}-${Date.now()}`);
await buildWordPressTranslations(false, { outputRoot: languageRoot });

const requiredPaths = [
  'readme.txt',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
];

// Pixflow-owned: source stays close to the OD fork (`wordpress/src`,
// `wordpress/assets`), but release zips install like a normal WP plugin.
const mappedPaths = [
  ['wordpress/src', 'src'],
  ['wordpress/assets', 'assets'],
  ['wordpress/resources', 'resources'],
  ['wordpress/languages', 'languages'],
  // Website Clone is a first-class composer capability, not optional DLC.
  // Ship its scenario with the WordPress app so Home and Library can resolve
  // it even before the larger plugin resource pack is installed or updated.
];
// Builder motion runtimes belong to the Pro add-on, which owns their consumers.
const vendorFiles = [];

// Copy only the audited WebAuthn runtime. Pixflow's path-aware loader owns its
// namespace, so generated Composer paths never enter the release package.
const composerVendorPaths = [];
const optionalPaths = [];
const excludedSegments = new Set([
  '.git',
  '.github',
  '.next',
  '.turbo',
  '.vite',
  'node_modules',
  'test-results',
  'playwright-report',
  '__tests__',
  '__snapshots__',
]);
const excludedExtensions = new Set([
  '.map',
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs.map',
  '.cjs.map',
]);

function shouldPackagePath(absolutePath) {
  const relativePath = relative(root, absolutePath);
  const parts = relativePath.split(/[\\/]+/);
  // WordPress translation source stays in the repository; installed language
  // data lives outside replaceable plugin directories and downloads on demand.
  if (parts.includes('languages') && /\.(?:mo|po)$/.test(relativePath)) return false;
  if (parts.some((part) => excludedSegments.has(part))) return false;
  if (/\.(?:test|spec)\.[A-Za-z0-9]+$/.test(relativePath)) return false;
  for (const extension of excludedExtensions) {
    if (relativePath.endsWith(extension)) return false;
  }
  return true;
}

async function copyEntry(relativePath) {
  const source = join(root, relativePath);
  const target = join(pluginDir, relativePath);
  const sourceStat = await stat(source);

  await mkdir(dirname(target), { recursive: true });

  if (sourceStat.isDirectory()) {
    await cp(source, target, { recursive: true, force: true, filter: shouldPackagePath });
    return;
  }

  await copyFile(source, target);
}

async function copyMappedEntry(sourceRelativePath, targetRelativePath) {
  const source = join(root, sourceRelativePath);
  const target = join(pluginDir, targetRelativePath);
  const sourceStat = await stat(source);

  await mkdir(dirname(target), { recursive: true });

  if (sourceStat.isDirectory()) {
    await cp(source, target, { recursive: true, force: true, filter: shouldPackagePath });
    return;
  }

  await copyFile(source, target);
}

async function copyPluginEntry() {
  const target = join(pluginDir, entryFile);

  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, 'pixflow-design.php'), target);
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

async function createZipArchive() {
  const zip = new JSZip();
  await addDirectoryToZip(zip, pluginDir, packageSlug);
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  if (directoryBuild && zipBuffer.length >= 10_000_000) {
    throw new Error('WordPress.org submission ZIP must remain below 10 MB. Reduce redundant build inputs before publishing a candidate.');
  }
  await assertZipProductIsolation(await JSZip.loadAsync(zipBuffer), 'WordPress plugin archive');
  const versionedPath = await writeWordPressPackageOutputs(zipPath, 'pixflow-design', await readFile(join(pluginDir, entryFile), 'utf8'), zipBuffer);
  console.log(`Created ${relative(root, versionedPath).replaceAll('\\', '/')} (${zipBuffer.length} bytes)`);
}

async function collectPackagedFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPackagedFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

async function validatePackagedPlugin() {
  const requiredPackagedPaths = [
    entryFile,
    'assets/app/pixflow-design-app.js',
    'assets/app/pixflow-design-app.css',
    'assets/app/agent-icons/codex.svg',
    'assets/app/model-icons/openai.svg',
    'assets/pixflow-design-builder.css',
    directoryBuild ? 'resources/bundled-library/skills' : 'resources/bundled-library.zip',
    'src/autoload.php',
    'src/Plugin.php',
    directoryBuild ? 'THIRD-PARTY-NOTICES.txt' : 'THIRD-PARTY-NOTICES.md',
    'readme.txt',
    'LICENSE',
  ];

  for (const relativePath of requiredPackagedPaths) {
    if (!existsSync(join(pluginDir, relativePath))) {
      throw new Error(`Packaged WordPress plugin is missing required production file: ${relativePath}`);
    }
  }

  const files = await collectPackagedFiles(pluginDir);
  if (directoryBuild && files.some((file) => /\.(?:zip|gz|tgz|tar|7z|rar)$/i.test(file) || file === 'src/Admin/PluginUpdater.php')) {
    throw new Error('Directory package contains a nested archive or private updater.');
  }
  const disallowed = files.filter((file) => !(directoryBuild && file.startsWith('source/')) && (
    file.endsWith('.map') ||
    file.endsWith('.ts') ||
    file.endsWith('.tsx') ||
    file.endsWith('.jsx') ||
    file.includes('/node_modules/') ||
    file.includes('/__tests__/') ||
    /\.(?:test|spec)\.[A-Za-z0-9]+$/.test(file) ||
    file.startsWith('design-templates/') ||
    file.startsWith('design-systems/') ||
    file.startsWith('skills/') ||
    file.startsWith('plugins/') ||
    file.startsWith('prompt-templates/') ||
    file.startsWith('assets/vendor/gsap/')
  ));
  if (disallowed.length > 0) {
    throw new Error(`Packaged WordPress plugin contains dev or DLC-only files:\n- ${disallowed.slice(0, 50).join('\n- ')}`);
  }
}

await rm(stageRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(pluginDir, { recursive: true });
await copyPluginEntry();

for (const relativePath of requiredPaths) {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Required plugin package path is missing: ${relativePath}`);
  }

  await copyEntry(relativePath);
}

for (const [sourceRelativePath, targetRelativePath] of mappedPaths) {
  if (!existsSync(join(root, sourceRelativePath))) {
    throw new Error(`Required plugin package path is missing: ${sourceRelativePath}`);
  }

  await copyMappedEntry(sourceRelativePath, targetRelativePath);
}

// Use the explicitly selected build, including isolated development assets.
await rm(join(pluginDir, 'assets/app'), { recursive: true, force: true });
await cp(appAssets, join(pluginDir, 'assets/app'), { recursive: true });
await copyFile(join(languageRoot, 'pixflow-design/pixflow-design.pot'), join(pluginDir, 'languages/pixflow-design.pot'));
if (directoryBuild) {
  await copyFile(join(root, 'wordpress/directory/readme.txt'), join(pluginDir, 'readme.txt'));
  await copyFile(join(root, 'wordpress/directory/SOURCE.txt'), join(pluginDir, 'SOURCE.txt'));
  await copyFile(join(root, 'wordpress/directory/LicenseHttpClient.php'), join(pluginDir, 'src/License/LicenseHttpClient.php'));
  await prepareDirectoryPhp(pluginDir, entryFile);
  await rm(join(pluginDir, 'THIRD-PARTY-NOTICES.md'), { force: true });
  await packageDirectorySources(root, appAssets, join(pluginDir, 'source'));
  await writeDirectoryNotices(root, pluginDir);
}

for (const [sourceRelativePath, targetRelativePath] of vendorFiles) {
  if (!existsSync(join(root, sourceRelativePath))) {
    throw new Error(`Required WordPress vendor asset is missing: ${sourceRelativePath}. Run pnpm install.`);
  }
  await copyMappedEntry(sourceRelativePath, targetRelativePath);
}

for (const [sourceRelativePath, targetRelativePath] of composerVendorPaths) {
  if (!existsSync(join(root, sourceRelativePath))) {
    throw new Error(`Required Composer dependency is missing: ${sourceRelativePath}. Run composer install --no-dev.`);
  }
  await copyMappedEntry(sourceRelativePath, targetRelativePath);
}


const includedOptionalPaths = [];
const skippedOptionalPaths = [];

for (const relativePath of optionalPaths) {
  if (!existsSync(join(root, relativePath))) {
    skippedOptionalPaths.push(relativePath);
    continue;
  }

  await copyEntry(relativePath);
  includedOptionalPaths.push(relativePath);
}

// Keep executable examples/recipes inert in the public plugin tree. WordPress
// expands this library only into its private resource directory.
const library = new JSZip();
const skillEditions = JSON.parse(await readFile(join(root, 'wordpress/resources/skill-editions.json'), 'utf8'));
for (const skill of skillEditions.skills) {
  if (skill.edition === 'free' && skill.status === 'bundled') {
    await addDirectoryToZip(library, join(root, 'skills', skill.folder), `skills/${skill.folder}`);
    await copyBundledWordPressGuidance(join(root, 'skills', skill.folder), join(pluginDir, 'resources/bundled-skills', skill.folder));
  }
}
const bundledGuidance = [
  ['guidance/examples/web-clone', 'plugins/_official/examples/web-clone'],
  // The hidden Home router is required even before optional resource packs.
  ['guidance/scenarios/od-default', 'plugins/_official/scenarios/od-default'],
];
for (const [source, target] of bundledGuidance) {
  await addDirectoryToZip(library, join(root, source), target);
  await copyBundledWordPressGuidance(join(root, source), join(pluginDir, 'resources/bundled-plugins', target.slice('plugins/'.length)));
}
if (directoryBuild) {
  await rm(join(pluginDir, 'resources/bundled-library.zip'), { force: true });
  // Same reviewed bytes as the website archive, ordinary readable files for the
  // directory distribution. Public guidance validation rejects executable files.
  for (const skill of skillEditions.skills) {
    if (skill.edition === 'free' && skill.status === 'bundled') {
      await copyBundledWordPressGuidance(join(root, 'skills', skill.folder), join(pluginDir, 'resources/bundled-library/skills', skill.folder));
    }
  }
  for (const [source, target] of bundledGuidance) {
    await copyBundledWordPressGuidance(join(root, source), join(pluginDir, 'resources/bundled-library', target));
  }
} else {
  await writeFile(join(pluginDir, 'resources/bundled-library.zip'), await library.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

await validatePackagedPlugin();
await createZipArchive();

const zipStat = await stat(zipPath);
const displayPath = relative(root, zipPath).replaceAll('\\', '/');

console.log(`Created ${displayPath} (${zipStat.size} bytes)`);
console.log(`Packaged WordPress plugin basename: ${packageSlug}/${entryFile}`);

if (includedOptionalPaths.length > 0) {
  console.log(`Included optional paths: ${includedOptionalPaths.join(', ')}`);
}

if (skippedOptionalPaths.length > 0) {
  console.log(`Skipped optional paths: ${skippedOptionalPaths.join(', ')}`);
}
