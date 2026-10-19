import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveWordPressBuild } from './wordpress-build-contract.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The installer embeds the full Next runtime. Require the paired Pro source
// before creating output directories or reusing any packaging cache.
process.env.PIXFLOW_DESIGN_PRO_ROOT = resolveWordPressBuild(root, { target: 'pro' }).proRoot;
const require = createRequire(import.meta.url);
const distRoot = join(root, 'dist');
const releaseRoot = join(distRoot, 'bridge-release');
const packageRoot = join(releaseRoot, 'packages');
const iconRoot = join(distRoot, 'pixflow-design-bridge-installer');
const iconSourcePath = join(iconRoot, 'pixflow-design-bridge-icon.svg');
const iconPath = join(iconRoot, 'pixflow-design-bridge.ico');
const bridgeBaseUrl = 'https://pixflow.dev/downloads/pixflow-design-bridge';
const namespace = 'release-stable-win';
const packRoot = resolve(process.env.PIXFLOW_DESIGN_BRIDGE_PACK_DIR || join(root, '.tmp', 'tools-pack'));
const namespaceRoot = join(packRoot, 'out', 'win', 'namespaces', namespace);
const workspaceBuildCacheRoot = join(packRoot, 'cache', 'entries', 'win.workspace-build');
const nsisInstallerCacheRoot = join(packRoot, 'cache', 'entries', 'win.nsis-installer');
const version = await readBridgeVersion();

await mkdir(iconRoot, { recursive: true });
await mkdir(packageRoot, { recursive: true });
// A previous local acceptance run may still be executing directly from
// win-unpacked. Windows keeps Electron DLLs locked for the life of those
// processes, so stop the exact tools-pack namespace before cleaning its output.
// Building tools-pack first ensures the lifecycle command matches this source.
runChecked('pnpm', ['--filter', '@open-design/tools-pack', 'build'], 'Failed to build tools-pack.');
runChecked('pnpm', [
  'exec',
  'tools-pack',
  'win',
  'stop',
  '--dir',
  packRoot,
  '--namespace',
  namespace,
  '--json',
], 'Failed to stop the previous Pixflow Design Bridge build.');
await removeTree(namespaceRoot);
await removeTree(nsisInstallerCacheRoot);
await writePixflowIconSvg(iconSourcePath);
await writeIco(iconSourcePath, iconPath);

runChecked('pnpm', ['--filter', '@open-design/packaged', 'build'], 'Failed to build packaged bridge entry.');
await removeTree(workspaceBuildCacheRoot);

const output = runChecked('pnpm', [
  'exec',
  'tools-pack',
  'win',
  'build',
  '--to',
  'nsis',
  '--dir',
  packRoot,
  '--namespace',
  namespace,
  '--app-version',
  version,
  '--json',
], 'Failed to build Pixflow Design Bridge Windows installer.', {
  PIXFLOW_DESIGN_PACK_APP_ID: 'dev.pixflow.bridge',
  PIXFLOW_DESIGN_PACK_BRIDGE_TRAY_MODE: '1',
  PIXFLOW_DESIGN_PACK_DISABLE_WIN_SIGNING: '1',
  PIXFLOW_DESIGN_PACK_PACKAGE_NAME: 'pixflow-design-bridge',
  PIXFLOW_DESIGN_PACK_PRODUCT_NAME: 'Pixflow Design Bridge',
  PIXFLOW_DESIGN_PACK_REGISTRY_ID: 'Pixflow Design Bridge',
  PIXFLOW_DESIGN_PACK_UPDATE_URL: bridgeBaseUrl,
  PIXFLOW_DESIGN_PACK_WIN_ICON: iconPath,
});

const report = parseJsonReport(output.stdout);
const installerPath = findInstallerPath(report);
const installerName = `pixflow-design-bridge-${version}-win-x64-setup.exe`;
const stableInstallerName = 'pixflow-design-bridge-win-x64-setup.exe';
const releaseInstallerPath = join(packageRoot, installerName);
const stableInstallerPath = join(packageRoot, stableInstallerName);
await copyFile(installerPath, releaseInstallerPath);
await copyFile(installerPath, stableInstallerPath);

const installerStat = await stat(releaseInstallerPath);
const installerSha256 = await fileSha256(releaseInstallerPath);
await writeInstallerManifest(installerName, stableInstallerName, installerStat.size, installerSha256);

console.log(`Created ${relative(root, releaseInstallerPath).replaceAll('\\', '/')} (${installerStat.size} bytes)`);
console.log(`Created ${relative(root, stableInstallerPath).replaceAll('\\', '/')} (${installerStat.size} bytes)`);

async function readBridgeVersion() {
  const pluginMain = await readFile(join(root, 'pixflow-design.php'), 'utf8');
  const match = pluginMain.match(/PIXFLOW_DESIGN_BRIDGE_VERSION['"],\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? '1.0.0';
}

function runChecked(command, args, message, env = {}) {
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const spawnArgs = process.platform === 'win32' ? ['/d', '/s', '/c', quoteCmd([command, ...args])] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    shell: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${message} Exit code ${result.status ?? 1}.`);
  }
  return result;
}

async function removeTree(path) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await rm(path, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 250,
      });
      return;
    } catch (error) {
      if (attempt === 5 || !isRetryableFsError(error)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
    }
  }
}

function isRetryableFsError(error) {
  return error
    && typeof error === 'object'
    && ['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM', 'UNKNOWN'].includes(error.code);
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

function findInstallerPath(report) {
  const candidates = [];
  const visit = (value) => {
    if (typeof value === 'string' && /setup\.exe$/i.test(value) && existsSync(value)) {
      candidates.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(report);
  const installer = candidates.find((candidate) => /Pixflow Design Bridge|Open Design|setup/i.test(candidate)) ?? candidates[0];
  if (!installer) throw new Error('tools-pack report did not include a setup.exe path.');
  return installer;
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

async function writeIco(svgPath, icoPath) {
  const sharp = await loadSharp();
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) {
    const png = await sharp(svgPath).resize(size, size).png().toBuffer();
    images.push({ size, png });
  }

  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + images.length * entrySize;
  const buffers = [Buffer.alloc(headerSize), Buffer.alloc(images.length * entrySize)];
  buffers[0].writeUInt16LE(0, 0);
  buffers[0].writeUInt16LE(1, 2);
  buffers[0].writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entryOffset = index * entrySize;
    const width = image.size >= 256 ? 0 : image.size;
    buffers[1].writeUInt8(width, entryOffset);
    buffers[1].writeUInt8(width, entryOffset + 1);
    buffers[1].writeUInt8(0, entryOffset + 2);
    buffers[1].writeUInt8(0, entryOffset + 3);
    buffers[1].writeUInt16LE(1, entryOffset + 4);
    buffers[1].writeUInt16LE(32, entryOffset + 6);
    buffers[1].writeUInt32LE(image.png.length, entryOffset + 8);
    buffers[1].writeUInt32LE(offset, entryOffset + 12);
    offset += image.png.length;
    buffers.push(image.png);
  });

  await writeFile(icoPath, Buffer.concat(buffers));
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

async function writeInstallerManifest(fileName, stableFileName, size, sha256) {
  const latestPath = join(releaseRoot, 'latest.json');
  let manifest = {};
  if (existsSync(latestPath)) {
    manifest = JSON.parse(await readFile(latestPath, 'utf8'));
  }
  const installers = {
    ...(manifest.installers ?? {}),
    windows: `${bridgeBaseUrl}/packages/${stableFileName}`,
  };
  const installerAssets = [
    ...((manifest.installerAssets ?? []).filter((asset) => asset.platform !== 'win32')),
    {
      platform: 'win32',
      arch: 'x64',
      format: 'nsis',
      url: `${bridgeBaseUrl}/packages/${fileName}`,
      sha256,
      size,
    },
  ];
  await writeFile(latestPath, `${JSON.stringify({
    schemaVersion: 1,
    product: 'pixflow-design-bridge',
    version,
    channel: 'stable',
    releasedAt: new Date().toISOString(),
    minimumPluginVersion: manifest.minimumPluginVersion ?? '1.1.0',
    assets: manifest.assets ?? [],
    installers,
    installerAssets,
  }, null, 2)}\n`, 'utf8');
}
