import { configuredWordPressMediaModelChoices } from './wordpress-media-selection';
import type { AgentInfo, AppConfig } from '../types';

export function imageGenerationRoute(
  config: Pick<AppConfig, 'mode' | 'agentId' | 'mediaProviders'>,
  agents: readonly Pick<AgentInfo, 'id' | 'available' | 'authStatus'>[] = [],
) {
  const codexReady = config.mode === 'daemon' && agents.some(
    agent => agent.id === 'codex' && agent.available && agent.authStatus === 'ok',
  );
  if (codexReady && config.agentId === 'codex') return { kind: 'codex' as const };
  const provider = configuredWordPressMediaModelChoices({
    surface: 'image', mediaProviders: config.mediaProviders,
  }).find(choice => config.mediaProviders?.[choice.providerId]?.enabled !== false);
  if (provider) return { kind: 'provider' as const, provider };
  if (codexReady && config.agentId === 'claude') return { kind: 'codex' as const };
  return null;
}