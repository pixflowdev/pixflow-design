import { findProvider, type MediaProviderId } from './models';

/** Stable identity used by chat rows for provider-backed media requests. */
export const BYOK_MEDIA_AGENT_ID = 'byok-api';

const PROVIDER_ROLE_LABELS: Partial<Record<MediaProviderId, string>> = {
  openai: 'OpenAI API',
  nanobanana: 'Google AI Studio',
  aihubmix: 'AIHubMix API',
  google: 'Google Gemini',
};

export function mediaProviderRoleLabel(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  if (!normalized) return 'BYOK API';
  const known = PROVIDER_ROLE_LABELS[normalized as MediaProviderId];
  if (known) return known;
  return findProvider(normalized as MediaProviderId)?.label ?? normalized;
}

export function mediaProviderAgentIdentity(
  providerId: string,
  model?: string | null,
): { agentId: string; agentName: string } {
  const label = mediaProviderRoleLabel(providerId);
  const modelId = model?.trim();
  return {
    agentId: BYOK_MEDIA_AGENT_ID,
    agentName: modelId ? `${label} · ${modelId}` : label,
  };
}
