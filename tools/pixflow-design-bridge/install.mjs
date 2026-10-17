#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolveBridgeWorkflowSources } from './runtime-manifest.mjs';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const installRoot = path.resolve(String(flags['install-root'] || defaultInstallRoot()));
  const sourceRoot = resolveSourceRoot(flags);
  const workflowSources = resolveBridgeWorkflowSources(sourceRoot, {
    proRoot: typeof flags['pro-root'] === 'string' ? flags['pro-root'] : process.env.PIXFLOW_DESIGN_PRO_ROOT,
  });
  const runtimeSources = await resolveRuntimeCopySources(sourceRoot, workflowSources);
  let appRoot = path.join(installRoot, 'app');
  const binRoot = path.join(installRoot, 'bin');
  const dataDir = path.join(installRoot, 'data');
  const odDataDir = path.join(dataDir, 'od');

  logInstall('Pixflow Design Bridge installer');
  logInstall(`Installing to ${installRoot}`);
  await fs.mkdir(installRoot, { recursive: true });
  await stopExistingBridge({ installRoot, dataDir });
  await stopLegacyPixflowBridge();
  await migrateLegacyDataRoot({ legacyDataDir: path.join(appRoot, 'data'), dataDir });
  await migrateLegacyOdDataDir({ legacyDir: path.join(appRoot, '.od'), odDataDir });
  appRoot = await prepareAppRootForInstall(appRoot, installRoot, flags);
  logStep(1, 5, 'Preparing Pixflow Design Local CLI bridge runtime...');
  await copyRuntime(runtimeSources, appRoot);
  await fs.mkdir(binRoot, { recursive: true });
  await writeLaunchers({ installRoot, appRoot, binRoot });

  if (flags['skip-install'] !== true || !(await hasRuntimeDependencies(appRoot))) {
    if (flags['skip-install'] === true) {
      logInstall('Runtime dependencies are missing; installing despite --skip-install.');
    }
    logStep(2, 5, 'Installing local runtime dependencies...');
    runPnpm(appRoot, ['install']);
    logStep(3, 5, 'Building local Pixflow Design runtime...');
    runPnpm(appRoot, ['--filter', '@open-design/daemon', 'build']);
  }

  await fs.writeFile(path.join(installRoot, 'manifest.json'), `${JSON.stringify({
    type: 'pixflow_design_bridge_installation',
    version: 1,
    installedAt: new Date().toISOString(),
    appRoot,
    binRoot,
    dataDir,
    odDataDir,
    autostart: flags['no-autostart'] === true ? 'disabled' : 'enabled',
    mode: 'local-cli-connector',
    resources: null,
  }, null, 2)}\n`, 'utf8');
  if (flags.start) {
    logStep(4, 5, 'Starting Pixflow Design Bridge...');
    runNode(path.join(appRoot, 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs'), [
      'start',
      '--data-dir',
      dataDir,
      '--install-root',
      installRoot,
      ...arrayFromFlag(flags['allowed-origin']).flatMap((origin) => ['--allowed-origin', origin]),
    ], appRoot);
  }

  if (flags['no-autostart'] !== true) {
    logStep(5, 5, 'Registering Pixflow Design Bridge to start when you sign in...');
    await installAutostart({ installRoot, appRoot, binRoot }).catch((error) => {
      process.stderr.write(`Pixflow Design Bridge autostart setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  }

  logInstall(`Installed at ${installRoot}`);
  logInstall(`Command: ${path.join(binRoot, process.platform === 'win32' ? 'pixflow-design-bridge.cmd' : 'pixflow-design-bridge')}`);
}

async function stopExistingBridge({ installRoot, dataDir }) {
  const manifestPath = path.join(installRoot, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = await readJson(manifestPath);
    const cli = manifest?.appRoot
      ? path.join(String(manifest.appRoot), 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs')
      : '';
    if (cli && existsSync(cli)) {
      logInstall('Stopping existing Pixflow Design Bridge...');
      const stopped = spawnSync(process.execPath, [cli, 'stop', '--data-dir', dataDir, '--install-root', installRoot], {
        cwd: String(manifest.appRoot),
        encoding: 'utf8',
        stdio: 'pipe',
        shell: false,
        windowsHide: true,
      });
      if (stopped.status !== 0) {
        logInstall('The previous runtime could not stop itself; continuing with process cleanup.');
      }
      await sleep(1500);
    }
  }

  // Pixflow-owned: older failed updates could leave a daemon running from an
  // app-* fallback folder. Stop any Pixflow daemon process under installRoot
  // before starting the freshly installed app.
  if (process.platform === 'win32') {
    const escapedRoot = installRoot.replaceAll("'", "''");
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      [
        `$root = '${escapedRoot}'`,
        'Get-CimInstance Win32_Process -Filter "name = \'node.exe\'" |',
        'Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and $_.CommandLine.Contains("daemon start") } |',
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }',
      ].join(' '),
    ], { stdio: 'ignore', shell: false, windowsHide: true });
    await sleep(1500);
    return;
  }

  spawnSync('pkill', ['-f', `${installRoot}.*daemon start`], { stdio: 'ignore', shell: false });
  await sleep(1500);
}

async function stopLegacyPixflowBridge() {
  const legacyRoot = defaultLegacyInstallRoot();
  if (!legacyRoot || !existsSync(legacyRoot)) return;

  logInstall('Checking for legacy Pixflow Bridge daemon...');

  if (process.platform === 'win32') {
    const escapedRoot = legacyRoot.replaceAll("'", "''");
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      [
        `$root = '${escapedRoot}'`,
        'Get-CimInstance Win32_Process -Filter "name = \'node.exe\'" |',
        'Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.CommandLine.Contains("pixflow-design-cli.mjs") -or $_.CommandLine.Contains("daemon start")) } |',
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }',
      ].join(' '),
    ], { stdio: 'ignore', shell: false, windowsHide: true });
    await removeLegacyWindowsAutostart();
    await sleep(1500);
    return;
  }

  spawnSync('pkill', ['-f', `${legacyRoot}.*pixflow-design-cli.*daemon start`], { stdio: 'ignore', shell: false });
  await sleep(1500);
}

async function removeLegacyWindowsAutostart() {
  const roamingRoot = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const startupDir = path.join(roamingRoot, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const legacyFiles = [
    path.join(startupDir, 'Pixflow Design Bridge.cmd'),
    path.join(startupDir, 'Pixflow Bridge.cmd'),
    path.join(startupDir, 'Pixflow AI Bridge.cmd'),
  ];
  await Promise.all(legacyFiles.map((filePath) => fs.rm(filePath, { force: true }).catch(() => {})));
  spawnSync('schtasks.exe', ['/Delete', '/TN', 'Pixflow Design Bridge', '/F'], {
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });
  spawnSync('schtasks.exe', ['/Delete', '/TN', 'Pixflow Bridge', '/F'], {
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveSourceRoot(flags) {
  if (typeof flags.source === 'string') return path.resolve(flags.source);
  const packageRuntime = path.join(PACKAGE_ROOT, 'runtime');
  if (existsSync(path.join(packageRuntime, 'package.json'))) return packageRuntime;
  return PACKAGE_ROOT;
}

/** Resolve and validate every selected source before the installer stops or
 * replaces an existing runtime. The partial-bundle marker is package output,
 * never a required source-tree resource. */
export async function resolveRuntimeCopySources(sourceRoot, workflowSources) {
  const required = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'scripts',
    'apps/daemon',
    'packages',
    // Full-repository source installs retain the root workspace manifest, so
    // its workspace dependencies must be present. Release packages replace
    // that manifest with a bridge-only one and simply skip absent paths.
    'tools/dev',
    'tools/pack',
    'tools/serve',
    'tools/pixflow-design-bridge',
  ];
  const sources = [];
  for (const relativePath of required) {
    const source = path.join(sourceRoot, relativePath);
    if (!existsSync(source)) {
      if (relativePath === 'tools/dev' || relativePath === 'tools/pack' || relativePath === 'tools/serve') {
        continue;
      }
      throw new Error(`Bridge runtime source is missing ${relativePath} in ${sourceRoot}`);
    }
    sources.push({ relativePath, source });
  }
  sources.push(...workflowSources);
  for (const { relativePath, source } of sources) {
    const info = await fs.stat(source);
    const expectsFile = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(relativePath);
    if (expectsFile ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`Bridge runtime source ${relativePath} must be a ${expectsFile ? 'file' : 'directory'}: ${source}`);
    }
    await fs.access(source);
  }
  return sources;
}

export async function copyRuntime(runtimeSources, targetRoot) {
  for (const { relativePath, source } of runtimeSources) {
    await fs.cp(source, path.join(targetRoot, relativePath), {
      recursive: true, force: true, filter: entry => shouldCopyRuntimePath(entry),
    });
  }
  const bundledRoot = path.join(targetRoot, 'plugins', '_official');
  await fs.mkdir(bundledRoot, { recursive: true });
  await fs.writeFile(path.join(bundledRoot, '.partial'), 'Pixflow Design Bridge bundles only required workflow resources.\n', 'utf8');
}

async function prepareAppRootForInstall(primaryAppRoot, installRoot, flags = {}) {
  if (flags['skip-install'] === true && await hasRuntimeDependencies(primaryAppRoot)) {
    // Pixflow-owned: dev/test reinstalls often only update bridge wrapper
    // files. Preserve node_modules so --skip-install stays genuinely fast and
    // cannot leave the app without dependencies after deleting app/.
    await fs.mkdir(primaryAppRoot, { recursive: true });
    return primaryAppRoot;
  }

  try {
    await removeWithRetry(primaryAppRoot, { attempts: 18, delayMs: 1000 });
    return primaryAppRoot;
  } catch (error) {
    // Pixflow-owned: Windows can keep the just-stopped daemon's app folder
    // locked briefly. Fall back to a versioned active app folder so updates
    // can complete without leaving users stuck at "Installing".
    const fallbackRoot = path.join(installRoot, `app-${Date.now()}`);
    logInstall(`Primary app folder is busy; installing to ${fallbackRoot}`);
    await fs.rm(fallbackRoot, { recursive: true, force: true }).catch(() => {});
    return fallbackRoot;
  }
}

async function hasRuntimeDependencies(appRoot) {
  if (!existsSync(path.join(appRoot, 'node_modules'))) return false;
  if (!existsSync(path.join(appRoot, 'node_modules', '.pnpm'))) return false;
  if (!existsSync(path.join(appRoot, 'node_modules', 'jszip'))) return false;

  // Vela is the bundled AMR runtime. Treat an older bridge install without it
  // as incomplete even when --skip-install was requested, so upgrades cannot
  // silently leave the Local CLI offline.
  return existsSync(path.join(appRoot, 'node_modules', '@powerformer', 'vela-cli'));
}

async function migrateLegacyOdDataDir({ legacyDir, odDataDir }) {
  if (!existsSync(legacyDir)) return;

  // Pixflow-owned: older bridge builds stored OD projects under app/.od.
  // Merge missing files into persistent data before app/ is replaced during
  // updates. Do not skip just because persistent data exists: a failed or
  // mixed-version install may have some projects/memory in app/.od and some in
  // data/od.
  logInstall(`Migrating existing Pixflow Design project data to ${odDataDir}`);
  await fs.mkdir(path.dirname(odDataDir), { recursive: true });
  await fs.cp(legacyDir, odDataDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}

async function migrateLegacyDataRoot({ legacyDataDir, dataDir }) {
  if (!existsSync(legacyDataDir)) return;

  // Pixflow-owned: defensive rescue for bad/experimental installs that placed
  // persistent bridge state inside app/data. The runtime app folder is
  // disposable; projects, memory, onboarding/app-config, site folders, sync
  // queues, resources metadata, and license entitlement must survive updates.
  const entries = [
    'od',
    'sites',
    'sync',
    'bridge.json',
    'site.json',
  ];

  for (const entry of entries) {
    const source = path.join(legacyDataDir, entry);
    if (!existsSync(source)) continue;
    const target = path.join(dataDir, entry);
    logInstall(`Migrating existing Pixflow Design bridge state to ${target}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }
}

async function removeWithRetry(targetPath, { attempts = 10, delayMs = 500 } = {}) {
  if (!existsSync(targetPath)) return;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

function shouldCopyRuntimePath(entry) {
  const normalized = entry.replaceAll('\\', '/');
  return !/\/(?:node_modules|\.git|\.next|dist\/wordpress-plugin|test-results|playwright-report)(?:\/|$)/.test(normalized);
}

async function writeLaunchers({ installRoot, appRoot, binRoot }) {
  const cli = path.join(appRoot, 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs');
  const dataDir = path.join(installRoot, 'data');

  if (process.platform === 'win32') {
    await fs.writeFile(path.join(binRoot, 'pixflow-design-bridge.cmd'), [
      '@echo off',
      `node "${cli}" %*`,
      '',
    ].join('\r\n'), 'utf8');
    await fs.writeFile(path.join(installRoot, 'Start Pixflow Design Bridge.cmd'), [
      '@echo off',
      `start "Pixflow Design Bridge" /min node "${cli}" start --data-dir "${dataDir}" --install-root "${installRoot}"`,
      '',
    ].join('\r\n'), 'utf8');
    await fs.writeFile(path.join(installRoot, 'Stop Pixflow Design Bridge.cmd'), [
      '@echo off',
      `node "${cli}" stop --data-dir "${dataDir}"`,
      '',
    ].join('\r\n'), 'utf8');
    return;
  }

  const shell = [
    '#!/usr/bin/env sh',
    `exec node ${quoteSh(cli)} "$@"`,
    '',
  ].join('\n');
  const commandPath = path.join(binRoot, 'pixflow-design-bridge');
  await fs.writeFile(commandPath, shell, 'utf8');
  await fs.chmod(commandPath, 0o755);

  const startPath = path.join(installRoot, 'start-pixflow-design-bridge.sh');
  await fs.writeFile(startPath, [
    '#!/usr/bin/env sh',
    `nohup node ${quoteSh(cli)} start --data-dir ${quoteSh(dataDir)} --install-root ${quoteSh(installRoot)} >/dev/null 2>&1 &`,
    '',
  ].join('\n'), 'utf8');
  await fs.chmod(startPath, 0o755);

  const stopPath = path.join(installRoot, 'stop-pixflow-design-bridge.sh');
  await fs.writeFile(stopPath, [
    '#!/usr/bin/env sh',
    `exec node ${quoteSh(cli)} stop --data-dir ${quoteSh(dataDir)}`,
    '',
  ].join('\n'), 'utf8');
  await fs.chmod(stopPath, 0o755);
}

// Pixflow-owned: register a user-level startup entry so the bridge is
// available after reboot without requiring administrator/root permissions.
async function installAutostart({ installRoot, appRoot, binRoot }) {
  const cli = path.join(appRoot, 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs');
  const dataDir = path.join(installRoot, 'data');

  if (process.platform === 'win32') {
    const taskName = 'Pixflow Design Bridge';
    const command = `"${process.execPath}" "${cli}" start --data-dir "${dataDir}" --install-root "${installRoot}"`;
    const result = spawnSync('schtasks.exe', [
      '/Create',
      '/TN',
      taskName,
      '/SC',
      'ONLOGON',
      '/TR',
      command,
      '/F',
    ], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status !== 0) {
      await installWindowsStartupFolderAutostart({ cli, dataDir });
      return;
    }
    return;
  }

  if (process.platform === 'darwin') {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    await fs.mkdir(launchAgentsDir, { recursive: true });
    const plistPath = path.join(launchAgentsDir, 'dev.pixflow.design.bridge.plist');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.pixflow.design.bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(cli)}</string>
    <string>start</string>
    <string>--data-dir</string>
    <string>${escapeXml(dataDir)}</string>
    <string>--install-root</string>
    <string>${escapeXml(installRoot)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(installRoot, 'bridge.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(installRoot, 'bridge-error.log'))}</string>
</dict>
</plist>
`;
    await fs.writeFile(plistPath, plist, 'utf8');
    spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
    spawnSync('launchctl', ['load', plistPath], { stdio: 'ignore' });
    return;
  }

  const systemdUserDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  await fs.mkdir(systemdUserDir, { recursive: true });
  const servicePath = path.join(systemdUserDir, 'pixflow-design-bridge.service');
  await fs.writeFile(servicePath, [
    '[Unit]',
    'Description=Pixflow Design Bridge',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${process.execPath} ${cli} start --data-dir ${dataDir} --install-root ${installRoot}`,
    'RemainAfterExit=yes',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n'), 'utf8');

  const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  const enable = spawnSync('systemctl', ['--user', 'enable', '--now', 'pixflow-design-bridge.service'], { stdio: 'ignore' });
  if (reload.status === 0 && enable.status === 0) return;

  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  await fs.mkdir(autostartDir, { recursive: true });
  await fs.writeFile(path.join(autostartDir, 'pixflow-design-bridge.desktop'), [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Pixflow Design Bridge',
    `Exec=${binRoot ? path.join(binRoot, 'pixflow-design-bridge') : process.execPath} start --data-dir ${dataDir} --install-root ${installRoot}`,
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n'), 'utf8');
}

// Pixflow-owned: fallback for locked-down Windows accounts where schtasks
// refuses user-level task creation, keeping bridge startup admin-free.
async function installWindowsStartupFolderAutostart({ cli, dataDir }) {
  const roamingRoot = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const startupDir = path.join(roamingRoot, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  await fs.mkdir(startupDir, { recursive: true });
  await fs.writeFile(path.join(startupDir, 'Pixflow Design Bridge.cmd'), [
    '@echo off',
    `start "Pixflow Design Bridge" /min "${process.execPath}" "${cli}" start --data-dir "${dataDir}" --install-root "${path.dirname(dataDir)}"`,
    '',
  ].join('\r\n'), 'utf8');
}

function runPnpm(cwd, args) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const spawnArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', quoteCmd(['pnpm', ...args])]
    : args;
  const result = spawnSync(command, spawnArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: process.platform === 'win32',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`pnpm ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function runNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    stdio: 'inherit',
    shell: false,
    windowsHide: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`node ${script} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    if (['start', 'skip-install', 'no-autostart'].includes(key)) {
      flags[key] = true;
      continue;
    }
    const next = argv[++i];
    if (next == null) throw new Error(`Missing value for --${key}`);
    if (flags[key] == null) {
      flags[key] = next;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(next);
    } else {
      flags[key] = [flags[key], next];
    }
  }
  return flags;
}

function arrayFromFlag(value) {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultInstallRoot() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Design Bridge');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Design Bridge');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pixflow-design-bridge');
}

function defaultLegacyInstallRoot() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Bridge');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Bridge');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pixflow-bridge');
}

function quoteSh(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quoteCmd(parts) {
  return parts.map((part) => {
    const value = String(part);
    return /[\s"&<>|^]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  }).join(' ');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function logInstall(message) {
  process.stdout.write(`[Pixflow Design] ${message}\n`);
}

function logStep(current, total, message) {
  const percent = Math.round((current / total) * 100);
  process.stdout.write(`[Pixflow Design] [${progressBar(percent)}] ${String(percent).padStart(3, ' ')}% ${message}\n`);
}

function progressBar(percent) {
  const width = 24;
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Pixflow Design Bridge installer failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
