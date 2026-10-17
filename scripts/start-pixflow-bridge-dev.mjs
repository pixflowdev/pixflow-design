#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridgeCli = path.join(repoRoot, 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs');

const args = parseArgs(process.argv.slice(2));
const host = args.host || '127.0.0.1';
const port = args.port || '7456';
const installRoot = path.resolve(args.installRoot || defaultInstallRoot());
const dataDir = path.resolve(args.dataDir || path.join(installRoot, 'data'));
const allowedOrigins = normalizeAllowedOrigins(args.allowedOrigin);
const skipBuild = args.skipBuild === true;
const keepRunning = args.keepRunning === true;

if (!fs.existsSync(bridgeCli)) {
  throw new Error(`Bridge CLI not found: ${bridgeCli}`);
}

if (!skipBuild) {
  runChecked(pnpmCommand(), ['--filter', '@open-design/daemon...', 'build'], 'Failed to build daemon and workspace dependencies.');
}

runChecked(process.execPath, [
  bridgeCli,
  'stop',
  '--data-dir',
  dataDir,
  '--install-root',
  installRoot,
], 'Failed to stop existing dev bridge.', { allowFailure: true });

stopPackagedWindowsBridge();
await waitForOffline(`http://${host}:${port}/api/health`, 5_000);

const startArgs = [
  bridgeCli,
  'start',
  '--host',
  host,
  '--port',
  String(port),
  '--data-dir',
  dataDir,
  '--install-root',
  installRoot,
  '--workspace-root',
  repoRoot,
  ...allowedOrigins.flatMap((origin) => ['--allowed-origin', origin]),
  '--json',
];

runChecked(process.execPath, startArgs, 'Failed to start source bridge.');

const health = fetchJson(`http://${host}:${port}/api/health`);
console.log(JSON.stringify({
  ok: Boolean(health?.ok),
  url: `http://${host}:${port}`,
  version: health?.version ?? null,
  site: health?.site ?? null,
  dataDir,
  installRoot,
}, null, 2));

if (keepRunning) {
  console.log('Source bridge is running in the background. Use `node tools/pixflow-design-bridge/pixflow-design-bridge.mjs stop --data-dir "<dataDir>"` to stop it.');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-build') {
      out.skipBuild = true;
      continue;
    }
    if (arg === '--keep-running') {
      out.keepRunning = true;
      continue;
    }
    if (arg === '--host') {
      out.host = requireValue(arg, argv[++i]);
      continue;
    }
    if (arg === '--port') {
      out.port = requireValue(arg, argv[++i]);
      continue;
    }
    if (arg === '--install-root') {
      out.installRoot = requireValue(arg, argv[++i]);
      continue;
    }
    if (arg === '--data-dir') {
      out.dataDir = requireValue(arg, argv[++i]);
      continue;
    }
    if (arg === '--allowed-origin') {
      const value = requireValue(arg, argv[++i]);
      if (out.allowedOrigin == null) {
        out.allowedOrigin = [value];
      } else {
        out.allowedOrigin.push(value);
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function defaultInstallRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Design Bridge');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Design Bridge');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pixflow-design-bridge');
}

function runChecked(command, commandArgs, message, options = {}) {
  const invocation = resolveSpawnInvocation(command, commandArgs);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      PIXFLOW_DESIGN_WORKSPACE_ROOT: repoRoot,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${message} Exit code ${result.status ?? 1}.`);
  }
}

function resolveSpawnInvocation(command, commandArgs) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...commandArgs],
    };
  }
  return { command, args: commandArgs };
}

function fetchJson(url) {
  const result = spawnSync(process.execPath, ['-e', `
    const response = await fetch(${JSON.stringify(url)});
    process.stdout.write(await response.text());
    process.exit(response.ok ? 0 : 1);
  `], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
    },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Health check failed for ${url}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function normalizeAllowedOrigins(values) {
  const defaults = [
    'http://127.0.0.1:8088',
    'http://localhost:8088',
    'https://socialpulsedigital.co.uk',
    'https://confidencecurve.co.uk',
  ];
  const input = Array.isArray(values) ? values : [];
  const origins = new Set();
  for (const value of [...defaults, ...input]) {
    try {
      origins.add(new URL(String(value)).origin);
    } catch {}
  }
  return Array.from(origins);
}

function stopPackagedWindowsBridge() {
  if (process.platform !== 'win32') return;
  spawnSync('taskkill.exe', ['/IM', 'Pixflow Design Bridge.exe', '/F', '/T'], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

async function waitForOffline(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = spawnSync(process.execPath, ['-e', `
      try {
        const response = await fetch(${JSON.stringify(url)});
        process.exit(response.ok ? 0 : 1);
      } catch {
        process.exit(1);
      }
    `], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '',
      },
      windowsHide: true,
    });
    if (result.status !== 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
