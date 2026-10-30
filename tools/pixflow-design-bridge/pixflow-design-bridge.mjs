#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolateBridgeCodexHome } from './codex-home.mjs';
import { resolveSiteContext, writeSiteContext } from './site-context.mjs';
import { exportProject, importProject, readSyncState, resolveSyncContext } from './sync/index.mjs';

// Pixflow-owned: wrapper version follows the packaged bridge/daemon version
// required by the WordPress plugin.
const VERSION = '2.1.4';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7456;
const CONFIG_FILE = 'bridge.json';
const PID_FILE = 'od-daemon.pid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help || flags.h) {
    printHelp();
    return;
  }

  if (command === 'start') {
    await start(flags);
    return;
  }

  if (command === 'switch-site') {
    await switchSite(flags);
    return;
  }

  if (command === 'status') {
    await status(flags);
    return;
  }

  if (command === 'stop') {
    await stop(flags);
    return;
  }

  if (command === 'config') {
    await config(args, flags);
    return;
  }

  if (command === 'sync-list') {
    await syncList(flags);
    return;
  }

  if (command === 'sync-export') {
    await syncExport(flags);
    return;
  }

  if (command === 'sync-import') {
    await syncImport(flags);
    return;
  }

  throw new Error(`Unknown Pixflow Design Bridge command: ${command}`);
}

function printHelp() {
  process.stdout.write(`Pixflow Design Bridge ${VERSION}

Usage:
  pixflow-design-bridge start [--host 127.0.0.1] [--port 7456] [--allowed-origin <url>] [--install-root <path>] [--site-key <hash>]
  pixflow-design-bridge switch-site --site-key <hash> [--site-url <url>] [--site-origin <origin>] [--site-label <name>]
  pixflow-design-bridge status [--json]
  pixflow-design-bridge stop
  pixflow-design-bridge config get [--json]
  pixflow-design-bridge config set --allowed-origin <url>
  pixflow-design-bridge sync-list [--json]
  pixflow-design-bridge sync-export --project-id <id> --wp-rest <url> --wp-nonce <nonce>
  pixflow-design-bridge sync-import --wp-project-uuid <uuid> --wp-rest <url> --wp-nonce <nonce>

The bridge starts and supervises the Pixflow Design daemon on the user's machine.
It does not implement Pixflow AI generation routes or replace OD mechanics.
Use --site-key to isolate projects, memory, app config, and sync data for a WordPress site.
`);
}

async function start(flags) {
  return startWithContext(await resolveContext(flags), flags);
}

async function startWithContext(context, flags, options = {}) {
  await stopLegacyPixflowBridge();
  const running = await fetchJson(`${context.baseUrl}/api/health`).catch(() => null);

  if (running) {
    const requestedSiteKey = context.site?.key || '';
    const runningSiteKey = running?.site?.key || '';
    if (requestedSiteKey && runningSiteKey !== requestedSiteKey) {
      print({
        status: 'site-context-mismatch',
        url: context.baseUrl,
        alreadyRunning: true,
        requestedSite: context.site,
        runningSite: running?.site || null,
      }, flags);
      return;
    }
    await reconcileSiteAppConfig(context);
    await writeConfig(context);
    const result = { status: 'running', url: context.baseUrl, alreadyRunning: true };
    if (options.print !== false) print(result, flags);
    return result;
  }

  const odCli = resolveOdCli(flags);
  await migrateLegacyOdDataDir(context);
  await reconcileSiteAppConfig(context);
  const env = {
    ...withPrependedPathEnv(
      process.env,
      path.join(context.workspaceRoot, 'node_modules', '.bin'),
    ),
    // Release bridge packages install bundled CLI dependencies locally. Make
    // their shims visible to agent detection/spawn even when the desktop app
    // was launched without inheriting a user shell PATH.
    // Pixflow-owned: OD's state must live outside the disposable app runtime
    // so bridge updates cannot remove projects, history, or app config.
    OD_DATA_DIR: context.odDataDir,
    OD_BIND_HOST: context.host,
    OD_PORT: String(context.port),
    OD_ALLOWED_ORIGINS: context.allowedOrigins.join(','),
    OD_INSTALLATION_DIR: context.installRoot,
    // Pixflow-owned: expose the bridge install root to daemon routes without
    // shipping WP-owned resource packs in the Local CLI connector.
    PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT: context.installRoot,
    PIXFLOW_DESIGN_BRIDGE_CLI: fileURLToPath(import.meta.url),
    PIXFLOW_DESIGN_BRIDGE_DATA_DIR: context.dataDir,
    PIXFLOW_DESIGN_BRIDGE_VERSION: VERSION,
    // Pixflow composes its own selected skills into every run. Loading the
    // user's Codex plugin catalogue adds latency and lets unrelated desktop
    // plugins affect bridge runs, so keep the bridge child deterministic.
    OD_CODEX_DISABLE_PLUGINS: '1',
    PIXFLOW_DESIGN_RESOURCE_ROOT: '',
    PIXFLOW_DESIGN_RESOURCE_MANIFEST_URL: '',
    // Pixflow-owned: WordPress site context keeps projects/memory/sync state
    // independent when one local bridge is used across multiple sites.
    PIXFLOW_DESIGN_SITE_KEY: context.site?.key || '',
    PIXFLOW_DESIGN_SITE_DATA_DIR: context.site?.dataDir || '',
    PIXFLOW_DESIGN_SITE_ORIGIN: context.site?.origin || '',
    PIXFLOW_DESIGN_SITE_URL: context.site?.url || '',
    PIXFLOW_DESIGN_SITE_LABEL: context.site?.label || '',
    PIXFLOW_DESIGN_SYNC_ROOT: context.site?.syncRoot || '',
    // Keep the site-scoped Codex runtime aligned with the host login. The
    // daemon refreshes this before each Codex spawn, including account changes
    // made while the bridge remains running.
    PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  };

  const child = spawn(process.execPath, [
    odCli,
    'daemon',
    'start',
    '--headless',
    '--host',
    context.host,
    '--port',
    String(context.port),
    '--no-open',
  ], {
    cwd: context.workspaceRoot,
    detached: true,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });

  child.unref();
  await fs.mkdir(context.dataDir, { recursive: true });
  await fs.writeFile(path.join(context.dataDir, PID_FILE), String(child.pid ?? ''), 'utf8');
  await writeSiteContext(context.site);
  await reconcileSiteAppConfig(context);
  await writeConfig(context);

  const ready = await waitForHealth(context.baseUrl, 20_000);
  const result = {
    status: ready ? 'running' : 'starting',
    url: context.baseUrl,
    pid: child.pid ?? null,
    allowedOrigins: context.allowedOrigins,
  };
  if (options.print !== false) print(result, flags);
  return result;
}

async function switchSite(flags) {
  if (!flags['site-key']) {
    throw new Error('Missing --site-key for switch-site.');
  }

  const context = await resolveContext(flags);
  const running = await fetchJson(`${context.baseUrl}/api/health`).catch(() => null);
  const runningSiteKey = running?.site?.key || '';
  const runningSiteDataDir = normalizePathForCompare(running?.site?.dataDir || '');
  const requestedSiteDataDir = normalizePathForCompare(context.site?.dataDir || '');

  await writeSiteContext(context.site);
  await writeConfig(context);

  if (
    running?.ok &&
    runningSiteKey === context.site?.key &&
    (!requestedSiteDataDir || runningSiteDataDir === requestedSiteDataDir)
  ) {
    print({
      status: 'running',
      url: context.baseUrl,
      alreadyRunning: true,
      site: context.site,
    }, flags);
    return;
  }

  if (running?.ok) {
    await stopDaemon(context);
    await waitForStopped(context.baseUrl, 10_000);
  }

  await startWithContext(context, flags, { print: false });
  const ready = await waitForSiteHealth(context.baseUrl, context.site?.key || '', 25_000);
  print({
    status: ready ? 'switched' : 'switching',
    url: context.baseUrl,
    site: context.site,
  }, flags);
}

function normalizePathForCompare(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

async function status(flags) {
  const context = await resolveContext(flags);
  const health = await fetchJson(`${context.baseUrl}/api/health`).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  const daemon = health?.ok
    ? await fetchJson(`${context.baseUrl}/api/daemon/status`).catch(() => null)
    : null;

  print({
    status: health?.ok ? 'running' : 'stopped',
    url: context.baseUrl,
    health,
    daemon,
    allowedOrigins: context.allowedOrigins,
  }, flags);
}

async function stop(flags) {
  const context = await resolveContext(flags);
  const result = await stopDaemon(context);
  print({ status: result?.ok === false ? 'unknown' : 'stopping', url: context.baseUrl, result }, flags);
}

async function stopDaemon(context) {
  const result = await fetchJson(`${context.baseUrl}/api/daemon/shutdown`, { method: 'POST' }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));

  await fs.rm(path.join(context.dataDir, PID_FILE), { force: true }).catch(() => {});
  return result;
}

async function stopLegacyPixflowBridge() {
  const legacyRoot = defaultLegacyDataDir().replace(/[\\/]data$/, '');
  if (!legacyRoot || !existsSync(legacyRoot)) return;

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
    return;
  }

  spawnSync('pkill', ['-f', `${legacyRoot}.*pixflow-design-cli.*daemon start`], { stdio: 'ignore', shell: false });
}

async function config(args, flags) {
  const subcommand = args[0] || 'get';
  const context = await resolveContext(flags);

  if (subcommand === 'get') {
    print({
      host: context.host,
      port: context.port,
      url: context.baseUrl,
      dataDir: context.dataDir,
      installRoot: context.installRoot,
      odDataDir: context.odDataDir,
      site: context.site,
      resourceRoot: null,
      allowedOrigins: context.allowedOrigins,
    }, flags);
    return;
  }

  if (subcommand !== 'set') {
    throw new Error(`Unknown config command: ${subcommand}`);
  }

  await writeConfig(context);
  print({ status: 'ok', config: await readConfig(context.dataDir) }, flags);
}

async function syncList(flags) {
  const context = resolveSyncContext({
    installRoot: flags['install-root'],
    dataDir: flags['data-dir'],
    odDataDir: flags['od-data-dir'],
    siteKey: flags['site-key'],
    siteDataDir: flags['site-data-dir'],
    siteOrigin: flags['site-origin'],
    siteUrl: flags['site-url'],
    siteLabel: flags['site-label'],
  });
  const state = await readSyncState(context);
  print({
    status: 'ok',
    syncRoot: context.syncRoot,
    projects: Object.values(state.projects || {}),
  }, flags);
}

async function syncExport(flags) {
  const result = await exportProject({
    installRoot: flags['install-root'],
    dataDir: flags['data-dir'],
    odDataDir: flags['od-data-dir'],
    siteKey: flags['site-key'],
    siteDataDir: flags['site-data-dir'],
    siteOrigin: flags['site-origin'],
    siteUrl: flags['site-url'],
    siteLabel: flags['site-label'],
    projectId: flags['project-id'],
    wpProjectUuid: flags['wp-project-uuid'],
    restBaseUrl: flags['wp-rest'],
    nonce: flags['wp-nonce'],
    title: flags.title,
    kind: flags.kind || 'project',
    visibility: flags.visibility || 'site',
    summary: flags.summary || '',
    previewPath: flags.preview,
  });
  print({ status: 'ok', ...result }, flags);
}

async function syncImport(flags) {
  const result = await importProject({
    installRoot: flags['install-root'],
    dataDir: flags['data-dir'],
    odDataDir: flags['od-data-dir'],
    siteKey: flags['site-key'],
    siteDataDir: flags['site-data-dir'],
    siteOrigin: flags['site-origin'],
    siteUrl: flags['site-url'],
    siteLabel: flags['site-label'],
    wpProjectUuid: flags['wp-project-uuid'],
    projectId: flags['project-id'],
    restBaseUrl: flags['wp-rest'],
    nonce: flags['wp-nonce'],
    versionNumber: flags.version,
    overwrite: flags.overwrite === true,
  });
  print({ status: 'ok', ...result }, flags);
}

async function resolveContext(flags) {
  const dataDir = path.resolve(String(flags['data-dir'] || process.env.PIXFLOW_DESIGN_BRIDGE_DATA_DIR || defaultDataDir()));
  const existing = await readConfig(dataDir);
  const host = String(flags.host || existing.host || process.env.PIXFLOW_DESIGN_BRIDGE_HOST || DEFAULT_HOST);
  const port = Number(flags.port || existing.port || process.env.PIXFLOW_DESIGN_BRIDGE_PORT || DEFAULT_PORT);

  if (!isLoopbackHost(host)) {
    throw new Error(`Pixflow Design Bridge only binds to loopback hosts. Refusing host: ${host}`);
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid bridge port: ${port}`);
  }

  const installRoot = resolveInstallRoot(flags, dataDir, existing);
  const site = resolveSiteContext({ dataDir, flags, existing });
  const allowedOrigins = normalizeOrigins([
    ...arrayFromConfig(existing.allowedOrigins),
    ...arrayFromCsv(process.env.PIXFLOW_DESIGN_ALLOWED_ORIGINS || ''),
    ...arrayFromFlag(flags['allowed-origin']),
    site?.origin || '',
    site?.url || '',
  ]);

  return {
    allowedOrigins,
    baseUrl: `http://${host}:${port}`,
    dataDir,
    host,
    installRoot,
    odDataDir: resolveOdDataDir(flags, dataDir, existing, site),
    port,
    resourceManifestUrl: '',
    site,
    workspaceRoot: resolveWorkspaceRoot(flags),
  };
}

function resolveInstallRoot(flags, dataDir, existing = {}) {
  const configured = String(flags['install-root'] || process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT || '').trim();
  if (configured) return path.resolve(configured);
  const existingRoot = String(existing.installRoot || '').trim();
  if (existingRoot && existsSync(path.join(path.resolve(existingRoot), 'manifest.json'))) {
    return path.resolve(existingRoot);
  }
  const dataBase = path.basename(path.resolve(dataDir)).toLowerCase();
  return dataBase === 'data' ? path.dirname(path.resolve(dataDir)) : path.resolve(dataDir);
}

function resolveOdDataDir(flags, dataDir, existing = {}, site = null) {
  const configured = String(flags['od-data-dir'] || process.env.PIXFLOW_DESIGN_OD_DATA_DIR || '').trim();
  if (configured) return path.resolve(configured);
  if (site?.odDataDir) return path.resolve(site.odDataDir);
  const existingOdDataDir = String(existing.odDataDir || '').trim();
  if (existingOdDataDir && existsSync(path.resolve(existingOdDataDir))) {
    return path.resolve(existingOdDataDir);
  }
  const dataBase = path.basename(path.resolve(dataDir)).toLowerCase();
  return dataBase === 'data'
    ? path.join(path.resolve(dataDir), 'od')
    : path.join(path.resolve(dataDir), 'data', 'od');
}

function resolveWorkspaceRoot(flags) {
  const configured = String(flags['workspace-root'] || process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT || '').trim();
  if (configured) return path.resolve(configured);

  let current = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(current, 'apps', 'daemon', 'bin', 'od.mjs'))) return current;
    current = path.dirname(current);
  }

  return path.resolve(__dirname, '..', '..');
}

function prependPath(entry, current) {
  const normalizedEntry = String(entry || '').trim();
  if (!normalizedEntry) return String(current || '');
  const existing = String(current || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const comparable = process.platform === 'win32'
    ? normalizedEntry.toLowerCase()
    : normalizedEntry;
  if (existing.some((value) => (process.platform === 'win32' ? value.toLowerCase() : value) === comparable)) {
    return existing.join(path.delimiter);
  }
  return [normalizedEntry, ...existing].join(path.delimiter);
}

function withPrependedPathEnv(source, entry) {
  const env = { ...source };
  let current = '';
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() !== 'path') continue;
    current ||= String(env[key] || '');
    delete env[key];
  }
  env.PATH = prependPath(entry, current);
  return env;
}

async function migrateLegacyOdDataDir(context) {
  const legacyDir = path.join(context.workspaceRoot, '.od');
  if (!existsSync(legacyDir)) return;
  if (await hasPersistentOdState(context.odDataDir)) return;

  // Pixflow-owned: early bridge builds let OD write under app/.od. Preserve
  // that state by copying it to the persistent bridge data dir before launch.
  await fs.mkdir(path.dirname(context.odDataDir), { recursive: true });
  await fs.cp(legacyDir, context.odDataDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}

async function reconcileSiteAppConfig(context) {
  const site = context?.site;
  if (!site?.dataDir || !site?.odDataDir) return;

  const rootConfig = path.join(site.dataDir, 'app-config.json');
  const odConfig = path.join(site.odDataDir, 'app-config.json');
  const [rootStat, odStat] = await Promise.all([
    fs.stat(rootConfig).catch(() => null),
    fs.stat(odConfig).catch(() => null),
  ]);

  const pixflowSite = {
    key: site.key || '',
    dataDir: site.dataDir || '',
    origin: site.origin || '',
    url: site.url || '',
    label: site.label || '',
    syncRoot: site.syncRoot || '',
    updatedAt: Date.now(),
  };

  if (!rootStat && !odStat) {
    for (const target of [rootConfig, odConfig]) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `${JSON.stringify({ pixflowSite }, null, 2)}\n`, 'utf8');
    }
    return;
  }

  const source = !rootStat
    ? odConfig
    : !odStat
      ? rootConfig
      : rootStat.mtimeMs >= odStat.mtimeMs
        ? rootConfig
        : odConfig;

  let sourceConfig = await readJsonFile(source);
  sourceConfig = await isolateBridgeCodexHome(sourceConfig, site.dataDir, {
    sourceCodexHome: process.env.PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME
      || process.env.CODEX_HOME
      || path.join(os.homedir(), '.codex'),
  });
  sourceConfig.pixflowSite = pixflowSite;

  for (const target of [rootConfig, odConfig]) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(sourceConfig, null, 2)}\n`, 'utf8');
  }
}

async function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function hasPersistentOdState(odDataDir) {
  if (!existsSync(odDataDir)) return false;
  const stateFiles = ['app.sqlite', 'app-config.json', 'installation.json'];
  if (stateFiles.some((file) => existsSync(path.join(odDataDir, file)))) return true;
  const stateDirs = ['projects', 'artifacts', 'critique-artifacts'];
  for (const dir of stateDirs) {
    const fullPath = path.join(odDataDir, dir);
    if (!existsSync(fullPath)) continue;
    const entries = await fs.readdir(fullPath).catch(() => []);
    if (entries.length > 0) return true;
  }
  const entries = await fs.readdir(odDataDir).catch(() => []);
  return entries.length > 0;
}

function resolveOdCli(flags) {
  const configured = String(flags['od-cli'] || process.env.PIXFLOW_DESIGN_OD_CLI || '').trim();
  const odCli = configured || path.join(resolveWorkspaceRoot(flags), 'apps', 'daemon', 'bin', 'od.mjs');

  if (!existsSync(odCli)) {
    throw new Error(`Pixflow Design daemon CLI not found: ${odCli}`);
  }

  return odCli;
}

async function waitForHealth(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const health = await fetchJson(`${baseUrl}/api/health`).catch(() => null);
    if (health?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function waitForSiteHealth(baseUrl, siteKey, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const health = await fetchJson(`${baseUrl}/api/health`).catch(() => null);
    if (health?.ok && (!siteKey || health?.site?.key === siteKey)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function waitForStopped(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const health = await fetchJson(`${baseUrl}/api/health`).catch(() => null);
    if (!health?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text}`);
  }
  return data;
}

async function readConfig(dataDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, CONFIG_FILE), 'utf8'));
  } catch {
    return {};
  }
}

async function writeConfig(context) {
  await fs.mkdir(context.dataDir, { recursive: true });
  await fs.writeFile(path.join(context.dataDir, CONFIG_FILE), `${JSON.stringify({
    type: 'pixflow_design_bridge_config',
    version: 1,
    bridgeVersion: VERSION,
    host: context.host,
    port: context.port,
    url: context.baseUrl,
    dataDir: context.dataDir,
    allowedOrigins: context.allowedOrigins,
    installRoot: context.installRoot,
    odDataDir: context.odDataDir,
    site: context.site,
    mode: 'local-cli-connector',
    resourceManifestUrl: '',
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    if (['help', 'h', 'json', 'overwrite'].includes(key)) {
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
  return { command: positionals[0] || '', args: positionals.slice(1), flags };
}

function print(value, flags) {
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  if (value.status) process.stdout.write(`status: ${value.status}\n`);
  if (value.url) process.stdout.write(`url: ${value.url}\n`);
  if (value.pid) process.stdout.write(`pid: ${value.pid}\n`);
  if (Array.isArray(value.allowedOrigins) && value.allowedOrigins.length > 0) {
    process.stdout.write(`allowed origins: ${value.allowedOrigins.join(', ')}\n`);
  }
}

function defaultDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Design Bridge', 'data');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Design Bridge', 'data');
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'pixflow-design-bridge',
    'data',
  );
}

function defaultLegacyDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Bridge', 'data');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Bridge', 'data');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pixflow-bridge', 'data');
}

function isLoopbackHost(host) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host).toLowerCase());
}

function normalizeOrigins(origins) {
  // Pixflow-owned: only pass concrete http(s) origins into the daemon CORS
  // config. This prevents malformed config values from weakening the bridge.
  return Array.from(new Set(origins.map(normalizeOrigin).filter(Boolean)));
}

function normalizeOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

function arrayFromCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function arrayFromConfig(value) {
  return Array.isArray(value) ? value : [];
}

function arrayFromFlag(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

main().catch((error) => {
  process.stderr.write(`Pixflow Design Bridge failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

