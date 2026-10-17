// Keep Codex CLI configuration compatible with the CLI bundled by Pixflow.
// The desktop Codex app and standalone CLI share this file, so the daemon
// normalizes only fields known to prevent parsing and preserves everything else.

import { randomBytes } from 'node:crypto';
import { rename, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expandHomePath } from './runtimes/paths.js';

export function resolveCodexConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.CODEX_HOME?.trim();
  const home = raw ? expandHomePath(raw) : path.join(os.homedir(), '.codex');
  return path.join(home, 'config.toml');
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function matchQuotedValue(line: string, key: string): string | null {
  const match = new RegExp(`^${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(line);
  if (!match) return null;
  const value = (match[1] ?? match[2] ?? '').trim();
  return value.length > 0 ? value : null;
}

/** Resolve the selected custom Codex provider's API-key environment name. */
export function extractCodexProviderEnvKey(toml: string): string | null {
  const lines = String(toml || '').split(/\r?\n/);
  let provider: string | null = null;
  for (const raw of lines) {
    const line = stripTomlComment(raw).trim();
    if (line.startsWith('[')) break;
    const value = matchQuotedValue(line, 'model_provider');
    if (value) {
      provider = value;
      break;
    }
  }
  if (!provider) return null;

  const headerRe =
    /^\[\s*model_providers\.\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_.-]+))\s*\]$/;
  let inSelectedTable = false;
  for (const raw of lines) {
    const line = stripTomlComment(raw).trim();
    if (line.startsWith('[')) {
      const match = headerRe.exec(line);
      const name = match ? (match[1] ?? match[2] ?? match[3]) : null;
      inSelectedTable = name === provider;
      continue;
    }
    if (!inSelectedTable) continue;
    const value = matchQuotedValue(line, 'env_key');
    if (value) return value;
  }
  return null;
}

export async function readCodexProviderEnvKey(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    const toml = await readFile(resolveCodexConfigPath(env), 'utf8');
    return extractCodexProviderEnvKey(toml);
  } catch {
    return null;
  }
}

const VALID_SERVICE_TIERS = new Set(['fast', 'flex']);

function splitLinesPreservingEndings(content: string): string[] {
  const lines = content.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function tableHeaderName(line: string): string | null {
  const withoutLineEnding = line.replace(/\r\n$|\n$|\r$/, '');
  const trimmed = withoutLineEnding.trim();
  const arrayHeader = trimmed.match(/^\[\[([^\]\r\n]+)\]\][^\S\r\n]*(?:#.*)?$/);
  if (arrayHeader?.[1]) return arrayHeader[1].trim();
  const tableHeader = trimmed.match(/^\[([^\]\r\n]+)\][^\S\r\n]*(?:#.*)?$/);
  return tableHeader?.[1]?.trim() ?? null;
}

function removeNestedFeaturesTables(content: string): string | null {
  const lines = splitLinesPreservingEndings(content);
  let changed = false;
  let dropping = false;
  const kept: string[] = [];
  for (const line of lines) {
    const headerName = tableHeaderName(line);
    if (headerName) {
      dropping = headerName.startsWith('features.');
      if (dropping) {
        changed = true;
        continue;
      }
    }
    if (dropping) {
      changed = true;
      continue;
    }
    kept.push(line);
  }
  return changed ? kept.join('') : null;
}

/**
 * Remove invalid service tiers and nested feature tables that make current
 * Codex CLIs reject config.toml. Returns null when the source is already valid.
 */
export function normalizeCodexConfigContent(content: string): string | null {
  const pattern =
    /^([^\S\r\n]*)service_tier([^\S\r\n]*=[^\S\r\n]*)(["'])([^"'\r\n]*)\3([^\S\r\n]*(?:#[^\r\n]*)?)(\r?\n|$)/gm;
  let changed = false;
  const serviceTierPatched = content.replace(
    pattern,
    (match: string, _indent, _eq, _quote, value: string) => {
      if (VALID_SERVICE_TIERS.has(value)) return match;
      changed = true;
      return '';
    },
  );
  const featuresPatched = removeNestedFeaturesTables(serviceTierPatched);
  if (featuresPatched !== null) changed = true;
  return changed ? (featuresPatched ?? serviceTierPatched) : null;
}

export interface CodexConfigIO {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

const defaultIO: CodexConfigIO = { readFile, writeFile, rename, unlink };

/** Atomically normalize the shared Codex config before launching the CLI. */
export async function normalizeCodexConfigFile(
  env: NodeJS.ProcessEnv = process.env,
  io: CodexConfigIO = defaultIO,
): Promise<void> {
  const configPath = resolveCodexConfigPath(env);
  let content: string;
  try {
    content = await io.readFile(configPath, 'utf8');
  } catch {
    return;
  }
  const patched = normalizeCodexConfigContent(content);
  if (patched === null) return;

  const tmpPath = `${configPath}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await io.writeFile(tmpPath, patched, 'utf8');
    await io.rename(tmpPath, configPath);
  } catch (error) {
    console.warn('[codex-config-normalize] atomic write failed:', error);
    await io.unlink(tmpPath).catch(() => {});
  }
}
