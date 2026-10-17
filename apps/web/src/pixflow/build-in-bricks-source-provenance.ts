import type {
  PixflowBuildInBricksSourceIndex,
  PixflowBuildInBricksSourceIndexEntry,
  PixflowBuildInBricksSourceLookup,
  PixflowBuildInBricksSourceScope,
  PixflowBuildInBricksSourceFile,
} from '@open-design/contracts';
import { hashSourceText } from './source-hash';
import {
  fetchBuildInBricksScratchProjectFileText,
  writeBuildInBricksScratchProjectTextFileDetailed,
} from './build-in-bricks-scratch-project-files';

export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH = 'pixflow/handoffs/bricks/source-index.json';
const MAX_SOURCE_INDEX_ENTRIES = 96;
const MAX_SELECTED_SOURCE_OWNER_PROJECTS = 256;

type SourceFileSpec = {
  path: string;
  required: boolean;
};

export type BuildInBricksSourceLookupRequest = {
  projectId: string;
  targetPostId: number;
  scope?: PixflowBuildInBricksSourceScope;
  fragmentNamespace?: string | null;
  convertedElementId?: string | null;
  currentPageFingerprint?: string | null;
  /** Current native Bricks page content read from WordPress. */
  currentNativeElements?: unknown[] | null;
  /** Current authoritative destination Theme Style snapshot for retained edits. */
  currentThemeStyleSnapshotHash?: string | null;
};

export type BuildInBricksSourceReadResult = PixflowBuildInBricksSourceLookup & {
  html: string | null;
  css: string | null;
  js: string | null;
};

export type BuildInBricksSelectedSourceOwner = {
  status: 'available' | 'missing' | 'ambiguous';
  projectId: string | null;
  entry: PixflowBuildInBricksSourceIndexEntry | null;
  message: string;
};

/**
 * Reconcile the preflight owner with the factual Builder selection observed at
 * the final dispatch boundary. Selection can change while the selected agent
 * is resolving intent, so a stale preflight owner must never override a newer
 * native element selection.
 */
export function resolveBuildInBricksDispatchSelection({
  liveSelectedElementId,
  retainedOwnerSelectedElementId,
}: {
  liveSelectedElementId?: unknown;
  retainedOwnerSelectedElementId?: unknown;
}): {
  selectedElementId: string;
  retainedOwnerMatchesSelection: boolean;
} {
  const live = typeof liveSelectedElementId === 'string' ? liveSelectedElementId.trim() : '';
  const retained = typeof retainedOwnerSelectedElementId === 'string'
    ? retainedOwnerSelectedElementId.trim()
    : '';
  return {
    selectedElementId: live || retained,
    retainedOwnerMatchesSelection: !live || !retained || live === retained,
  };
}

/**
 * Resolve factual retained-source ownership for one selected native Bricks
 * element. A page may contain independent Build fragments from different
 * projects, so page-level "last project" memory is not an ownership signal.
 * The persisted source index is authoritative and multiple matches remain
 * fail-closed.
 */
export async function resolveBuildInBricksSelectedSourceOwner({
  projectIds,
  targetPostId,
  convertedElementId,
}: {
  projectIds: string[];
  targetPostId: number;
  convertedElementId: string;
}): Promise<BuildInBricksSelectedSourceOwner> {
  const result = await resolveBuildInBricksSelectedSourceOwnerSet({
    projectIds,
    targetPostId,
    convertedElementIds: [convertedElementId],
  });
  if (result.status === 'available') {
    return {
      ...result,
      message: 'The selected Bricks element has one retained Build source owner.',
    };
  }
  if (result.status === 'ambiguous') {
    return {
      ...result,
      message: 'More than one retained Build source owns the selected Bricks element; no project was selected implicitly.',
    };
  }
  return {
    ...result,
    message: 'No retained Build source owns the selected Bricks element.',
  };
}

/**
 * Resolve one common retained-source owner for a factual Builder selection.
 * A multi-selection that spans independent generated fragments is useful
 * placement context, but it is not authority to rewrite any one fragment.
 */
export async function resolveBuildInBricksSelectedSourceOwnerSet({
  projectIds,
  targetPostId,
  convertedElementIds,
}: {
  projectIds: string[];
  targetPostId: number;
  convertedElementIds: string[];
}): Promise<BuildInBricksSelectedSourceOwner> {
  const postId = Math.trunc(Number(targetPostId || 0));
  const elementIds = uniqueStrings(convertedElementIds);
  const candidates = uniqueStrings(projectIds).slice(0, MAX_SELECTED_SOURCE_OWNER_PROJECTS);
  if (postId <= 0 || elementIds.length === 0 || candidates.length === 0) {
    return {
      status: 'missing',
      projectId: null,
      entry: null,
      message: 'No retained Build source owns every selected Bricks element.',
    };
  }

  const indexes = await Promise.all(candidates.map(async (projectId) => ({
    projectId,
    index: await readBuildInBricksSourceIndex(projectId),
  })));
  const matchesByElement = elementIds.map((elementId) => indexes.flatMap(({ projectId, index }) => (
    (index?.entries || [])
      .filter((entry) => (
        entry.status === 'active'
        && entry.projectId === projectId
        && entry.targetPostId === postId
        && entry.convertedElementIds.includes(elementId)
      ))
      .map((entry) => ({ projectId, entry }))
  )));
  if (matchesByElement.some((matches) => matches.length === 0)) {
    return {
      status: 'missing',
      projectId: null,
      entry: null,
      message: 'No retained Build source owns every selected Bricks element.',
    };
  }
  if (matchesByElement.some((matches) => matches.length > 1)) {
    return {
      status: 'ambiguous',
      projectId: null,
      entry: null,
      message: 'At least one selected Bricks element has ambiguous retained-source ownership.',
    };
  }
  const matches = matchesByElement.flatMap((entries) => entries);
  const first = matches[0];
  const commonOwner = Boolean(first) && matches.every(({ projectId, entry }) => (
    projectId === first?.projectId && entry.sourceId === first.entry.sourceId
  ));
  if (commonOwner && first) {
    return {
      status: 'available',
      projectId: first.projectId,
      entry: first.entry,
      message: 'Every selected Bricks element has the same retained Build source owner.',
    };
  }
  return {
    status: 'ambiguous',
    projectId: null,
    entry: null,
    message: 'The selected Bricks elements span more than one retained Build source owner.',
  };
}

/**
 * Resolve page-level retained-source authority when no native element is
 * selected. A remembered scratch project is only a candidate: exactly one
 * active, persisted source-index entry for the current post must exist.
 */
export async function resolveBuildInBricksPageSourceOwner({
  projectIds,
  targetPostId,
}: {
  projectIds: string[];
  targetPostId: number;
}): Promise<BuildInBricksSelectedSourceOwner> {
  const postId = Math.trunc(Number(targetPostId || 0));
  const candidates = uniqueStrings(projectIds).slice(0, MAX_SELECTED_SOURCE_OWNER_PROJECTS);
  if (postId <= 0 || candidates.length === 0) {
    return {
      status: 'missing',
      projectId: null,
      entry: null,
      message: 'No accepted retained Build source owns the current Bricks page.',
    };
  }
  const matches = (await Promise.all(candidates.map(async (projectId) => ({
    projectId,
    index: await readBuildInBricksSourceIndex(projectId),
  })))).flatMap(({ projectId, index }) => (
    (index?.entries || [])
      .filter((entry) => (
        entry.status === 'active'
        && entry.projectId === projectId
        && entry.targetPostId === postId
        && entry.scope === 'full_page'
      ))
      .map((entry) => ({ projectId, entry }))
  ));
  if (matches.length === 1 && matches[0]) {
    return {
      status: 'available',
      projectId: matches[0].projectId,
      entry: matches[0].entry,
      message: 'The current Bricks page has one accepted retained Build source owner.',
    };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      projectId: null,
      entry: null,
      message: 'The current Bricks page contains more than one retained Build source owner.',
    };
  }
  return {
    status: 'missing',
    projectId: null,
    entry: null,
    message: 'No accepted retained Build source owns the current Bricks page.',
  };
}

export type PersistBuildInBricksSourceIndexInput = {
  projectId: string;
  targetPostId: number;
  scope: PixflowBuildInBricksSourceScope;
  fragmentNamespace?: string | null;
  placement?: Record<string, unknown> | null;
  /** Canonical source metadata for new Build writes. */
  source?: {
    htmlPath?: string | null;
    cssPath?: string | null;
    jsPath?: string | null;
  };
  /** @deprecated Historical compatibility input; never emitted by new Build writes. */
  stageASource?: {
    htmlPath?: string | null;
    cssPath?: string | null;
    jsPath?: string | null;
  };
  convertedElementIds?: string[];
  convertedGlobalClassIds?: string[];
  /** Verified persisted Bricks page content returned by the insertion boundary. */
  persistedNativeElements?: unknown[] | null;
  handoffId?: string | null;
  runId?: string | null;
  contextRevision?: string | null;
  themeStyleSnapshotHash?: string | null;
  skillVersion?: string | null;
};

export type PersistBuildInBricksSourceIndexResult = {
  ok: boolean;
  index: PixflowBuildInBricksSourceIndex | null;
  entry: PixflowBuildInBricksSourceIndexEntry | null;
  message: string;
};

export function buildInBricksRetainedSourceConflictNotice(message: unknown): string {
  const reason = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Retained Build source no longer matches the authoritative native Bricks content.';
  return `Retained Build source edit paused: ${reason} Reconciliation is required before Pixflow can overwrite native content.`;
}

export function markBuildInBricksRetainedSourceConflict<
  T extends { id?: string; content?: string; status?: string; runStatus?: string; endedAt?: number },
>(messages: T[], assistantMessageId: string, notice: string, endedAt = Date.now()): T[] {
  return messages.map((message) => message.id === assistantMessageId
    ? {
        ...message,
        content: notice,
        status: 'done',
        runStatus: 'failed',
        endedAt,
      }
    : message);
}

export async function readBuildInBricksSourceIndex(
  projectId: string,
): Promise<PixflowBuildInBricksSourceIndex | null> {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) return null;
  const text = await fetchBuildInBricksScratchProjectFileText(
    normalizedProjectId,
    PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
  );
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<PixflowBuildInBricksSourceIndex>;
    if (parsed.schema !== 'pixflow.build_in_bricks.source_index.v1' || parsed.version !== 1) return null;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(isSourceIndexEntry).slice(-MAX_SOURCE_INDEX_ENTRIES)
      : [];
    return {
      schema: 'pixflow.build_in_bricks.source_index.v1',
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      entries,
    };
  } catch {
    return null;
  }
}

export async function lookupBuildInBricksSource(
  request: BuildInBricksSourceLookupRequest,
): Promise<PixflowBuildInBricksSourceLookup> {
  const index = await readBuildInBricksSourceIndex(request.projectId);
  if (!index) {
    return {
      status: 'unsupported_legacy',
      entry: null,
      message: 'This generated page has no retained HTML-first source index; native Bricks editing remains available.',
    };
  }
  const targetPostId = Math.trunc(Number(request.targetPostId || 0));
  const candidates = index.entries.filter((entry) => (
    entry.status === 'active'
    && entry.projectId === String(request.projectId || '').trim()
    && entry.targetPostId === targetPostId
    && (!request.scope || entry.scope === request.scope)
    && (request.fragmentNamespace === undefined || entry.fragmentNamespace === (request.fragmentNamespace || null))
    && (!request.convertedElementId || entry.convertedElementIds.includes(request.convertedElementId))
  ));
  if (candidates.length === 0) {
    return {
      status: 'missing',
      entry: null,
      message: 'No active retained HTML/CSS/JS source owns this Bricks page or fragment.',
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      entry: null,
      message: 'More than one retained source entry matches this Bricks target; no source was selected implicitly.',
    };
  }
  const entry = candidates[0];
  const conflicts: NonNullable<PixflowBuildInBricksSourceLookup['conflicts']> = [];
  const conflictMessages: string[] = [];
  const authoritativeNativeCheckRequested = Object.prototype.hasOwnProperty.call(
    request,
    'currentNativeElements',
  );
  const recordedNativeFingerprint = cleanOptional(entry?.nativeContentFingerprint);
  if (entry && recordedNativeFingerprint && authoritativeNativeCheckRequested) {
    if (!Array.isArray(request.currentNativeElements)) {
      conflicts.push('native_verification_unavailable');
      conflictMessages.push('The current Pixflow-owned native Bricks content could not be verified; retained-source editing is paused to avoid overwriting native edits.');
    } else {
      const currentNativeFingerprint = await hashBuildInBricksOwnedNativeContent(
        request.currentNativeElements,
        entry.convertedElementIds,
      );
      if (!currentNativeFingerprint || currentNativeFingerprint !== recordedNativeFingerprint) {
        conflicts.push('native_content_drift');
        conflictMessages.push('The Pixflow-owned native Bricks content changed after conversion; reconcile those native edits before applying a retained-source edit.');
      }
    }
  }
  const recordedPageFingerprint = entry?.placement && typeof entry.placement.pageFingerprint === 'string'
    ? entry.placement.pageFingerprint.trim()
    : '';
  const currentPageFingerprint = String(request.currentPageFingerprint || '').trim();
  // Whole-page fingerprints predate owned-subtree identity. Keep them only as
  // a compatibility fallback; new entries must not let unrelated page edits
  // block a scoped follow-up.
  if (entry && !recordedNativeFingerprint && recordedPageFingerprint && currentPageFingerprint && recordedPageFingerprint !== currentPageFingerprint) {
    conflicts.push('legacy_page_content_drift');
    conflictMessages.push('The Bricks page changed after the source was converted; HTML-native editing is paused to avoid overwriting native edits.');
  }
  const recordedThemeStyleHash = cleanOptional(entry?.themeStyleSnapshotHash);
  const currentThemeStyleHash = cleanOptional(request.currentThemeStyleSnapshotHash);
  const authoritativeThemeStyleCheckRequested = Object.prototype.hasOwnProperty.call(
    request,
    'currentThemeStyleSnapshotHash',
  );
  if (entry && recordedThemeStyleHash && authoritativeThemeStyleCheckRequested && !currentThemeStyleHash) {
    conflicts.push('theme_style_verification_unavailable');
    conflictMessages.push('The current destination Bricks Theme Style could not be resolved; retained-source editing is paused rather than assuming the recorded environment is still valid.');
  }
  if (entry && recordedThemeStyleHash && currentThemeStyleHash && recordedThemeStyleHash !== currentThemeStyleHash) {
    conflicts.push('theme_style_drift');
    conflictMessages.push('The destination Bricks Theme Style changed after conversion; the retained source must be reviewed against the current environment before editing.');
  }
  if (entry && conflicts.length > 0) {
    return {
      status: 'conflict',
      entry,
      conflicts,
      message: conflictMessages.join(' '),
    };
  }
  return entry
    ? { status: 'available', entry, message: 'Retained HTML-first source is available.' }
    : { status: 'missing', entry: null, message: 'No active retained HTML/CSS/JS source owns this Bricks page or fragment.' };
}

export async function readBuildInBricksSource(
  request: BuildInBricksSourceLookupRequest,
): Promise<BuildInBricksSourceReadResult> {
  const lookup = await lookupBuildInBricksSource(request);
  // Ownership conflicts are authoritative. Valid retained files cannot turn a
  // native-content or Theme Style mismatch back into an available source.
  // Source bytes are read only after the ownership lookup has passed.
  if (lookup.status !== 'available' || !lookup.entry) {
    return { ...lookup, html: null, css: null, js: null };
  }
  const entry = lookup.entry;
  const [html, css, js] = await Promise.all([
    readSourceFile(request.projectId, entry.files.html),
    readSourceFile(request.projectId, entry.files.css),
    entry.files.js ? readSourceFile(request.projectId, entry.files.js) : Promise.resolve(''),
  ]);
  if (html === null || css === null || (entry.files.js && js === null)) {
    return {
      status: 'missing',
      entry,
      message: 'The retained HTML-first source files are no longer available in the owning project.',
      html,
      css,
      js,
    };
  }
  const [htmlHash, cssHash, jsHash] = await Promise.all([
    hashSourceText(html),
    hashSourceText(css),
    hashSourceText(js || ''),
  ]);
  const hashesMatch = htmlHash === entry.files.html.hash
    && cssHash === entry.files.css.hash
    && (!entry.files.js || jsHash === entry.files.js.hash);
  if (!hashesMatch) {
    return {
      status: 'stale',
      entry,
      message: 'The retained source changed after conversion; it must be reviewed before an HTML-native edit.',
      html,
      css,
      js,
    };
  }
  return { status: 'available', entry, message: 'Retained HTML-first source and hashes are verified.', html, css, js };
}

export async function persistBuildInBricksSourceIndex(
  input: PersistBuildInBricksSourceIndexInput,
): Promise<PersistBuildInBricksSourceIndexResult> {
  const projectId = String(input.projectId || '').trim();
  const targetPostId = Math.trunc(Number(input.targetPostId || 0));
  // The source index is a canonical Build write. Historical `stageASource`
  // remains readable by the session normalizer, but must never be promoted
  // into a new Build provenance record.
  if (!input.source && input.stageASource) {
    return {
      ok: false,
      index: null,
      entry: null,
      message: 'Historical stage-a source metadata is read-compatible only; canonical Build provenance requires buildSource.',
    };
  }
  const source = input.source || {};
  const htmlPath = normalizeSourcePath(source.htmlPath);
  const cssPath = normalizeSourcePath(source.cssPath);
  const jsPath = normalizeSourcePath(source.jsPath);
  if (
    (htmlPath && !htmlPath.startsWith('build-source/'))
    || (cssPath && !cssPath.startsWith('build-source/'))
    || (jsPath && !jsPath.startsWith('build-source/'))
  ) {
    return { ok: false, index: null, entry: null, message: 'Canonical Build provenance accepts only build-source/* artifact paths.' };
  }
  if (!projectId || targetPostId <= 0 || !htmlPath || !cssPath) {
    return { ok: false, index: null, entry: null, message: 'Source index requires an owning project, target post, HTML path and CSS path.' };
  }
  const [html, css, js] = await Promise.all([
    fetchBuildInBricksScratchProjectFileText(projectId, htmlPath),
    fetchBuildInBricksScratchProjectFileText(projectId, cssPath),
    jsPath
      ? fetchBuildInBricksScratchProjectFileText(projectId, jsPath)
      : Promise.resolve(''),
  ]);
  if (!html?.trim() || !css?.trim() || (jsPath && js === null)) {
    return { ok: false, index: null, entry: null, message: 'Verified conversion did not leave complete HTML/CSS/optional-JS source files.' };
  }
  const [htmlHash, cssHash, jsHash, sourceHash] = await Promise.all([
    hashSourceText(html),
    hashSourceText(css),
    hashSourceText(js || ''),
    hashSourceText(JSON.stringify({ html, css, js: js || '' })),
  ]);
  const convertedElementIds = uniqueStrings(input.convertedElementIds);
  const nativeContentFingerprint = Array.isArray(input.persistedNativeElements)
    ? await hashBuildInBricksOwnedNativeContent(input.persistedNativeElements, convertedElementIds)
    : null;
  if (!nativeContentFingerprint) {
    return {
      ok: false,
      index: null,
      entry: null,
      message: 'Verified conversion did not provide a fingerprintable Pixflow-owned native Bricks subtree.',
    };
  }
  const now = new Date().toISOString();
  const sourceId = `bib-${targetPostId}-${Date.now().toString(36)}`;
  const previous = await readBuildInBricksSourceIndex(projectId);
  const previousActive = previous?.entries.find((entry) => (
    entry.status === 'active'
    && entry.targetPostId === targetPostId
    && entry.scope === input.scope
    && entry.fragmentNamespace === (input.fragmentNamespace || null)
  )) || null;
  const entry: PixflowBuildInBricksSourceIndexEntry = {
    sourceId,
    version: 1,
    projectId,
    targetPostId,
    scope: input.scope,
    fragmentNamespace: input.fragmentNamespace || null,
    placement: input.placement || null,
    files: {
      html: { path: htmlPath, hash: htmlHash, required: true },
      css: { path: cssPath, hash: cssHash, required: true },
      js: jsPath ? { path: jsPath, hash: jsHash, required: false } : null,
    },
    sourceHash,
    convertedElementIds,
    convertedGlobalClassIds: uniqueStrings(input.convertedGlobalClassIds),
    nativeContentFingerprint,
    nativeContentFingerprintAlgorithm: 'pixflow-owned-bricks-subtree-v1',
    handoffId: cleanOptional(input.handoffId),
    runId: cleanOptional(input.runId),
    contextRevision: cleanOptional(input.contextRevision) || 'unknown',
    themeStyleSnapshotHash: cleanOptional(input.themeStyleSnapshotHash),
    skillVersion: cleanOptional(input.skillVersion) || 'unknown',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastSuccessfulConversionAt: now,
    previousSourceId: previousActive?.sourceId || null,
  };
  const entries = (previous?.entries || []).map((candidate) => (
    previousActive && candidate.sourceId === previousActive.sourceId
      ? { ...candidate, status: 'superseded' as const, updatedAt: now }
      : candidate
  ));
  entries.push(entry);
  const index: PixflowBuildInBricksSourceIndex = {
    schema: 'pixflow.build_in_bricks.source_index.v1',
    version: 1,
    updatedAt: now,
    entries: entries.slice(-MAX_SOURCE_INDEX_ENTRIES),
  };
  const saved = await writeBuildInBricksScratchProjectTextFileDetailed(
    projectId,
    PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
    `${JSON.stringify(index, null, 2)}\n`,
  );
  if (!saved.ok) {
    return {
      ok: false,
      index: null,
      entry: null,
      message: saved.message || 'The source index could not be persisted in the owning project.',
    };
  }
  return { ok: true, index, entry, message: 'Verified Build in Bricks source provenance persisted.' };
}

/**
 * Hash only Pixflow-owned Bricks elements plus descendants a user may have
 * added beneath an owned parent. Object keys are canonicalized while array
 * order is retained because Bricks sibling/child order is semantic.
 */
export async function hashBuildInBricksOwnedNativeContent(
  elements: unknown[],
  ownedElementIds: string[],
): Promise<string | null> {
  const owned = new Set(uniqueStrings(ownedElementIds));
  if (owned.size === 0) return null;
  const selected: Record<string, unknown>[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const value of elements) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const element = value as Record<string, unknown>;
      const id = typeof element.id === 'string' ? element.id.trim() : '';
      const parent = typeof element.parent === 'string' ? element.parent.trim() : '';
      if (!id || owned.has(id) || !parent || !owned.has(parent)) continue;
      owned.add(id);
      changed = true;
    }
  }
  for (const value of elements) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const element = value as Record<string, unknown>;
    const id = typeof element.id === 'string' ? element.id.trim() : '';
    if (id && owned.has(id)) selected.push(element);
  }
  if (selected.length === 0) return null;
  return hashSourceText(JSON.stringify(canonicalizeNativeValue(selected)));
}

function canonicalizeNativeValue(value: unknown, propertyKey?: string): unknown {
  // Bricks persists a top-level parent sentinel as numeric zero even when the
  // accepted insert payload used an empty string. Both mean "page root"; this
  // serialization-only change must not look like a manual hierarchy edit.
  if (propertyKey === 'parent' && value === 0) return '';
  if (Array.isArray(value)) return value.map((item) => canonicalizeNativeValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => [key, canonicalizeNativeValue((value as Record<string, unknown>)[key], key)]));
}

async function readSourceFile(projectId: string, file: { path: string }): Promise<string | null> {
  return fetchBuildInBricksScratchProjectFileText(projectId, file.path);
}

function normalizeSourcePath(value: unknown): string | null {
  const path = typeof value === 'string' ? value.replace(/\\/g, '/').replace(/^\/+/, '').trim() : '';
  if (!path || path.includes('..') || path.startsWith('http:') || path.startsWith('https:')) return null;
  return path;
}

function cleanOptional(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 300) : null;
}

function uniqueStrings(values: unknown): string[] {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)
    .slice(0, 2_000)));
}

function isSourceIndexEntry(value: unknown): value is PixflowBuildInBricksSourceIndexEntry {
  const entry = value as Partial<PixflowBuildInBricksSourceIndexEntry> | null;
  return Boolean(
    entry
    && typeof entry.sourceId === 'string'
    && typeof entry.projectId === 'string'
    && Number.isInteger(entry.targetPostId)
    && Number(entry.targetPostId) > 0
    && (entry.scope === 'full_page' || entry.scope === 'section' || entry.scope === 'component')
    && entry.files
    && typeof entry.files.html?.path === 'string'
    && typeof entry.files.css?.path === 'string'
    && typeof entry.sourceHash === 'string'
    && (entry.status === 'active' || entry.status === 'superseded' || entry.status === 'stale' || entry.status === 'conflict')
  );
}
