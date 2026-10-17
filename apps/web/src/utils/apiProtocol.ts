import { isOpenAICompatible } from '../providers/openai-compatible';
import type { ApiProtocol, AppConfig } from '../types';

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama Cloud API',
  senseaudio: 'SenseAudio API',
  aihubmix: 'AIHubMix API',
};

const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
  ollama: 'ollama-cloud-api',
  senseaudio: 'senseaudio-api',
  aihubmix: 'aihubmix-api',
};

export function apiProtocolLabel(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_LABELS[protocol ?? 'anthropic'];
}

export function apiProtocolModelLabel(
  protocol: ApiProtocol | undefined,
  model: string,
): string {
  const label = apiProtocolLabel(protocol);
  const trimmed = model.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}

export function apiProtocolAgentId(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_AGENT_IDS[protocol ?? 'anthropic'];
}

export function apiExecutionAgentId(config: Pick<AppConfig, 'apiTransport' | 'apiProtocol'>): string {
  return config.apiTransport === 'composio' ? 'composio' : apiProtocolAgentId(config.apiProtocol);
}

/** The selected Composio model is independent of preserved direct API settings. */
export function apiExecutionModel(config: Pick<AppConfig, 'apiTransport' | 'composioModel' | 'model'>): string {
  return (config.apiTransport === 'composio' ? config.composioModel : config.model) || '';
}

export function apiExecutionLabel(config: AppConfig): string {
  return config.apiTransport === 'composio'
    ? `Composio${config.composioModel ? ` · ${config.composioModel}` : ''}`
    : apiProtocolModelLabel(config.apiProtocol, config.model || '');
}

export function usesAnthropicProxy(cfg: AppConfig): boolean {
  if (
    cfg.apiProtocol === 'azure' ||
    cfg.apiProtocol === 'ollama' ||
    cfg.apiProtocol === 'google' ||
    cfg.apiProtocol === 'senseaudio' ||
    cfg.apiProtocol === 'aihubmix' ||
    cfg.apiProtocol === 'openai'
  ) {
    return false;
  }
  if (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl)) {
    return false;
  }
  return Boolean(cfg.baseUrl && cfg.baseUrl !== 'https://api.anthropic.com');
}

export function isAnthropicSupportedImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return /\.(jpe?g|png|gif|webp)$/.test(lower);
}
