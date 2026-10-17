import fs from 'node:fs';
import path from 'node:path';
import type { ComposioWritePolicy } from '@open-design/contracts';

export interface ComposioConfig {
  apiKey: string;
  authConfigIds: Record<string, string>;
  writePolicy?: ComposioWritePolicy;
}

export interface PublicComposioConfig {
  configured: boolean;
  apiKeyTail: string;
}

let configFilePath = path.join(process.cwd(), '.od', 'connectors', 'composio-config.json');

export function configureComposioConfigStore(dataDir: string): void {
  configFilePath = path.join(dataDir, 'connectors', 'composio-config.json');
}

export function readComposioConfig(): ComposioConfig {
  const raw = readRawConfig();
  return normalizeComposioConfig(raw);
}

export function readPublicComposioConfig(): PublicComposioConfig {
  const config = readComposioConfig();
  return {
    configured: Boolean(config.apiKey),
    apiKeyTail: config.apiKey ? config.apiKey.slice(-4) : '',
  };
}

export function writeComposioConfig(input: unknown): PublicComposioConfig {
  const prior = readComposioConfig();
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const hasApiKey = Object.prototype.hasOwnProperty.call(record, 'apiKey');
  const hasAuthConfigIds = Object.prototype.hasOwnProperty.call(record, 'authConfigIds');
  const apiKeyInput = normalizeOptionalString(record.apiKey) ?? '';
  const nextApiKey = hasApiKey ? apiKeyInput : prior.apiKey;
  const apiKeyChanged = prior.apiKey !== nextApiKey;
  const next = normalizeComposioConfig({
    apiKey: nextApiKey,
    authConfigIds: apiKeyChanged ? {} : hasAuthConfigIds ? record.authConfigIds : prior.authConfigIds,
    ...(!apiKeyChanged && prior.writePolicy ? { writePolicy: prior.writePolicy } : {}),
  });
  writeRawConfig(next);
  return readPublicComposioConfig();
}

export function setComposioAuthConfigId(connectorId: string, authConfigId: string): void {
  const normalizedConnectorId = normalizeOptionalString(connectorId);
  const normalizedAuthConfigId = normalizeOptionalString(authConfigId);
  if (!normalizedConnectorId || !normalizedAuthConfigId) return;
  const prior = readComposioConfig();
  writeRawConfig(normalizeComposioConfig({
    ...prior,
    authConfigIds: {
      ...prior.authConfigIds,
      [normalizedConnectorId]: normalizedAuthConfigId,
    },
  }));
}

export function deleteComposioAuthConfigId(connectorId: string): void {
  const normalizedConnectorId = normalizeOptionalString(connectorId);
  if (!normalizedConnectorId) return;
  const prior = readComposioConfig();
  if (prior.authConfigIds[normalizedConnectorId] === undefined) return;
  const authConfigIds = { ...prior.authConfigIds };
  delete authConfigIds[normalizedConnectorId];
  writeRawConfig(normalizeComposioConfig({ ...prior, authConfigIds }));
}

export function readComposioWritePolicy(): ComposioWritePolicy {
  return readComposioConfig().writePolicy ?? { allowWrites: false, connectorWrites: {} };
}

/** Patch one scope without overwriting other connectors or account credentials. */
export function writeComposioWritePolicy(input: unknown): ComposioWritePolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a write-access setting');
  const value = input as Record<string, unknown>;
  if (typeof value.allowWrites !== 'boolean' || Object.keys(value).some(key => !['allowWrites', 'connectorId'].includes(key))) {
    throw new Error('allowWrites must be a boolean');
  }
  if ('connectorId' in value && (typeof value.connectorId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(value.connectorId))) {
    throw new Error('Invalid connector ID');
  }
  const prior = readComposioConfig();
  const policy = prior.writePolicy ?? { allowWrites: false, connectorWrites: {} };
  if (typeof value.connectorId === 'string') {
    policy.connectorWrites = { ...policy.connectorWrites, [value.connectorId]: value.allowWrites };
  } else policy.allowWrites = value.allowWrites;
  writeRawConfig({ ...prior, writePolicy: policy });
  return policy;
}

function readRawConfig(): unknown {
  try {
    return JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as unknown;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeRawConfig(config: ComposioConfig): void {
  fs.mkdirSync(path.dirname(configFilePath), { recursive: true, mode: 0o700 });
  const tempPath = `${configFilePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, configFilePath);
  fs.chmodSync(configFilePath, 0o600);
}

function normalizeComposioConfig(value: unknown): ComposioConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    apiKey: normalizeOptionalString(raw.apiKey) ?? '',
    authConfigIds: normalizeAuthConfigIds(raw.authConfigIds),
    ...(raw.writePolicy && typeof raw.writePolicy === 'object' && !Array.isArray(raw.writePolicy)
      ? { writePolicy: normalizeWritePolicy(raw.writePolicy as Record<string, unknown>) } : {}),
  };
}

function normalizeWritePolicy(raw: Record<string, unknown>): ComposioWritePolicy {
  const entries = raw.connectorWrites && typeof raw.connectorWrites === 'object' && !Array.isArray(raw.connectorWrites)
    ? Object.entries(raw.connectorWrites).filter(([id, value]) => /^[a-z0-9][a-z0-9_-]{0,99}$/.test(id) && typeof value === 'boolean') : [];
  return { allowWrites: raw.allowWrites === true, connectorWrites: Object.fromEntries(entries) };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeAuthConfigIds(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [connectorId, authConfigId] of Object.entries(value as Record<string, unknown>)) {
    const normalizedConnectorId = normalizeOptionalString(connectorId);
    const normalizedAuthConfigId = normalizeOptionalString(authConfigId);
    if (normalizedConnectorId && normalizedAuthConfigId) next[normalizedConnectorId] = normalizedAuthConfigId;
  }
  return next;
}
