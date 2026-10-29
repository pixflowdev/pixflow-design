import { stageNativeTransport } from '../tools/pack/src/native-transport.ts';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBridgeWorkflowSources } from '../tools/pixflow-design-bridge/runtime-manifest.mjs';
import { assertZipBufferProductIsolation } from './product-isolation.mjs';
import { resolveWordPressBuild } from './wordpress-build-contract.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativePayload = process.env.PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR;
if (!nativePayload) throw new Error('Release runtime requires PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR.');
const nativeConfig = JSON.parse(await readFile(join(nativePayload, 'config.json'), 'utf8'));
if (nativeConfig.hostName !== 'dev.pixflow.bridge' || nativeConfig.extensionOrigin !== 'chrome-extension://hbnbiboohlelmngadeolikeejamjlbkh/') throw new Error('Release runtime requires the permanent Pixflow native host identity.');

const proRoot = resolveWordPressBuild(root, { target: 'pro' }).proRoot;
const workflowSources = resolveBridgeWorkflowSources(root, { proRoot, requirePro: true });
const distDir = join(root, 'dist');
const stageRoot = join(distDir, 'pixflow-design-bridge-package');
const packageRoot = join(stageRoot, 'pixflow-design-bridge');
const runtimeRoot = join(packageRoot, 'runtime');
const zipPath = join(distDir, 'pixflow-design-bridge.zip');
const releaseRoot = join(distDir, 'bridge-release');
const bridgeBaseUrl = 'https://pixflow.dev/downloads/pixflow-design-bridge';
const releaseIdentity = await readReleaseIdentity();
const pixflowBridgeVersion = releaseIdentity.bridgeVersion;

const runtimePaths = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/daemon',
  'packages',
  'tools/pixflow-design-bridge',
  // Website Clone is a first-class core entry point, not a community-library
  // preset. Ship its scenario and functional skill with the bridge so a
  // packaged upgrade can use it immediately, before optional WordPress
  // resource-pack refreshes have completed.
  'LICENSE',
];

const excludedSegments = new Set([
  '.git',
  '.next',
  '.od',
  '.tmp',
  'node_modules',
  'test-results',
  'playwright-report',
  'dist',
]);

await rm(stageRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
const preservedMacDmgs = await preserveExistingMacDmgs();
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });

for (const runtimePath of runtimePaths) {
  const source = join(root, runtimePath);
  if (!existsSync(source)) continue;
  const target = join(runtimeRoot, runtimePath);
  await mkdir(dirname(target), { recursive: true });
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    await cp(source, target, {
      recursive: true,
      force: true,
      filter: (entry) => shouldCopy(entry),
    });
  } else {
    await copyFile(source, target);
  }
}
for (const { relativePath, source } of workflowSources) {
  const target = join(runtimeRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true, filter: entry => shouldCopy(entry) });
}

await writeFile(
  join(runtimeRoot, 'plugins', '_official', '.partial'),
  'WordPress resource packs own the remaining official plugin catalog.\n',
  'utf8',
);

await stageNativeTransport(runtimeRoot, nativePayload);
await writeRuntimePackageJson();
await writeRuntimePostinstall();

await writeFile(join(packageRoot, 'INSTALL.txt'), [
  'Pixflow Design Bridge',
  '',
  'This package installs a local bridge that runs the Pixflow Design daemon on this machine.',
  'It is the Local CLI connector only. WordPress owns the workspace UI, community plugins,',
  'design systems, design templates, and resource packs.',
  '',
  'Install:',
  '  node runtime/tools/pixflow-design-bridge/install.mjs --start --allowed-origin https://your-site.example',
  '',
  'After install, Pixflow Design in WordPress can point at:',
  '  http://127.0.0.1:7456',
  '',
].join('\n'), 'utf8');

await writeFile(join(packageRoot, 'install-windows.cmd'), [
  '@echo off',
  'setlocal',
  'node "%~dp0runtime\\tools\\pixflow-design-bridge\\install.mjs" --start %*',
  'if errorlevel 1 pause',
  '',
].join('\r\n'), 'utf8');

await writeFile(join(packageRoot, 'install-macos-linux.sh'), [
  '#!/usr/bin/env sh',
  'set -eu',
  'SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  'exec node "$SCRIPT_DIR/runtime/tools/pixflow-design-bridge/install.mjs" --start "$@"',
  '',
].join('\n'), 'utf8');

function shouldCopy(entry) {
  const relativePath = relative(root, entry);
  if (relativePath.endsWith('.map')) return false;

  const parts = relativePath.split(/[\\/]+/);
  if (parts.some((part) => excludedSegments.has(part))) return false;
  if (parts.includes('apps') && parts.includes('web')) return false;
  if (parts.includes('apps') && parts.includes('landing-page')) return false;
  if (parts.includes('apps') && parts.includes('electron')) return false;
  if (parts.includes('e2e')) return false;
  return true;
}

function runChecked(command, args, message) {
  // Pixflow-owned: avoid shell:true so bridge package builds do not emit Node DEP0190 warnings.
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const spawnArgs = process.platform === 'win32' ? ['/d', '/s', '/c', quoteCmd([command, ...args])] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${message} Exit code ${result.status ?? 1}.`);
  }
}

function quoteCmd(parts) {
  return parts.map((part) => {
    const value = String(part);
    return /[\s"&<>|^]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  }).join(' ');
}

async function writeRuntimePackageJson() {
  const source = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const toolsPack = JSON.parse(await readFile(join(root, 'tools', 'pack', 'package.json'), 'utf8'));
  const runtimePackage = {
    name: 'pixflow-design-bridge-runtime',
    version: pixflowBridgeVersion,
    private: true,
    packageManager: source.packageManager,
    type: 'module',
    scripts: {
      postinstall: 'node ./scripts/postinstall.mjs',
      bridge: 'node ./tools/pixflow-design-bridge/pixflow-design-bridge.mjs',
      'daemon:build': 'pnpm --filter @open-design/daemon build',
    },
    dependencies: {
      '@powerformer/vela-cli': toolsPack.optionalDependencies?.['@powerformer/vela-cli'] ?? '0.0.26',
      jszip: source.devDependencies?.jszip ?? source.dependencies?.jszip ?? '3.10.1',
    },
    devDependencies: {
      '@open-design/daemon': 'workspace:*',
      '@types/node': source.devDependencies?.['@types/node'] ?? '20.19.39',
      tsx: source.devDependencies?.tsx ?? '4.22.3',
      typescript: source.devDependencies?.typescript ?? '5.9.3',
    },
    engines: source.engines,
    pnpm: source.pnpm,
  };
  await writeFile(join(runtimeRoot, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8');
}

async function writeRuntimePostinstall() {
const source = String.raw`import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "packages/contracts",
  "packages/platform",
  "packages/download",
  "packages/host",
  "packages/registry-protocol",
  "packages/agui-adapter",
  "packages/plugin-runtime",
  "packages/sidecar-proto",
  "packages/launcher-proto",
  "packages/sidecar",
  "packages/diagnostics",
  "apps/daemon",
];

const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
for (const target of targets) {
  const pnpmArgs = ["-C", target, "run", "build"];
  const result = spawnSync(command, process.platform === "win32" ? ["/d", "/s", "/c", quoteCmd(["pnpm", ...pnpmArgs])] : pnpmArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function quoteCmd(parts) {
  return parts.map((part) => {
    const value = String(part);
    return /[\s"&<>|^]/.test(value) ? '"' + value.replaceAll('"', '\\"') + '"' : value;
  }).join(" ");
}
`;
  await mkdir(join(runtimeRoot, 'scripts'), { recursive: true });
  await writeFile(join(runtimeRoot, 'scripts', 'postinstall.mjs'), `${source}\n`, 'utf8');
}

function runZipCommand() {
  if (process.platform === 'win32') {
    const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
    const command = [
      '$ErrorActionPreference = "Stop";',
      `Compress-Archive -LiteralPath ${psQuote(packageRoot)} -DestinationPath ${psQuote(zipPath)} -Force`,
    ].join(' ');
    return spawnSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  return spawnSync('zip', ['-qr', zipPath, 'pixflow-design-bridge'], {
    cwd: stageRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const zipResult = runZipCommand();
if (zipResult.status !== 0) {
  const details = [zipResult.stdout, zipResult.stderr].filter(Boolean).join('\n').trim();
  throw new Error(`Failed to create Pixflow Design Bridge package.${details ? `\n${details}` : ''}`);
}

await assertZipBufferProductIsolation(await readFile(zipPath), 'Pixflow Design Bridge archive');

const zipStat = await stat(zipPath);
await writeBridgeReleaseFiles(zipStat.size);
console.log(`Created ${relative(root, zipPath).replaceAll('\\', '/')} (${zipStat.size} bytes)`);

async function writeBridgeReleaseFiles(size) {
  const version = pixflowBridgeVersion;
  const sha256 = await fileSha256(zipPath);
  // Pixflow-owned: publish a content-addressed package filename so public
  // caches cannot serve an older bridge zip after latest.json changes.
  const packageName = `pixflow-design-bridge-${version}-${sha256.slice(0, 12)}.zip`;

  await mkdir(join(releaseRoot, 'packages'), { recursive: true });
  await copyFile(zipPath, join(releaseRoot, 'packages', packageName));
  await restorePreservedMacDmgs(preservedMacDmgs);

  const asset = {
    platform: 'all',
    arch: 'universal',
    format: 'zip',
    url: `${bridgeBaseUrl}/packages/${packageName}`,
    sha256,
    size,
  };

  await writeFile(join(releaseRoot, 'latest.json'), `${JSON.stringify({
    schemaVersion: 1,
    product: 'pixflow-design-bridge',
    version,
    channel: 'stable',
    releasedAt: new Date().toISOString(),
    minimumPluginVersion: releaseIdentity.pluginVersion,
    assets: [asset],
    installers: {
      windows: `${bridgeBaseUrl}/packages/pixflow-design-bridge-win-x64-setup.exe`,
      linux: `${bridgeBaseUrl}/install.sh`,
    },
  }, null, 2)}\n`, 'utf8');

  await writeFile(join(releaseRoot, 'install.ps1'), [
    '$ErrorActionPreference = "Stop"',
    '$Host.UI.RawUI.WindowTitle = "Pixflow Design Bridge Installer"',
    'Write-Host ""',
    'Write-Host "Pixflow Design Bridge installer" -ForegroundColor Cyan',
    'Write-Host "This installs or updates the local Pixflow Design Bridge for WordPress."',
    'Write-Host "It runs on 127.0.0.1 and installs user-level startup for the Local CLI connector."',
    'Write-Host "Workspace assets and Pixflow resources are served by the WordPress plugin, not the bridge."',
    'Write-Host ""',
    'function Invoke-PixflowDownload([string]$Uri, [string]$OutFile, [string]$Label) {',
    '  $request = [System.Net.HttpWebRequest]::Create($Uri)',
    '  $request.UserAgent = "Pixflow Design Bridge Installer"',
    '  $response = $request.GetResponse()',
    '  try {',
    '    $total = [int64]$response.ContentLength',
    '    $inputStream = $response.GetResponseStream()',
    '    $outputStream = [System.IO.File]::Open($OutFile, [System.IO.FileMode]::Create)',
    '    try {',
    '      $buffer = New-Object byte[] 65536',
    '      $received = [int64]0',
    '      $lastPercent = -1',
    '      while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {',
    '        $outputStream.Write($buffer, 0, $read)',
    '        $received += $read',
    '        if ($total -gt 0) {',
    '          $percent = [Math]::Min(100, [Math]::Floor(($received / $total) * 100))',
    '          if ($percent -eq 100 -or $percent -ge ($lastPercent + 1)) {',
    '            $lastPercent = $percent',
    '            Write-Progress -Activity "Pixflow Design Bridge installer" -Status ("Downloading {0}: {1}%" -f $Label, $percent) -PercentComplete $percent',
    '          }',
    '        }',
    '      }',
    '      Write-Progress -Activity "Pixflow Design Bridge installer" -Status ("Downloaded {0}" -f $Label) -PercentComplete 100 -Completed',
    '      Write-Host ("[Pixflow Design] Downloaded {0}" -f $Label)',
    '    } finally {',
    '      $outputStream.Dispose()',
    '      $inputStream.Dispose()',
    '    }',
    '  } finally {',
    '    $response.Dispose()',
    '  }',
    '}',
    '$manifestUrl = "https://pixflow.dev/downloads/pixflow-design-bridge/latest.json"',
    '$installRoot = Join-Path $env:LOCALAPPDATA "Pixflow Design Bridge"',
    '$manifestFile = Join-Path $installRoot "manifest.json"',
    '$existingVersion = $null',
    'if (Test-Path $manifestFile) {',
    '  Write-Host "[Pixflow Design] Existing Bridge install detected. This will update it in place." -ForegroundColor Yellow',
    '  try {',
    '    $installed = Get-Content $manifestFile -Raw | ConvertFrom-Json',
    '    $cli = Join-Path $installed.appRoot "tools\\pixflow-design-bridge\\pixflow-design-bridge.mjs"',
    '    if (Test-Path $cli) {',
    '      Write-Host "[Pixflow Design] Stopping existing Bridge..."',
    '      node $cli stop --data-dir (Join-Path $installRoot "data") --install-root $installRoot | Out-Host',
    '      Start-Sleep -Seconds 3',
    '    }',
    '  } catch {',
    '    Write-Host "[Pixflow Design] Could not stop existing Bridge cleanly. The installer will continue and use a fresh runtime folder if needed." -ForegroundColor Yellow',
    '  }',
    '} else {',
    '  Write-Host "[Pixflow Design] No existing Bridge install detected. This will install a fresh Bridge."',
    '}',
    '$work = Join-Path $env:TEMP ("pixflow-design-bridge-" + [guid]::NewGuid().ToString())',
    'New-Item -ItemType Directory -Path $work | Out-Null',
    '$manifestPath = Join-Path $work "latest.json"',
    'Write-Host "[Pixflow Design] Checking latest bridge package..."',
    'Invoke-PixflowDownload -Uri $manifestUrl -OutFile $manifestPath -Label "release manifest"',
    '$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json',
    '$asset = $manifest.assets | Select-Object -First 1',
    '$zipPath = Join-Path $work "pixflow-design-bridge.zip"',
    'Write-Host "[Pixflow Design] Downloading Bridge $($manifest.version)..."',
    'Invoke-PixflowDownload -Uri $asset.url -OutFile $zipPath -Label "bridge package"',
    'Write-Host "[Pixflow Design] Verifying download..."',
    '$hash = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLowerInvariant()',
    'if ($asset.sha256 -and $hash -ne $asset.sha256.ToLowerInvariant()) { throw "Checksum mismatch. Expected $($asset.sha256), received $hash" }',
    '$extract = Join-Path $work "extract"',
    'Write-Host "[Pixflow Design] Extracting installer..."',
    'Expand-Archive -LiteralPath $zipPath -DestinationPath $extract -Force',
    '$installer = Join-Path $extract "pixflow-design-bridge\\runtime\\tools\\pixflow-design-bridge\\install.mjs"',
    'Write-Host "[Pixflow Design] Installing Local CLI bridge runtime..."',
    'node $installer --source (Join-Path $extract "pixflow-design-bridge\\runtime") --start',
    'Write-Host ""',
    'Write-Host "Pixflow Design Bridge is installed and running." -ForegroundColor Green',
    'Write-Host "Return to the Bricks builder and click ""I installed it - Rescan""."',
    '',
  ].join('\r\n'), 'utf8');

  await writeFile(join(releaseRoot, 'install.sh'), [
    '#!/usr/bin/env sh',
    'set -eu',
    'echo ""',
    'echo "Pixflow Design Bridge installer"',
    'echo "This installs or updates the local Pixflow Design Bridge for WordPress."',
    'echo "It runs on 127.0.0.1 and installs user-level startup for the Local CLI connector."',
    'echo "Workspace assets and Pixflow resources are served by the WordPress plugin, not the bridge."',
    'echo ""',
    'MANIFEST_URL="https://pixflow.dev/downloads/pixflow-design-bridge/latest.json"',
    'INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/pixflow-design-bridge"',
    'if [ "$(uname -s)" = "Darwin" ]; then INSTALL_ROOT="$HOME/Library/Application Support/Pixflow Design Bridge"; fi',
    'MANIFEST_FILE="$INSTALL_ROOT/manifest.json"',
    'if [ -f "$MANIFEST_FILE" ]; then',
    '  echo "[Pixflow Design] Existing Bridge install detected. This will update it in place."',
    '  CLI="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); console.log(require(\'path\').join(m.appRoot,\'tools\',\'pixflow-design-bridge\',\'pixflow-design-bridge.mjs\'))" "$MANIFEST_FILE" 2>/dev/null || true)"',
    '  if [ -n "$CLI" ] && [ -f "$CLI" ]; then',
    '    echo "[Pixflow Design] Stopping existing Bridge..."',
    '    node "$CLI" stop --data-dir "$INSTALL_ROOT/data" --install-root "$INSTALL_ROOT" || true',
    '    sleep 3',
    '  fi',
    'else',
    '  echo "[Pixflow Design] No existing Bridge install detected. This will install a fresh Bridge."',
    'fi',
    'WORK="$(mktemp -d)"',
    'cleanup() { rm -rf "$WORK"; }',
    'trap cleanup EXIT',
    'echo "[Pixflow Design] Checking latest bridge package..."',
    'curl -fL --progress-bar "$MANIFEST_URL" -o "$WORK/latest.json"',
    'PACKAGE_URL="$(node -e "const m=require(process.argv[1]); console.log(m.assets[0].url)" "$WORK/latest.json")"',
    'PACKAGE_SHA="$(node -e "const m=require(process.argv[1]); console.log(m.assets[0].sha256)" "$WORK/latest.json")"',
    'PACKAGE_VERSION="$(node -e "const m=require(process.argv[1]); console.log(m.version)" "$WORK/latest.json")"',
    'echo "[Pixflow Design] Downloading Bridge $PACKAGE_VERSION..."',
    'curl -fL --progress-bar "$PACKAGE_URL" -o "$WORK/pixflow-design-bridge.zip"',
    'echo "[Pixflow Design] Verifying download..."',
    'ACTUAL_SHA="$(node -e "const {createHash}=require(\'crypto\'); const {readFileSync}=require(\'fs\'); console.log(createHash(\'sha256\').update(readFileSync(process.argv[1])).digest(\'hex\'))" "$WORK/pixflow-design-bridge.zip")"',
    'if [ "$ACTUAL_SHA" != "$PACKAGE_SHA" ]; then echo "Checksum mismatch. Expected $PACKAGE_SHA, received $ACTUAL_SHA" >&2; exit 1; fi',
    'echo "[Pixflow Design] Extracting installer..."',
    'unzip -q "$WORK/pixflow-design-bridge.zip" -d "$WORK/extract"',
    'echo "[Pixflow Design] Installing Local CLI bridge runtime..."',
    'node "$WORK/extract/pixflow-design-bridge/runtime/tools/pixflow-design-bridge/install.mjs" --source "$WORK/extract/pixflow-design-bridge/runtime" --start',
    'echo ""',
    'echo "Pixflow Design Bridge is installed and running."',
    'echo "Return to the Bricks builder and click \\"I installed it - Rescan\\"."',
    '',
  ].join('\n'), 'utf8');

  console.log(`Created ${relative(root, releaseRoot).replaceAll('\\', '/')} release metadata`);
}

async function readReleaseIdentity() {
  const pluginMain = await readFile(join(root, 'pixflow-design.php'), 'utf8');
  const pluginVersion = pluginMain.match(/PIXFLOW_DESIGN_VERSION['"],\s*['"]([^'"]+)['"]/)?.[1];
  const bridgeVersion = pluginMain.match(/PIXFLOW_DESIGN_BRIDGE_VERSION['"],\s*['"]([^'"]+)['"]/)?.[1];
  if (!pluginVersion || !bridgeVersion) {
    throw new Error('Unable to read Pixflow plugin and bridge release versions from pixflow-design.php.');
  }

  const bridgeSource = await readFile(
    join(root, 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs'),
    'utf8',
  );
  const runtimeVersion = bridgeSource.match(/const VERSION = ['"]([^'"]+)['"]/)?.[1];
  if (runtimeVersion !== bridgeVersion) {
    throw new Error(
      `Bridge version mismatch: plugin requires ${bridgeVersion}, runtime declares ${runtimeVersion || 'unknown'}.`,
    );
  }

  return { pluginVersion, bridgeVersion };
}

async function preserveExistingMacDmgs() {
  const packagesRoot = join(releaseRoot, 'packages');
  if (!existsSync(packagesRoot)) return [];
  const entries = await readdir(packagesRoot);
  const dmgs = entries.filter((entry) => /^pixflow-design-bridge(?:-[^-]+(?:\.[^-]+)*)?-mac-(?:arm64|x64)\.dmg$/.test(entry));
  if (dmgs.length === 0) return [];

  const preserveRoot = join(distDir, 'bridge-release-preserved-mac-dmgs');
  await rm(preserveRoot, { recursive: true, force: true });
  await mkdir(preserveRoot, { recursive: true });

  const preserved = [];
  for (const name of dmgs) {
    const source = join(packagesRoot, name);
    const target = join(preserveRoot, name);
    await copyFile(source, target);
    preserved.push({ name, path: target });
  }
  return preserved;
}

async function restorePreservedMacDmgs(preservedMacDmgs) {
  if (preservedMacDmgs.length === 0) return;
  const packagesRoot = join(releaseRoot, 'packages');
  await mkdir(packagesRoot, { recursive: true });
  for (const artifact of preservedMacDmgs) {
    await copyFile(artifact.path, join(packagesRoot, artifact.name));
  }
}

async function fileSha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectPromise);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}
