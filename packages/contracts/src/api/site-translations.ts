/** Manual translation preview shared by WordPress UI and headless clients. */
export type SiteTranslationLanguage = { code: string; label: string };
export type SiteTranslationRules = { excludedPages: number[]; excludedClasses: string[]; glossary: {source: string; target: string; locale: string}[]; dynamicText: boolean };
export type SiteTranslationSettings = { source: string; languages: SiteTranslationLanguage[]; revision: number; rules?: SiteTranslationRules };
export type SiteTranslationUpdates = { activeLanguages: string[]; needsUpdate: boolean };
export type SiteTranslationPage = { id: number; title: string; url: string; type: string; sourceRevision: number; publishedLanguages: string[]; pendingLanguages?: string[] };
export type SiteTranslationIndex = { settings: SiteTranslationSettings; pages: SiteTranslationPage[]; hasMore: boolean; nextOffset: number; total: number };
export type SiteTranslationEntry = {
  key: string; scope: string; context: string; source: string;
  target: string; publishedTarget: string; revision: number;
};
export type SiteTranslationUrl = { revision: number; draftPath: string; publishedPath: string };
export type SiteTranslationDocument = { revision: number; entries: SiteTranslationEntry[]; published: boolean; publishedUrl?: string; url?: SiteTranslationUrl; needsReview?: boolean; sourceVersion?: string };
export type SiteTranslationMutation =
  | ({ action: 'configure' } & SiteTranslationSettings)
  | { action: 'capture'; postId: number; locale: string; html: string; sourceRevision: number; sourceVersion?: string }
  | { action: 'save'; postId: number; locale: string; key: string; target: string; revision: number; sourceRevision: number }
  | { action: 'url'; postId: number; locale: string; path: string; revision: number }
  | { action: 'publish'; postId: number; locale: string; sourceRevision: number; revisions: Record<string, number>; urlRevision?: number };

/** Durable, user-owned generation progress. Credentials and source text are not job metadata. */
export type SiteTranslationJobItem = { postId: number; locale: string; sourceRevision: number; status: 'pending' | 'complete' | 'failed'; error?: string };
export type SiteTranslationJob = {
  id: string; status: 'pending' | 'complete' | 'paused' | 'cancelled';
  items: SiteTranslationJobItem[]; model: string; protocol: string;
  busy: boolean; interrupted: boolean;
};
export type SiteTranslationProvider = { apiProtocol: string; model: string; baseUrl: string; apiKey: string; apiVersion?: string };
export type AgentTextRequest = { agentId: 'codex'|'claude'; model: string; prompt: string };
export type AgentTextResponse = { text: string; source: 'desktop'|'cli' };
export type AgentTextCapability = { available: true };
export type SiteTranslationClaim = { job: SiteTranslationJob; lease?: string; prompt?: string };
