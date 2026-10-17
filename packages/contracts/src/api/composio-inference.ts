import type { PixflowSiteProviderTurn } from './pixflow-direct-site.js';

export interface ComposioInferenceProvider {
  id: string;
  name: string;
  connected: boolean;
}
export interface ComposioInferenceRequest {
  provider: string;
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  turns?: unknown[];
  results?: Array<{ id: string; result: unknown; images?: ComposioInferenceImage[] }>;
  images?: ComposioInferenceImage[];
  maxTokens?: number;
  siteTools?: boolean;
}
export interface ComposioInferenceImage { mimeType: string; base64: string }
export type ComposioInferenceResponse = PixflowSiteProviderTurn;
export interface ComposioInferenceModels { models: Array<{ id: string; label: string }> }

/** Explicit WordPress-user access; independent of Bridge connector permissions. */
export interface ComposioSiteAccount {
  id: string; name: string; toolkit: string; owner: string; status: string; enabled: boolean;
  identity?: { username: string; displayName: string };
  createdAt?: string;
  suspended?: boolean;
}
export interface ComposioSiteApps { accounts: ComposioSiteAccount[]; limits?: { maximum: number | null; enabled: number; saved: number } }
export interface ComposioSiteToolkit { slug: string; name: string; description: string; toolCount: number }
export interface ComposioSiteCatalogue { items: ComposioSiteToolkit[]; nextCursor: string | null }
export interface ComposioSiteToolPreview { tools: Array<{ name: string; title: string; description: string; access: string }>; nextCursor: string | null }
export interface ComposioSiteWritePolicy { allowWrites: boolean; accountWrites: Record<string, boolean> }
export interface ComposioSiteSelection { accountId: string; enabled: boolean }
export interface ComposioSiteWriteUpdate { accountId?: string; allowWrites: boolean }
export interface ComposioSiteExecute { accountId: string; tool: string; arguments: Record<string, unknown> }
