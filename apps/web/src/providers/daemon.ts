/**
 * Daemon provider — fetch-based SSE client for /api/runs. The daemon can
 * emit three event streams depending on the agent's streamFormat:
 *   - 'agent'   : typed events emitted by Claude Code's stream-json parser
 *                 (status, text_delta, thinking_delta, tool_use, tool_result,
 *                 usage, raw). We forward these to the UI as AgentEvent items.
 *   - 'stdout'  : plain chunks from other CLIs. We wrap them in a single
 *                 rolling 'text' event.
 *   - 'stderr'  : incidental stderr. Shown only when the process exits
 *                 non-zero (tail appended to the error message).
 */
import type { AgentEvent, ChatCommentAttachment, ChatMessage } from '../types';
import { expandSteeringMessages } from '../pixflow/steering-messages';
import type { AmrEntryAttribution } from '../analytics/amr-attribution';
import type {
  ChatAnalyticsHints,
  ChatRunCreateResponse,
  ChatRunListResponse,
  ChatRunStatus,
  ChatRunStatusResponse,
  ChatRequest,
  ChatSessionMode,
  ChatSseEvent,
  ChatSseStartPayload,
  DaemonAgentPayload,
  AmrModelsResponse,
  AmrWalletSnapshot,
  MediaExecutionPolicy,
  ResearchFindings,
  ResearchOptions,
  ResearchStatus,
  RunContextSelection,
  SseErrorPayload,
  PixflowBuildInBricksSkillAuthority,
  PixflowWorkspaceSource,
  PixflowDirectSiteSession,
} from '@open-design/contracts';
import type { StreamHandlers } from './anthropic';

/**
 * Returns the front-end carrier that's about to send this request:
 * - 'desktop' when running inside the Electron shell
 * - 'web' when running in a regular browser
 * - 'unknown' in non-browser test environments (jsdom without a UA)
 *
 * The daemon uses this to label telemetry traces. Cheap, called once per
 * run so caching isn't worth the complexity.
 */
function detectClientType(): 'desktop' | 'web' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent ?? '';
  if (ua.includes('Electron/')) return 'desktop';
  if (ua) return 'web';
  return 'unknown';
}
import { parseSseFrame } from './sse';
import { isPixflowWordPressEmbed, requestWordPressRest } from '../pixflow/license';
import { toPixflowRuntimeUrl } from '../pixflow/bridge-url';
import { pixflowRuntimeFetch as pixflowWordPressRuntimeFetch, pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { getPixflowBridgeBaseUrl, getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import {
  ensurePixflowOptionalBridgeSiteContext,
  isPixflowOptionalBridgeLoopbackAccessError,
  isPixflowIntentionalAbort,
  normalizePixflowOptionalBridgeError,
  notifyPixflowOptionalBridgeDisconnected,
} from '../pixflow/optional-bridge';
import {
  summarizeArtifactsForTranscript,
  type PersistedArtifactFileRef,
} from '../artifacts/strip';
import { trackRunProgress, trackRunStart, trackRunTerminal } from '../observability/stuck-run';
import { extractPublicThinkingText } from '../utils/agentThinking';

const MAX_TRANSCRIPT_MESSAGE_CHARS = 12_000;
const LARGE_TOOL_RESULT_CHARS = 8_000;
const HIGH_INPUT_TOKEN_WARNING_THRESHOLD = 200_000;

export function latestUserPromptFromHistory(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function truncateForTranscript(content: string): string {
  if (content.length <= MAX_TRANSCRIPT_MESSAGE_CHARS) return content;
  const omitted = content.length - MAX_TRANSCRIPT_MESSAGE_CHARS;
  return `${content.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS)}\n\n[Pixflow Design truncated ${omitted} chars from this prior message before sending it to the agent. Full content remains in persisted history.]`;
}

function escapeTranscriptRoleDelimiters(content: string): string {
  return content.replace(/^(## (?:user|assistant)[ \t]*)(\r?)$/gm, '\\$1$2');
}

function compactInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function buildPriorRunContextWarning(history: ChatMessage[]): string | null {
  let highestInputTokens = 0;
  let largeToolResults = 0;
  let sawAgentBrowserCoreDump = false;

  for (const message of history) {
    for (const event of message.events ?? []) {
      if (event.kind === 'usage' && typeof event.inputTokens === 'number') {
        highestInputTokens = Math.max(highestInputTokens, event.inputTokens);
      }
      if (event.kind === 'tool_result') {
        if (event.content.length > LARGE_TOOL_RESULT_CHARS) largeToolResults += 1;
        if (
          event.content.includes('agent-browser skills get core') ||
          event.content.includes('Agent Browser Core') ||
          event.content.includes('name: core')
        ) {
          sawAgentBrowserCoreDump = true;
        }
      }
      if (event.kind === 'tool_use') {
        const input = compactInput(event.input);
        if (input.includes('agent-browser skills get core')) {
          sawAgentBrowserCoreDump = true;
        }
      }
    }
  }

  const notes: string[] = [];
  if (highestInputTokens >= HIGH_INPUT_TOKEN_WARNING_THRESHOLD) {
    notes.push(`a previous run reported ${highestInputTokens} input tokens`);
  }
  if (largeToolResults > 0) {
    notes.push(`${largeToolResults} large prior tool result${largeToolResults === 1 ? '' : 's'} exist only in persisted event history`);
  }
  if (sawAgentBrowserCoreDump) {
    notes.push('agent-browser documentation output was seen earlier; do not replay it into this turn');
  }
  if (notes.length === 0) return null;

  return [
    '## context warning',
    `Pixflow Design detected ${notes.join(', ')}.`,
    'Keep this turn compact: summarize prior tool output, read large references from temp files, and quote only task-relevant lines.',
  ].join('\n');
}

function scopeHistoryToAgent(history: ChatMessage[], targetAgentId?: string): ChatMessage[] {
  // An explicit fork imports a complete conversation into a fresh agent session.
  // Its original provider labels are display provenance, never context boundaries.
  if (history.some(message => message.historyOrigin)) return history;
  if (!targetAgentId) return history;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'assistant' && message.agentId && message.agentId !== targetAgentId) {
      return history.slice(i + 1);
    }
  }
  return history;
}

// Strip OD-specific markup that the agent emitted on a prior turn but
// that the model would otherwise pattern-match as a template to echo.
// Today this is `<question-form>` blocks (and the `<ask-question>` alias the
// UI parser and the daemon open-tag matcher both accept) and the ```json
// fenced schemas
// some models (GPT-OSS-120B Medium, Gemini 3.5 Flash) emit alongside
// them — leaving those literal in the transcript causes weak/medium
// plain-stream models to re-emit an identical form on the user's
// follow-up turn, looking like the discovery form loop never breaks
// (see PR #3157 form-loop investigation). If we only scrubbed the canonical
// tag, an alias-form turn would replay verbatim and re-trigger that loop.
//
// User content is preserved verbatim — a user message that legitimately
// quotes `<question-form>` (e.g. discussing the markup with the agent)
// must not be mangled.
export function sanitizePriorAssistantTurnForTranscript(
  content: string,
  persistedArtifactFiles: ReadonlyArray<PersistedArtifactFileRef> = [],
): string {
  let sanitized = content.replace(
    // `\1` backreference keeps the open/close tag names matched so we never
    // splice across a `<question-form>…</ask-question>` mismatch.
    /<(question-form|ask-question)\b[^>]*>[\s\S]*?<\/\1>/g,
    '[question-form was emitted here on a prior turn; the user already answered, see their reply below.]',
  );
  // Strip ```json (or plain ```) fenced blocks whose body matches the
  // form schema shape — `"questions": [` is the strongest tell. A
  // generic JSON snippet without that key (e.g. an API response the
  // agent shared) is left intact.
  sanitized = sanitized.replace(
    /```(?:json)?\s*\n([\s\S]*?)\n```/g,
    (match, body: string) => {
      if (/"questions"\s*:\s*\[/.test(body)) {
        return '[form schema was echoed here on a prior turn; stripped to avoid a loop.]';
      }
      return match;
    },
  );
  // Replace prior-turn `<artifact>` HTML with a one-line summary — but ONLY
  // for artifacts whose save to the project files is confirmed by the
  // message's producedFiles record. persistArtifact has refusal and
  // write-failure branches; on those paths the transcript copy is the only
  // surviving artifact body, so an unconfirmed block stays verbatim (the
  // 12K truncation below still bounds it) and a follow-up turn can repair it.
  // For confirmed saves the agent reads/edits the file from disk, never from
  // this transcript copy, so re-sending the whole document each turn is pure
  // waste — the summary keeps identifier/title/type plus the saved file name.
  // Runs before truncateForTranscript so the summarized message no longer
  // trips the 12K cap. Uses markdown-aware detection so a literal
  // `<artifact>` recited in a code fence survives.
  sanitized = summarizeArtifactsForTranscript(sanitized, persistedArtifactFiles);
  return sanitized;
}

// producedFiles → the persistence evidence summarizeArtifactsForTranscript
// matches artifact blocks against. producedFiles is the whole per-turn file
// diff — tool-written files included — so a name collision with an unrelated
// same-turn file must not count as proof the <artifact> body was saved. Only
// artifact-originated saves qualify: persistArtifact always writes an explicit
// (non-inferred) manifest, whereas tool-written files surface with no manifest
// or a daemon-inferred one (`metadata.inferred === true`). Within that
// narrowed set, the manifest identifier is the strongest link (it survives
// `-2`/`-3` collision renames); the file name is the fallback for artifact
// saves whose manifest predates identifier metadata.
function persistedArtifactFilesOf(message: ChatMessage): PersistedArtifactFileRef[] {
  return (message.producedFiles ?? [])
    .filter((file) => file.artifactManifest && file.artifactManifest.metadata?.inferred !== true)
    .map((file) => {
      const identifier = file.artifactManifest?.metadata?.identifier;
      return {
        name: file.name,
        identifier: typeof identifier === 'string' && identifier ? identifier : undefined,
      };
    });
}

export function buildDaemonTranscript(history: ChatMessage[], targetAgentId?: string): string {
  const scopedHistory = expandSteeringMessages(scopeHistoryToAgent(history, targetAgentId));
  const transcript = scopedHistory
    .map((m, index) => {
      const trimmed = m.content.trim();
      const sanitized =
        m.role === 'assistant'
          ? sanitizePriorAssistantTurnForTranscript(trimmed, persistedArtifactFilesOf(m))
          : trimmed;
      // The final user message is the active request, not historical context.
      // Synthetic Pixflow workflows can legitimately carry a long, precise
      // execution contract here (Prototype Bricks is one example). Truncating
      // it silently drops late quality/animation rules even though prompt
      // delivery is stdin-based and has no argv limit. Keep prior turns
      // compact, but always deliver the active user turn intact.
      const isActiveUserTurn = m.role === 'user' && index === scopedHistory.length - 1;
      const content = isActiveUserTurn ? sanitized : truncateForTranscript(sanitized);
      return `## ${m.role}\n${escapeTranscriptRoleDelimiters(content)}`;
    })
    .join('\n\n');
  const warning = buildPriorRunContextWarning(scopedHistory);
  return warning ? `${warning}\n\n${transcript}` : transcript;
}

export interface DaemonStreamHandlers extends StreamHandlers {
  onAgentEvent: (ev: AgentEvent) => void;
  /**
   * Live-only incremental tool-input fragment (Claude `input_json_delta`).
   * Kept off `AgentEvent`/`PersistedAgentEvent` because it is ephemeral and
   * never persisted — consumers accumulate by tool-use `id` for real-time
   * display and discard once the full `tool_use` event arrives. `name` is the
   * tool name so the UI can gate the live preview to code-writing tools.
   */
  onToolInputDelta?: (id: string, name: string, delta: string) => void;
}

export interface DaemonStreamOptions {
  /** Transient source binding, never embedded in project metadata or transcript. */
  workspaceSource?: PixflowWorkspaceSource;
  agentId: string;
  history: ChatMessage[];
  /** Legacy field accepted by older tests/callers. Daemon-owned prompt composition ignores it. */
  systemPrompt?: string;
  /** Stops the current browser-side SSE subscription. The daemon run continues. */
  signal: AbortSignal;
  /** Explicit user cancellation signal. This maps to POST /api/runs/:id/cancel. */
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  // The active project's id. When supplied, the daemon spawns the agent
  // with cwd = the project folder so its file tools target the right
  // workspace.
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. These
  // are layered onto the system prompt for this run only and do not
  // change the project's persistent `skillId`.
  skillIds?: string[];
  designSystemId?: string | null;
  // Project-relative paths the user has staged for this turn. The
  // daemon resolves them inside the project folder, validates they
  // exist, and stitches them into the user message as `@<path>` hints.
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  // Per-CLI model + reasoning the user picked in the model menu. Both are
  // optional; the daemon validates them against the agent's declared
  // options and falls back to the CLI default when missing.
  model?: string | null;
  reasoning?: string | null;
  fastMode?: boolean | null;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  pluginInputs?: Record<string, unknown>;
  /** Metadata used when the daemon creates a row for a WordPress-first project. */
  projectMetadata?: Record<string, unknown> | null;
  pixflowBuildSkillAuthority?: PixflowBuildInBricksSkillAuthority | null;
  wordpressPluginAssetSync?: { pluginId: string } | null;
  mediaExecution?: MediaExecutionPolicy;
  locale?: string;
  initialLastEventId?: string | null;
  onRunCreated?: (runId: string) => void;
  onRunStatus?: (status: ChatRunStatus) => void;
  onRunEventId?: (eventId: string) => void;
  /** Called after a WordPress-backed Bridge run has copied its files home. */
  onProjectFilesSynced?: () => void;
  // v2 analytics context propagated to run_created / run_finished.
  // Optional; the daemon only consumes these to shape PostHog props
  // (page_name / area / entry_from / DS context). Behavior never
  // depends on them.
  analyticsHints?: ChatAnalyticsHints;
}

interface WordPressPluginAssetBundleFile {
  path: string;
  sourcePath?: string;
  mime?: string;
  encoding: 'base64';
  content: string;
}

interface WordPressPluginAssetBundleResponse {
  ok?: boolean;
  pluginId?: string;
  files?: WordPressPluginAssetBundleFile[];
}

interface WordPressProjectFileEntry {
  name?: string;
  path?: string;
  type?: string;
  mime?: string;
  size?: number;
  sha256?: string;
  artifactManifest?: unknown;
}

interface WordPressProjectFilesResponse {
  files?: WordPressProjectFileEntry[];
}

interface BridgeProjectFilesResponse {
  files?: WordPressProjectFileEntry[];
}

function pixflowBridgeApiBase(): string {
  return getPixflowBridgeBaseUrl();
}

function daemonApiUrl(path: string): string {
  return toPixflowRuntimeUrl(path);
}

/** HTTP headers are byte strings; JSON escapes preserve Unicode session metadata losslessly. */
function sessionHeader(value: PixflowDirectSiteSession): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

export async function claudeSignInRequest(action: 'status' | 'start' | 'cancel', signal?: AbortSignal): Promise<import('@open-design/contracts').ClaudeSignInStatus> {
  const response = await daemonFetch(`/api/agents/claude/sign-in${action === 'cancel' ? '/cancel' : ''}`, {
    method: action === 'status' ? 'GET' : 'POST', signal, cache: 'no-store',
    ...(action === 'status' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  });
  if (!response.ok) throw new Error('Claude sign-in is unavailable. Check Bridge and try again.');
  return response.json();
}

function daemonFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = daemonApiUrl(path);
  const headers = new Headers(init.headers || {});
  const siteKey = String(getPixflowWordPressConfig()?.siteHash || '').trim();
  if (siteKey) headers.set('X-Pixflow-Site-Key', siteKey);
  return fetch(url, {
    ...init,
    headers,
    targetAddressSpace: 'loopback',
  } as RequestInit & { targetAddressSpace: 'loopback' }).catch((error) => {
    if (isPixflowIntentionalAbort(error, init.signal)) throw error;
    if (!/^https?:\/\/(?:127(?:\.\d{1,3}){3}|localhost|\[?::1\]?)(?::\d+)?(?:\/|$)/i.test(url)) {
      throw error;
    }
    const normalized = normalizePixflowOptionalBridgeError(error);
    notifyPixflowOptionalBridgeDisconnected(normalized);
    throw normalized;
  });
}

export async function fetchResearchStatusViaDaemon(signal?: AbortSignal): Promise<ResearchStatus> {
  const response = await daemonFetch('/api/research/status', { method: 'GET', cache: 'no-store', signal });
  if (!response.ok) throw new Error(await researchDaemonError(response, 'Research availability check failed'));
  return await response.json() as ResearchStatus;
}

export async function searchResearchViaDaemon(input: {
  query: string;
  maxSources?: number;
  includeContent?: boolean;
  domains?: string[];
  recencyDays?: number;
  providers?: string[];
}, signal?: AbortSignal): Promise<ResearchFindings> {
  const response = await daemonFetch('/api/research/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw new Error(await researchDaemonError(response, 'Online research failed'));
  return await response.json() as ResearchFindings;
}

async function researchDaemonError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
  if (typeof body?.error === 'string') return body.error;
  if (body?.error && typeof body.error.message === 'string') return body.error.message;
  return `${fallback} (${response.status}).`;
}

function daemonBridgeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  // The WordPress entrypoint installs a fetch router so normal `/api/*`
  // calls can be split between the Bridge and the site's REST adapter. That
  // router deliberately sends project-file URLs to WordPress because those
  // files are durable there. These calls are the opposite direction: they
  // must address the Bridge's temporary project tree while staging files
  // before/after a Local CLI run. Bypass the router or a Bridge
  // `/api/projects/:id/files` request is silently mapped back to WordPress,
  // making generated binaries appear to vanish from the durable project.
  const nativeFetch = typeof window !== 'undefined'
    ? (window as Window & { __PIXFLOW_DESIGN_NATIVE_FETCH__?: typeof fetch }).__PIXFLOW_DESIGN_NATIVE_FETCH__
    : undefined;
  const request = nativeFetch ?? fetch;
  const headers = new Headers(init.headers || {});
  const siteKey = String(getPixflowWordPressConfig()?.siteHash || '').trim();
  if (siteKey) headers.set('X-Pixflow-Site-Key', siteKey);
  return request(url, {
    ...init,
    headers,
    targetAddressSpace: 'loopback',
  } as RequestInit & { targetAddressSpace: 'loopback' });
}

async function syncWordPressPluginAssetsToBridgeProject(
  projectId: string | null | undefined,
  sync: DaemonStreamOptions['wordpressPluginAssetSync'],
): Promise<void> {
  if (!projectId || !sync?.pluginId || !isPixflowWordPressEmbed()) return;

  const response = await requestWordPressRest<WordPressPluginAssetBundleResponse>(
    `od/plugins/${encodeURIComponent(sync.pluginId)}/asset-bundle`,
  );
  if (!response.ok) {
    throw new Error(`Could not stage plugin assets for ${sync.pluginId}. WordPress returned ${response.status}.`);
  }
  const files = response.ok && Array.isArray(response.body.files) ? response.body.files : [];
  if (files.length === 0) return;

  const bridgeBase = pixflowBridgeApiBase();
  if (!bridgeBase) return;
  const endpoint = `${bridgeBase}/api/projects/${encodeURIComponent(projectId)}/files`;
  for (const file of files) {
    if (!file.path || file.encoding !== 'base64' || typeof file.content !== 'string') continue;
    const upload = await daemonBridgeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.path,
        content: file.content,
        encoding: 'base64',
      }),
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => '');
      throw new Error(
        `Could not stage plugin asset ${file.sourcePath || file.path}. Bridge returned ${upload.status}${detail ? `: ${detail}` : ''}.`,
      );
    }
  }
}

function projectFilePath(projectId: string, name: string, raw = false): string {
  const encodedName = name
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/${raw ? 'raw' : 'files'}/${encodedName}`;
}

function projectFileName(file: WordPressProjectFileEntry): string {
  return String(file.path || file.name || '').trim().replaceAll('\\', '/');
}

function projectFileSha256(file: WordPressProjectFileEntry | null | undefined): string | null {
  const value = String(file?.sha256 || '').trim().toLowerCase().replace(/^sha256:/, '');
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function projectFilesHaveSameContent(
  left: WordPressProjectFileEntry | null | undefined,
  right: WordPressProjectFileEntry | null | undefined,
): boolean {
  const leftHash = projectFileSha256(left);
  const rightHash = projectFileSha256(right);
  return leftHash !== null && rightHash !== null && leftHash === rightHash;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function uploadBridgeProjectFile(
  endpoint: string,
  name: string,
  bytes: ArrayBuffer,
  mime: string | undefined,
  artifactManifest: unknown,
): Promise<void> {
  // Multipart avoids the daemon's 4 MB JSON body limit for generated videos
  // and other binary assets. Keep a JSON fallback for non-browser test
  // environments where FormData/Blob are not available.
  if (typeof FormData === 'function' && typeof Blob === 'function') {
    const form = new FormData();
    const basename = name.split('/').pop() || name;
    form.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), basename);
    form.append('name', name);
    const upload = await daemonBridgeFetch(endpoint, { method: 'POST', body: form });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => '');
      throw new Error(`Bridge rejected project file ${name} (${upload.status})${detail ? `: ${detail}` : ''}.`);
    }
    return;
  }

  const upload = await daemonBridgeFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      content: arrayBufferToBase64(bytes),
      encoding: 'base64',
      ...(artifactManifest && typeof artifactManifest === 'object' ? { artifactManifest } : {}),
    }),
  });
  if (!upload.ok) {
    const detail = await upload.text().catch(() => '');
    throw new Error(`Bridge rejected project file ${name} (${upload.status})${detail ? `: ${detail}` : ''}.`);
  }
}

async function syncWordPressProjectFilesToBridgeProject(projectId: string | null | undefined): Promise<void> {
  if (!projectId || !isPixflowWordPressEmbed()) return;

  const bridgeBase = pixflowBridgeApiBase();
  if (!bridgeBase) return;

  const listResponse = await pixflowWordPressRuntimeFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files?contentHashes=1`,
    { cache: 'no-store' },
  );
  if (!listResponse.ok) {
    throw new Error(`Could not read WordPress project files (${listResponse.status}).`);
  }
  const listed = await listResponse.json().catch(() => ({})) as WordPressProjectFilesResponse;
  const files = Array.isArray(listed.files) ? listed.files : [];
  const endpoint = `${bridgeBase}/api/projects/${encodeURIComponent(projectId)}/files`;
  // The Bridge project directory can outlive the WordPress page/route. Make
  // the non-plugin portion an exact mirror before the run, including the
  // empty-project case, so an old generated asset can never leak into a new
  // project or get copied back after a failed run.
  const wpNames = new Set<string>();
  for (const file of files) {
    const name = projectFileName(file);
    if (!name || file.type === 'dir' || name.startsWith('plugin-assets/')) continue;
    wpNames.add(name);
  }
  const bridgeList = await daemonBridgeFetch(
    `${bridgeBase}/api/projects/${encodeURIComponent(projectId)}/files?contentHashes=1`,
    { cache: 'no-store' },
  );
  if (!bridgeList.ok) {
    const detail = await bridgeList.text().catch(() => '');
    throw new Error(`Could not read Bridge project files (${bridgeList.status})${detail ? `: ${detail}` : ''}.`);
  }
  const bridgePayload = await bridgeList.json().catch(() => ({})) as BridgeProjectFilesResponse;
  const bridgeByName = new Map(
    (Array.isArray(bridgePayload.files) ? bridgePayload.files : [])
      .map((file) => [projectFileName(file), file] as const)
      .filter(([name]) => Boolean(name)),
  );
  for (const file of Array.isArray(bridgePayload.files) ? bridgePayload.files : []) {
    const name = projectFileName(file);
    if (!name || file.type === 'dir' || name.startsWith('plugin-assets/') || wpNames.has(name)) continue;
    const removed = await daemonBridgeFetch(`${bridgeBase}${projectFilePath(projectId, name)}`, { method: 'DELETE' });
    if (!removed.ok && removed.status !== 404) {
      throw new Error(`Could not remove stale Bridge project file ${name} (${removed.status}).`);
    }
  }
  if (files.length === 0) return;

  for (const file of files) {
    const name = projectFileName(file);
    if (!name || file.type === 'dir' || name.startsWith('plugin-assets/')) continue;
    if (projectFilesHaveSameContent(file, bridgeByName.get(name))) continue;
    const raw = await pixflowWordPressRuntimeFetch(projectFilePath(projectId, name, true), { cache: 'no-store' });
    if (!raw.ok) {
      throw new Error(`Could not read WordPress project file ${name} (${raw.status}).`);
    }
    await uploadBridgeProjectFile(endpoint, name, await raw.arrayBuffer(), file.mime, file.artifactManifest);
  }
}

async function syncBridgeProjectFilesToWordPressProject(projectId: string | null | undefined): Promise<void> {
  if (!projectId || !isPixflowWordPressEmbed()) return;

  const bridgeBase = pixflowBridgeApiBase();
  if (!bridgeBase) return;
  const bridgeList = await daemonBridgeFetch(
    `${bridgeBase}/api/projects/${encodeURIComponent(projectId)}/files?contentHashes=1`,
    { cache: 'no-store' },
  );
  if (!bridgeList.ok) {
    throw new Error(`Could not read Bridge project files (${bridgeList.status}).`);
  }
  const listed = await bridgeList.json().catch(() => ({})) as BridgeProjectFilesResponse;
  const files = Array.isArray(listed.files) ? listed.files : [];
  const bridgeNames = new Set<string>();

  const wpList = await pixflowWordPressRuntimeFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files?contentHashes=1`,
    { cache: 'no-store' },
  );
  const wpFiles = wpList.ok
    ? ((await wpList.json().catch(() => ({}))) as WordPressProjectFilesResponse)
    : {};
  const durableFiles = Array.isArray(wpFiles.files) ? wpFiles.files : [];
  const wpByName = new Map(
    durableFiles
      .map((file) => [projectFileName(file), file] as const)
      .filter(([name]) => Boolean(name)),
  );

  for (const file of files) {
    const name = projectFileName(file);
    if (!name || file.type === 'dir' || name.startsWith('plugin-assets/')) continue;
    // WordPress intentionally rejects zero-byte project uploads. Treat an
    // empty Bridge file as absence in the durable mirror so optional source
    // artifacts (for example script.js after an interaction is removed) are
    // deleted instead of turning a successful agent run into an invalid
    // multipart upload.
    if (file.size === 0) continue;
    bridgeNames.add(name);
    if (projectFilesHaveSameContent(file, wpByName.get(name))) continue;
    const raw = await daemonBridgeFetch(`${bridgeBase}${projectFilePath(projectId, name, true)}`, { cache: 'no-store' });
    if (!raw.ok) {
      throw new Error(`Could not read Bridge project file ${name} (${raw.status}).`);
    }
    const bytes = await raw.arrayBuffer();
    if (bytes.byteLength === 0) {
      bridgeNames.delete(name);
      continue;
    }
    const form = typeof FormData === 'function' && typeof Blob === 'function' ? new FormData() : null;
    let response: Response;
    if (form) {
      const basename = name.split('/').pop() || name;
      form.append('file', new Blob([bytes], { type: file.mime || 'application/octet-stream' }), basename);
      form.append('name', name);
      response = await pixflowWordPressRuntimeFetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: 'POST', body: form },
      );
    } else {
      response = await pixflowWordPressRuntimeFetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            content: arrayBufferToBase64(bytes),
            encoding: 'base64',
            ...(file.artifactManifest && typeof file.artifactManifest === 'object'
              ? { artifactManifest: file.artifactManifest }
              : {}),
          }),
        },
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Could not persist Bridge project file ${name} to WordPress (${response.status})${detail ? `: ${detail}` : ''}.`);
    }
  }

  // A successful pre-run sync means this is the authoritative project tree.
  // Remove files that the agent intentionally deleted, but leave plugin assets
  // alone because those are ephemeral Bridge-side inputs staged for a run.
  if (!wpList.ok) return;
  for (const file of durableFiles) {
    const name = projectFileName(file);
    if (!name || name.startsWith('plugin-assets/') || bridgeNames.has(name)) continue;
    await pixflowWordPressRuntimeFetch(projectFilePath(projectId, name), { method: 'DELETE' }).catch(() => {});
  }
}

export interface DaemonReattachOptions {
  runId: string;
  signal: AbortSignal;
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  initialLastEventId?: string | null;
  onRunStatus?: (status: ChatRunStatus) => void;
  onRunEventId?: (eventId: string) => void;
}

export const RUNS_CHANGED_EVENT = 'open-design:runs-changed';

function notifyRunsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
}

function daemonSseErrorMessage(data: SseErrorPayload): string {
  const formattedOpenCodeError = formatOpenCodeSessionError(data.error?.details);
  if (formattedOpenCodeError) return formattedOpenCodeError;

  const message = String(data.error?.message ?? data.message ?? 'daemon error');
  const legacyOpenCodeError = formatLegacyOpenCodeSessionError(message);
  if (legacyOpenCodeError) return legacyOpenCodeError;

  const detail =
    data.error?.details &&
    typeof data.error.details === 'object' &&
    !Array.isArray(data.error.details) &&
    typeof data.error.details.detail === 'string'
      ? data.error.details.detail
      : null;
  if (!detail || detail === message || message.includes(detail)) return message;
  return `${message}\n${detail}`;
}

function daemonSseError(data: SseErrorPayload): Error {
  const error = new Error(daemonSseErrorMessage(data)) as Error & {
    code?: string;
    details?: unknown;
  };
  if (data.error?.code) error.code = data.error.code;
  if (data.error?.details !== undefined) error.details = data.error.details;
  return error;
}

function shouldSuppressLifecycleExitFallback(
  agentId: string | undefined,
  exitCode: number | null,
  exitSignal: string | null,
  stderrTail: string,
): boolean {
  if (exitCode !== 130 || exitSignal) return false;
  if (agentId === 'amr') return true;
  const normalizedStderr = stderrTail.toLowerCase();
  return (
    normalizedStderr.includes('opencode server listening') ||
    normalizedStderr.includes('opencode_server_password')
  );
}

const AMR_OPENCODE_INCOMPLETE_MESSAGE =
  'AMR/OpenCode started, but the run did not complete. Please retry or check the run details for the session stream error.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBooleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}

interface OpenCodeSessionErrorDetails {
  source: string | null;
  code: string | null;
  message: string | null;
  statusCode: number | null;
  retryable: boolean | null;
  suggestion: string | null;
  responseBodyPreview: string | null;
}

function inferOpenCodeRetryable(statusCode: number | null): boolean | null {
  if (statusCode === null) return null;
  return statusCode === 429 || statusCode >= 500;
}

function normalizeOpenCodeSessionErrorDetails(value: unknown): OpenCodeSessionErrorDetails | null {
  if (!isRecord(value) || value.kind !== 'opencode_session_error') return null;
  const statusCode = readNumberField(value, 'statusCode');
  return {
    source: readStringField(value, 'source'),
    code: readStringField(value, 'code'),
    message: readStringField(value, 'message'),
    statusCode,
    retryable: readBooleanField(value, 'retryable') ?? inferOpenCodeRetryable(statusCode),
    suggestion: readStringField(value, 'suggestion'),
    responseBodyPreview: readStringField(value, 'responseBodyPreview'),
  };
}

function linkErrorMessageFromResponseBodyPreview(preview: string | null): string | null {
  if (!preview) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(preview);
  } catch {
    return null;
  }
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
  return readStringField(error, 'message');
}

function retryExhaustedMessage(details: OpenCodeSessionErrorDetails): string | null {
  const linkMessage = linkErrorMessageFromResponseBodyPreview(details.responseBodyPreview);
  if (!linkMessage) return null;
  const retryMatch = linkMessage.match(/\bRetried the upstream request\s+(\d+)\s+times\b/i);
  if (!retryMatch) return null;
  const retryCount = retryMatch[1];
  return [
    'The upstream model service is temporarily unavailable.',
    '',
    `We already retried ${retryCount} times, but the request still failed. Please retry later or switch to another model.`,
  ].join('\n');
}

function formatOpenCodeSessionError(value: unknown): string | null {
  const details = normalizeOpenCodeSessionErrorDetails(value);
  if (!details) return null;
  const statusCode = details.statusCode;
  const message = details.message;
  if (details.source === 'opencode' && details.code === 'ROLE_MARKER_HALLUCINATION') {
    return message;
  }
  if (statusCode === 404) {
    return 'The model service returned 404 Not Found for the configured runtime endpoint. Check the AMR Link URL or model route.';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'AMR authentication failed. Please sign in again or refresh the runtime key.';
  }
  if (statusCode === 429) {
    return 'The model service rejected the request due to quota or rate limits. Retry later or check quota and rate limits.';
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    const exhaustedMessage = retryExhaustedMessage(details);
    if (exhaustedMessage) return exhaustedMessage;
    return 'The upstream model provider returned a temporary error. Please retry or switch models.';
  }
  const base = message ? `OpenCode session failed: ${message}` : 'OpenCode session failed.';
  return details.suggestion ? `${base}\n${details.suggestion}` : base;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

function legacyOpenCodeSessionErrorDetails(text: string): OpenCodeSessionErrorDetails | null {
  const marker = 'opencode session error:';
  const markerIndex = text.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return null;
  const jsonStart = text.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) return null;
  const jsonText = extractBalancedJsonObject(text, jsonStart);
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const error = isRecord(parsed.error) ? parsed.error : null;
  const data = isRecord(error?.data) ? error.data : null;
  const statusCode = readNumberField(data, 'statusCode');
  const retryable = readBooleanField(data, 'isRetryable') ?? inferOpenCodeRetryable(statusCode);
  return {
    source: null,
    code: null,
    message: readStringField(data, 'message') ?? readStringField(error, 'message'),
    statusCode,
    retryable,
    suggestion: null,
    responseBodyPreview: readStringField(data, 'responseBodyPreview') ?? readStringField(data, 'responseBody'),
  };
}

function formatLegacyOpenCodeSessionError(text: string): string | null {
  const details = legacyOpenCodeSessionErrorDetails(text);
  if (!details) return null;
  return formatOpenCodeSessionError({
    kind: 'opencode_session_error',
    ...details,
  });
}

function isAmrOpenCodeExitFallback(agentId: string | undefined, stderr: string): boolean {
  if (agentId === 'amr' || agentId === 'opencode') return true;
  const normalized = stderr.toLowerCase();
  return normalized.includes('opencode server listening') || normalized.includes('opencode session error:');
}

function isAmrOpenCodeBootstrapLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^AMR run id:\s*\S+/i.test(trimmed) ||
    /^Performing one time database migration/i.test(trimmed) ||
    /^sqlite-migration:done$/i.test(trimmed) ||
    /^Database migration complete\.?$/i.test(trimmed) ||
    /^Warning:\s*OPENCODE_SERVER_PASSWORD is not set/i.test(trimmed) ||
    /^opencode server listening on http:\/\/127\.0\.0\.1:\d+/i.test(trimmed)
  );
}

function cleanAmrOpenCodeStderrFallback(agentId: string | undefined, stderr: string): string {
  if (!isAmrOpenCodeExitFallback(agentId, stderr)) return stderr.trim();
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.trim() && !isAmrOpenCodeBootstrapLine(line))
    .join('\n')
    .trim();
}

export async function streamViaDaemon({
  workspaceSource,
  agentId,
  history,
  systemPrompt,
  signal,
  cancelSignal,
  handlers,
  projectId,
  conversationId,
  sessionMode,
  assistantMessageId,
  clientRequestId,
  skillId,
  skillIds,
  designSystemId,
  attachments,
  commentAttachments,
  model,
  reasoning,
  fastMode,
  research,
  context,
  appliedPluginSnapshotId,
  pluginId,
  pluginInputs,
  projectMetadata,
  pixflowBuildSkillAuthority,
  wordpressPluginAssetSync,
  mediaExecution,
  locale,
  initialLastEventId,
  onRunCreated,
  onRunStatus,
  onRunEventId,
  onProjectFilesSynced,
  analyticsHints,
}: DaemonStreamOptions): Promise<void> {
  const emitRunStatus = (status: ChatRunStatus) => {
    onRunStatus?.(status);
    notifyRunsChanged();
  };
  // Local CLIs are single-turn print-mode programs, so we collapse the whole
  // chat into one string. If this becomes too noisy for long histories, the
  // fix is to only include the final user turn.
  const transcript = buildDaemonTranscript(history, agentId);
  const pluginProjectMetadata = appliedPluginSnapshotId || pluginId || wordpressPluginAssetSync?.pluginId
    ? {
        skipDiscoveryBrief: true,
        ...(pluginId ? { pluginId } : {}),
        ...(appliedPluginSnapshotId ? { appliedPluginSnapshotId } : {}),
      }
    : null;
  const runProjectMetadata = {
    ...(projectMetadata ?? {}),
    ...(pluginProjectMetadata ?? {}),
  };
  const request: ChatRequest = {
    agentId,
    message: transcript,
    currentPrompt: latestUserPromptFromHistory(history),
    ...(typeof systemPrompt === 'string' && systemPrompt.trim() ? { systemPrompt: systemPrompt.trim().slice(0, 48_000) } : {}),
    projectId: projectId ?? null,
    conversationId: conversationId ?? null,
    sessionMode,
    assistantMessageId: assistantMessageId ?? null,
    clientRequestId: clientRequestId ?? null,
    skillId: skillId ?? null,
    skillIds: Array.isArray(skillIds) ? skillIds : [],
    designSystemId: designSystemId ?? null,
    attachments: attachments ?? [],
    commentAttachments: commentAttachments ?? [],
    model: model ?? null,
    reasoning: reasoning ?? null,
    fastMode: fastMode === true,
    locale,
    ...(appliedPluginSnapshotId ? { appliedPluginSnapshotId } : {}),
    ...(pluginId ? { pluginId } : {}),
    ...(pluginInputs ? { pluginInputs } : {}),
    ...(pluginProjectMetadata
      ? {
          skipDiscoveryBrief: true,
        }
      : {}),
    ...(Object.keys(runProjectMetadata).length > 0 ? { projectMetadata: runProjectMetadata } : {}),
    ...(pixflowBuildSkillAuthority ? { pixflowBuildSkillAuthority } : {}),
    ...(context ? { context } : {}),
    ...(research ? { research } : {}),
    ...(mediaExecution ? { mediaExecution } : {}),
    ...(analyticsHints ? { analyticsHints } : {}),
  };
  const body = JSON.stringify(request);

  let workspaceSession: PixflowDirectSiteSession | undefined;
  let runCreationAttempted = false;
  try {
    await ensurePixflowOptionalBridgeSiteContext({ timeoutMs: 30_000 });
    // WordPress owns the durable project tree when the workspace is embedded.
    // Stage that tree into the optional Bridge before the daemon starts so a
    // Local CLI/Bridge agent sees the same files the user sees in the canvas.
    await syncWordPressProjectFilesToBridgeProject(projectId);
    await syncWordPressPluginAssetsToBridgeProject(projectId, wordpressPluginAssetSync);

    if (workspaceSource) {
      // Switching chats detaches the SSE viewer, not the submitted request.
      // Only the explicit Stop signal may cancel admission before a run exists.
      const admissionSignal = cancelSignal ?? signal;
      admissionSignal.throwIfAborted();
      const sessionResponse = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
        method: 'POST', signal: admissionSignal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceSource }),
      });
      if (!sessionResponse.ok) throw new Error('Could not connect this Workspace chat to WordPress. Please retry.');
      workspaceSession = await sessionResponse.json() as PixflowDirectSiteSession;
      if (!workspaceSession.token || !workspaceSession.workspaceSource) throw new Error('Update Pixflow to enable Workspace builder handoff.');
      admissionSignal.throwIfAborted();
    }

    runCreationAttempted = true;
    const createResp = await daemonFetch('/api/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Tells the daemon which front-end carrier started the run so the
        // telemetry trace can be tagged 'client:desktop' vs 'client:web'.
        // The daemon falls back to a User-Agent sniff when this header is
        // absent (e.g. third-party clients), so omitting it in tests is OK.
        'X-OD-Client': detectClientType(),
        ...(workspaceSession ? { 'X-Pixflow-Workspace-Session': sessionHeader(workspaceSession) } : {}),
      },
      body,
    });

    if (!createResp.ok) {
      const text = await createResp.text().catch(() => '');
      emitRunStatus('failed');
      handlers.onError(new Error(`daemon ${createResp.status}: ${text || 'no body'}`));
      return;
    }

    const created = (await createResp.json()) as ChatRunCreateResponse;
    const runId = created.runId;
    onRunCreated?.(runId);
    // Start the stuck-run watchdog. trackRunProgress is called inside the
    // SSE consumer below on every event; trackRunTerminal fires when the
    // stream resolves to a terminal state (or errors out).
    trackRunStart(runId, {
      agent_id: agentId,
      project_id: projectId ?? undefined,
      conversation_id: conversationId ?? undefined,
      client_type: detectClientType(),
    });
    notifyRunsChanged();
    emitRunStatus('queued');
    await consumeDaemonRun({
      agentId,
      runId,
      signal,
      cancelSignal,
      handlers,
      initialLastEventId,
      onRunStatus: emitRunStatus,
      onRunEventId,
    });
    // Persist generated/edited files back to the WordPress project after the
    // run has finished. This covers normal Prototype/media runs as well as
    // follow-up edits, so reopening the project restores the same output even
    // though the local daemon used its own filesystem.
    try {
      await syncBridgeProjectFilesToWordPressProject(projectId);
      onProjectFilesSynced?.();
    } catch (syncError) {
      handlers.onError(syncError instanceof Error ? syncError : new Error(String(syncError)));
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    emitRunStatus('failed');
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    // Once dispatched the daemon owns revocation, including errors and cancellation.
    // An uncertain HTTP outcome may already be running: do not revoke underneath it.
    if (workspaceSession && !runCreationAttempted) {
      const endpoint = new URL(workspaceSession.endpoint);
      if (endpoint.searchParams.has('rest_route')) endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/session');
      else endpoint.pathname = endpoint.pathname.replace(/\/tools\/?$/, '/session');
      await fetch(endpoint, { method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${workspaceSession.token}` } }).catch(() => undefined);
    }
  }
}

export async function reattachDaemonRun(options: DaemonReattachOptions): Promise<void> {
  await consumeDaemonRun({
    ...options,
    onRunStatus: (status) => {
      options.onRunStatus?.(status);
      notifyRunsChanged();
    },
  });
}

export async function fetchChatRunStatus(runId: string): Promise<ChatRunStatusResponse | null> {
  try {
    const resp = await daemonFetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!resp.ok) return null;
    return (await resp.json()) as ChatRunStatusResponse;
  } catch {
    return null;
  }
}

export async function steerChatRun(runId: string, input: import('@open-design/contracts').ChatRunSteerRequest): Promise<import('@open-design/contracts').PixflowDirectSiteSteerResponse> {
  try {
    const response = await daemonFetch(`/api/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(240_000),
    });
    const result = await response.json();
    if (['accepted', 'queued', 'rejected', 'unconfirmed'].includes(result?.state)) return result;
    return { messageId: input.messageId, state: response.status >= 500 ? 'unconfirmed' : 'rejected', message: result.message || 'Keep this message queued and retry steering.' };
  } catch {
    return { messageId: input.messageId, state: 'unconfirmed', message: 'Steering delivery could not be confirmed. Check the conversation before retrying.' };
  }
}

// PR #3157: Antigravity's auth banner can offer a one-click "open
// system terminal with agy" button. The daemon endpoint spawns
// osascript / x-terminal-emulator / `cmd /c start` for the user; on
// success the new Terminal window pops up with agy running and the
// browser opens for OAuth. The Promise resolves once the daemon kicks
// off the spawn (not when OAuth completes), so the UI can disable the
// button momentarily and then re-enable for a retry click after the
// user finishes in the terminal.
export interface LaunchAntigravityOauthResult {
  ok: boolean;
  platform?: string;
  via?: string;
  error?: string;
}
export async function launchAntigravityOauth(): Promise<LaunchAntigravityOauthResult> {
  try {
    const resp = await daemonFetch('/api/agents/antigravity/oauth-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await resp.json().catch(() => null)) as
      | LaunchAntigravityOauthResult
      | null;
    if (!resp.ok) {
      return {
        ok: false,
        error:
          body?.error ?? `daemon returned ${resp.status} ${resp.statusText}`,
      };
    }
    return body ?? { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface VelaUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  plan?: string;
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  loginInFlight?: boolean;
  profile: string;
  user: VelaUser | null;
  configPath: string;
}

// AMR (vela) login surfaces three thin endpoints on the daemon:
//   GET  /api/integrations/vela/status   — read ~/.amr/config.json projection
//   POST /api/integrations/vela/login    — spawn `vela login` (vela opens browser itself)
//   POST /api/integrations/vela/login/cancel — terminate a still-pending login
//   POST /api/integrations/vela/logout   — clear ~/.amr auth and Settings-backed AMR auth env
// The Settings UI polls /status after kicking off /login to detect completion.
export async function fetchVelaLoginStatus(): Promise<VelaLoginStatus | null> {
  try {
    const resp = await daemonFetch('/api/integrations/vela/status');
    if (!resp.ok) return null;
    return (await resp.json()) as VelaLoginStatus;
  } catch {
    return null;
  }
}

export async function fetchAmrModels(): Promise<AmrModelsResponse | null> {
  try {
    const resp = await daemonFetch('/api/amr/models', { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as AmrModelsResponse;
  } catch {
    return null;
  }
}

export function formatVelaBalanceUsd(balanceUsd: string | null | undefined): string | null {
  const raw = balanceUsd?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function fetchAmrWalletSnapshot(
  options: { refresh?: boolean } = {},
): Promise<AmrWalletSnapshot | null> {
  try {
    const query = options.refresh ? '?refresh=1' : '';
    const resp = await daemonFetch(`/api/integrations/vela/wallet${query}`, {
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    return (await resp.json()) as AmrWalletSnapshot;
  } catch {
    return null;
  }
}

export interface StartVelaLoginResult {
  ok: boolean;
  status: number;
  pid?: number;
  alreadyRunning?: boolean;
  error?: string;
}

export async function startVelaLogin(
  attribution?: AmrEntryAttribution | null,
): Promise<StartVelaLoginResult> {
  try {
    const resp = await daemonFetch('/api/integrations/vela/login', {
      method: 'POST',
      headers: attribution ? { 'Content-Type': 'application/json' } : undefined,
      body: attribution ? JSON.stringify({ attribution }) : undefined,
    });
    if (resp.ok) {
      const body = (await resp.json()) as { pid?: number };
      return { ok: true, status: resp.status, pid: body.pid };
    }
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      status: resp.status,
      alreadyRunning: resp.status === 409,
      error: body?.error ?? '',
    };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelVelaLogin(): Promise<{ ok: boolean; canceled?: boolean }> {
  try {
    const resp = await daemonFetch('/api/integrations/vela/login/cancel', { method: 'POST' });
    if (!resp.ok) return { ok: false };
    const body = (await resp.json().catch(() => null)) as { canceled?: boolean } | null;
    return { ok: true, canceled: body?.canceled };
  } catch {
    return { ok: false };
  }
}

export async function velaLogout(): Promise<{ ok: boolean }> {
  try {
    const resp = await daemonFetch('/api/integrations/vela/logout', { method: 'POST' });
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

// Forwards the user's assistant-turn rating to the daemon so it can emit
// a Langfuse `score-create`. Fire-and-forget — failures are not surfaced
// to the UI (the rating is already persisted on the message itself via
// the PUT /messages/:id round-trip).
export async function reportChatRunFeedback(req: {
  runId: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  hasCustomReason: boolean;
  customReason: string;
}): Promise<void> {
  try {
    await daemonFetch(`/api/runs/${encodeURIComponent(req.runId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    // Best-effort.
  }
}

export async function listActiveChatRuns(
  projectId: string,
  conversationId: string,
): Promise<ChatRunStatusResponse[]> {
  try {
    const qs = new URLSearchParams({ projectId, conversationId, status: 'active' });
    const resp = await daemonFetch(`/api/runs?${qs.toString()}`);
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

export async function listProjectRuns(): Promise<ChatRunStatusResponse[]> {
  try {
    const resp = await daemonFetch('/api/runs');
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

async function consumeDaemonRun({
  agentId,
  runId,
  signal,
  cancelSignal,
  handlers,
  initialLastEventId,
  onRunStatus,
  onRunEventId,
}: DaemonReattachOptions & { agentId?: string }): Promise<void> {
  let acc = '';
  let stderrBuf = '';
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let endStatus: ChatRunStatus | null = null;
  let pendingStructuredError: Error | null = null;
  // Tracks whether the server explicitly declared `status: 'succeeded'` in
  // the SSE end payload (or via the fallback run-status fetch). Distinct
  // from `endStatus === 'succeeded'`, which can be a local fallback when
  // the SSE end event omits or sends an invalid `status` field. Only the
  // explicit declaration is allowed to bypass the exit-code/signal safety
  // net below — a missing-status fallback keeps the old behavior so a
  // failure response with `{code:1}` or `{code:null,signal:"SIGTERM"}` and
  // no `status` field still surfaces an error banner.
  let serverDeclaredSuccess = false;
  // Set when the daemon reports this terminal failure can be recovered by
  // resuming the agent's CLI session (transient upstream drop / inactivity on
  // a session-resuming runtime). Carried onto the surfaced error so the chat
  // can offer a Continue affordance. See ChatRunStatusResponse.resumable.
  let endResumable = false;
  let lastEventId: string | null = initialLastEventId ?? null;
  let canceled = false;
  const cancelRun = () => {
    if (canceled) return;
    canceled = true;
    void daemonFetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }).catch(() => {});
  };

  cancelSignal?.addEventListener('abort', cancelRun, { once: true });
  try {
    if (cancelSignal?.aborted) {
      cancelRun();
      return;
    }

    for (let reconnects = 0; endStatus === null && reconnects < 5;) {
      const qs = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : '';
      let resp: Response;
      try {
        resp = await daemonFetch(`/api/runs/${encodeURIComponent(runId)}/events${qs}`, {
          method: 'GET',
          signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Chrome's Local Network Access denial is a persistent site
        // permission state, not a transient SSE disconnect. Retrying it five
        // times only adds duplicate console failures and delays the actionable
        // Bridge permission banner.
        if ((err as Error).name === 'PixflowNativeDisconnectedError') { handlers.onError(err as Error); return; }
        if (isPixflowOptionalBridgeLoopbackAccessError(err)) throw err;
        reconnects += 1;
        continue;
      }

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        handlers.onError(new Error(`daemon ${resp.status}: ${text || 'no body'}`));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawStreamProgress = false;

      while (true) {
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (err) {
          // Network interruptions should use the existing Last-Event-ID
          // reconnect path. Keep parsing and handler failures outside this
          // catch so application bugs are never mistaken for transport loss.
          if ((err as Error).name === 'AbortError') throw err;
          try { await reader.cancel(); } catch {}
          if ((err as Error).name === 'PixflowNativeDisconnectedError') { handlers.onError(err as Error); return; }
          break;
        }
        const { value, done } = readResult;
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          if (parsed.kind === 'comment') {
            sawStreamProgress = true;
            trackRunProgress(runId);
            continue;
          }
          if (parsed.kind !== 'event') continue;
          sawStreamProgress = true;
          trackRunProgress(runId);
          if (parsed.id) {
            lastEventId = parsed.id;
            onRunEventId?.(parsed.id);
          }

          const event = parsed as unknown as ChatSseEvent;

          if (event.event === 'stdout') {
            const chunk = String(event.data.chunk ?? '');
            acc += chunk;
            handlers.onDelta(chunk);
            handlers.onAgentEvent({ kind: 'text', text: chunk });
            continue;
          }

          if (event.event === 'stderr') {
            stderrBuf += event.data.chunk ?? '';
            continue;
          }

          if (event.event === 'agent') {
            if (event.data.type === 'tool_input_delta') {
              if (
                typeof event.data.id === 'string' &&
                typeof event.data.name === 'string' &&
                typeof event.data.delta === 'string'
              ) {
                handlers.onToolInputDelta?.(event.data.id, event.data.name, event.data.delta);
              }
              continue;
            }
            const translated = translateAgentEvent(event.data);
            if (!translated) continue;
            if (translated.kind === 'text') {
              acc += translated.text;
              handlers.onDelta(translated.text);
            }
            handlers.onAgentEvent(translated);
            continue;
          }

          if (event.event === 'start') {
            const data = event.data as ChatSseStartPayload;
            onRunStatus?.('running');
            handlers.onAgentEvent({
              kind: 'status',
              label: 'starting',
              detail: typeof data.bin === 'string' ? data.bin : undefined,
            });
            continue;
          }

          if (event.event === 'error') {
            const data = event.data as SseErrorPayload;
            const structuredError = daemonSseError(data);
            if ((structuredError as Error & {code?:string}).code === 'RUN_REPLAY_UNAVAILABLE') {
              await reader.cancel().catch(() => undefined);
              handlers.onError(structuredError);
              return;
            }
            pendingStructuredError = structuredError;
            // A failed first attempt emits this before the same run's retry
            // completes. Do not disconnect on a transient status snapshot;
            // the terminal frame or post-stream fallback is authoritative.
            continue;
          }

          if (event.event === 'end') {
            exitCode = typeof event.data.code === 'number' ? event.data.code : null;
            exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
            if (event.data.resumable === true) endResumable = true;
            // `serverDeclaredSuccess` records whether the server explicitly
            // set `status: 'succeeded'` in the end payload — the local
            // `'succeeded'` fallback below does not count and must keep
            // hitting the exit-code/signal safety net later.
            serverDeclaredSuccess = event.data.status === 'succeeded';
            endStatus = isChatRunStatus(event.data.status) ? event.data.status : 'succeeded';
            onRunStatus?.(endStatus);
          }
        }
      }
      let shouldResetReconnects = sawStreamProgress;
      if (pendingStructuredError && endStatus === null) {
        const status = await fetchChatRunStatus(runId).catch(() => null);
        if (status && isChatRunStatus(status.status) && status.status !== 'queued' && status.status !== 'running') {
          endStatus = status.status;
          exitCode = status.exitCode ?? null;
          exitSignal = status.signal ?? null;
          serverDeclaredSuccess = status.status === 'succeeded';
          if (status.resumable === true) endResumable = true;
          onRunStatus?.(endStatus);
          break;
        }
        if (!status) {
          onRunStatus?.('failed');
          handlers.onError(pendingStructuredError);
          return;
        }
        shouldResetReconnects = false;
      }
      reconnects = shouldResetReconnects ? 0 : reconnects + 1;
    }

    if (endStatus === null) {
      const status = await fetchChatRunStatus(runId);
      if (status && isChatRunStatus(status.status) && status.status !== 'queued' && status.status !== 'running') {
        endStatus = status.status;
        exitCode = status.exitCode ?? null;
        exitSignal = status.signal ?? null;
        // Fallback REST path: `status.status` is explicitly declared by the
        // daemon's run record (it passed `isChatRunStatus()` above), so an
        // explicit `'succeeded'` here is just as authoritative as the SSE
        // end-event success.
        serverDeclaredSuccess = status.status === 'succeeded';
        if (status.resumable === true) endResumable = true;
        onRunStatus?.(endStatus);
      } else {
        onRunStatus?.('failed');
        handlers.onError(new Error('daemon stream disconnected before run completed'));
        return;
      }
    }

    if (endStatus === 'canceled') {
      handlers.onDone(acc);
      return;
    }

    // Trust the server's authoritative success declaration. When the server
    // explicitly sets `status: 'succeeded'` (either in the SSE end payload
    // or via the fallback run-status fetch), the run completed cleanly even
    // if the underlying process exited via a signal — some agents (e.g.
    // ACP agents like Devin for Terminal) intentionally exit via SIGTERM
    // after a clean prompt completion because they don't shut down on
    // `stdin.end()`. The signal/non-zero-code safety net is bypassed only
    // for that explicit declaration; a missing/invalid `status` from a
    // compatible or older daemon still falls back to `endStatus =
    // 'succeeded'` for the run-status surface but must keep the safety net
    // intact so a real failure response like `{code:1}` or
    // `{code:null,signal:"SIGTERM"}` without `status` still surfaces an
    // error banner.
    const looksLikeFailure =
      endStatus === 'failed' ||
      (!serverDeclaredSuccess &&
        (exitSignal || (exitCode !== null && exitCode !== 0)));
    if (looksLikeFailure) {
      if (pendingStructuredError) {
        handlers.onError(markErrorResumable(pendingStructuredError, endResumable));
        return;
      }
      if (shouldSuppressLifecycleExitFallback(agentId, exitCode, exitSignal, stderrBuf)) {
        handlers.onDone(acc);
        return;
      }
      const cleanedStderr = cleanAmrOpenCodeStderrFallback(agentId, stderrBuf);
      const formattedOpenCodeError = formatLegacyOpenCodeSessionError(cleanedStderr);
      const tail = (formattedOpenCodeError ?? cleanedStderr).trim().slice(-400);
      const fallbackTail =
        tail || (isAmrOpenCodeExitFallback(agentId, stderrBuf) ? AMR_OPENCODE_INCOMPLETE_MESSAGE : '');
      handlers.onError(
        markErrorResumable(
          new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${fallbackTail ? `\n${fallbackTail}` : ''}`),
          endResumable,
        ),
      );
      return;
    }
    handlers.onDone(acc);
  } finally {
    cancelSignal?.removeEventListener('abort', cancelRun);
    // Settle the stuck-run watchdog with whatever terminal state we
    // resolved. If the watchdog was never armed (reattach paths that
    // hit the daemon for an already-finished run), trackRunTerminal
    // is a no-op for unknown runIds.
    trackRunTerminal(runId, endStatus ?? (canceled ? 'canceled' : 'unknown'));
  }
}

function isChatRunStatus(value: unknown): value is ChatRunStatus {
  return value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'canceled';
}

/** Tag an error surfaced to the chat with whether the failed run can be
 *  resumed (continued from its existing CLI session). Only stamps the property
 *  when true so non-resumable failures stay undefined. */
function markErrorResumable(err: Error, resumable: boolean): Error {
  if (resumable) (err as Error & { resumable?: boolean }).resumable = true;
  return err;
}

function normalizeToolInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('filePath' in obj && typeof obj.filePath === 'string') {
    return { ...obj, file_path: obj.filePath };
  }
  return input;
}

const TRANSIENT_ACP_STATUS_LABELS = new Set([
  'waiting_for_first_output',
  'tool_call',
  'tool_call_update',
  'session_update',
]);

function normalizeAgentStatusLabel(label: string): string {
  return TRANSIENT_ACP_STATUS_LABELS.has(label) ? 'running' : label;
}

const PROVIDER_ACTIVITY_STATUS: Record<string, {
  phase: Extract<AgentEvent, { kind: 'activity' }>['phase'];
  label: string;
}> = {
  preparing: { phase: 'preparing', label: 'Preparing…' },
  researching: { phase: 'researching', label: 'Researching…' },
  reading: { phase: 'reading', label: 'Reading…' },
  thinking: { phase: 'thinking', label: 'Thinking…' },
  planning: { phase: 'planning', label: 'Planning…' },
  executing: { phase: 'executing', label: 'Working…' },
  verifying: { phase: 'verifying', label: 'Verifying…' },
};

// Translate a raw `agent` SSE payload (what apps/daemon/src/claude-stream.ts emits)
// into the UI's AgentEvent union. Keep this liberal — unknown types just
// return null so the UI ignores them instead of rendering garbage.
export function translateAgentEvent(data: DaemonAgentPayload): AgentEvent | null {
  if (data.type === 'assistant_message_boundary') return { ...data, kind: 'assistant_message_boundary' };
  if (data.type === 'steering_message') return { ...data, kind: 'steering_message' };
  if (data.type === 'voice_transcript') return { ...data, kind: 'voice_transcript' };
  const t = data.type;
  if (t === 'activity') {
    return {
      kind: 'activity',
      id: data.id,
      origin: data.origin,
      phase: data.phase,
      status: data.status,
      label: data.label,
      ...(typeof data.detail === 'string' ? { detail: data.detail } : {}),
      ...(typeof data.startedAt === 'number' ? { startedAt: data.startedAt } : {}),
      ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
      ...(typeof data.sourceCount === 'number' ? { sourceCount: data.sourceCount } : {}),
      ...(Array.isArray(data.sources) ? { sources: data.sources } : {}),
    };
  }
  if (t === 'status' && typeof data.label === 'string') {
    const activity = PROVIDER_ACTIVITY_STATUS[data.label.trim().toLowerCase()];
    if (activity) {
      return {
        kind: 'activity',
        id: 'provider-current-activity',
        origin: 'provider',
        phase: activity.phase,
        status: 'progress',
        label: activity.label,
        ...(typeof data.detail === 'string' ? { detail: data.detail } : {}),
      };
    }
    return {
      kind: 'status',
      label: normalizeAgentStatusLabel(data.label),
      detail:
        typeof data.detail === 'string'
          ? data.detail
          : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round((data.ttftMs as number) / 100) / 10}s`
            : undefined,
    };
  }
  if (t === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  if (t === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (t === 'thinking_start') {
    return { kind: 'status', label: 'thinking' };
  }
  if (t === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: data.action,
      projectId: data.projectId,
      artifactId: data.artifactId,
      title: data.title,
      refreshStatus: data.refreshStatus,
    };
  }
  if (t === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: data.phase,
      projectId: data.projectId,
      artifactId: data.artifactId,
      refreshId: data.refreshId,
      title: data.title,
      refreshedSourceCount: data.refreshedSourceCount,
      error: data.error,
    };
  }
  if (t === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return { kind: 'tool_use', id: data.id, name: data.name, input: normalizeToolInput(data.input) };
  }
  if (t === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
    };
  }
  if (t === 'usage') {
    const usage = (data.usage ?? {}) as Record<string, number>;
    return {
      kind: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: typeof data.costUsd === 'number' ? data.costUsd : undefined,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
    };
  }
  if (t === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated to prevent unauthorized instruction injection.`,
    };
  }
  if (t === 'tool_loop' && typeof data.toolName === 'string') {
    const toolName = data.toolName;
    const count = typeof data.count === 'number' ? data.count : 0;
    const detail = data.action === 'halt'
      ? `Run stopped: the agent repeated a failing ${toolName} call ${count}× without progress. Re-check the actual target before retrying.`
      : `Heads up — the agent has repeated a failing ${toolName} call ${count}× and may be stuck.`;
    return { kind: 'status', label: 'warning', detail };
  }
  if (t === 'raw' && typeof data.line === 'string') {
    return { kind: 'raw', line: data.line };
  }
  // Canonical events own their payload; tool output is not provider thinking.
  const providerThinkingText = extractPublicThinkingText(data);
  if (providerThinkingText) {
    return { kind: 'thinking', text: providerThinkingText };
  }
  return null;
}

export async function saveArtifact(
  identifier: string,
  title: string,
  html: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const resp = await daemonFetch('/api/artifacts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, title, html }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as { url: string; path: string };
  } catch {
    return null;
  }
}
