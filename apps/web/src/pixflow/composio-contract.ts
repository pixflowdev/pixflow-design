import type { ComponentType } from 'react';
import type { ComposioInferenceRequest, ComposioInferenceResponse, ComposioSiteApps } from '@open-design/contracts';
import type { AppConfig } from '../types';

/** Component and request signatures shared with the independently loaded factory. */
export interface ComposioContribution {
  ComposioExecution: ComponentType<{ config: AppConfig; onChange: (patch: Partial<AppConfig>) => void; compact?: boolean }>;
  ComposioSiteConnectors: ComponentType;
  ComposioSiteApps: ComponentType<{ revision?: number; toolkit?: string; showGlobalPolicy?: boolean; onLoaded?: (apps: ComposioSiteApps) => void }>;
  ComposioWriteAccess: ComponentType<{ connectorId?: string; connectorName?: string }>;
  composioInferenceJson: <T>(action: string, body?: unknown, signal?: AbortSignal, method?: string) => Promise<T>;
  composioInferenceTurn: (input: ComposioInferenceRequest, signal: AbortSignal) => Promise<ComposioInferenceResponse>;
  fetchComposioGuidance: (signal: AbortSignal) => Promise<string>;
}
