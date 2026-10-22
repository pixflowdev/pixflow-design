/** Durable transcript identity. The server resolves ownership; never trust a client user ID. */
export interface PixflowChatHistoryBinding {
  projectId: string;
  conversationId: string;
}

export interface PixflowChatHistoryResolveRequest {
  sessionKey: string;
  title?: string;
  projectId?: string;
  conversationId?: string;
  /** false only looks up an existing binding; opening an empty panel must not create a chat. */
  create?: boolean;
}

export type PixflowChatHistoryLookupResponse = PixflowChatHistoryBinding | { projectId: null; conversationId: null };

/** Pages are chronological. nextCursor fetches the page preceding this one. */
export interface PixflowChatHistoryPage<T> {
  messages: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PixflowChatHistoryVersion {
  historyRevision?: number;
  historySequence?: number;
}

export interface PixflowChatHistorySaveResponse<T> {
  ok: boolean;
  message: T;
  revision: number;
}

export interface PixflowSavedChatHistory extends PixflowChatHistoryBinding {
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  sessionKey?: string | null;
}

export interface PixflowChatHistoryListPage {
  conversations: PixflowSavedChatHistory[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PixflowChatHistoryImportResponse<T> {
  messages: T[];
  deletedMessageIds: string[];
}

/** Chronological complete payloads. A changed transcript rejects the cursor with 409; restart rather than merge exports. */
export interface PixflowChatHistoryExportPage<T> extends PixflowChatHistoryPage<T> {
  schemaVersion: 1;
  exportedAt: string;
  conversation: Omit<PixflowSavedChatHistory, 'sessionKey'>;
}

/** Database value bytes, not allocated disk usage or a hosting quota. */
export interface PixflowChatHistoryStorageUsage {
  scope: 'current-user';
  measuredAt: string;
  conversationCount: number;
  messageCount: number;
  compressedMessageCount: number;
  storedMessageBytes: number;
  logicalMessageBytes: number;
  savedMessageBytes: number;
  /** Includes preserved legacy chat recovery copies and other project metadata. */
  projectMetadataBytes: number;
  /** This site's saved working-context checkpoints and candidate indexes. */
  workingContextBytes: number;
  exclusions: Array<'media-files' | 'browser-cache' | 'bridge-files' | 'database-overhead' | 'temporary-context-candidates' | 'saved-memory'>;
}

/** A derived model context; never a replacement for the saved transcript. */
export interface PixflowWorkingContextRequest {
  transport: 'api' | 'composio';
  throughMessageId: string;
  maxTokens?: number;
  apiProtocol?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  model?: string;
  provider?: string;
  force?: boolean;
}
export interface PixflowWorkingContextResponse {
  messages: Array<{ role: string; content: string }>;
  status: 'unchanged' | 'reused' | 'compacted' | 'fallback';
  coveredMessages: number;
  sourceDigest: string;
  summary?: string;
  candidateId?: string;
  reason?: string;
}

export interface PixflowWorkingRunContextRequest extends Omit<PixflowWorkingContextRequest, 'throughMessageId'> {
  messages: Array<{ role: string; content: string }>;
  turns: unknown[];
  results: unknown[];
  calls: unknown[];
  inFlight?: unknown;
}
export type PixflowWorkingRunContextResponse = { status: 'compacted'; summary: string } | { status: 'fallback'; reason: string };
