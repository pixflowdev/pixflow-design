import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveWordPressBuild } from './wordpress-build-contract.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const distRoot = join(root, 'dist');
const releaseRoot = join(distRoot, 'bridge-release');
const packageRoot = join(releaseRoot, 'packages');
const iconRoot = join(distRoot, 'pixflow-design-bridge-installer');
const iconSourcePath = join(iconRoot, 'pixflow-design-bridge-icon.svg');
const macIconSetPath = join(iconRoot, 'pixflow-design-bridge.iconset');
const macIconPath = join(iconRoot, 'pixflow-design-bridge.icns');
const bridgeBaseUrl = 'https://pixflow.dev/downloads/pixflow-design-bridge';
const version = await readBridgeVersion();
const args = parseArgs(process.argv.slice(2));
const requireExisting = args.require || process.env.PIXFLOW_DESIGN_REQUIRE_MAC_DMG === '1';

await mkdir(packageRoot, { recursive: true });

const imported = [];
const explicitArm64 = args.arm64 ?? process.env.PIXFLOW_DESIGN_MAC_ARM64_DMG;
const explicitX64 = args.x64 ?? process.env.PIXFLOW_DESIGN_MAC_X64_DMG;

if (explicitArm64) imported.push(await importDmg('arm64', resolve(explicitArm64)));
if (explicitX64) imported.push(await importDmg('x64', resolve(explicitX64)));

if (imported.length === 0 && process.platform === 'darwin') {
  imported.push(await buildCurrentMacDmg());
}

if (imported.length === 0) {
  const existing = [
    { arch: 'arm64', path: join(packageRoot, 'pixflow-design-bridge-mac-arm64.dmg') },
    { arch: 'x64', path: join(packageRoot, 'pixflow-design-bridge-mac-x64.dmg') },
  ].filter((entry) => existsSync(entry.path));

  for (const entry of existing) {
    imported.push(await importDmg(entry.arch, entry.path));
  }
}

if (imported.length === 0) {
  const message = [
    'No Pixflow Design Bridge macOS DMGs were built or imported.',
    'Run this script on macOS to build the current architecture, or pass:',
    '  --arm64 /path/to/pixflow-design-bridge-mac-arm64.dmg',
    '  --x64 /path/to/pixflow-design-bridge-mac-x64.dmg',
    'Pass only Pixflow Design Bridge DMGs; other products contain the wrong identity.',
  ].join('\n');
  if (requireExisting) throw new Error(message);
  console.warn(`[Pixflow Bridge macOS] ${message}`);
  process.exit(0);
}

if (requireExisting && !imported.some((artifact) => artifact.arch === 'arm64')) {
  throw new Error('The macOS Apple Silicon DMG is required. Provide/build pixflow-design-bridge-mac-arm64.dmg before deploy.');
}

if (requireExisting && !imported.some((artifact) => artifact.arch === 'x64')) {
  console.warn('[Pixflow Bridge macOS] No Intel x64 DMG found. Apple Silicon will be deployed; provide --x64 or PIXFLOW_DESIGN_MAC_X64_DMG if Intel support is required.');
}

await writeMacInstallerManifest(imported);
for (const artifact of imported) {
  console.log(`Prepared ${artifact.arch} ${relative(root, artifact.stablePath).replaceAll('\\', '/')} (${artifact.size} bytes)`);
}

async function buildCurrentMacDmg() {
  process.env.PIXFLOW_DESIGN_PRO_ROOT = resolveWordPressBuild(root, { target: 'pro' }).proRoot;
  await mkdir(iconRoot, { recursive: true });
  await writePixflowIconSvg(iconSourcePath);
  await writeIcns(iconSourcePath, macIconSetPath, macIconPath);

  runChecked('pnpm', ['--filter', '@open-design/desktop', 'build'], 'Failed to build desktop bridge dependency.');
  runChecked('pnpm', ['--filter', '@open-design/packaged', 'build'], 'Failed to build packaged bridge entry.');
  runChecked('pnpm', ['--filter', '@open-design/tools-pack', 'build'], 'Failed to build tools-pack.');

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const namespace = `release-stable-pixflow-bridge-mac-${arch}`;
  const output = runChecked('pnpm', [
    'exec',
    'tools-pack',
    'mac',
    'build',
    '--to',
    'dmg',
    '--namespace',
    namespace,
    '--app-version',
    version,
    '--json',
  ], 'Failed to build Pixflow Design Bridge macOS DMG.', pixflowPackEnv());

  const report = parseJsonReport(output.stdout);
  if (!report.dmgPath || !existsSync(report.dmgPath)) {
    throw new Error('tools-pack mac report did not include a DMG path.');
  }
  return importDmg(arch, report.dmgPath);
}

function pixflowPackEnv() {
  return {
    PIXFLOW_DESIGN_PACK_APP_ID: 'dev.pixflow.bridge',
    PIXFLOW_DESIGN_PACK_BRIDGE_TRAY_MODE: '1',
    PIXFLOW_DESIGN_PACK_MAC_ICON: macIconPath,
    PIXFLOW_DESIGN_PACK_MAC_ICON_PNG: join(macIconSetPath, 'icon_128x128.png'),
    PIXFLOW_DESIGN_PACK_PACKAGE_NAME: 'pixflow-design-bridge',
    PIXFLOW_DESIGN_PACK_PRODUCT_NAME: 'Pixflow Design Bridge',
    PIXFLOW_DESIGN_PACK_REGISTRY_ID: 'Pixflow Design Bridge',
    PIXFLOW_DESIGN_PACK_UPDATE_URL: bridgeBaseUrl,
  };
}

async function importDmg(arch, sourcePath) {
  if (arch !== 'arm64' && arch !== 'x64') throw new Error(`Unsupported mac arch: ${arch}`);
  if (!existsSync(sourcePath)) throw new Error(`macOS DMG not found: ${sourcePath}`);

  const versionedName = `pixflow-design-bridge-${version}-mac-${arch}.dmg`;
  const stableName = `pixflow-design-bridge-mac-${arch}.dmg`;
  const versionedPath = join(packageRoot, versionedName);
  const stablePath = join(packageRoot, stableName);
  if (resolve(sourcePath) !== resolve(versionedPath)) await copyFileWithRetry(sourcePath, versionedPath);
  if (resolve(sourcePath) !== resolve(stablePath)) await copyFileWithRetry(sourcePath, stablePath);

  const fileStat = await stat(versionedPath);
  return {
    arch,
    versionedName,
    stableName,
    versionedPath,
    stablePath,
    sha256: await fileSha256(versionedPath),
    size: fileStat.size,
  };
}

async function copyFileWithRetry(sourcePath, targetPath) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await copyFile(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function writeMacInstallerManifest(macArtifacts) {
  const latestPath = join(releaseRoot, 'latest.json');
  let manifest = {};
  if (existsSync(latestPath)) {
    manifest = JSON.parse(await readFile(latestPath, 'utf8'));
  }

  const byArch = new Map(macArtifacts.map((artifact) => [artifact.arch, artifact]));
  const existingInstallers = manifest.installers ?? {};
  const { macos, macosArm64, macosX64, ...nonMacInstallers } = existingInstallers;
  const installers = {
    ...nonMacInstallers,
    ...(byArch.has('arm64') ? { macosArm64: `${bridgeBaseUrl}/packages/${byArch.get('arm64').stableName}` } : {}),
    ...(byArch.has('x64') ? { macosX64: `${bridgeBaseUrl}/packages/${byArch.get('x64').stableName}` } : {}),
  };
  installers.macos = installers.macosArm64 ?? installers.macosX64 ?? `${bridgeBaseUrl}/install.sh`;

  const nextMacAssets = macArtifacts.map((artifact) => ({
    platform: 'darwin',
    arch: artifact.arch,
    format: 'dmg',
    url: `${bridgeBaseUrl}/packages/${artifact.versionedName}`,
    sha256: artifact.sha256,
    size: artifact.size,
  }));
  const installerAssets = [
    ...((manifest.installerAssets ?? []).filter((asset) => asset.platform !== 'darwin')),
    ...nextMacAssets,
  ];

  await writeFile(latestPath, `${JSON.stringify({
    schemaVersion: 1,
    product: 'pixflow-design-bridge',
    version,
    channel: 'stable',
    releasedAt: manifest.releasedAt ?? new Date().toISOString(),
    minimumPluginVersion: manifest.minimumPluginVersion ?? '1.1.0',
    assets: manifest.assets ?? [],
    installers,
    installerAssets,
  }, null, 2)}\n`, 'utf8');
}

async function readBridgeVersion() {
  const pluginMain = await readFile(join(root, 'pixflow-design.php'), 'utf8');
  const match = pluginMain.match(/PIXFLOW_DESIGN_BRIDGE_VERSION['"],\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? '1.0.0';
}

function runChecked(command, runArgs, message, env = {}) {
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const spawnArgs = process.platform === 'win32' ? ['/d', '/s', '/c', quoteCmd([command, ...runArgs])] : runArgs;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    shell: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    const detail = [
      `${message} Exit code ${result.status ?? 1}.`,
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : '',
    ].filter(Boolean).join('\n\n');
    throw new Error(detail);
  }
  return result;
}

function quoteCmd(parts) {
  return parts.map((part) => {
    const value = String(part);
    return /[\s"&<>|^]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  }).join(' ');
}

function parseJsonReport(stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) throw new Error('tools-pack did not emit a JSON report.');
  const start = trimmed.lastIndexOf('\n{');
  const json = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  return JSON.parse(json);
}

async function writePixflowIconSvg(path) {
  const mark = await readFile(join(root, 'wordpress', 'assets', 'brand', 'pixflow-icon-light.svg'), 'utf8');
  const inner = mark
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<\/?svg[^>]*>/g, '')
    .trim();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1f1f1f"/>
  <g transform="translate(96 76) scale(0.32)">${inner}</g>
</svg>
`;
  await writeFile(path, svg, 'utf8');
}

async function writeIcns(svgPath, iconSetPath, iconPath) {
  const sharp = await loadSharp();
  await mkdir(iconSetPath, { recursive: true });
  const entries = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];
  for (const [size, name] of entries) {
    await sharp(svgPath).resize(size, size).png().toFile(join(iconSetPath, name));
  }
  runChecked('iconutil', ['-c', 'icns', iconSetPath, '-o', iconPath], 'Failed to create macOS icns icon.');
}

async function loadSharp() {
  const candidates = [
    'sharp',
    join(root, 'node_modules', '.pnpm', 'node_modules', 'sharp'),
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default ?? mod;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to load sharp for icon generation: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fileSha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function parseArgs(rawArgs) {
  const parsed = { require: false };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--require-existing' || arg === '--require') {
      parsed.require = true;
      continue;
    }
    if (arg === '--arm64') {
      parsed.arm64 = rawArgs[++index];
      continue;
    }
    if (arg === '--x64') {
      parsed.x64 = rawArgs[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}
