import { buildPixflowBricksHandoffChatMessage } from './bricks-handoff-chat';
import {
  isVerifiedBricksBaselineResult,
  keepVerifiedBricksBaselineWithWarning,
  preparePixflowBricksBaselineHandoff,
  preparePixflowBricksHandoff,
  type PixflowInitialHtmlInsertResult,
} from './bricks-initial-insert';
import {
  isBuildInBricksHtmlFirstPayload,
  normalizeBuildInBricksCompatibilityPayload,
  type PixflowBricksAgentSessionPayload,
} from './bricks-agent-session';
import {
  createBuildInBricksRunBundleTracker,
  createPrototypeBricksRunBundleTracker,
  inferBuildInBricksFailureCause,
  inferPrototypeBricksFailureCause,
} from './prototype-bricks-run-bundle';
import {
  persistBuildInBricksRunBundle,
  persistPrototypeBricksRunBundle,
} from './prototype-bricks-run-bundle-persistence';
import {
  persistBuildInBricksSourceIndex,
  PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
} from './build-in-bricks-source-provenance';
import type { PixflowBricksMutationAck } from '@open-design/contracts';

const MAX_HANDOFF_STREAM_EVENTS = 180;
const MAX_HANDOFF_EVENT_TEXT_CHARS = 4000;

export type PixflowBricksHandoffJobOptions = {
  payload: PixflowBricksAgentSessionPayload;
  mode: 'baseline' | 'stage_b';
  /** Verified primary HTML already read by the initiating surface. */
  primaryHtml?: string;
  messageIdPrefix?: string;
  signal?: AbortSignal;
  onOpen?: (payload: PixflowBricksAgentSessionPayload) => void;
  onUpdate?: (payload: PixflowBricksAgentSessionPayload) => void;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
  /**
   * Reads the authoritative WordPress content after verified insertion. Build
   * provenance must fingerprint persisted Bricks state, not the pre-hydration
   * live payload used to update the open canvas.
   */
  readPersistedNativeElements?: (postId: number) => Promise<unknown[] | null>;
  isCancelled?: () => boolean;
  stoppedMessage?: string;
  failedMessage?: string;
  reuseVerifiedBaselineWorkspaceDir?: string;
};

// Pixflow-owned: all HTML-to-Bricks entry points use one handoff lifecycle.
// The caller owns where payload updates are posted; this runner owns the
// prepare/stream/final/error message shape so Home, project auto-handoff, and
// the floating panel cannot drift apart.
export async function runPixflowBricksHandoffJob({
  payload: receivedPayload,
  mode,
  primaryHtml,
  messageIdPrefix = 'handoff',
  signal,
  onOpen,
  onUpdate,
  onLiveMutation,
  readPersistedNativeElements,
  isCancelled,
  stoppedMessage = 'Bricks handoff was stopped.',
  failedMessage = 'Bricks handoff preparation failed.',
  reuseVerifiedBaselineWorkspaceDir,
}: PixflowBricksHandoffJobOptions): Promise<PixflowBricksAgentSessionPayload> {
  const initialPayload = normalizeBuildInBricksCompatibilityPayload(receivedPayload);
  if (mode === 'stage_b' && isBuildInBricksHtmlFirstPayload(initialPayload)) {
    throw new Error('Ordinary Build in Bricks HTML-first runs do not support Stage B refinement.');
  }
  const isBuildInBricksRun = isBuildInBricksHtmlFirstPayload(initialPayload);
  const inferFailureCause = isBuildInBricksRun
    ? inferBuildInBricksFailureCause
    : inferPrototypeBricksFailureCause;
  let payload = initialPayload;
  // The builder only supplies reuseVerifiedBaselineWorkspaceDir from the
  // verified optional-action entry point. Cross-window payload normalization
  // can omit the persistence receipt even though the converter result has
  // already passed persistence and live-canvas verification. Preserve that
  // verified boundary here so cleanup cannot fall back to a full reconversion.
  const postedInitialInsert = initialPayload.initialInsert as PixflowInitialHtmlInsertResult | null;
  const explicitlyReusedBaselineInsert = reuseVerifiedBaselineWorkspaceDir
    && postedInitialInsert?.ok === true
    && postedInitialInsert.persisted?.ok === true
    && postedInitialInsert.persisted.contentMatches === true
    ? {
      ...postedInitialInsert,
      persisted: {
        ...postedInitialInsert.persisted,
        ok: true,
        contentMatches: true,
      },
    }
    : null;
  let verifiedBaselineInsert: PixflowInitialHtmlInsertResult | null =
    isVerifiedBricksBaselineResult(initialPayload.initialInsert)
      ? initialPayload.initialInsert
      : explicitlyReusedBaselineInsert;
  const runBundle = isBuildInBricksRun
    ? createBuildInBricksRunBundleTracker(initialPayload)
    : createPrototypeBricksRunBundleTracker(initialPayload);
  const preparationMessageId = `assistant:${payload.session.id}:${messageIdPrefix}-preparing`;
  const preparationCreatedAt = Date.now();
  const streamedHandoffEvents: unknown[] = [];

  payload = {
    ...payload,
    session: {
      ...payload.session,
      status: 'loading',
      mode: payload.session.mode,
      messages: [
        ...payload.session.messages,
        buildPixflowBricksHandoffChatMessage({
          id: preparationMessageId,
          payload,
          stage: 'preparing',
          createdAt: preparationCreatedAt,
          mode,
        }),
      ],
    },
  };
  onOpen?.(payload);

  const shouldStop = () => Boolean(isCancelled?.());
  const publishUpdate = () => {
    if (shouldStop()) return;
    onUpdate?.(payload);
  };
  const publishTerminalUpdate = () => {
    onUpdate?.(payload);
  };
  const archiveRunBundle = async () => {
    if (!payload.runBundle) return;
    const archived = isBuildInBricksRun
      ? await persistBuildInBricksRunBundle(payload.projectId, payload.runBundle)
      : await persistPrototypeBricksRunBundle(payload.projectId, payload.runBundle);
    payload = {
      ...payload,
      runBundle: archived.bundle,
    };
  };
  const markStopped = async () => {
    runBundle.fail('cancelled', stoppedMessage);
    payload = {
      ...payload,
      runBundle: runBundle.snapshot(),
      initialInsert: {
        ok: false,
        terminalCode: 'html_to_bricks_cancelled',
        terminalClass: 'cancelled',
        message: stoppedMessage,
      },
      handoffState: 'failed',
      session: {
        ...payload.session,
        status: 'ready',
        error: null,
        messages: payload.session.messages.map((entry) => entry.id === preparationMessageId
          ? buildPixflowBricksHandoffChatMessage({
            id: preparationMessageId,
            payload,
            stage: 'failed',
            createdAt: preparationCreatedAt,
            message: stoppedMessage,
            events: streamedHandoffEvents,
            mode,
          })
          : entry),
      },
    };
    await archiveRunBundle();
    publishTerminalUpdate();
  };

  const postHandoffStreamUpdate = (events: unknown[]) => {
    if (shouldStop() || !Array.isArray(events) || events.length === 0) return;
    streamedHandoffEvents.push(...compactHandoffEvents(events, isBuildInBricksRun));
    trimHandoffEventBuffer(streamedHandoffEvents, isBuildInBricksRun);
    payload = {
      ...payload,
      session: {
        ...payload.session,
        messages: payload.session.messages.map((message) => message.id === preparationMessageId
          ? buildPixflowBricksHandoffChatMessage({
            id: preparationMessageId,
            payload,
            stage: 'preparing',
            createdAt: preparationCreatedAt,
            events: streamedHandoffEvents,
            mode,
          })
          : message),
      },
    };
    publishUpdate();
  };

  try {
    const prepareHandoff = mode === 'baseline'
      ? preparePixflowBricksBaselineHandoff
      : preparePixflowBricksHandoff;
    const reuseVerifiedBaseline = mode === 'stage_b'
      && Boolean(reuseVerifiedBaselineWorkspaceDir)
      && Boolean(verifiedBaselineInsert);
    const initialInsert = await prepareHandoff({
      payload,
      primaryHtml,
      signal,
      onChatEvents: postHandoffStreamUpdate,
      onLiveMutation,
      ...(reuseVerifiedBaseline ? {
        visualRepairWorkspaceDir: reuseVerifiedBaselineWorkspaceDir,
        visualRepairBaselineState: {
          baselineInsert: verifiedBaselineInsert || undefined,
          baselinePreviewVerified: true,
          persistedBaselineElementIdMap: {},
          persistedBaselineGlobalClassIdMap: {},
        },
      } : {}),
      onLifecycleMark: (mark) => {
        runBundle.mark(mark);
        payload = {
          ...payload,
          runBundle: runBundle.snapshot(),
        };
      },
      onRunObservation: (observation) => {
        runBundle.recordObservation(observation);
        payload = {
          ...payload,
          runBundle: runBundle.snapshot(),
        };
      },
      onInitialInsert: (insert) => {
        if (shouldStop()) return;
        const baselinePreview = getInsertArtifactStage(insert) === 'pre_stage_b_baseline_preview';
        if (baselinePreview && isVerifiedBricksBaselineResult(insert)) {
          verifiedBaselineInsert = insert;
        }
        const retainedBaseline = mode === 'stage_b'
          && insert.ok === false
          && verifiedBaselineInsert
          ? keepVerifiedBricksBaselineWithWarning(
            verifiedBaselineInsert,
            insert.message || failedMessage,
          )
          : null;
        const publishedInsert = retainedBaseline || insert;
        runBundle.recordInsert(publishedInsert);
        payload = {
          ...payload,
          runBundle: runBundle.snapshot(),
          initialInsert: publishedInsert,
          handoffState: retainedBaseline
            ? payload.handoffState
            : insert.ok === false
            ? 'failed'
            : baselinePreview
              ? payload.handoffState
              : 'applied',
        };
        publishUpdate();
      },
    });
    if (shouldStop()) {
      await markStopped();
      return payload;
    }
    if (!initialInsert || typeof initialInsert !== 'object') {
      throw new Error('Bricks handoff preparation finished without returning an applyable result.');
    }
    const qaNormalizedInsert = isBuildInBricksHtmlFirstPayload(payload)
      ? normalizeBuildQaOnlyFailure(initialInsert)
      : initialInsert;
    const retainedOrOriginalInsert = mode === 'stage_b'
      && initialInsert.ok === false
      && verifiedBaselineInsert
      ? keepVerifiedBricksBaselineWithWarning(
        verifiedBaselineInsert,
        initialInsert.message || failedMessage,
      )
      : qaNormalizedInsert;
    const terminalInsert = classifyTerminalInsert(retainedOrOriginalInsert, isBuildInBricksRun);
    if (terminalInsert.ok === false) {
      runBundle.fail(
        inferFailureCause(terminalInsert),
        terminalInsert.message || failedMessage,
        terminalInsert,
      );
    } else {
      runBundle.succeed(terminalInsert);
    }
    payload = {
      ...payload,
      runBundle: runBundle.snapshot(),
      initialInsert: terminalInsert,
      handoffState: terminalInsert.ok === false ? 'failed' : 'applied',
      session: {
        ...payload.session,
        status: terminalInsert.ok === false ? 'error' : 'ready',
        error: terminalInsert.ok === false
          ? (terminalInsert.message || failedMessage)
          : null,
        messages: payload.session.messages.map((message) => message.id === preparationMessageId
          ? buildPixflowBricksHandoffChatMessage({
            id: preparationMessageId,
            payload,
            stage: terminalInsert.ok === false ? 'failed' : 'ready',
            createdAt: preparationCreatedAt,
            message: terminalInsert.message,
            events: streamedHandoffEvents.length > 0
              ? streamedHandoffEvents
              : compactHandoffEvents(terminalInsert.handoffChatEvents, isBuildInBricksRun),
            mode,
          })
          : message),
      },
    };
    const canonicalBuildSource = initialPayload.buildSource || payload.buildSource;
    const canonicalBuildSourcePaths = Boolean(
      canonicalBuildSource?.htmlPath?.startsWith('build-source/')
      && canonicalBuildSource?.cssPath?.startsWith('build-source/')
      && (!canonicalBuildSource.jsPath || canonicalBuildSource.jsPath.startsWith('build-source/')),
    );
    if (
      isBuildInBricksRun
      && isVerifiedBricksBaselineResult(terminalInsert)
      // New ordinary Build provenance must be rooted in the canonical
      // `build-source/*` contract. A historical payload may still expose
      // `stageASource` for compatibility, but writing a new source index from
      // that field would silently make legacy storage canonical again.
      && canonicalBuildSource
      && canonicalBuildSourcePaths
    ) {
      const buildSource = canonicalBuildSource;
      const persistedPostId = Number(terminalInsert.postId || payload.targetContext?.postId || 0);
      const reloadedPersistedElements = readPersistedNativeElements && persistedPostId > 0
        ? await readPersistedNativeElements(persistedPostId).catch(() => null)
        : null;
      // A positively verified insertion already proves that the applied
      // payload matches WordPress. Prefer a fresh authoritative read, but do
      // not abandon retained-source provenance when that post-insert read is
      // transiently unavailable.
      const authoritativePersistedElements = Array.isArray(reloadedPersistedElements)
        ? reloadedPersistedElements
        : Array.isArray(terminalInsert.livePayload?.content)
          ? terminalInsert.livePayload.content
          : null;
      const sourceScope = payload.generationScope || 'full_page';
      const persistedElementIds = Array.isArray(terminalInsert.persisted?.storedIds)
        ? terminalInsert.persisted.storedIds
        : [];
      const sourceIndex = await persistBuildInBricksSourceIndex({
        projectId: initialPayload.projectId || payload.projectId || '',
        targetPostId: Number(terminalInsert.postId || payload.targetContext?.postId || 0),
        scope: sourceScope,
        fragmentNamespace: payload.retainedSourceOwnership?.fragmentNamespace
          ?? payload.scopedPlacement?.targetId
          ?? null,
        placement: payload.retainedSourceOwnership?.placement
          ?? (payload.scopedPlacement
            ? {
                ...(payload.scopedPlacement as unknown as Record<string, unknown>),
                ...(payload.buildPageFingerprint ? { pageFingerprint: payload.buildPageFingerprint } : {}),
              }
            : payload.buildPageFingerprint ? { pageFingerprint: payload.buildPageFingerprint } : null),
        source: buildSource || {},
        // Full-page replacement owns the complete verified stored result, so
        // use WordPress's post-normalization ids. Scoped inserts must retain
        // their bounded changed-id set rather than claiming unrelated page
        // siblings through the full persisted receipt.
        convertedElementIds: sourceScope === 'full_page' && persistedElementIds.length > 0
          ? persistedElementIds
          : terminalInsert.changedIds?.elementIds || persistedElementIds,
        convertedGlobalClassIds: terminalInsert.changedIds?.globalClassIds || [],
        persistedNativeElements: authoritativePersistedElements,
        handoffId: terminalInsert.handoffArtifacts?.handoffId || payload.runBundle?.touched.handoffIds.at(-1) || null,
        runId: payload.runBundle?.runId || null,
        contextRevision: payload.buildContextRevision,
        themeStyleSnapshotHash: payload.themeStyleSnapshotHash || payload.themeStyleContext?.snapshotHash || null,
        skillVersion: payload.buildSkillVersion,
      }).catch((error) => ({
        ok: false,
        index: null,
        entry: null,
        message: error instanceof Error ? error.message : 'The source index could not be persisted.',
      }));
      payload = {
        ...payload,
        runBundle: sourceIndex.ok && payload.runBundle
          ? {
              ...payload.runBundle,
              touched: {
                ...payload.runBundle.touched,
                artifactFiles: Array.from(new Set([
                  ...payload.runBundle.touched.artifactFiles,
                  PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
                ])),
              },
            }
          : payload.runBundle,
        sourceIndex: {
          status: sourceIndex.ok ? 'saved' : 'not_saved',
          path: PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
          sourceId: sourceIndex.entry?.sourceId || null,
          message: sourceIndex.message,
        },
      };
    } else if (isBuildInBricksRun && canonicalBuildSource) {
      payload = {
        ...payload,
        sourceIndex: {
          status: 'not_saved',
          path: PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH,
          sourceId: null,
          message: !canonicalBuildSourcePaths
            ? 'Historical stage-a source remains read-compatible, but new Build provenance requires canonical build-source/* artifacts.'
            : 'Build source provenance was not persisted because WordPress did not return a positively verified insertion receipt.',
        },
      };
    }
  } catch (error) {
    const wasCancelled = error instanceof Error && error.name === 'AbortError';
    if (shouldStop() || wasCancelled) {
      await markStopped();
      return payload;
    }
    const message = wasCancelled
      ? stoppedMessage
      : error instanceof Error ? error.message : failedMessage;
    if (mode === 'stage_b' && verifiedBaselineInsert) {
      const retainedBaseline = keepVerifiedBricksBaselineWithWarning(
        verifiedBaselineInsert,
        message,
      );
      runBundle.succeed(retainedBaseline);
      payload = {
        ...payload,
        runBundle: runBundle.snapshot(),
        initialInsert: retainedBaseline,
        handoffState: 'applied',
        session: {
          ...payload.session,
          status: 'ready',
          error: null,
          messages: payload.session.messages.map((entry) => entry.id === preparationMessageId
            ? buildPixflowBricksHandoffChatMessage({
              id: preparationMessageId,
              payload,
              stage: 'ready',
              createdAt: preparationCreatedAt,
              message: retainedBaseline.message,
              events: streamedHandoffEvents.length > 0
                ? streamedHandoffEvents
                : compactHandoffEvents(retainedBaseline.handoffChatEvents, isBuildInBricksRun),
              mode,
            })
            : entry),
        },
      };
      await archiveRunBundle();
      publishUpdate();
      return payload;
    }
    runBundle.fail(inferFailureCause({ message }), message);
    payload = {
      ...payload,
      runBundle: runBundle.snapshot(),
      initialInsert: {
        ok: false,
        terminalCode: 'html_to_bricks_structural_failure',
        terminalClass: 'failure',
        message,
      },
      handoffState: 'failed',
      session: {
        ...payload.session,
        status: 'error',
        error: message,
        messages: payload.session.messages.map((entry) => entry.id === preparationMessageId
          ? buildPixflowBricksHandoffChatMessage({
            id: preparationMessageId,
            payload,
            stage: 'failed',
            createdAt: preparationCreatedAt,
            message,
            events: streamedHandoffEvents.length > 0
              ? streamedHandoffEvents
              : compactHandoffEvents(payload.initialInsert?.handoffChatEvents, isBuildInBricksRun),
            mode,
          })
          : entry),
      },
    };
  }

  await archiveRunBundle();
  publishUpdate();
  return payload;
}

function classifyTerminalInsert(
  insert: PixflowInitialHtmlInsertResult,
  buildInBricks: boolean,
): PixflowInitialHtmlInsertResult {
  if (insert.terminalCode && insert.terminalClass) return insert;
  if (insert.ok !== false) {
    const warning = insert.code === 'bricks_handoff_baseline_kept_with_stage_b_warning'
      || insert.code === 'bricks_handoff_applied_with_visual_warning'
      || insert.code === 'bricks_handoff_applied_with_qa_warning'
      || insert.qaAssessment?.status === 'warning'
      || insert.qaAssessment?.status === 'failed';
    return {
      ...insert,
      terminalCode: warning
        ? 'html_to_bricks_applied_with_warning'
        : 'html_to_bricks_applied',
      terminalClass: warning ? 'warning_success' : 'clean_success',
    };
  }
  const cause = buildInBricks
    ? inferBuildInBricksFailureCause(insert)
    : inferPrototypeBricksFailureCause(insert);
  return {
    ...insert,
    terminalCode: cause === 'stage_a_blocked'
      ? 'html_to_bricks_source_failure'
      : 'html_to_bricks_structural_failure',
    terminalClass: 'failure',
  };
}

function normalizeBuildQaOnlyFailure(
  insert: PixflowInitialHtmlInsertResult,
): PixflowInitialHtmlInsertResult {
  if (
    !insert.qaAssessment
    || !['warning', 'failed'].includes(insert.qaAssessment.status)
  ) return insert;
  const persisted = insert.persisted;
  // QA is non-fatal only after WordPress proves that the converted content was
  // actually stored and matches what was inserted. An omitted match receipt is
  // not equivalent to verification and must not mask a real insertion failure.
  const persistedSuccessfully = persisted?.ok === true && persisted.contentMatches === true;
  if (!persistedSuccessfully) {
    // A truthy transport response is not proof that WordPress persisted the
    // intended Bricks payload. Keep the QA verdict visible, but fail closed
    // when the receipt is missing or mismatched so `qa.failed` cannot become a
    // false successful Build completion.
    return insert.ok === false
      ? insert
      : {
          ...insert,
          ok: false,
          code: 'bricks_handoff_persistence_verification_failed',
          message: insert.message || 'Post-conversion QA could not be treated as non-fatal because persisted Bricks content was not positively verified.',
          status: insert.status || 502,
        };
  }
  return {
    ...insert,
    ok: true,
    code: 'bricks_handoff_applied_with_qa_warning',
    message: insert.message || 'The converted Bricks result was inserted, but post-conversion QA reported findings.',
    status: 200,
  };
}

function getInsertArtifactStage(insert: unknown): string {
  if (!insert || typeof insert !== 'object' || Array.isArray(insert)) return '';
  const applyRequest = (insert as { applyRequest?: unknown }).applyRequest;
  if (!applyRequest || typeof applyRequest !== 'object' || Array.isArray(applyRequest)) return '';
  const directStage = (applyRequest as { artifactStage?: unknown }).artifactStage;
  if (typeof directStage === 'string') return directStage;
  const artifactBundle = (applyRequest as { artifactBundle?: unknown }).artifactBundle;
  if (!artifactBundle || typeof artifactBundle !== 'object' || Array.isArray(artifactBundle)) return '';
  const metadata = (artifactBundle as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const stage = (metadata as { artifactStage?: unknown }).artifactStage;
  return typeof stage === 'string' ? stage : '';
}

function compactHandoffEvents(events: unknown, buildInBricks = false): unknown[] {
  if (!Array.isArray(events)) return [];
  return events.map((event) => compactHandoffEvent(event, buildInBricks));
}

function compactHandoffEvent(event: unknown, buildInBricks: boolean): unknown {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return event;
  }
  const record = event as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  for (const key of ['content', 'text', 'message']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > MAX_HANDOFF_EVENT_TEXT_CHARS) {
      next = next || { ...record };
      next[key] = compactHandoffEventText(value, buildInBricks);
    }
  }
  return next || event;
}

function compactHandoffEventText(value: string, buildInBricks: boolean): string {
  if (value.length <= MAX_HANDOFF_EVENT_TEXT_CHARS) return value;
  const headLength = Math.floor(MAX_HANDOFF_EVENT_TEXT_CHARS * 0.45);
  const tailLength = Math.floor(MAX_HANDOFF_EVENT_TEXT_CHARS * 0.35);
  const omitted = value.length - headLength - tailLength;
  return [
    value.slice(0, headLength).trimEnd(),
    `\n\n[Pixflow stream compacted ${omitted} characters from this tool output. Full output remains in the local ${buildInBricks ? 'Build handoff' : 'Stage B'} run log.]\n\n`,
    value.slice(-tailLength).trimStart(),
  ].join('');
}

function trimHandoffEventBuffer(events: unknown[], buildInBricks: boolean): void {
  if (events.length <= MAX_HANDOFF_STREAM_EVENTS) return;
  const keepHead = 24;
  const keepTail = MAX_HANDOFF_STREAM_EVENTS - keepHead - 1;
  const omitted = events.length - keepHead - keepTail;
  const tail = events.splice(events.length - keepTail, keepTail);
  events.splice(keepHead, events.length - keepHead, {
    kind: 'text',
    text: buildInBricks
      ? `[Pixflow stream compacted ${omitted} earlier Build handoff events. Full output remains in the local Build handoff run log.]`
      : `[Pixflow stream compacted ${omitted} earlier Stage B events. Full output remains in the local Stage B run log.]`,
  }, ...tail);
}
