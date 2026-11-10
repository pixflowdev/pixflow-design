import models from '../../../../wordpress/resources/context-models.json';
import type { AppConfig } from '../types';

/** A conservative local estimate, not a tokenizer or the provider's advertised limit.
 * Leave headroom for output, instructions, tools and images; cap working context
 * for latency even when a provider supports a million-token request. Unknown or
 * custom endpoints retain the previous conservative threshold. Native CLI owns
 * its own compaction and does not call this policy.
 */
export function contextBudget(config: Pick<AppConfig, 'model' | 'apiProtocol' | 'baseUrl' | 'apiTransport' | 'composioModel' | 'composioProvider' | 'maxTokens'>, fixedBytes = 0) {
  const composio = config.apiTransport === 'composio';
  // Composio connection IDs are opaque; its selected model is the catalogue ID.
  let openai = composio;
  if (!composio && config.apiProtocol === 'openai') {
    try { openai = new URL(config.baseUrl).hostname === 'api.openai.com'; } catch { /* Unknown endpoint. */ }
  }
  const model = composio ? (config.composioModel ?? '').replace(/^openai\//, '') : config.model;
  const window = openai && Object.hasOwn(models.openai, model) ? (models.openai as Record<string, number>)[model] : undefined;
  const output = Number.isFinite(config.maxTokens) && (config.maxTokens ?? 0) > 0 ? Math.ceil(config.maxTokens!) : 8192;
  const fixed = Number.isFinite(fixedBytes) ? Math.max(0, fixedBytes) : 0;
  const tokens = window ? Math.max(2048, Math.min(models.maxWorkingTokens, Math.floor(window * 0.65) - output - 4096 - Math.ceil(fixed / 3))) : models.fallbackBytes / 3;
  const triggerBytes = tokens * models.bytesPerEstimatedToken;
  return { triggerBytes, growthBytes: Math.min(24000, Math.floor(triggerBytes / 2)), knownModel: Boolean(window) };
}
