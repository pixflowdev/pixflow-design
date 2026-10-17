import { projectRawUrl, writeProjectBase64File, writeProjectTextFile, writeProjectTextFiles } from '../providers/registry';
import { toPixflowRuntimeUrl } from './bridge-url';
import { fetchProjectFileText } from '../providers/registry';
import { fetchPixflowFrameworkState, fetchPixflowRouteContext, type PixflowFrameworkState, type PixflowRouteContextSnapshot } from './framework';
import type {
  PixflowBricksAgentSessionPayload,
  PixflowBricksAgentSourceFile,
  PixflowBricksStageASourceMetadata,
} from './bricks-agent-session';
import { getPixflowBricksAgentSource, isBuildInBricksHtmlFirstPayload } from './bricks-agent-session';
import { requestWordPressRest } from './license';
import { getPixflowBridgeBaseUrl, getPixflowBuilderPostId, getPixflowWordPressConfig } from './wordpress-context';
import type { PrototypeBricksRunMark } from './prototype-bricks-run-bundle';
import type {
  PixflowBricksMutationAck,
  PixflowBricksMutationBatch,
  PixflowBricksMutationEvent,
  PixflowBricksCompatibilityContext,
  PixflowHtmlToBricksRunObservation,
  PixflowHtmlToBricksTerminalClass,
  PixflowHtmlToBricksTerminalCode,
  PixflowHtmlFrameworkContext,
  PixflowHtmlSourceManifest,
  PixflowVisualCaptureResponse,
  PixflowBricksConverterSkillPack,
} from '@open-design/contracts';
import {
  createPixflowHtmlFrameworkContext,
  normalizePixflowBuildInBricksThemeStyleContext,
  normalizePixflowBricksCompatibilityContext,
} from '@open-design/contracts';
import { safeBricksHandoffErrorMessage } from './bricks-handoff-error';
import { buildInBricksScopedPlacementPosition } from './bricks-scoped-placement';
import { buildBuildInBricksThemeStyleContext } from './build-in-bricks-source';
import { composeBuildInBricksSourceHtml } from './build-in-bricks-source';
import { writeBuildInBricksScratchProjectTextFiles } from './build-in-bricks-scratch-project-files';

let bricksConverterSkillPackRequest: Promise<PixflowBricksConverterSkillPack> | null = null;

async function fetchPixflowBricksConverterSkillPack(): Promise<PixflowBricksConverterSkillPack> {
  if (!bricksConverterSkillPackRequest) {
    bricksConverterSkillPackRequest = requestWordPressRest<{
      ok?: boolean;
      skillPack?: PixflowBricksConverterSkillPack;
      message?: string;
    }>('/pixflow-mcp/bricks-converter-skill-pack').then((response) => {
      if (!response.ok || !response.body?.ok || !response.body.skillPack) {
        throw new Error(
          response.body?.message
            || `The Pixflow Bricks converter abilities could not be loaded from WordPress (${response.status}).`,
        );
      }
      return response.body.skillPack;
    }).catch((error) => {
      bricksConverterSkillPackRequest = null;
      throw error;
    });
  }
  return bricksConverterSkillPackRequest;
}

export type PixflowInitialHtmlInsertSummary = {
  sourceFile?: string;
  source?: string;
  sectionCount?: number;
  elementCount?: number;
  globalClassCount?: number;
  inserted?: number;
  total?: number;
  warnings?: string[];
};

export type PixflowBricksQaAssessment = {
  source: 'post_conversion';
  status: 'passed' | 'warning' | 'failed' | 'unavailable';
  warnings: string[];
};

export type PixflowBuildThemeStyleSnapshotValidation = {
  ok: true;
  snapshotHash: string;
} | {
  ok: false;
  code: 'build_theme_style_context_missing' | 'build_theme_style_policy_invalid' | 'build_theme_style_snapshot_invalid' | 'build_theme_style_snapshot_drift';
  message: string;
};

/**
 * Ordinary Build must convert against the same authoritative Theme Style
 * snapshot used by source generation and review. This gate rejects malformed
 * transported context and live WordPress drift before conversion can mutate
 * the target page.
 */
export function validateBuildInBricksThemeStyleSnapshot(
  payload: PixflowBricksAgentSessionPayload,
  frameworkContext: PixflowHtmlFrameworkContext,
): PixflowBuildThemeStyleSnapshotValidation {
  if (!isBuildInBricksHtmlFirstPayload(payload)) {
    return { ok: true, snapshotHash: '' };
  }
  if (!payload.themeStyleContext) {
    return {
      ok: false,
      code: 'build_theme_style_context_missing',
      message: 'Build conversion was paused because its effective Bricks Theme Style context is missing.',
    };
  }
  const transported = normalizePixflowBuildInBricksThemeStyleContext(payload.themeStyleContext);
  if (payload.themeStylePolicy !== 'inherit_effective' || transported.policy !== 'inherit_effective') {
    return {
      ok: false,
      code: 'build_theme_style_policy_invalid',
      message: 'Build conversion was paused because ordinary Build must inherit the effective Bricks Theme Style.',
    };
  }
  if (payload.themeStyleSnapshotHash && payload.themeStyleSnapshotHash !== transported.snapshotHash) {
    return {
      ok: false,
      code: 'build_theme_style_snapshot_invalid',
      message: 'Build conversion was paused because the transported Theme Style snapshot identity does not match its canonical context.',
    };
  }
  const liveRouteContext = frameworkContext.routeContext as unknown as PixflowRouteContextSnapshot;
  const current = buildBuildInBricksThemeStyleContext(liveRouteContext);
  if (current.resolution.status !== 'available') {
    return {
      ok: false,
      code: 'build_theme_style_context_missing',
      message: 'Build conversion was paused because WordPress could not resolve the current effective Bricks Theme Style.',
    };
  }
  if (current.snapshotHash !== transported.snapshotHash) {
    return {
      ok: false,
      code: 'build_theme_style_snapshot_drift',
      message: 'Build conversion was paused because the destination Bricks Theme Style changed after source generation and review.',
    };
  }
  return { ok: true, snapshotHash: transported.snapshotHash };
}

type PixflowRunObservationRecorder = (observation: PixflowHtmlToBricksRunObservation) => void;

export type PixflowInitialHtmlInsertResult = {
  ok: boolean;
  code?: string;
  terminalCode?: PixflowHtmlToBricksTerminalCode;
  terminalClass?: PixflowHtmlToBricksTerminalClass;
  message?: string;
  postId?: number;
  area?: string;
  operation?: string;
  replaceExisting?: boolean;
  savedElementCountBeforeInsert?: number;
  undoPolicy?: {
    nativeBricksUndo: 'builder_history_only';
    pixflowRollback: 'restores_content_and_owned_theme_style';
  };
  sidecars?: Record<string, unknown>;
  summary?: PixflowInitialHtmlInsertSummary;
  // Execution status and post-conversion QA are intentionally separate. A
  // structurally valid conversion can be applied successfully while QA still
  // reports an honest failed/warning assessment for follow-up work.
  qaAssessment?: PixflowBricksQaAssessment;
  persisted?: {
    ok?: boolean;
    contentMatches?: boolean;
    postId?: number;
    area?: string;
    expectedCount?: number;
    actualCount?: number;
    expectedIds?: string[];
    storedIds?: string[];
    missingIds?: string[];
    extraIds?: string[];
    expectedHash?: string;
    actualHash?: string;
  };
  changedIds?: {
    elementIds?: string[];
    globalClassIds?: string[];
    templateIds?: number[];
    mediaAttachmentIds?: number[];
  };
  header?: { ok?: boolean; skipped?: boolean; templateId?: number } | null;
  footer?: { ok?: boolean; skipped?: boolean; templateId?: number } | null;
  runtimeDiagnostics?: Array<Record<string, unknown>>;
  livePayload?: {
    postId?: number;
    area?: string;
    replaceExisting?: boolean;
    savedElementCountBeforeInsert?: number;
    content?: unknown[];
    elements?: unknown[];
    globalClasses?: unknown[];
  };
  insert?: {
    rollbackSnapshot?: { id?: string } | null;
  };
  frontendUrl?: string | null;
  visualVerification?: {
    ok: boolean;
    frontendUrl: string | null;
    screenshots: string[];
    report: string | null;
    qualityPassed: boolean | null;
    pixelPassed?: boolean | null;
    fidelityPassed?: boolean | null;
    pixelExactOverridePassed?: boolean | null;
    repairEvidence?: Record<string, unknown> | null;
    errors: string[];
  };
  builderUrl?: string | null;
  editLink?: string | null;
  handoffArtifacts?: { handoffId: string; files: string[]; warning?: string };
  // Opaque local workspace used only by the optional one-pass cleanup. The
  // follow-up reuses this verified baseline instead of converting source again.
  refinementWorkspaceDir?: string;
  // Pixflow-owned: chat events converted from the local runner JSONL so the
  // Bricks floating panel can render the real handoff work using the same
  // stream/Bash/TODO UI as the main workspace.
  handoffChatEvents?: unknown[];
  baselineInsert?: PixflowInitialHtmlInsertResult;
  rollback?: PixflowBricksBaselineRollback;
  // Pixflow-owned: prepare returns the exact confirmed-apply request for the
  // builder panel. WordPress is not mutated until the user clicks Apply.
  applyRequest?: Record<string, unknown>;
  status?: number;
};

export function isVerifiedBricksBaselineResult(
  result: unknown,
): result is PixflowInitialHtmlInsertResult {
  const candidate = result as Partial<PixflowInitialHtmlInsertResult> | null | undefined;
  return Boolean(
    candidate
    && candidate.ok === true
    && candidate.persisted?.ok === true
    && candidate.persisted.contentMatches === true,
  );
}

export function keepVerifiedBricksBaselineWithWarning(
  baseline: PixflowInitialHtmlInsertResult,
  warning: string,
): PixflowInitialHtmlInsertResult {
  const normalizedWarning = String(warning || '').trim()
    || 'Optional post-generation cleanup could not complete.';
  return {
    ...baseline,
    ok: true,
    code: 'bricks_handoff_baseline_kept_with_stage_b_warning',
    terminalCode: 'html_to_bricks_applied_with_warning',
    terminalClass: 'warning_success',
    message: `The verified converted Bricks baseline was kept and remains applied. ${normalizedWarning} Review it in Bricks and use Pixflow Undo if you do not want to keep it.`,
    operation: baseline.operation || 'set',
    status: 200,
    baselineInsert: baseline,
    rollback: undefined,
    summary: {
      ...baseline.summary,
      warnings: Array.from(new Set([
        ...(baseline.summary?.warnings || []),
        normalizedWarning,
      ])),
    },
  };
}

type BricksHandoffStoredArtifacts = {
  files: string[];
  json: Record<string, unknown>;
  text: Record<string, string>;
};

type BricksHandoffFetchResult = {
  result: Record<string, unknown>;
  resultSignature?: BricksResultSignature;
  artifacts: BricksHandoffStoredArtifacts;
  workspaceDir?: string;
  localMediaAssets?: PixflowHandoffLocalMediaAsset[];
  summary?: { modelInvocationCount?: number };
  sourceManifest?: PixflowHtmlSourceManifest;
  compatibility?: PixflowBricksCompatibilityContext;
};

export type PixflowHandoffLocalMediaAsset = {
  ref: string;
  projectPath: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
};

const MAX_HANDOFF_LOCAL_MEDIA_FILE_BYTES = 8 * 1024 * 1024;
const MAX_HANDOFF_LOCAL_MEDIA_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_HANDOFF_LOCAL_MEDIA_FILES = 48;

function isLocalHandoffMediaRef(value: string): boolean {
  const ref = value.trim();
  return Boolean(ref)
    && !/^(?:[a-z][a-z0-9+.-]*:|#|\/|\\)/i.test(ref)
    && /\.(?:avif|gif|jpe?g|png|svg|webp|m4a|mov|mp3|mp4|ogg|wav|webm|woff2?|ttf|otf)(?:[?#].*)?$/i.test(ref);
}

function resolveProjectContainedMediaPath(sourceFilePath: string, ref: string): string | null {
  const cleanSource = sourceFilePath.replace(/\\/g, '/').replace(/^\/+/, '').split(/[?#]/, 1)[0];
  const cleanRef = ref.replace(/\\/g, '/').split(/[?#]/, 1)[0];
  if (!cleanSource || !cleanRef || !isLocalHandoffMediaRef(ref)) return null;
  const segments = cleanSource.split('/').slice(0, -1);
  for (const segment of cleanRef.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

function isLocalHandoffImageRef(value: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value.trim());
}

function stripHtmlCommentsForMediaDiscovery(value: string): string {
  return value.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

export function collectHandoffLocalMediaAssetReferences(
  bricksHandoffResult: Record<string, unknown>,
  sourceFilePath: string,
): Array<{ ref: string; projectPath: string }> {
  const refs: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (isLocalHandoffMediaRef(value)) refs.push(value.trim());
      const discoverableValue = stripHtmlCommentsForMediaDiscovery(value);
      const cssUrl = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi;
      let match: RegExpExecArray | null;
      while ((match = cssUrl.exec(discoverableValue)) !== null) {
        if (isLocalHandoffMediaRef(match[2] || '')) refs.push((match[2] || '').trim());
      }
      const htmlMediaAttribute = /\b(srcset|src|poster)\s*=\s*(['"])(.*?)\2/gi;
      while ((match = htmlMediaAttribute.exec(discoverableValue)) !== null) {
        const attribute = String(match[1] || '').toLowerCase();
        const candidates = attribute === 'srcset'
          ? String(match[3] || '').split(',').map((item) => item.trim().split(/\s+/, 1)[0] || '')
          : [String(match[3] || '').trim()];
        for (const candidate of candidates) {
          if (isLocalHandoffMediaRef(candidate)) refs.push(candidate);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(bricksHandoffResult);

  const unique = new Map<string, { ref: string; projectPath: string }>();
  for (const ref of refs) {
    const projectPath = resolveProjectContainedMediaPath(sourceFilePath, ref);
    if (!projectPath) continue;
    unique.set(`${ref}\0${projectPath}`, { ref, projectPath });
  }
  return [...unique.values()];
}

function handoffMediaMimeType(projectPath: string, responseMime: string): string {
  const declared = (responseMime.split(';', 1)[0] ?? '').trim().toLowerCase();
  if (/^(?:image|video|audio)\//.test(declared)) return declared;
  const extension = projectPath.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    avif: 'image/avif', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
    mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm',
    woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  };
  return extension ? (mimeByExtension[extension] || 'application/octet-stream') : 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

export async function buildHandoffLocalMediaAssets(
  projectId: string,
  sourceFilePath: string,
  bricksHandoffResult: Record<string, unknown>,
  signal?: AbortSignal,
  prebundledAssets: PixflowHandoffLocalMediaAsset[] = [],
  placeholderImageUrl = getPixflowWordPressConfig()?.placeholderImageUrl?.trim() || '',
): Promise<PixflowHandoffLocalMediaAsset[]> {
  const bundled = normalizeHandoffLocalMediaAssets(prebundledAssets);
  const bundledRefs = new Set(bundled.map((asset) => asset.ref));
  const references = collectHandoffLocalMediaAssetReferences(bricksHandoffResult, sourceFilePath)
    .filter((reference) => !bundledRefs.has(reference.ref));
  if (references.length > MAX_HANDOFF_LOCAL_MEDIA_FILES) {
    throw new Error(`The Bricks handoff references ${references.length} local media files; the safe limit is ${MAX_HANDOFF_LOCAL_MEDIA_FILES}.`);
  }
  const assets: PixflowHandoffLocalMediaAsset[] = [...bundled];
  let totalBytes = bundled.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  let placeholder: { bytes: Uint8Array; mimeType: string; filename: string } | null | undefined;
  const fetchMedia = async (url: string, options: RequestInit): Promise<Response | null> => {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  };
  const readPlaceholder = async (): Promise<typeof placeholder> => {
    if (placeholder !== undefined) return placeholder;
    placeholder = null;
    if (!placeholderImageUrl) return placeholder;
    const response = await fetchMedia(placeholderImageUrl, {
      cache: 'force-cache',
      headers: { Accept: 'image/*,*/*;q=0.5' },
      signal,
    });
    if (!response?.ok) return placeholder;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_HANDOFF_LOCAL_MEDIA_FILE_BYTES) return placeholder;
    placeholder = {
      bytes,
      mimeType: handoffMediaMimeType('pixflow-missing-media-placeholder.webp', response.headers.get('content-type') || ''),
      filename: 'pixflow-missing-media-placeholder.webp',
    };
    return placeholder;
  };
  for (const reference of references) {
    const fetchOptions: RequestInit = {
      cache: 'no-store',
      headers: { Accept: 'image/*,video/*,audio/*,font/*,*/*;q=0.5' },
      signal,
    };
    let response = await fetchMedia(projectRawUrl(projectId, reference.projectPath), fetchOptions);
    if (response?.status === 404 && reference.projectPath.includes('/')) {
      // Older WordPress multipart handling replaced bundle path separators
      // with underscores. Keep the canonical relative path as the handoff
      // identity, but recover only its exact deterministic legacy filename.
      const legacyFlattenedPath = reference.projectPath.replace(/\//g, '_');
      if (legacyFlattenedPath !== reference.projectPath) {
        response = await fetchMedia(projectRawUrl(projectId, legacyFlattenedPath), fetchOptions);
      }
    }
    let bytes: Uint8Array;
    let filename = reference.projectPath.split('/').pop() || 'pixflow-handoff-media';
    let mimeType: string;
    if (!response?.ok) {
      if (!isLocalHandoffImageRef(reference.ref)) continue;
      const fallback = await readPlaceholder();
      if (!fallback) continue;
      bytes = fallback.bytes;
      filename = fallback.filename;
      mimeType = fallback.mimeType;
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
      mimeType = handoffMediaMimeType(reference.projectPath, response.headers.get('content-type') || '');
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_HANDOFF_LOCAL_MEDIA_FILE_BYTES) {
      continue;
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_HANDOFF_LOCAL_MEDIA_TOTAL_BYTES) {
      throw new Error('Required Stage A media exceeds the 24 MB Bricks handoff limit.');
    }
    assets.push({
      ...reference,
      filename,
      mimeType,
      contentBase64: bytesToBase64(bytes),
      sizeBytes: bytes.byteLength,
    });
  }
  return assets;
}

function normalizeHandoffLocalMediaAssets(value: unknown): PixflowHandoffLocalMediaAsset[] {
  if (!Array.isArray(value)) return [];
  const assets: PixflowHandoffLocalMediaAsset[] = [];
  let totalBytes = 0;
  for (const item of value.slice(0, MAX_HANDOFF_LOCAL_MEDIA_FILES)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const ref = String(record.ref || '').trim();
    const projectPath = String(record.projectPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const filename = String(record.filename || '').trim();
    const mimeType = String(record.mimeType || '').trim().toLowerCase();
    const contentBase64 = String(record.contentBase64 || '').replace(/\s+/g, '');
    const sizeBytes = Number(record.sizeBytes || 0);
    const estimatedBytes = Math.floor(contentBase64.length * 3 / 4)
      - (contentBase64.endsWith('==') ? 2 : contentBase64.endsWith('=') ? 1 : 0);
    if (!ref || !projectPath || projectPath.split('/').some((part) => part === '..')
      || !filename || !/^(?:image|video|audio|font)\//.test(mimeType)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)
      || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0
      || sizeBytes > MAX_HANDOFF_LOCAL_MEDIA_FILE_BYTES || estimatedBytes !== sizeBytes) continue;
    totalBytes += sizeBytes;
    if (totalBytes > MAX_HANDOFF_LOCAL_MEDIA_TOTAL_BYTES) break;
    assets.push({ ref, projectPath, filename, mimeType, contentBase64, sizeBytes });
  }
  return assets;
}

export type BricksResultSignature = {
  sha256: string;
  size: number;
};

export function buildFinalBricksVisualEvidence(
  repairEvidence: Record<string, unknown>,
  resultSignature?: BricksResultSignature,
): Record<string, unknown> {
  return {
    ...repairEvidence,
    schema: 'pixflow.prototype_bricks.final_visual_evidence.v2',
    ...(resultSignature ? { resultSignature } : {}),
  };
}

const SOURCE_FIDELITY_PIXEL_EXACT_MAX_DIFFERENCE_RATIO = 0.01;
const SOURCE_FIDELITY_PIXEL_EXACT_MAX_TILE_RATIO = 0.08;
const SOURCE_FIDELITY_PIXEL_EXACT_MAX_MEAN_CHANNEL_DIFFERENCE = 1;
const SOURCE_FIDELITY_PIXEL_EXACT_MAX_TILE_MEAN_CHANNEL_DIFFERENCE = 3;
const SOURCE_FIDELITY_PIXEL_EXACT_MIN_MATCH_COVERAGE = 0.85;

type FinalBricksVisualQualityCapture = Pick<PixflowVisualCaptureResponse['captures'][number], 'viewport'> & {
  comparison?: Pick<NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']>,
    | 'passed'
    | 'differenceRatio'
    | 'meanAbsoluteChannelDifference'
    | 'maximumTileDifferenceRatio'
    | 'maximumTileMeanAbsoluteChannelDifference'
    | 'maximumTopBandTileDifferenceRatio'>;
  fidelity?: Pick<NonNullable<PixflowVisualCaptureResponse['captures'][number]['fidelity']>,
    'passed' | 'matchCoverage'>;
};

export function evaluateFinalBricksVisualQuality({
  captureComplete,
  captures,
  sourceFidelityClone,
}: {
  captureComplete: boolean;
  captures: FinalBricksVisualQualityCapture[];
  sourceFidelityClone: boolean;
}): {
  pixelPassed: boolean;
  fidelityPassed: boolean;
  pixelExactOverridePassed: boolean;
  qualityPassed: boolean;
} {
  const comparisons = captures
    .map((capture) => capture.comparison)
    .filter((comparison): comparison is NonNullable<typeof comparison> => Boolean(comparison));
  const fidelityComparisons = captures
    .map((capture) => capture.fidelity)
    .filter((comparison): comparison is NonNullable<typeof comparison> => Boolean(comparison));
  const expectedCaptureCount = captures.length;
  const pixelPassed = captureComplete
    && expectedCaptureCount > 0
    && comparisons.length === expectedCaptureCount
    && comparisons.every((comparison) => comparison.passed);
  const fidelityPassed = captureComplete
    && expectedCaptureCount > 0
    && fidelityComparisons.length === expectedCaptureCount
    && fidelityComparisons.every((comparison) => comparison.passed);
  // Website Clone may intentionally flatten source-only wrappers into native
  // Bricks elements. In that case DOM geometry can compare the wrong semantic
  // wrapper even while the accepted and final pixels are effectively exact.
  // Keep this override clone-only, require complete DOM coverage evidence, and
  // use much tighter full-frame/tile limits than the normal pixel gate.
  const pixelExactOverridePassed = sourceFidelityClone
    && pixelPassed
    && fidelityComparisons.length === expectedCaptureCount
    && comparisons.every((comparison) => (
      comparison.differenceRatio <= SOURCE_FIDELITY_PIXEL_EXACT_MAX_DIFFERENCE_RATIO
      && comparison.meanAbsoluteChannelDifference <= SOURCE_FIDELITY_PIXEL_EXACT_MAX_MEAN_CHANNEL_DIFFERENCE
      && comparison.maximumTileDifferenceRatio <= SOURCE_FIDELITY_PIXEL_EXACT_MAX_TILE_RATIO
      && comparison.maximumTileMeanAbsoluteChannelDifference <= SOURCE_FIDELITY_PIXEL_EXACT_MAX_TILE_MEAN_CHANNEL_DIFFERENCE
      && comparison.maximumTopBandTileDifferenceRatio <= SOURCE_FIDELITY_PIXEL_EXACT_MAX_TILE_RATIO
    ))
    && fidelityComparisons.every((comparison) => (
      comparison.matchCoverage >= SOURCE_FIDELITY_PIXEL_EXACT_MIN_MATCH_COVERAGE
    ));
  return {
    pixelPassed,
    fidelityPassed,
    pixelExactOverridePassed,
    qualityPassed: pixelPassed && (fidelityPassed || pixelExactOverridePassed),
  };
}

export type FinalBricksVisualDisposition = 'accept' | 'keep_with_warning';

// Visual comparison is advisory once the final Bricks payload has passed its
// structural, persistence, and live-canvas checks. Unavailable evidence or a
// subjective mismatch leaves the applied result available for review and Undo;
// parity never launches another Stage B model invocation.
export function resolveFinalBricksVisualDisposition({
  verification,
}: {
  verification: NonNullable<PixflowInitialHtmlInsertResult['visualVerification']>;
  visualRepairAttempt: number;
}): FinalBricksVisualDisposition {
  if (verification.ok && verification.qualityPassed === true) {
    return 'accept';
  }
  return 'keep_with_warning';
}

type PixflowVisualRepairBaselineState = {
  baselineInsert?: PixflowInitialHtmlInsertResult;
  baselinePreviewVerified: boolean;
  verifiedBaselineHandoff?: BricksHandoffFetchResult;
  persistedBaselineElementIdMap: Record<string, string>;
  persistedBaselineGlobalClassIdMap: Record<string, string>;
};

type BricksHandoffOwnership = {
  localProjectId: string;
  wpProjectUuid: string;
  latestVersion: number | null;
  lastSyncedHash: string;
  artifactHash: string;
};

export type PixflowBricksBaselineRollback = {
  attempted: true;
  ok: boolean;
  checkpointId: string | null;
  persisted: boolean;
  canvasVerified: boolean;
  message: string;
};

// The daemon/runner owns the 15-minute Stage B deadline. Keep the browser
// transport guard beyond that boundary while AbortSignal keeps Stop immediate.
export const BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS = 17 * 60 * 1000;
// Bricks finishes late layout work (fonts, responsive rules, and frontend
// scripts) after navigation has completed. Capturing earlier can measure a
// transient geometry state and incorrectly send an already-correct handoff
// through another model repair pass.
export const BRICKS_FRONTEND_VISUAL_SETTLE_MS = 4_000;
export const BRICKS_FINAL_VISUAL_VIEWPORTS = [
  { id: 'desktop-top', width: 1440, height: 1000, scrollPosition: 'top' },
  { id: 'bricks-base', width: 992, height: 844, scrollPosition: 'top' },
  { id: 'mobile-top', width: 390, height: 844, scrollPosition: 'top' },
] as const;

const BRICKS_ADAPTIVE_VISUAL_VIEWPORTS = [
  { id: 'desktop-bottom', width: 1440, height: 1000, scrollPosition: 'bottom' },
  { id: 'mobile-middle', width: 390, height: 844, scrollPosition: 'middle' },
  { id: 'mobile-bottom', width: 390, height: 844, scrollPosition: 'bottom' },
] as const;

export function selectFinalBricksVisualViewports(sourceEvidencePaths: string[]) {
  const evidence = sourceEvidencePaths.join(' ').toLowerCase();
  const extras = BRICKS_ADAPTIVE_VISUAL_VIEWPORTS.filter((viewport) => {
    if (viewport.id === 'desktop-bottom') return /desktop[^\s]*(?:bottom|full|long)|(?:bottom|full|long)[^\s]*desktop/.test(evidence);
    if (viewport.id === 'mobile-middle') return /mobile[^\s]*(?:middle|mid)|(?:middle|mid)[^\s]*mobile/.test(evidence);
    return /mobile[^\s]*(?:bottom|full|long)|(?:bottom|full|long)[^\s]*mobile/.test(evidence);
  });
  return [...BRICKS_FINAL_VISUAL_VIEWPORTS, ...extras];
}

// A full-page replacement changes the saved Bricks tree and its in-memory
// collection in one atomic operation. Bricks does not reliably repaint the
// canvas iframe from that collection change alone, so the mutation must reload
// the canvas before its root IDs can be treated as visually verified.
export function fullPageBricksMutationRequiresCanvasRefresh({
  operation,
  replaceExisting,
}: {
  operation: string;
  replaceExisting: boolean;
}): boolean {
  return operation === 'set' && replaceExisting;
}

// Scoped generation is inserted alongside page-owned content and site-wide
// classes. The live bridge has already verified every generated element/class
// ID before returning an applied acknowledgement, so exact collection totals
// are meaningful only when the handoff owns the complete page replacement.
export function liveBricksBaselineCountsMatch({
  scopedInsert,
  ack,
  expectedElementCount,
  expectedGlobalClassCount,
}: {
  scopedInsert: boolean;
  ack: PixflowBricksMutationAck;
  expectedElementCount: number;
  expectedGlobalClassCount: number;
}): boolean {
  return scopedInsert || (
    ack.observed.elementCount === expectedElementCount
    && ack.observed.globalClassCount === expectedGlobalClassCount
  );
}

export function resolveBuildInBricksScopedMutationOwnership(
  payload: Pick<PixflowBricksAgentSessionPayload, 'generationScope' | 'retainedSourceOwnership'>,
): {
  scopedInsert: boolean;
  retainedScopedReplacement: boolean;
  replaceExisting: boolean;
  replaceElementIds: string[] | undefined;
  replaceGlobalClassIds: string[] | undefined;
  liveOperation: 'insert' | 'set';
} {
  const scopedInsert = payload.generationScope === 'section' || payload.generationScope === 'component';
  const replaceElementIds = Array.from(new Set(
    (payload.retainedSourceOwnership?.convertedElementIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
  const retainedScopedReplacement = scopedInsert && replaceElementIds.length > 0;
  return {
    scopedInsert,
    retainedScopedReplacement,
    replaceExisting: !scopedInsert,
    replaceElementIds: retainedScopedReplacement ? replaceElementIds : undefined,
    replaceGlobalClassIds: retainedScopedReplacement
      ? Array.from(new Set(
          (payload.retainedSourceOwnership?.convertedGlobalClassIds || [])
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ))
      : undefined,
    liveOperation: retainedScopedReplacement ? 'set' : scopedInsert ? 'insert' : 'set',
  };
}

// A scoped baseline is appended beside content the user already owns. Stage B
// draft checkpoints are provisional trees and can change structural identities
// before the result settles; replaying those structures in a live Bricks page
// can accumulate duplicate roots in native autosave state. Keep the verified
// baseline visible, then replace only that baseline through the mandatory
// persisted final apply. Full-page work can continue using progressive drafts
// because each checkpoint owns the entire canvas.
export function shouldStreamStageBMutationToLiveCanvas(
  generationScope?: 'full_page' | 'section' | 'component',
  baselinePreviewVerified = true,
): boolean {
  return baselinePreviewVerified
    && generationScope !== 'section'
    && generationScope !== 'component';
}

// Stage B mutation events are a progressive canvas preview. The final payload
// is still applied atomically and verified against both WordPress persistence
// and live Bricks state below. A transient preview checkpoint must therefore
// degrade to a visible warning instead of discarding a valid final result.
export function describeStageBMutationCheckpointFailure(
  batch: PixflowBricksMutationBatch,
  ack: PixflowBricksMutationAck | void,
): string | null {
  if (ack?.ok === true
    && ack.status === 'applied_verified'
    && ack.checkpointId === batch.checkpointId) {
    return null;
  }
  const observed = ack?.observed
    ? ` (live: ${ack.observed.elementCount} elements, ${ack.observed.globalClassCount} classes)`
    : '';
  return `Stage B live checkpoint ${batch.checkpointId} was not verified${ack?.message ? `: ${ack.message}` : ''}${observed}`;
}

export function buildStageBMutationTimelineEvents(
  batch: PixflowBricksMutationBatch,
  phase: 'started' | 'verified' | 'failed',
  detail = '',
): unknown[] {
  const toolUseId = `stage-b-mutation:${batch.checkpointId || batch.sequence}`;
  if (phase === 'started') {
    const operations = Array.from(new Set(
      batch.events
        .map((event) => String(event.type || '').trim())
        .filter(Boolean),
    ));
    return [{
      kind: 'tool_use',
      id: toolUseId,
      name: 'Bricks mutation',
      input: {
        checkpointId: batch.checkpointId,
        sequence: batch.sequence,
        source: batch.source,
        operations,
      },
    }];
  }
  return [{
    kind: 'tool_result',
    toolUseId,
    content: detail || (
      phase === 'verified'
        ? `Applied and verified Stage B checkpoint ${batch.checkpointId}.`
        : `Stage B checkpoint ${batch.checkpointId} was not verified.`
    ),
    isError: phase === 'failed',
  }];
}

export async function restoreVerifiedBricksBaselineCheckpoint({
  postId,
  persistBaseline,
  onLiveMutation,
  scopedSectionInsert = false,
}: {
  postId: number;
  persistBaseline: () => Promise<PixflowInitialHtmlInsertResult>;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
  scopedSectionInsert?: boolean;
}): Promise<PixflowBricksBaselineRollback> {
  const checkpointId = `baseline-rollback-${Date.now().toString(36)}`;
  try {
    const restored = await persistBaseline();
    const persisted = restored.ok !== false
      && restored.persisted?.ok === true
      && restored.persisted.contentMatches === true;
    if (!persisted) {
      return {
        attempted: true,
        ok: false,
        checkpointId: null,
        persisted: false,
        canvasVerified: false,
        message: restored.message || 'The verified baseline could not be restored in WordPress.',
      };
    }

    const content = restored.livePayload?.content || [];
    const globalClasses = restored.livePayload?.globalClasses || [];
    if (!onLiveMutation || !restored.livePayload || content.length === 0) {
      return {
        attempted: true,
        ok: false,
        checkpointId: null,
        persisted: true,
        canvasVerified: false,
        message: 'The verified baseline was restored in WordPress, but the live Bricks canvas could not be verified.',
      };
    }

    const payloadHash = await hashHandoffBundle({ content, globalClasses });
    const liveAck = await onLiveMutation({
      operation: 'set',
      postId,
      elements: content,
      globalClasses,
      replaceExisting: true,
      focusCanvas: false,
      refreshCanvas: fullPageBricksMutationRequiresCanvasRefresh({ operation: 'set', replaceExisting: true }),
      phase: 'stage_b_rollback',
      checkpointId,
      payloadHash,
      sequence: Number.MAX_SAFE_INTEGER,
    });
    const canvasVerified = liveAck?.ok === true
      && liveAck.status === 'applied_verified'
      && liveAck.checkpointId === checkpointId
      && liveAck.observed.elementCount === content.length
      && (scopedSectionInsert || liveAck.observed.globalClassCount === globalClasses.length);
    return {
      attempted: true,
      ok: canvasVerified,
      checkpointId,
      persisted: true,
      canvasVerified,
      message: canvasVerified
        ? 'The rejected Stage B result was rolled back to the verified baseline in WordPress and the live Bricks canvas.'
        : `The verified baseline was restored in WordPress, but the live Bricks canvas rejected the rollback checkpoint${liveAck?.message ? `: ${liveAck.message}` : '.'}`,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      checkpointId: null,
      persisted: false,
      canvasVerified: false,
      message: `The verified baseline rollback failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function restorePreHandoffBricksSnapshot({
  postId,
  snapshotId,
  rollbackSnapshot,
  onLiveMutation,
  phase = 'pre_handoff_rollback',
}: {
  postId: number;
  snapshotId: string;
  rollbackSnapshot: () => Promise<PixflowInitialHtmlInsertResult>;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
  phase?: string;
}): Promise<PixflowBricksBaselineRollback> {
  if (!snapshotId) {
    return {
      attempted: true,
      ok: false,
      checkpointId: null,
      persisted: false,
      canvasVerified: false,
      message: 'The pre-handoff rollback snapshot was unavailable.',
    };
  }

  const checkpointId = `${phase.replace(/_/g, '-')}-${Date.now().toString(36)}`;
  try {
    const restored = await rollbackSnapshot();
    const persisted = restored.ok !== false
      && restored.persisted?.ok === true
      && restored.persisted.contentMatches === true;
    if (!persisted) {
      return {
        attempted: true,
        ok: false,
        checkpointId: null,
        persisted: false,
        canvasVerified: false,
        message: restored.message || 'The pre-handoff Bricks snapshot could not be restored in WordPress.',
      };
    }

    const elements = restored.livePayload?.elements || restored.livePayload?.content || [];
    const globalClasses = restored.livePayload?.globalClasses || [];
    if (!onLiveMutation || !restored.livePayload) {
      return {
        attempted: true,
        ok: false,
        checkpointId: null,
        persisted: true,
        canvasVerified: false,
        message: 'The pre-handoff snapshot was restored in WordPress, but the live Bricks canvas could not be verified.',
      };
    }

    const payloadHash = await hashHandoffBundle({ content: elements, globalClasses });
    const liveAck = await onLiveMutation({
      operation: 'set',
      postId,
      elements,
      globalClasses,
      replaceExisting: true,
      focusCanvas: false,
      refreshCanvas: fullPageBricksMutationRequiresCanvasRefresh({ operation: 'set', replaceExisting: true }),
      phase,
      checkpointId,
      payloadHash,
      sequence: Number.MAX_SAFE_INTEGER,
    });
    const canvasVerified = liveAck?.ok === true
      && liveAck.status === 'applied_verified'
      && liveAck.checkpointId === checkpointId
      && liveAck.observed.elementCount === elements.length
      && liveAck.observed.globalClassCount === globalClasses.length;
    return {
      attempted: true,
      ok: canvasVerified,
      checkpointId,
      persisted: true,
      canvasVerified,
      message: canvasVerified
        ? 'The failed handoff was rolled back to the exact pre-run Bricks content and design-system snapshot.'
        : `The pre-handoff snapshot was restored in WordPress, but the live Bricks canvas rejected the rollback checkpoint${liveAck?.message ? `: ${liveAck.message}` : '.'}`,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      checkpointId: null,
      persisted: false,
      canvasVerified: false,
      message: `The pre-handoff rollback failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function restoreBricksMutationTransaction({
  postId,
  stageBToBaselineSnapshotId,
  baselineToPreRunSnapshotId,
  rollbackSnapshot,
  onLiveMutation,
}: {
  postId: number;
  stageBToBaselineSnapshotId: string;
  baselineToPreRunSnapshotId: string;
  rollbackSnapshot: (snapshotId: string) => Promise<PixflowInitialHtmlInsertResult>;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
}): Promise<PixflowBricksBaselineRollback & {
  stageBToBaseline: PixflowBricksBaselineRollback;
  baselineToPreRun?: PixflowBricksBaselineRollback;
}> {
  const stageBToBaseline = await restorePreHandoffBricksSnapshot({
    postId,
    snapshotId: stageBToBaselineSnapshotId,
    rollbackSnapshot: () => rollbackSnapshot(stageBToBaselineSnapshotId),
    onLiveMutation,
    phase: 'stage_b_to_baseline_rollback',
  });
  if (!stageBToBaseline.ok) {
    return {
      ...stageBToBaseline,
      message: `The Stage B to baseline rollback failed closed. ${stageBToBaseline.message}`,
      stageBToBaseline,
    };
  }

  const baselineToPreRun = await restorePreHandoffBricksSnapshot({
    postId,
    snapshotId: baselineToPreRunSnapshotId,
    rollbackSnapshot: () => rollbackSnapshot(baselineToPreRunSnapshotId),
    onLiveMutation,
    phase: 'baseline_to_pre_run_rollback',
  });
  return {
    ...baselineToPreRun,
    ok: stageBToBaseline.ok && baselineToPreRun.ok,
    message: baselineToPreRun.ok
      ? 'The owned Stage B mutation was rolled back to baseline, then the baseline was rolled back to the exact pre-run Bricks state.'
      : `Stage B was restored to baseline, but the baseline-to-pre-run rollback failed closed. ${baselineToPreRun.message}`,
    stageBToBaseline,
    baselineToPreRun,
  };
}

export function buildPersistedBricksElementIdMap(
  sourceContent: unknown[],
  persistedContent: unknown[],
): Record<string, string> {
  if (sourceContent.length === 0 || sourceContent.length !== persistedContent.length) return {};
  const mapping: Record<string, string> = {};
  for (let index = 0; index < sourceContent.length; index += 1) {
    const source = sourceContent[index];
    const persisted = persistedContent[index];
    if (!isPlainObject(source) || !isPlainObject(persisted)) return {};
    const sourceId = String(source.id || '').trim();
    const persistedId = String(persisted.id || '').trim();
    const sourceName = String(source.name || '').trim();
    const persistedName = String(persisted.name || '').trim();
    if (!sourceId || !persistedId || (sourceName && persistedName && sourceName !== persistedName)) return {};
    mapping[sourceId] = persistedId;
  }
  return mapping;
}

export function buildPersistedBricksGlobalClassIdMap(
  sourceClasses: unknown[],
  persistedClasses: unknown[],
): Record<string, string> {
  const persistedIdByName = new Map<string, string>();
  for (const value of persistedClasses) {
    if (!isPlainObject(value)) continue;
    const name = String(value.name || '').trim();
    const id = String(value.id || '').trim();
    if (name && id) persistedIdByName.set(name, id);
  }
  const mapping: Record<string, string> = {};
  for (const value of sourceClasses) {
    if (!isPlainObject(value)) continue;
    const sourceId = String(value.id || '').trim();
    const name = String(value.name || '').trim();
    const persistedId = persistedIdByName.get(name) || '';
    if (sourceId && persistedId) mapping[sourceId] = persistedId;
  }
  return mapping;
}

export function buildPersistedBricksGlobalClassIdByName(
  persistedClasses: unknown[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const value of persistedClasses) {
    if (!isPlainObject(value)) continue;
    const name = String(value.name || '').trim();
    const id = String(value.id || '').trim();
    if (name && id) mapping[name] = id;
  }
  return mapping;
}

export function translateStageBMutationBatchIds(
  batch: PixflowBricksMutationBatch,
  idMap: Record<string, string>,
  globalClassIdMap: Record<string, string> = {},
  persistedGlobalClassIdByName: Record<string, string> = {},
): PixflowBricksMutationBatch {
  const resolvedGlobalClassIdMap = { ...globalClassIdMap };
  for (const event of batch.events) {
    if (event.type !== 'classes') continue;
    for (const globalClass of event.upsert) {
      const sourceId = String(globalClass.id || '').trim();
      const persistedId = persistedGlobalClassIdByName[String(globalClass.name || '').trim()] || '';
      if (sourceId && persistedId) resolvedGlobalClassIdMap[sourceId] = persistedId;
    }
  }
  const translateId = (value: unknown) => {
    const id = String(value || '');
    return idMap[id] || id;
  };
  const translateChildren = (value: unknown) => Array.isArray(value) ? value.map(translateId) : value;
  const translateGlobalClassId = (value: unknown) => {
    const id = String(value || '');
    return resolvedGlobalClassIdMap[id] || id;
  };
  const translateSettings = (value: unknown) => {
    if (!isPlainObject(value)) return value;
    return {
      ...value,
      ...(Array.isArray(value._cssGlobalClasses)
        ? { _cssGlobalClasses: value._cssGlobalClasses.map(translateGlobalClassId) }
        : {}),
    };
  };
  const translateElement = (value: Record<string, unknown>) => ({
    ...value,
    ...(value.id ? { id: translateId(value.id) } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'parent') ? { parent: translateId(value.parent) } : {}),
    ...(Array.isArray(value.children) ? { children: translateChildren(value.children) } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'settings') ? { settings: translateSettings(value.settings) } : {}),
  });
  const translateChanges = (changes: Record<string, unknown>) => ({
    ...changes,
    ...(Object.prototype.hasOwnProperty.call(changes, 'parent') ? { parent: translateId(changes.parent) } : {}),
    ...(Array.isArray(changes.children) ? { children: translateChildren(changes.children) } : {}),
    ...(Object.prototype.hasOwnProperty.call(changes, 'settings') ? { settings: translateSettings(changes.settings) } : {}),
  });
  const events = batch.events.map((event): PixflowBricksMutationEvent => {
    if (event.type === 'add') return { ...event, elements: event.elements.map(translateElement) };
    if (event.type === 'remove') return { ...event, elementIds: event.elementIds.map(translateId) };
    if (event.type === 'patch') {
      return {
        ...event,
        patches: event.patches.map((patch) => ({
          ...patch,
          id: translateId(patch.id),
          changes: translateChanges(patch.changes),
        })),
      };
    }
    if (event.type === 'reorder') return { ...event, orderedIds: event.orderedIds.map(translateId) };
    if (event.type === 'classes') {
      return {
        ...event,
        upsert: event.upsert.map((globalClass) => ({
          ...globalClass,
          id: translateGlobalClassId(globalClass.id),
        })),
        removeIds: event.removeIds.map(translateGlobalClassId),
      };
    }
    if (event.type === 'focus') return { ...event, elementId: translateId(event.elementId) };
    if (event.type === 'checkpoint') {
      return {
        ...event,
        ...(Array.isArray(event.elementIds) ? { elementIds: event.elementIds.map(translateId) } : {}),
        ...(Array.isArray(event.globalClassIds)
          ? { globalClassIds: event.globalClassIds.map(translateGlobalClassId) }
          : {}),
      };
    }
    return event;
  });
  return { ...batch, events };
}

type BricksColorSchemeSnapshotResponse = {
  ok?: boolean;
  colorScheme?: Record<string, unknown>;
};

type BricksSchemaCatalogResponse = {
  ok?: boolean;
  catalog?: unknown[];
  elements?: Record<string, unknown>;
  breakpoints?: unknown[];
  breakpointMode?: Record<string, unknown>;
  pseudoStates?: string[];
  themeStyleLoadingMethod?: 'all' | 'specific' | 'unknown';
  runtimeCapabilities?: Record<string, boolean>;
  source?: string;
  bricksVersion?: string | null;
};

type BricksKnowledgeSnapshotResponse = {
  ok?: boolean;
  knowledge?: Record<string, unknown>;
};

// Pixflow-owned: handoff preparation must never block forever on optional WP
// context probes. The bridge conversion can continue without these snapshots;
// a stalled probe should degrade the model context, not freeze the panel.
export function withPixflowTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  label: string,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(`[pixflow] ${label} timed out after ${timeoutMs}ms; continuing with fallback.`);
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        console.warn(`[pixflow] ${label} failed; continuing with fallback.`, error);
        resolve(fallback);
      });
  });
}

// Pixflow-owned: required handoff inputs should fail with a useful message
// instead of leaving the Bricks Agent panel in an endless preparing state.
function withPixflowRequiredTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  options: { onTimeout?: () => void } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      options.onTimeout?.();
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

// Pixflow-owned: Handoff to Bricks insert client. Conversion runs in the local
// bridge and the resulting Bricks JSON/sidecars are persisted to the project
// before WordPress receives them for controlled insertion.
export async function preparePixflowBricksHandoff({
  payload,
  primaryHtml,
  signal,
  onChatEvents,
  onInitialInsert,
  onLifecycleMark,
  onRunObservation,
  onLiveMutation,
  visualRepairAttempt = 0,
  visualRepairEvidence = null,
  visualRepairWorkspaceDir,
  visualRepairBaselineState,
}: {
  payload: PixflowBricksAgentSessionPayload;
  primaryHtml?: string;
  signal?: AbortSignal;
  // Pixflow-owned: explicit Handoff to Bricks can stream bridge runner events
  // into the builder panel while the isolated conversion model is running.
  onChatEvents?: (events: unknown[]) => void;
  // Pixflow-owned: baseline and final writes must reach the active Bricks
  // builder as soon as they exist so users see the canvas change during the
  // handoff instead of waiting for a black-box final response.
  onInitialInsert?: (insert: PixflowInitialHtmlInsertResult) => void;
  onLifecycleMark?: (mark: PrototypeBricksRunMark) => void;
  onRunObservation?: PixflowRunObservationRecorder;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
  visualRepairAttempt?: number;
  visualRepairEvidence?: Record<string, unknown> | null;
  visualRepairWorkspaceDir?: string;
  visualRepairBaselineState?: PixflowVisualRepairBaselineState;
}): Promise<PixflowInitialHtmlInsertResult> {
  if (isBuildInBricksHtmlFirstPayload(payload)) {
    throw new Error('Ordinary Build in Bricks must use the converter baseline handoff; the legacy Stage B handoff is compatibility-only.');
  }
  // Pixflow-owned: the iframe/bootstrap post id reflects the canvas that is open
  // now. A prepared payload can survive a site/page switch, so it is only a
  // fallback and must never redirect a live mutation to an old post.
  const postId = Number(
    getPixflowBuilderPostId()
    || payload.targetContext?.postId
    || 0,
  );
  const sourceFile = payload.sourceFile;
  const filePath = sourcePath(sourceFile);
  const scopedSectionInsert = payload.generationScope === 'section' || payload.generationScope === 'component';
  const scopedPlacementPosition = buildInBricksScopedPlacementPosition(payload.scopedPlacement);

  if (!payload.projectId) {
    throw new Error('No Pixflow project was available for the Bricks handoff.');
  }
  if (!sourceFile || !filePath) {
    throw new Error('No generated HTML file was available for the Bricks handoff.');
  }
  if (!postId) {
    throw new Error('Choose a WordPress page before handing off to Bricks.');
  }

  onLifecycleMark?.('handoff_route_context_fetch_start');
  onLifecycleMark?.('framework_preflight_start');
  const frameworkPreflightStartedAt = Date.now();
  const frameworkContext = await withPixflowTimeout(
    fetchOptionalFrameworkContext(postId),
    8000,
    fallbackFrameworkContext(),
    'Bricks handoff framework context',
  );
  const frameworkPreflightDurationMs = Date.now() - frameworkPreflightStartedAt;
  onLifecycleMark?.('framework_preflight_end');
  onLifecycleMark?.('handoff_route_context_fetch_end');
  onChatEvents?.(buildHandoffLifecycleEvents({
    stage: 'converting',
    sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
    targetLabel: payload.targetContext?.postTitle
      ? `${payload.targetContext.postTitle} (#${postId})`
      : `page #${postId}`,
  }));
  let baselineInsert = visualRepairBaselineState?.baselineInsert;
  let baselinePreviewVerified = visualRepairBaselineState?.baselinePreviewVerified === true;
  let verifiedBaselineHandoff = visualRepairBaselineState?.verifiedBaselineHandoff;
  let persistedBaselineElementIdMap: Record<string, string> = visualRepairBaselineState?.persistedBaselineElementIdMap || {};
  let persistedBaselineGlobalClassIdMap: Record<string, string> = visualRepairBaselineState?.persistedBaselineGlobalClassIdMap || {};
  let persistedBaselineGlobalClassIdByName: Record<string, string> = buildPersistedBricksGlobalClassIdByName(
    visualRepairBaselineState?.baselineInsert?.livePayload?.globalClasses || [],
  );
  let baselineInsertPromise: Promise<void> | null = null;
  const rollbackSnapshotById = async (snapshotId: string): Promise<PixflowInitialHtmlInsertResult> => {
    const response = await requestWordPressRest<PixflowInitialHtmlInsertResult>(
      'pixflow-mcp/conversion/rollback',
      {
        method: 'POST',
        body: { postId, snapshotId },
      },
    );
    const body = normalizeInitialInsertResponse(response.body, response.status);
    return {
      ...body,
      ok: response.ok && body.ok !== false,
      status: body.status || response.status,
    };
  };
  const rollbackToPreHandoffSnapshot = async (): Promise<PixflowBricksBaselineRollback> => {
    const rollbackStartedAt = Date.now();
    const snapshotId = String(baselineInsert?.insert?.rollbackSnapshot?.id || '');
    const rollback = await restorePreHandoffBricksSnapshot({
      postId,
      snapshotId,
      onLiveMutation,
      rollbackSnapshot: () => rollbackSnapshotById(snapshotId),
    });
    onRunObservation?.({
      kind: 'rollback',
      reason: 'pre_handoff_restore',
      durationMs: Date.now() - rollbackStartedAt,
      outcome: rollback.ok ? 'restored' : 'failed',
    });
    return rollback;
  };
  let conversionEnded = false;
  const markConversionEnded = () => {
    if (conversionEnded) return;
    conversionEnded = true;
    onLifecycleMark?.('conversion_end');
  };
  onLifecycleMark?.('source_validation_start');
  onLifecycleMark?.('deterministic_conversion_start');
  const deterministicConversionStartedAt = Date.now();
  onLifecycleMark?.('conversion_start');
  // Stage B is not allowed to start until the deterministic converter payload
  // has been persisted and verified in the live Bricks canvas. Build in Bricks
  // already uses this ordering; the uploaded-HTML handoff must use the same
  // gate so a failed preview can never be silently followed by a Stage B run.
  let stageBInvocationStartedAt: number | null = null;
  const startStageBInvocation = () => {
    if (stageBInvocationStartedAt !== null) return;
    onLifecycleMark?.('stage_b_started');
    onLifecycleMark?.('stage_b_invocation_start');
    stageBInvocationStartedAt = Date.now();
  };
  const stageBInvocationId = `stage-b-${visualRepairAttempt + 1}`;
  let bricksHandoff: BricksHandoffFetchResult;
  try {
    if (baselinePreviewVerified && isVerifiedBricksBaselineResult(baselineInsert)) {
      startStageBInvocation();
      onChatEvents?.(buildHandoffLifecycleEvents({
        stage: 'stage-b-running',
        baselineInserted: true,
        sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
        targetLabel: payload.targetContext?.postTitle
          ? `${payload.targetContext.postTitle} (#${postId})`
          : `page #${postId}`,
      }));
    }
    bricksHandoff = withHandoffSidecars(await fetchBricksHandoffResult(
      payload,
      sourceFile,
      filePath,
      frameworkContext,
      frameworkPreflightDurationMs,
      onRunObservation,
      signal,
      onChatEvents,
      onLifecycleMark,
      (baseline) => {
      onLifecycleMark?.('source_validation_end');
      onLifecycleMark?.('source_acceptance_passed');
      onLifecycleMark?.('deterministic_conversion_end');
      onRunObservation?.({
        kind: 'source_preparation',
        capabilities: baseline.sourceManifest?.capabilities || [
          { name: 'validation', status: 'failed', durationMs: 0 },
          { name: 'sanitization', status: 'failed', durationMs: 0 },
          { name: 'resource_materialization', status: 'failed', durationMs: 0 },
          { name: 'sandbox_settle', status: 'failed', durationMs: 0 },
          { name: 'dom_style_capture', status: 'failed', durationMs: 0 },
          { name: 'responsive_capture', status: 'failed', durationMs: 0 },
        ],
      });
      onRunObservation?.({
        kind: 'conversion',
        durationMs: Date.now() - deterministicConversionStartedAt,
        elementCount: Array.isArray(baseline.result.content) ? baseline.result.content.length : 0,
        globalClassCount: Array.isArray(baseline.result.global_classes)
          ? baseline.result.global_classes.length
          : Array.isArray(baseline.result.globalClasses) ? baseline.result.globalClasses.length : 0,
        syntheticWrapperCount: 0,
      });
      if (baselineInsertPromise || baselineInsert || signal?.aborted) return;
      baselineInsertPromise = (async () => {
        markConversionEnded();
        onLifecycleMark?.('baseline_apply_started');
        onLifecycleMark?.('baseline_persistence_start');
        const baselinePersistenceStartedAt = Date.now();
        let baselinePersistenceDurationMs = 0;
        let baselineCanvasVerificationStartedAt: number | null = null;
        onChatEvents?.(buildHandoffLifecycleEvents({
          stage: 'baseline-inserting',
          sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
          targetLabel: payload.targetContext?.postTitle
            ? `${payload.targetContext.postTitle} (#${postId})`
            : `page #${postId}`,
        }));
        onChatEvents?.([{ kind: 'text', text: 'Baseline Bricks JSON is ready. I am inserting it into the canvas now so you can see the handoff before Stage B refinement finishes.' }]);
        try {
          const baselineHandoff = withHandoffSidecars({
            result: baseline.result,
            artifacts: {
              ...baseline.artifacts,
              json: {
                ...baseline.artifacts.json,
                qa: baseline.artifacts.json.qa || buildBaselinePreviewQa(),
              },
            },
          });
          baselineInsert = await applyPreparedHandoffResult({
            payload,
            postId,
            sourceFile,
            frameworkContext,
            bricksHandoff: baselineHandoff,
            replaceExisting: !scopedSectionInsert,
            artifactStage: 'pre_stage_b_baseline_preview',
            livePreview: true,
          });
          baselinePersistenceDurationMs = Date.now() - baselinePersistenceStartedAt;
          onLifecycleMark?.('baseline_persistence_end');
          if (baselineInsert.ok === false || baselineInsert.persisted?.ok !== true) {
            throw new Error(baselineInsert.message || 'WordPress did not verify the saved Bricks baseline.');
          }
          const baselineContent = baselineInsert.livePayload?.content || [];
          const baselineClasses = baselineInsert.livePayload?.globalClasses || [];
          persistedBaselineElementIdMap = buildPersistedBricksElementIdMap(
            Array.isArray(baseline.result.content) ? baseline.result.content : [],
            baselineContent,
          );
          persistedBaselineGlobalClassIdMap = buildPersistedBricksGlobalClassIdMap(
            Array.isArray(baseline.result.global_classes) ? baseline.result.global_classes : [],
            baselineClasses,
          );
          persistedBaselineGlobalClassIdByName = buildPersistedBricksGlobalClassIdByName(baselineClasses);
          const baselineCheckpointId = `baseline-${Date.now().toString(36)}`;
          const baselinePayloadHash = await hashHandoffBundle({ content: baselineContent, globalClasses: baselineClasses });
          onLifecycleMark?.('baseline_canvas_verification_start');
          baselineCanvasVerificationStartedAt = Date.now();
          const fallbackLiveMutation = typeof window !== 'undefined'
            ? (window as typeof window & {
                pixflowDesignBricks?: {
                  applyLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck;
                };
              }).pixflowDesignBricks?.applyLiveMutation
            : undefined;
          const liveMutationHandler = onLiveMutation || fallbackLiveMutation;
          const liveAck = baselineInsert.livePayload && liveMutationHandler
            ? await liveMutationHandler({
              operation: scopedSectionInsert ? 'insert' : 'set',
              postId,
              elements: baselineContent,
              globalClasses: baselineClasses,
              replaceExisting: !scopedSectionInsert,
              position: scopedPlacementPosition,
              focusCanvas: false,
              refreshCanvas: !scopedSectionInsert
                && fullPageBricksMutationRequiresCanvasRefresh({ operation: 'set', replaceExisting: true }),
              phase: 'pre_stage_b_baseline_preview',
              checkpointId: baselineCheckpointId,
              payloadHash: baselinePayloadHash,
              expectedElementIds: elementIds(baselineContent),
              expectedGlobalClassIds: elementIds(baselineClasses),
              sequence: 0,
            })
            : undefined;
          if (!liveAck || liveAck.ok !== true || liveAck.status !== 'applied_verified') {
            throw new Error(`The Bricks canvas did not verify the baseline preview${liveAck?.message ? `: ${liveAck.message}` : '.'}`);
          }
          if (!scopedSectionInsert && (liveAck.observed.elementCount !== baselineContent.length
            || liveAck.observed.globalClassCount !== baselineClasses.length)) {
            throw new Error('The Bricks canvas baseline verification counts did not match the prepared payload.');
          }
          verifiedBaselineHandoff = baselineHandoff;
          baselinePreviewVerified = true;
          onLifecycleMark?.('baseline_canvas_verification_end');
          onLifecycleMark?.('baseline_apply_finished');
          onRunObservation?.({
            kind: 'apply',
            stage: 'baseline',
            persistenceDurationMs: baselinePersistenceDurationMs,
            liveCanvasVerificationDurationMs: baselineCanvasVerificationStartedAt === null
              ? 0
              : Date.now() - baselineCanvasVerificationStartedAt,
            outcome: 'verified',
          });
          onInitialInsert?.(baselineInsert);
          onChatEvents?.([
            {
              kind: 'text',
              text: 'Baseline preview is saved and visible in the Bricks canvas. Stage B is now certifying the compiled payload; the selected model will run only if a concrete repair is required.',
            },
            ...(payload.scopedPlacement?.warning
              ? [{ kind: 'text', text: payload.scopedPlacement.warning }]
              : []),
          ]);
          startStageBInvocation();
          onChatEvents?.(buildHandoffLifecycleEvents({
            stage: 'stage-b-running',
            baselineInserted: true,
            sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
            targetLabel: payload.targetContext?.postTitle
              ? `${payload.targetContext.postTitle} (#${postId})`
              : `page #${postId}`,
          }));
        } catch (error) {
          if (baselinePersistenceDurationMs === 0) {
            baselinePersistenceDurationMs = Date.now() - baselinePersistenceStartedAt;
            onLifecycleMark?.('baseline_persistence_end');
          }
          if (baselineCanvasVerificationStartedAt !== null) {
            onLifecycleMark?.('baseline_canvas_verification_end');
          }
          onRunObservation?.({
            kind: 'apply',
            stage: 'baseline',
            persistenceDurationMs: baselinePersistenceDurationMs,
            liveCanvasVerificationDurationMs: baselineCanvasVerificationStartedAt === null
              ? 0
              : Date.now() - baselineCanvasVerificationStartedAt,
            outcome: 'failed',
          });
          onChatEvents?.([{
            kind: 'text',
            text: `Baseline preview insert could not be applied: ${safeBricksHandoffErrorMessage(error)} Stage B was not started.`,
          }]);
          throw error;
        }
      })();
      return baselineInsertPromise;
      },
      async (mutation) => {
        if (!onLiveMutation) return;
        if (!shouldStreamStageBMutationToLiveCanvas(payload.generationScope, baselinePreviewVerified)) return;
        if (baselineInsertPromise) await baselineInsertPromise;
        if (!shouldStreamStageBMutationToLiveCanvas(payload.generationScope, baselinePreviewVerified)) return;
        const batch = translateStageBMutationBatchIds(
          mutation as unknown as PixflowBricksMutationBatch,
          persistedBaselineElementIdMap,
          persistedBaselineGlobalClassIdMap,
          persistedBaselineGlobalClassIdByName,
        );
        onChatEvents?.(buildStageBMutationTimelineEvents(batch, 'started'));
        try {
          const ack = await onLiveMutation({
            ...batch,
            operation: 'events',
            postId,
            focusCanvas: false,
            phase: 'stage_b_mutation',
          });
          const checkpointFailure = describeStageBMutationCheckpointFailure(batch, ack);
          if (checkpointFailure) {
            onChatEvents?.(buildStageBMutationTimelineEvents(
              batch,
              'failed',
              `${checkpointFailure}. Continuing to the mandatory atomic final apply and verification.`,
            ));
            onChatEvents?.([{
              kind: 'text',
              text: `${checkpointFailure}. Continuing to the mandatory atomic final apply and verification.`,
            }]);
          } else {
            onChatEvents?.(buildStageBMutationTimelineEvents(batch, 'verified'));
          }
        } catch (error) {
          const failure = `Stage B live preview could not be verified: ${safeBricksHandoffErrorMessage(error)}. Continuing to the mandatory atomic final apply and verification.`;
          onChatEvents?.(buildStageBMutationTimelineEvents(batch, 'failed', failure));
          onChatEvents?.([{
            kind: 'text',
            text: failure,
          }]);
        }
      },
      visualRepairEvidence,
      visualRepairWorkspaceDir,
      primaryHtml,
    ));
    if (!baselinePreviewVerified || !isVerifiedBricksBaselineResult(baselineInsert)) {
      throw new Error('The converted Bricks baseline was not verified in the canvas before Stage B.');
    }
    onLifecycleMark?.('stage_b_invocation_end');
    onRunObservation?.({
      kind: 'stage_b',
      invocationId: stageBInvocationId,
      modelInvocationCount: Math.max(0, Number(bricksHandoff.summary?.modelInvocationCount ?? 1)),
      runner: payload.session.runnerId,
      durationMs: Date.now() - (stageBInvocationStartedAt || Date.now()),
      disposition: 'applied',
    });
    markConversionEnded();
    onLifecycleMark?.('stage_b_finished');
  } catch (error) {
    if (stageBInvocationStartedAt !== null) {
      onLifecycleMark?.('stage_b_invocation_end');
      onRunObservation?.({
        kind: 'stage_b',
        invocationId: stageBInvocationId,
        runner: payload.session.runnerId,
        durationMs: Date.now() - stageBInvocationStartedAt,
        disposition: signal?.aborted ? 'cancelled' : 'failed',
      });
    }
    markConversionEnded();
    if (baselineInsertPromise) {
      await baselineInsertPromise;
    }
    if (baselinePreviewVerified && isVerifiedBricksBaselineResult(baselineInsert)) {
      const message = safeBricksHandoffErrorMessage(error);
      return keepVerifiedBricksBaselineWithWarning(baselineInsert, message);
    }
    throw error;
  }
  if (baselineInsertPromise) {
    await baselineInsertPromise;
  }
  let preparedFinal: PixflowInitialHtmlInsertResult | undefined;
  const rollbackRejectedFinal = async (): Promise<PixflowBricksBaselineRollback> => {
    const rollbackStartedAt = Date.now();
    const snapshotId = String(preparedFinal?.insert?.rollbackSnapshot?.id || '');
    if (!baselinePreviewVerified || !snapshotId) {
      const unavailable: PixflowBricksBaselineRollback = {
        attempted: true,
        ok: false,
        checkpointId: null,
        persisted: false,
        canvasVerified: false,
        message: 'No Stage B to baseline rollback snapshot was available.',
      };
      onRunObservation?.({
        kind: 'rollback',
        reason: 'stage_b_to_baseline',
        durationMs: Date.now() - rollbackStartedAt,
        outcome: 'failed',
      });
      return unavailable;
    }
    const rollback = await restorePreHandoffBricksSnapshot({
      postId,
      snapshotId,
      onLiveMutation,
      rollbackSnapshot: () => rollbackSnapshotById(snapshotId),
      phase: 'stage_b_to_baseline_rollback',
    });
    onRunObservation?.({
      kind: 'rollback',
      reason: 'stage_b_to_baseline',
      durationMs: Date.now() - rollbackStartedAt,
      outcome: rollback.ok ? 'restored' : 'failed',
    });
    return rollback;
  };
  const qa = evaluateHandoffQa(bricksHandoff.artifacts.json.qa ?? (bricksHandoff.result as { stage_b_qa?: unknown }).stage_b_qa);
  if (!qa.ok) {
    if (baselinePreviewVerified && isVerifiedBricksBaselineResult(baselineInsert)) {
      return keepVerifiedBricksBaselineWithWarning(baselineInsert, qa.message);
    }
    return {
      ok: false,
      code: 'bricks_handoff_qa_failed',
      message: qa.message,
      postId,
      area: 'content',
      operation: 'prepare',
      replaceExisting: false,
      status: 422,
      handoffArtifacts: baselineInsert?.handoffArtifacts || { handoffId: '', files: [] },
      applyRequest: baselineInsert?.applyRequest || {},
      handoffChatEvents: Array.isArray(bricksHandoff.artifacts.json.runnerEvents)
        ? bricksHandoff.artifacts.json.runnerEvents
        : [],
      baselineInsert,
      summary: {
        sourceFile: sourceFile.path || sourceFile.name,
        source: 'bricks_handoff_preparation',
        warnings: qa.warnings,
      },
    };
  }
  onLifecycleMark?.('final_apply_started');
  const finalPersistenceStartedAt = Date.now();
  let finalPersistenceDurationMs = 0;
  try {
    preparedFinal = await applyPreparedHandoffResult({
      payload,
      postId,
      sourceFile,
      frameworkContext,
      bricksHandoff,
      replaceExisting: !scopedSectionInsert,
      artifactStage: 'stage_b_final',
      replaceElementIds: scopedSectionInsert ? baselineInsert?.changedIds?.elementIds : undefined,
      replaceGlobalClassIds: scopedSectionInsert ? baselineInsert?.changedIds?.globalClassIds : undefined,
    });
    finalPersistenceDurationMs = Date.now() - finalPersistenceStartedAt;
  } catch (error) {
    finalPersistenceDurationMs = Date.now() - finalPersistenceStartedAt;
    onRunObservation?.({
      kind: 'apply',
      stage: 'final',
      persistenceDurationMs: finalPersistenceDurationMs,
      liveCanvasVerificationDurationMs: 0,
      outcome: 'failed',
    });
    if (baselinePreviewVerified && isVerifiedBricksBaselineResult(baselineInsert)) {
      return keepVerifiedBricksBaselineWithWarning(
        baselineInsert,
        `Optional cleanup could not be applied: ${safeBricksHandoffErrorMessage(error)}`,
      );
    }
    const rollback = await rollbackToPreHandoffSnapshot();
    const failedApply: PixflowInitialHtmlInsertResult = {
      ok: false,
      code: 'bricks_handoff_apply_failed',
      message: `The final Stage B apply failed: ${safeBricksHandoffErrorMessage(error)} ${rollback.message}`,
      postId,
      area: 'content',
      operation: 'apply',
      replaceExisting: true,
      status: 500,
      handoffArtifacts: baselineInsert?.handoffArtifacts || { handoffId: '', files: [] },
      applyRequest: baselineInsert?.applyRequest || {},
      handoffChatEvents: Array.isArray(bricksHandoff.artifacts.json.runnerEvents)
        ? bricksHandoff.artifacts.json.runnerEvents
        : [],
      baselineInsert,
      rollback,
    };
    onInitialInsert?.(failedApply);
    return failedApply;
  }
  if (!preparedFinal) {
    if (baselinePreviewVerified && isVerifiedBricksBaselineResult(baselineInsert)) {
      return keepVerifiedBricksBaselineWithWarning(
        baselineInsert,
        'Optional cleanup finished without an applyable Bricks result.',
      );
    }
    throw new Error('Stage B finished without an applyable Bricks result.');
  }
  onLifecycleMark?.('final_apply_finished');
  const handoffArtifacts = preparedFinal.handoffArtifacts || { handoffId: '', files: [] };
  const applyRequest = preparedFinal.applyRequest || {};
  const chatEvents = Array.isArray(bricksHandoff.artifacts.json.runnerEvents)
    ? bricksHandoff.artifacts.json.runnerEvents
    : [];
  if (preparedFinal.ok === false) {
    onRunObservation?.({
      kind: 'apply',
      stage: 'final',
      persistenceDurationMs: finalPersistenceDurationMs,
      liveCanvasVerificationDurationMs: 0,
      outcome: 'failed',
    });
    const rollback = await rollbackRejectedFinal();
    if (rollback.ok && isVerifiedBricksBaselineResult(baselineInsert)) {
      return keepVerifiedBricksBaselineWithWarning(
        baselineInsert,
        preparedFinal.message || 'Optional cleanup returned an invalid Bricks payload.',
      );
    }
    const failedApply: PixflowInitialHtmlInsertResult = {
      ...preparedFinal,
      ok: false,
      code: preparedFinal.code || 'bricks_handoff_apply_failed',
      message: `${preparedFinal.message || 'Bricks handoff apply failed after conversion.'} ${rollback.message}`,
      postId,
      area: preparedFinal.area || 'content',
      operation: preparedFinal.operation || 'apply',
      replaceExisting: true,
      status: preparedFinal.status || 500,
      handoffArtifacts,
      applyRequest,
      handoffChatEvents: chatEvents,
      baselineInsert,
      rollback,
    };
    onInitialInsert?.(failedApply);
    return failedApply;
  }

  const finalCanvasVerificationStartedAt = Date.now();
  try {
    if (preparedFinal.persisted?.ok !== true || preparedFinal.persisted.contentMatches !== true) {
      throw new Error('The final Bricks payload was applied, but server persistence verification did not succeed.');
    }
    const finalContent = preparedFinal.livePayload?.content || [];
    const finalClasses = preparedFinal.livePayload?.globalClasses || [];
    if (onLiveMutation && preparedFinal.livePayload) {
      const finalSplitTemplatesApplied = [preparedFinal.header, preparedFinal.footer].some((area) => (
        Boolean(area && area.skipped !== true && Number(area.templateId || 0) > 0)
      ));
      const finalCheckpointId = `final-${Date.now().toString(36)}`;
      const finalPayloadHash = await hashHandoffBundle({ content: finalContent, globalClasses: finalClasses });
      const liveAck = await onLiveMutation({
        operation: 'set',
        postId,
        elements: finalContent,
        globalClasses: finalClasses,
        replaceExisting: true,
        focusCanvas: false,
        refreshCanvas: finalSplitTemplatesApplied
          || fullPageBricksMutationRequiresCanvasRefresh({ operation: 'set', replaceExisting: true }),
        phase: 'stage_b_final',
        checkpointId: finalCheckpointId,
        payloadHash: finalPayloadHash,
        expectedElementIds: elementIds(finalContent),
        expectedGlobalClassIds: elementIds(finalClasses),
        sequence: Number.MAX_SAFE_INTEGER,
      });
      if (!liveAck || liveAck.ok !== true || liveAck.status !== 'applied_verified') {
        throw new Error(`The Bricks canvas did not verify the final Stage B payload${liveAck?.message ? `: ${liveAck.message}` : '.'}`);
      }
      if (liveAck.observed.elementCount !== finalContent.length
        || liveAck.observed.globalClassCount !== finalClasses.length) {
        throw new Error('The Bricks canvas final verification counts did not match the saved Stage B payload.');
      }
    }
  } catch (error) {
    onRunObservation?.({
      kind: 'apply',
      stage: 'final',
      persistenceDurationMs: finalPersistenceDurationMs,
      liveCanvasVerificationDurationMs: Date.now() - finalCanvasVerificationStartedAt,
      outcome: 'failed',
    });
    const rollback = await rollbackRejectedFinal();
    if (rollback.ok && isVerifiedBricksBaselineResult(baselineInsert)) {
      return keepVerifiedBricksBaselineWithWarning(
        baselineInsert,
        `Optional cleanup could not be verified: ${safeBricksHandoffErrorMessage(error)}`,
      );
    }
    const failedVerification: PixflowInitialHtmlInsertResult = {
      ...preparedFinal,
      ok: false,
      code: 'bricks_handoff_final_verification_failed',
      message: `${safeBricksHandoffErrorMessage(error)} ${rollback.message}`,
      status: 422,
      handoffArtifacts,
      applyRequest,
      handoffChatEvents: chatEvents,
      baselineInsert,
      rollback,
    };
    onInitialInsert?.(failedVerification);
    return failedVerification;
  }
  onRunObservation?.({
    kind: 'apply',
    stage: 'final',
    persistenceDurationMs: finalPersistenceDurationMs,
    liveCanvasVerificationDurationMs: Date.now() - finalCanvasVerificationStartedAt,
    outcome: 'verified',
  });

  const visualVerification = await captureFinalBricksFrontendEvidence({
    projectId: payload.projectId,
    frontendUrl: preparedFinal.frontendUrl || null,
    sourcePath: filePath,
    stageAScreenshots: (isBuildInBricksHtmlFirstPayload(payload)
      ? payload.buildEvidence?.screenshots
      : payload.stageAEvidence?.screenshots) || [],
    resultSignature: bricksHandoff.resultSignature,
    sourceFidelityClone: getPixflowBricksAgentSource(payload)?.sourceFidelityClone === true,
    scopedSectionInsert,
    onLifecycleMark,
    onRunObservation,
  });
  const visualDisposition = resolveFinalBricksVisualDisposition({
    verification: visualVerification,
    visualRepairAttempt,
  });
  if (visualDisposition === 'keep_with_warning') {
    const captureFailure = String(visualVerification.errors[0] || '').trim().replace(/[.\s]+$/, '');
    const warning = visualVerification.ok
      ? 'The Bricks page was applied and kept, but its final render did not meet the automated desktop/mobile parity target. Review the result in Bricks and use Undo if you do not want to keep it.'
      : `The Bricks page was applied and kept, but final visual verification could not complete${captureFailure ? ` (${captureFailure})` : ''}. Review the result in Bricks and use Undo if you do not want to keep it.`;
    const keptWithWarning: PixflowInitialHtmlInsertResult = {
      ...preparedFinal,
      ok: true,
      code: 'bricks_handoff_applied_with_visual_warning',
      terminalCode: 'html_to_bricks_applied_with_warning',
      terminalClass: 'warning_success',
      message: warning,
      operation: preparedFinal.operation || 'set',
      replaceExisting: preparedFinal.replaceExisting !== false,
      status: 200,
      handoffArtifacts: preparedFinal.handoffArtifacts || handoffArtifacts,
      applyRequest,
      handoffChatEvents: chatEvents,
      baselineInsert,
      visualVerification,
      summary: {
        ...preparedFinal.summary,
        warnings: [...(preparedFinal.summary?.warnings || []), ...qa.warnings, warning],
      },
    };
    onInitialInsert?.(keptWithWarning);
    return keptWithWarning;
  }
  const appliedResult: PixflowInitialHtmlInsertResult = {
    ...preparedFinal,
    code: preparedFinal.code || 'bricks_handoff_applied',
    terminalCode: 'html_to_bricks_applied',
    terminalClass: 'clean_success',
    message: preparedFinal.message || 'Bricks handoff applied to the selected Bricks page.',
    operation: preparedFinal.operation || 'set',
    replaceExisting: preparedFinal.replaceExisting !== false,
    status: preparedFinal.status || 200,
    handoffArtifacts: preparedFinal.handoffArtifacts || handoffArtifacts,
    applyRequest,
    handoffChatEvents: chatEvents,
    baselineInsert,
    visualVerification,
    summary: {
      ...preparedFinal.summary,
      warnings: [...(preparedFinal.summary?.warnings || []), ...qa.warnings],
    },
  };
  onInitialInsert?.(appliedResult);
  return appliedResult;
}

// Pixflow-owned: ordinary Build in Bricks ends after deterministic conversion,
// a verified builder insert, and post-conversion diagnostics. There is no
// second model stage in this pipeline.
export async function preparePixflowBricksBaselineHandoff({
  payload,
  primaryHtml,
  signal,
  onChatEvents,
  onInitialInsert,
  onLifecycleMark,
  onRunObservation,
  onLiveMutation,
}: {
  payload: PixflowBricksAgentSessionPayload;
  primaryHtml?: string;
  signal?: AbortSignal;
  onChatEvents?: (events: unknown[]) => void;
  onInitialInsert?: (insert: PixflowInitialHtmlInsertResult) => void;
  onLifecycleMark?: (mark: PrototypeBricksRunMark) => void;
  onRunObservation?: PixflowRunObservationRecorder;
  onLiveMutation?: (mutation: Record<string, unknown>) => Promise<PixflowBricksMutationAck> | PixflowBricksMutationAck | void;
}): Promise<PixflowInitialHtmlInsertResult> {
  const postId = Number(getPixflowBuilderPostId() || payload.targetContext?.postId || 0);
  const sourceFile = payload.sourceFile;
  const filePath = sourcePath(sourceFile);
  const scopedOwnership = resolveBuildInBricksScopedMutationOwnership(payload);
  const { scopedInsert, retainedScopedReplacement } = scopedOwnership;

  if (!payload.projectId) throw new Error('No Pixflow project was available for the Bricks conversion.');
  if (!sourceFile || !filePath) throw new Error('No generated HTML file was available for the Bricks conversion.');
  if (!postId) throw new Error('Choose a WordPress page before converting the HTML to Bricks.');

  onLifecycleMark?.('handoff_route_context_fetch_start');
  onLifecycleMark?.('framework_preflight_start');
  const frameworkPreflightStartedAt = Date.now();
  const frameworkContext = await withPixflowTimeout(
    fetchOptionalFrameworkContext(postId),
    8000,
    fallbackFrameworkContext(),
    'Bricks converter framework context',
  );
  const frameworkPreflightDurationMs = Date.now() - frameworkPreflightStartedAt;
  onLifecycleMark?.('framework_preflight_end');
  onLifecycleMark?.('handoff_route_context_fetch_end');
  const themeStyleSnapshot = validateBuildInBricksThemeStyleSnapshot(payload, frameworkContext);
  if (!themeStyleSnapshot.ok) {
    const failed: PixflowInitialHtmlInsertResult = {
      ok: false,
      code: themeStyleSnapshot.code,
      message: themeStyleSnapshot.message,
      postId,
      area: 'content',
      operation: 'prepare',
      replaceExisting: false,
      status: 409,
    };
    onInitialInsert?.(failed);
    return failed;
  }
  onLifecycleMark?.('source_validation_start');
  onLifecycleMark?.('deterministic_conversion_start');
  const conversionStartedAt = Date.now();
  onLifecycleMark?.('conversion_start');
  onChatEvents?.(buildHandoffLifecycleEvents({
    stage: 'converting',
    includeRefinement: false,
    sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
    targetLabel: payload.targetContext?.postTitle
      ? `${payload.targetContext.postTitle} (#${postId})`
      : `page #${postId}`,
  }));

  const baseline = withHandoffSidecars(await fetchBricksHandoffBaseline(
    payload,
    sourceFile,
    filePath,
    frameworkContext,
    frameworkPreflightDurationMs,
    onRunObservation,
    onLifecycleMark,
    signal,
    onChatEvents,
    primaryHtml,
  ));
  onLifecycleMark?.('source_validation_end');
  onLifecycleMark?.('source_acceptance_passed');
  const conversionDurationMs = Date.now() - conversionStartedAt;
  onLifecycleMark?.('deterministic_conversion_end');
  onLifecycleMark?.('conversion_end');
  onRunObservation?.({
    kind: 'source_preparation',
    capabilities: [
      { name: 'validation', status: 'completed', durationMs: 0 },
      { name: 'sanitization', status: 'unavailable', durationMs: 0 },
      { name: 'resource_materialization', status: 'unavailable', durationMs: 0 },
      { name: 'sandbox_settle', status: 'unavailable', durationMs: 0 },
      { name: 'dom_style_capture', status: 'unavailable', durationMs: 0 },
      { name: 'responsive_capture', status: 'unavailable', durationMs: 0 },
    ],
  });
  onRunObservation?.({
    kind: 'conversion',
    durationMs: conversionDurationMs,
    elementCount: Array.isArray(baseline.result.content) ? baseline.result.content.length : 0,
    globalClassCount: Array.isArray(baseline.result.global_classes)
      ? baseline.result.global_classes.length
      : Array.isArray(baseline.result.globalClasses) ? baseline.result.globalClasses.length : 0,
    syntheticWrapperCount: 0,
  });
  onLifecycleMark?.('baseline_apply_started');
  onLifecycleMark?.('baseline_persistence_start');
  const baselinePersistenceStartedAt = Date.now();

  const prepared = await applyPreparedHandoffResult({
    payload,
    postId,
    sourceFile,
    frameworkContext,
    bricksHandoff: baseline,
    replaceExisting: scopedOwnership.replaceExisting,
    replaceElementIds: scopedOwnership.replaceElementIds,
    replaceGlobalClassIds: scopedOwnership.replaceGlobalClassIds,
    artifactStage: 'converter_baseline_final',
  });
  const baselinePersistenceDurationMs = Date.now() - baselinePersistenceStartedAt;
  onLifecycleMark?.('baseline_persistence_end');
  const persistedVerified = prepared.persisted?.ok === true
    && prepared.persisted.contentMatches === true;
  if (prepared.ok === false || !persistedVerified) {
    onRunObservation?.({
      kind: 'apply',
      stage: 'baseline',
      persistenceDurationMs: baselinePersistenceDurationMs,
      liveCanvasVerificationDurationMs: 0,
      outcome: 'failed',
    });
    const failed = {
      ...prepared,
      ok: false,
      code: prepared.code || 'bricks_converter_persistence_verification_failed',
      message: prepared.message
        || 'The converted Bricks content could not be verified after saving.',
      status: prepared.status || 422,
    };
    onInitialInsert?.(failed);
    return failed;
  }

  let baselineCanvasVerificationDurationMs = 0;
  if (prepared.livePayload && onLiveMutation) {
    onLifecycleMark?.('baseline_canvas_verification_start');
    const baselineCanvasVerificationStartedAt = Date.now();
    const content = prepared.livePayload.content || prepared.livePayload.elements || [];
    const globalClasses = prepared.livePayload.globalClasses || [];
    const checkpointId = `converter-${Date.now().toString(36)}`;
    const payloadHash = await hashHandoffBundle({ content, globalClasses });
    const liveAck = await onLiveMutation({
      operation: scopedOwnership.liveOperation,
      postId,
      elements: content,
      globalClasses,
      replaceExisting: !scopedInsert,
      position: retainedScopedReplacement
        ? { mode: 'append' }
        : buildInBricksScopedPlacementPosition(payload.scopedPlacement),
      focusCanvas: false,
      refreshCanvas: !scopedInsert
        && fullPageBricksMutationRequiresCanvasRefresh({ operation: 'set', replaceExisting: true }),
      phase: 'converter_baseline_final',
      checkpointId,
      payloadHash,
      expectedElementIds: elementIds(content),
      expectedGlobalClassIds: elementIds(globalClasses),
      sequence: 0,
    });
    if (!liveAck || liveAck.ok !== true || liveAck.status !== 'applied_verified') {
      baselineCanvasVerificationDurationMs = Date.now() - baselineCanvasVerificationStartedAt;
      onLifecycleMark?.('baseline_canvas_verification_end');
      onRunObservation?.({
        kind: 'apply',
        stage: 'baseline',
        persistenceDurationMs: baselinePersistenceDurationMs,
        liveCanvasVerificationDurationMs: baselineCanvasVerificationDurationMs,
        outcome: 'failed',
      });
      const failed = {
        ...prepared,
        ok: false,
        code: 'bricks_converter_canvas_verification_failed',
        message: `The converted Bricks content was saved, but the open canvas did not verify it${liveAck?.message ? `: ${liveAck.message}` : '.'}`,
        status: 422,
      };
      onInitialInsert?.(failed);
      return failed;
    }
    if (!liveBricksBaselineCountsMatch({
      scopedInsert,
      ack: liveAck,
      expectedElementCount: content.length,
      expectedGlobalClassCount: globalClasses.length,
    })) {
      baselineCanvasVerificationDurationMs = Date.now() - baselineCanvasVerificationStartedAt;
      onLifecycleMark?.('baseline_canvas_verification_end');
      onRunObservation?.({
        kind: 'apply',
        stage: 'baseline',
        persistenceDurationMs: baselinePersistenceDurationMs,
        liveCanvasVerificationDurationMs: baselineCanvasVerificationDurationMs,
        outcome: 'failed',
      });
      const failed = {
        ...prepared,
        ok: false,
        code: 'bricks_converter_canvas_count_mismatch',
        message: 'The converted Bricks content was saved, but the live canvas verification counts did not match it.',
        status: 422,
      };
      onInitialInsert?.(failed);
      return failed;
    }
    baselineCanvasVerificationDurationMs = Date.now() - baselineCanvasVerificationStartedAt;
    onLifecycleMark?.('baseline_canvas_verification_end');
  }

  onLifecycleMark?.('baseline_apply_finished');
  onRunObservation?.({
    kind: 'apply',
    stage: 'baseline',
    persistenceDurationMs: baselinePersistenceDurationMs,
    liveCanvasVerificationDurationMs: baselineCanvasVerificationDurationMs,
    outcome: 'verified',
  });
  const result: PixflowInitialHtmlInsertResult = {
    ...prepared,
    ok: true,
    code: prepared.code || 'bricks_converter_baseline_applied',
    refinementWorkspaceDir: baseline.workspaceDir,
    message: prepared.message
      || 'Converted HTML was inserted into Bricks. Post-conversion QA remains available as diagnostics.',
    handoffChatEvents: Array.isArray(baseline.artifacts.json.runnerEvents)
      ? baseline.artifacts.json.runnerEvents
      : [],
    summary: {
      ...prepared.summary,
      warnings: Array.from(new Set([
        ...(prepared.summary?.warnings || []),
        ...(prepared.qaAssessment?.warnings || []),
      ])),
    },
  };
  onChatEvents?.([{
    kind: 'text',
    text: 'The converted result is saved and visible in Bricks. Execution completed; any post-conversion QA findings remain available as diagnostics.',
  }]);
  onInitialInsert?.(result);
  return result;
}

async function captureFinalBricksFrontendEvidence({
  projectId,
  frontendUrl,
  sourcePath,
  stageAScreenshots,
  resultSignature,
  sourceFidelityClone,
  scopedSectionInsert,
  onLifecycleMark,
  onRunObservation,
}: {
  projectId: string;
  frontendUrl: string | null;
  sourcePath: string;
  stageAScreenshots: string[];
  resultSignature?: BricksResultSignature;
  sourceFidelityClone: boolean;
  scopedSectionInsert: boolean;
  onLifecycleMark?: (mark: PrototypeBricksRunMark) => void;
  onRunObservation?: PixflowRunObservationRecorder;
}): Promise<NonNullable<PixflowInitialHtmlInsertResult['visualVerification']>> {
  const cleanUrl = String(frontendUrl || '').trim();
  if (!cleanUrl) {
    return {
      ok: false,
      frontendUrl: null,
      screenshots: [],
      report: null,
      qualityPassed: null,
      errors: ['WordPress did not return a frontend URL for post-Stage-B capture.'],
    };
  }
  const finalCanvasVerificationStartedAt = Date.now();
  try {
    onLifecycleMark?.('visual_settle_start');
    onLifecycleMark?.('visual_capture_start');
    onLifecycleMark?.('visual_comparison_start');
    const referenceUrls = scopedSectionInsert ? [] : stageAScreenshots.map((screenshotPath) => {
      const rawUrl = projectRawUrl(projectId, screenshotPath);
      const url = typeof window !== 'undefined' ? new URL(rawUrl, window.location.origin).toString() : rawUrl;
      return {
        viewport: /mobile/i.test(screenshotPath) ? 'mobile' : 'desktop',
        url,
      };
    });
    const rawSourceUrl = projectRawUrl(projectId, sourcePath);
    const fidelityReferenceUrl = scopedSectionInsert
      ? ''
      : typeof window !== 'undefined'
        ? new URL(rawSourceUrl, window.location.origin).toString()
        : rawSourceUrl;
    const selectedViewports = selectFinalBricksVisualViewports(stageAScreenshots);
    const response = await fetch(toPixflowRuntimeUrl('/api/pixflow/visual-capture'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: cleanUrl,
        viewports: selectedViewports,
        references: referenceUrls,
        ...(fidelityReferenceUrl ? { fidelityReferenceUrl } : {}),
        waitMs: BRICKS_FRONTEND_VISUAL_SETTLE_MS,
      }),
    });
    const payload = await response.json().catch(() => null) as PixflowVisualCaptureResponse | null;
    onLifecycleMark?.('visual_settle_end');
    onLifecycleMark?.('visual_capture_end');
    onLifecycleMark?.('visual_comparison_end');
    const screenshotFiles: string[] = [];
    if (payload?.captures) {
      for (const capture of payload.captures) {
        const screenshotPath = `stage-b/screenshots/frontend-${capture.viewport}.png`;
        const file = await writeProjectBase64File(projectId, screenshotPath, capture.base64);
        if (file) screenshotFiles.push(file.path || file.name);
      }
    }
    const ok = screenshotFiles.length === selectedViewports.length;
    const evaluated = evaluateFinalBricksVisualQuality({
      captureComplete: ok,
      captures: payload?.captures || [],
      sourceFidelityClone,
    });
    const {
      pixelPassed,
      fidelityPassed,
      pixelExactOverridePassed,
      qualityPassed,
    } = scopedSectionInsert
      ? {
          pixelPassed: null,
          fidelityPassed: null,
          pixelExactOverridePassed: null,
          qualityPassed: ok,
        }
      : evaluated;
    const reportPath = 'stage-b/reports/frontend-visual-evidence.json';
    const repairIssues = (payload?.captures || [])
      .filter((capture) => capture.comparison?.passed !== true || capture.fidelity?.passed !== true)
      .map((capture) => ({
        viewport: capture.viewport,
        message: [
          `pixel difference ratio ${Number(capture.comparison?.differenceRatio || 0).toFixed(4)} (passed: ${capture.comparison?.passed === true})`,
          `match coverage ${Number(capture.fidelity?.matchCoverage || 0).toFixed(4)}`,
          `geometry ${Number(capture.fidelity?.geometryScore || 0).toFixed(4)}`,
          `computed-style ${Number(capture.fidelity?.styleScore || 0).toFixed(4)}`,
          `overall ${Number(capture.fidelity?.overallScore || 0).toFixed(4)}`,
          `top mismatches: ${(capture.fidelity?.mismatches || []).slice(0, 12).map((mismatch) => mismatch.label).join(', ') || 'none recorded'}`,
        ].join('; '),
      }));
    const repairEvidence: Record<string, unknown> = {
      schema: 'pixflow.prototype_bricks.visual_repair_evidence.v1',
      status: qualityPassed ? 'passed' : 'failed',
      createdAt: new Date().toISOString(),
      frontendUrl: cleanUrl,
      stageAScreenshots,
      finalScreenshots: screenshotFiles,
      ...(resultSignature ? { resultSignature } : {}),
      issues: repairIssues,
      captures: payload?.captures?.map((capture) => ({
        viewport: capture.viewport,
        width: capture.width,
        height: capture.height,
        sha256: capture.sha256,
        path: `stage-b/screenshots/frontend-${capture.viewport}.png`,
        comparison: capture.comparison || null,
        fidelity: capture.fidelity || null,
      })) || [],
      captureComplete: ok,
      critiqueSource: scopedSectionInsert
        ? 'deterministic_contextual_section_frontend_capture'
        : 'deterministic_pixel_dom_geometry_computed_style',
      pixelPassed,
      fidelityPassed,
      pixelExactOverridePassed,
      qualityPassed,
      errors: payload?.errors || [],
    };
    const reportFile = await writeProjectTextFile(
      projectId,
      reportPath,
      `${JSON.stringify(buildFinalBricksVisualEvidence(repairEvidence, resultSignature), null, 2)}\n`,
    );
    onRunObservation?.({
      kind: 'visual',
      captureCount: screenshotFiles.length,
      settleDurationMs: payload?.timings?.settleDurationMs ?? BRICKS_FRONTEND_VISUAL_SETTLE_MS,
      captureDurationMs: payload?.timings?.captureDurationMs ?? 0,
      comparisonDurationMs: payload?.timings?.comparisonDurationMs ?? 0,
      evidencePaths: [reportFile?.path || reportFile?.name || reportPath],
    });
    return {
      ok,
      frontendUrl: cleanUrl,
      screenshots: screenshotFiles,
      report: reportFile?.path || reportFile?.name || reportPath,
      qualityPassed,
      pixelPassed,
      fidelityPassed,
      pixelExactOverridePassed,
      repairEvidence,
        errors: payload?.errors || (ok ? [] : ['All required desktop, Bricks base-width, and mobile frontend captures did not complete.']),
    };
  } catch (error) {
    return {
      ok: false,
      frontendUrl: cleanUrl,
      screenshots: [],
      report: null,
      qualityPassed: null,
      errors: [safeBricksHandoffErrorMessage(error)],
    };
  }
}

function buildHandoffLifecycleEvents({
  stage,
  baselineInserted = false,
  includeRefinement = true,
  sourceLabel,
  targetLabel,
}: {
  stage: 'reading-source' | 'converting' | 'baseline-inserting' | 'stage-b-running';
  baselineInserted?: boolean;
  includeRefinement?: boolean;
  sourceLabel: string;
  targetLabel: string;
}): unknown[] {
  const plan = [
    {
      step: `Read ${sourceLabel}`,
      status: stage === 'reading-source' ? 'in_progress' : 'completed',
    },
    {
      step: 'Convert HTML into baseline Bricks JSON',
      status: stage === 'converting' ? 'in_progress' : 'completed',
    },
    {
      step: `Insert the baseline into ${targetLabel}`,
      status: stage === 'baseline-inserting'
        ? 'in_progress'
        : stage === 'stage-b-running' && baselineInserted
          ? 'completed'
          : 'pending',
    },
    ...(includeRefinement
      ? [{
          step: 'Clean up and refine the build',
          status: stage === 'stage-b-running' ? 'in_progress' : 'pending',
        }]
      : []),
  ];
  const id = `handoff-lifecycle-${stage}`;
  return [
    {
      kind: 'tool_use',
      id,
      name: 'update_plan',
      input: { plan },
    },
    {
      kind: 'tool_result',
      toolUseId: id,
      content: stage === 'converting'
        ? 'Preparing the deterministic Bricks baseline.'
        : stage === 'reading-source'
          ? 'Reading the uploaded HTML source from project storage.'
          : stage === 'baseline-inserting'
          ? 'Baseline payload is ready for the first Bricks canvas insert.'
          : baselineInserted
            ? 'Stage B is certifying the inserted baseline and will use the selected model only for a concrete repair.'
            : 'Stage B validation is running; the live baseline could not be inserted, so the final validated apply remains pending.',
      isError: false,
    },
  ];
}

export async function runPixflowInitialHtmlInsert({
  payload,
  replaceExisting = true,
}: {
  payload: PixflowBricksAgentSessionPayload;
  replaceExisting?: boolean;
}): Promise<PixflowInitialHtmlInsertResult> {
  // Pixflow-owned: keep the immediate insert path aligned with the prepared
  // handoff path for direct HTML-to-Bricks imports.
  const postId = Number(
    payload.targetContext?.postId
    || getPixflowBuilderPostId()
    || 0,
  );
  const sourceFile = payload.sourceFile;
  const filePath = sourcePath(sourceFile);

  if (!payload.projectId) {
    throw new Error('No Pixflow project was available for the Bricks handoff.');
  }
  if (!sourceFile || !filePath) {
    throw new Error('No generated HTML file was available for the Bricks handoff.');
  }
  if (!postId) {
    throw new Error('Choose a WordPress page before handing off to Bricks.');
  }

  const frameworkContext = await withPixflowTimeout(
    fetchOptionalFrameworkContext(postId),
    8000,
    fallbackFrameworkContext(),
    'Bricks handoff framework context',
  );
  const bricksHandoff = withHandoffSidecars(await fetchBricksHandoffResult(payload, sourceFile, filePath));
  const handoffArtifacts = await persistBricksHandoffArtifacts(
    payload.projectId,
    bricksHandoff.result,
    bricksHandoff.artifacts,
    sourceFile,
    frameworkContext,
    payload.buildAttempt || null,
    isBuildInBricksHtmlFirstPayload(payload),
  );
  const localMediaAssets = await buildHandoffLocalMediaAssets(
    payload.projectId,
    filePath,
    bricksHandoff.result,
    undefined,
    bricksHandoff.localMediaAssets,
  );
  const artifactBundle = {
    ...buildHandoffArtifactBundle(bricksHandoff, sourceFile, frameworkContext),
    localMediaAssets,
  };
  const applyRequest = await buildHandoffApplyRequest({
    projectId: payload.projectId,
    postId,
    title: handoffSyncTitle(payload, sourceFile),
    handoffArtifacts,
    artifactBundle,
    replaceExisting,
  });

  const response = await requestWordPressRest<PixflowInitialHtmlInsertResult>(
    'bricks/handoffs/apply',
    {
      method: 'POST',
      body: applyRequest,
    },
  );

  const body = normalizeInitialInsertResponse(response.body, response.status);
  const persisted = body.persisted;
  const persistedOk = !persisted || persisted.ok !== false;
  if (!response.ok || body.ok === false || !persistedOk) {
    throw new Error(
      !persistedOk
        ? (body.message || 'Initial Bricks insert returned successfully, but the saved Bricks content could not be verified.')
        : (body.message || 'Initial Bricks insert failed.'),
    );
  }

  return body;
}

async function buildHandoffApplyRequest({
  projectId,
  postId,
  title,
  handoffArtifacts,
  artifactBundle,
  replaceExisting,
}: {
  projectId: string;
  postId: number;
  title: string;
  handoffArtifacts: { handoffId: string; files: string[] };
  artifactBundle: Record<string, unknown>;
  replaceExisting: boolean;
}): Promise<Record<string, unknown>> {
  const ownership = await buildHandoffOwnership(projectId, artifactBundle);

  // Pixflow-owned: the builder panel receives this object after prepare, but
  // WordPress only receives it after explicit user confirmation.
  return {
    postId,
    handoffId: handoffArtifacts.handoffId,
    projectId,
    wpProjectUuid: ownership.wpProjectUuid,
    ownership,
    handoffArtifacts,
    artifactBundle: {
      ...artifactBundle,
      metadata: {
        ...(artifactBundle.metadata as Record<string, unknown> | undefined),
        ownership,
      },
    },
    replaceExisting,
  };
}

function buildHandoffReferenceApplyRequest({
  projectId,
  postId,
  handoffArtifacts,
  replaceExisting,
  artifactStage,
  themeStylePolicy,
  themeStyleContext,
  themeStyleSnapshotHash,
  sourceContract,
}: {
  projectId: string;
  postId: number;
  handoffArtifacts: { handoffId: string; files: string[] };
  replaceExisting: boolean;
  artifactStage: string;
  themeStylePolicy?: string;
  themeStyleContext?: Record<string, unknown> | null;
  themeStyleSnapshotHash?: string | null;
  sourceContract?: string | null;
}): Record<string, unknown> {
  return {
    postId,
    handoffId: handoffArtifacts.handoffId,
    projectId,
    handoffArtifacts: {
      ...handoffArtifacts,
      artifactStage,
    },
    artifactStage,
    ...(themeStylePolicy ? { themeStylePolicy } : {}),
    ...(themeStyleContext ? { themeStyleContext } : {}),
    ...(themeStyleSnapshotHash ? { themeStyleSnapshotHash } : {}),
    ...(sourceContract ? { sourceContract } : {}),
    replaceExisting,
    artifactBundleStored: true,
  };
}

async function applyPreparedHandoffResult({
  payload,
  postId,
  sourceFile,
  frameworkContext,
  bricksHandoff,
  replaceExisting,
  artifactStage,
  livePreview = false,
  replaceElementIds,
  replaceGlobalClassIds,
}: {
  payload: PixflowBricksAgentSessionPayload;
  postId: number;
  sourceFile: PixflowBricksAgentSourceFile;
  frameworkContext: Record<string, unknown>;
  bricksHandoff: BricksHandoffFetchResult;
  replaceExisting: boolean;
  artifactStage: string;
  livePreview?: boolean;
  replaceElementIds?: string[];
  replaceGlobalClassIds?: string[];
}): Promise<PixflowInitialHtmlInsertResult> {
  const fragmentNamespace = payload.generationScope === 'section' || payload.generationScope === 'component'
    ? `pixflow-section-${payload.session.id}`
    : undefined;
  if (!payload.projectId) {
    return {
      ok: false,
      code: 'missing_project',
      message: 'No Pixflow project was available for the Bricks handoff.',
      status: 422,
    };
  }
  if (livePreview) {
    const previewHandoffArtifacts = {
      handoffId: `pre-stage-b-${Date.now()}`,
      files: [],
    };
    const applyRequest = buildHandoffReferenceApplyRequest({
      postId,
      projectId: payload.projectId,
      handoffArtifacts: previewHandoffArtifacts,
      replaceExisting,
      artifactStage,
      themeStylePolicy: payload.themeStylePolicy || (isBuildInBricksHtmlFirstPayload(payload) ? 'inherit_effective' : 'isolated'),
      themeStyleContext: payload.themeStyleContext || null,
      themeStyleSnapshotHash: payload.themeStyleSnapshotHash || null,
      sourceContract: payload.sourceContract || null,
    });
    applyRequest.buildAttempt = payload.buildAttempt || null;
    const content = Array.isArray(bricksHandoff.result.content) ? bricksHandoff.result.content : [];
    const globalClasses = Array.isArray(bricksHandoff.result.global_classes)
      ? bricksHandoff.result.global_classes
      : (Array.isArray(bricksHandoff.result.globalClasses) ? bricksHandoff.result.globalClasses : []);
    if (content.length === 0) {
      return {
        ok: false,
        code: 'bricks_baseline_preview_empty',
        message: 'The deterministic Bricks baseline did not contain any canvas elements.',
        status: 422,
        handoffArtifacts: previewHandoffArtifacts,
        applyRequest,
      };
    }
    const handoffQa = bricksHandoff.artifacts.json.qa
      ?? (bricksHandoff.result as { stage_b_qa?: unknown }).stage_b_qa
      ?? buildBaselinePreviewQa();
    const localMediaAssets = await buildHandoffLocalMediaAssets(
      payload.projectId,
      sourcePath(sourceFile),
      bricksHandoff.result,
      undefined,
      bricksHandoff.localMediaAssets,
    );
    const response = await requestWordPressRest<PixflowInitialHtmlInsertResult>(
      'pixflow-mcp/conversion/initial-html-insert',
      {
        method: 'POST',
        body: {
          postId,
          bricksHandoffResult: bricksHandoff.result,
          handoffQa,
          sourceFile,
          handoffArtifacts: {
            ...previewHandoffArtifacts,
            artifactStage,
          },
          frameworkContext,
          generationScope: payload.generationScope,
          themeStylePolicy: payload.themeStylePolicy || (isBuildInBricksHtmlFirstPayload(payload) ? 'inherit_effective' : 'isolated'),
          themeStyleContext: payload.themeStyleContext || undefined,
          themeStyleSnapshotHash: payload.themeStyleSnapshotHash || undefined,
          sourceContract: payload.sourceContract || undefined,
          localMediaAssets,
          replaceExisting,
          replaceElementIds,
          replaceGlobalClassIds,
          fragmentNamespace,
          position: buildInBricksScopedPlacementPosition(payload.scopedPlacement),
          buildAttempt: payload.buildAttempt || null,
        },
      },
    );
    const body = normalizeInitialInsertResponse(response.body, response.status);
    const persistedOk = body.persisted?.ok === true && body.persisted.contentMatches === true;
    const qaAssessment = evaluateHandoffQa(handoffQa);
    return {
      ...body,
      ok: response.ok && body.ok !== false && persistedOk,
      code: persistedOk ? (body.code || 'bricks_baseline_persisted') : (body.code || 'bricks_baseline_not_persisted'),
      message: persistedOk
        ? (body.message || 'The deterministic Bricks baseline was saved and verified.')
        : (body.message || 'The deterministic Bricks baseline could not be verified after saving.'),
      status: body.status || response.status,
      handoffArtifacts: body.handoffArtifacts || previewHandoffArtifacts,
      applyRequest,
      qaAssessment: {
        source: 'post_conversion',
        status: qaAssessment.assessmentStatus,
        warnings: qaAssessment.warnings,
      },
    };
  }
  const handoffArtifacts = await persistBricksHandoffArtifacts(
    payload.projectId,
    bricksHandoff.result,
    bricksHandoff.artifacts,
    sourceFile,
    frameworkContext,
    payload.buildAttempt || null,
    isBuildInBricksHtmlFirstPayload(payload),
  );
  const applyRequest = buildHandoffReferenceApplyRequest({
    projectId: payload.projectId,
    postId,
    handoffArtifacts,
    replaceExisting,
    artifactStage,
    themeStylePolicy: payload.themeStylePolicy || (isBuildInBricksHtmlFirstPayload(payload) ? 'inherit_effective' : 'isolated'),
    themeStyleContext: payload.themeStyleContext || null,
    themeStyleSnapshotHash: payload.themeStyleSnapshotHash || null,
    sourceContract: payload.sourceContract || null,
  });
  applyRequest.buildAttempt = payload.buildAttempt || null;
  const handoffQa = bricksHandoff.artifacts.json.qa
    ?? (bricksHandoff.result as { stage_b_qa?: unknown }).stage_b_qa
    ?? {};
  const localMediaAssets = await buildHandoffLocalMediaAssets(
    payload.projectId,
    sourcePath(sourceFile),
    bricksHandoff.result,
    undefined,
    bricksHandoff.localMediaAssets,
  );
  const projectFilePaths = new Set(
    (payload.handoffFiles || []).map((file) => sourcePath(file)).filter(Boolean),
  );
  const applyMediaAssets = getPixflowBricksAgentSource(payload)?.daemonSourceMirror === true
    ? localMediaAssets.map((asset) => {
        if (!projectFilePaths.has(asset.projectPath)) return asset;
        const { contentBase64: _contentBase64, ...projectFileAsset } = asset;
        return { ...projectFileAsset, projectFile: true as const };
      })
    : localMediaAssets;
  const response = await requestWordPressRest<PixflowInitialHtmlInsertResult>(
    'pixflow-mcp/conversion/initial-html-insert',
    {
      method: 'POST',
      body: {
        projectId: payload.projectId,
        postId,
        bricksHandoffResult: compactBricksHandoffResultForWordPressApply(bricksHandoff.result),
        handoffQa,
        sourceFile,
        handoffArtifacts: {
          ...handoffArtifacts,
          artifactStage,
        },
        frameworkContext,
        generationScope: payload.generationScope,
        themeStylePolicy: payload.themeStylePolicy || (isBuildInBricksHtmlFirstPayload(payload) ? 'inherit_effective' : 'isolated'),
        themeStyleContext: payload.themeStyleContext || undefined,
        themeStyleSnapshotHash: payload.themeStyleSnapshotHash || undefined,
        sourceContract: payload.sourceContract || undefined,
        localMediaAssets: applyMediaAssets,
        replaceExisting,
        replaceElementIds,
        replaceGlobalClassIds,
        fragmentNamespace,
        position: buildInBricksScopedPlacementPosition(payload.scopedPlacement),
        buildAttempt: payload.buildAttempt || null,
      },
    },
  );
  const body = normalizeInitialInsertResponse(response.body, response.status);
  const persisted = body.persisted;
  const persistedOk = !persisted || persisted.ok !== false;
  const qaAssessment = evaluateHandoffQa(handoffQa);
  return {
    ...body,
    ok: response.ok && body.ok !== false && persistedOk,
    code: !persistedOk ? (body.code || 'bricks_handoff_not_persisted') : body.code,
    message: !persistedOk
      ? (body.message || 'Bricks handoff insert returned successfully, but the saved Bricks content could not be verified.')
      : body.message,
    status: body.status || response.status,
    handoffArtifacts: body.handoffArtifacts || handoffArtifacts,
    applyRequest,
    qaAssessment: {
      source: 'post_conversion',
      status: qaAssessment.assessmentStatus,
      warnings: qaAssessment.warnings,
    },
  };
}

function elementIds(items: unknown[]): string[] {
  return items
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item)
      ? String((item as { id?: unknown }).id || '').trim()
      : ''))
    .filter(Boolean);
}

function normalizeInitialInsertResponse(value: unknown, status: number): PixflowInitialHtmlInsertResult {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const body = value as PixflowInitialHtmlInsertResult;
    return typeof body.message === 'string'
      ? { ...body, message: safeBricksHandoffErrorMessage(body.message) }
      : body;
  }
  return {
    ok: false,
    code: 'wordpress_rest_non_json_response',
    message: safeBricksHandoffErrorMessage(value),
    status: status || 500,
  };
}

function buildBaselinePreviewQa(): Record<string, unknown> {
  return {
    status: 'passed',
    ok: true,
    score: 1,
    phase: 'pre_conversion_baseline_preview',
    summary: {
      note: 'Deterministic baseline preview inserted before controlled final application.',
    },
    issues: [],
    warnings: [],
  };
}

function handoffSyncTitle(
  payload: PixflowBricksAgentSessionPayload,
  sourceFile: PixflowBricksAgentSourceFile,
): string {
  const postTitle = String(payload.targetContext?.postTitle || '').trim();
  if (postTitle) {
    return `Bricks handoff - ${postTitle}`;
  }

  const sourceTitle = String(sourceFile.title || sourceFile.name || '').trim();
  return sourceTitle ? `Bricks handoff - ${sourceTitle}` : 'Bricks handoff project';
}

// Pixflow-owned: Phase 10 apply is only allowed for handoffs tied to a
// WordPress-owned shared project. This keeps local bridge artifacts from being
// applied to an unrelated site/project if a payload is replayed or copied.
async function buildHandoffOwnership(
  wpProjectUuid: string,
  artifactBundle: Record<string, unknown>,
): Promise<BricksHandoffOwnership> {
  const normalizedProjectUuid = String(wpProjectUuid || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(normalizedProjectUuid)) {
    throw new Error('A WordPress Pixflow project is required before applying a Bricks handoff.');
  }

  return {
    localProjectId: normalizedProjectUuid,
    wpProjectUuid: normalizedProjectUuid,
    latestVersion: null,
    lastSyncedHash: '',
    artifactHash: await hashHandoffBundle(artifactBundle),
  };
}

async function hashHandoffBundle(artifactBundle: Record<string, unknown>): Promise<string> {
  // Pixflow-owned: WordPress decodes JSON objects with sequential numeric keys
  // as PHP arrays before verifying the hash. Normalize the browser-side bundle
  // to the same shape so valid Bricks handoffs do not fail ownership checks.
  const text = encodeForWordPressHash(normalizeForWordPressJson(artifactBundle));
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return '';
}

function encodeForWordPressHash(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

function normalizeForWordPressJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForWordPressJson(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.length === 0) {
    return [];
  }
  const numericKeys = keys
    .filter((key) => /^\d+$/.test(key))
    .map((key) => Number(key))
    .sort((a, b) => a - b);
  const isSequentialArrayObject = keys.length > 0
    && numericKeys.length === keys.length
    && numericKeys.every((key, index) => key === index);

  if (isSequentialArrayObject) {
    return numericKeys.map((key) => normalizeForWordPressJson(object[String(key)]));
  }

  return Object.fromEntries(
    keys.map((key) => [key, normalizeForWordPressJson(object[key])]),
  );
}

// Pixflow-owned: persist the bridge-built Bricks JSON and sidecars into the
// same project before WordPress insertion, so handoff is reproducible and can
// later be re-applied or audited by another user.
export async function persistBricksHandoffArtifacts(
  projectId: string,
  bricksHandoffResult: Record<string, unknown>,
  artifacts: BricksHandoffStoredArtifacts,
  sourceFile: PixflowBricksAgentSourceFile,
  frameworkContext: Record<string, unknown>,
  buildAttempt: PixflowBricksAgentSessionPayload['buildAttempt'] = null,
  canonicalBuild = false,
): Promise<{ handoffId: string; files: string[]; warning?: string }> {
  const handoffId = `handoff-${new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'z')}`;
  const root = `pixflow/handoffs/bricks/${handoffId}`;
  const measuredStyleOwnershipEvidence = extractBricksMeasuredStyleOwnershipEvidence(bricksHandoffResult);
  const legacyStageJsonFiles: Array<[string, unknown]> = canonicalBuild
    ? []
    : [[`${root}/stage-b-qa.json`, artifacts.json.qa ?? {}]];
  const files: Array<[string, unknown]> = [
    [`${root}/build-attempt-correlation.json`, buildAttempt
      ? (canonicalBuild ? { ...buildAttempt } : { ...buildAttempt, stageBHandoffId: handoffId })
      : (canonicalBuild
        ? { submissionId: null, buildAttemptId: null, projectId, repairAttempt: 0 }
        : { submissionId: null, buildAttemptId: null, projectId, stageARunId: null, stageBHandoffId: handoffId, repairAttempt: 0 })],
    [`${root}/source-artifact.json`, sourceFile],
    [`${root}/html-source-manifest.json`, artifacts.json.sourceManifest ?? {}],
    [`${root}/framework-route.json`, frameworkContext],
    [`${root}/bricks-handoff-result.json`, bricksHandoffResult],
    [`${root}/bricks-page-payload.json`, (bricksHandoffResult as { content?: unknown }).content ?? []],
    [`${root}/bricks-header-payload.json`, (bricksHandoffResult as { stage_b_header?: { content?: unknown } }).stage_b_header?.content ?? []],
    [`${root}/bricks-footer-payload.json`, (bricksHandoffResult as { stage_b_footer?: { content?: unknown } }).stage_b_footer?.content ?? []],
    [`${root}/bricks-global-classes.json`, (bricksHandoffResult as { global_classes?: unknown }).global_classes ?? []],
    [`${root}/bricks-color-system.json`, (bricksHandoffResult as { stage_b_color_system?: unknown }).stage_b_color_system ?? {}],
    [`${root}/bricks-font-system.json`, (bricksHandoffResult as { stage_b_font_system?: unknown }).stage_b_font_system ?? {}],
    [`${root}/bricks-icon-system.json`, (bricksHandoffResult as { stage_b_icon_system?: unknown }).stage_b_icon_system ?? {}],
    [`${root}/bricks-handoff-qa.json`, artifacts.json.qa ?? {}],
    [`${root}/bricks-route-contract.json`, artifacts.json.routeContract ?? (bricksHandoffResult as { stage_b_route_contract?: unknown }).stage_b_route_contract ?? {}],
    [`${root}/bricks-theme-style-contract.json`, artifacts.json.themeStyleContract ?? (bricksHandoffResult as { stage_b_theme_style_contract?: unknown }).stage_b_theme_style_contract ?? {}],
    [`${root}/bricks-theme-style-health.json`, artifacts.json.themeStyleHealth ?? (bricksHandoffResult as { stage_b_theme_style_health?: unknown }).stage_b_theme_style_health ?? {}],
    [`${root}/bricks-theme-style-payload.json`, artifacts.json.themeStylePayload ?? (bricksHandoffResult as { stage_b_theme_style_payload?: unknown }).stage_b_theme_style_payload ?? {}],
    [`${root}/bricks-media-intent.json`, artifacts.json.mediaIntent ?? (bricksHandoffResult as { stage_b_media_intent?: unknown }).stage_b_media_intent ?? {}],
    // Pixflow-owned: persisted evidence proves the handoff crossed the model
    // boundary and did not silently apply the deterministic baseline.
    [`${root}/bricks-model-run-evidence.json`, artifacts.json.modelRunEvidence ?? {}],
    [`${root}/bricks-conversion-plan.json`, artifacts.json.conversionPlan ?? {}],
    [`${root}/bricks-source-map.json`, artifacts.json.sourceMap ?? {}],
    [`${root}/bricks-style-map.json`, artifacts.json.styleMap ?? {}],
    [`${root}/bricks-section-map.json`, artifacts.json.sectionMap ?? {}],
    [`${root}/bricks-header-plan.json`, artifacts.json.headerPlan ?? {}],
    [`${root}/bricks-footer-plan.json`, artifacts.json.footerPlan ?? {}],
    [`${root}/bricks-class-plan.json`, artifacts.json.classPlan ?? {}],
    [`${root}/bricks-structure-ir.json`, artifacts.json.structureIr ?? (bricksHandoffResult as { stage_b_structure_ir?: unknown }).stage_b_structure_ir ?? {}],
    [`${root}/bricks-structure-report.json`, artifacts.json.structureReport ?? (bricksHandoffResult as { stage_b_structure_report?: unknown }).stage_b_structure_report ?? {}],
    [`${root}/bricks-style-ownership-report.json`, artifacts.json.styleOwnershipReport ?? (bricksHandoffResult as { stage_b_style_ownership_report?: unknown }).stage_b_style_ownership_report ?? {}],
    [`${root}/${BRICKS_MEASURED_STYLE_OWNERSHIP_EVIDENCE_FILE}`, measuredStyleOwnershipEvidence],
    [`${root}/bricks-class-lifecycle-report.json`, artifacts.json.classLifecycleReport ?? (bricksHandoffResult as { stage_b_class_lifecycle_report?: unknown }).stage_b_class_lifecycle_report ?? {}],
    [`${root}/bricks-token-graph-report.json`, artifacts.json.tokenGraphReport ?? (bricksHandoffResult as { stage_b_token_graph_report?: unknown }).stage_b_token_graph_report ?? {}],
    [`${root}/bricks-schema-catalog.json`, artifacts.json.bricksSchemaCatalog ?? {}],
    [`${root}/bricks-focused-schemas.json`, artifacts.json.bricksFocusedSchemas ?? {}],
    [`${root}/bricks-schema-validation.json`, artifacts.json.bricksSchemaValidation ?? {}],
    [`${root}/bricks-runtime-knowledge.json`, artifacts.json.bricksRuntimeKnowledge ?? {}],
    [`${root}/bricks-color-usage.json`, artifacts.json.colorUsage ?? {}],
    ...legacyStageJsonFiles,
  ];
  const legacyStageTextFiles: Array<[string, string]> = canonicalBuild
    ? []
    : [[`${root}/stage-b-agent-report.md`, artifacts.text.agentReport || 'No Stage B agent report was emitted.\n']];
  const textFiles: Array<[string, string]> = [
    [`${root}/bricks-handoff-report.md`, artifacts.text.conversionReport || 'No Bricks handoff conversion report was emitted.\n'],
    [`${root}/bricks-handoff-baseline-report.md`, artifacts.text.baselineReport || 'No Bricks handoff baseline report was emitted.\n'],
    [`${root}/bricks-fidelity-plan.md`, artifacts.text.fidelityPlan || 'No Bricks handoff fidelity plan was emitted.\n'],
    [`${root}/bricks-runner-prompt.txt`, artifacts.text.runnerPrompt || 'No Bricks handoff runner prompt was captured.\n'],
    [`${root}/bricks-handoff-critique.md`, artifacts.text.handoffCritique || 'No Bricks handoff critique was emitted.\n'],
    ...legacyStageTextFiles,
  ];

  const candidateBatch = [
    ...files.map(([name, value]) => ({
      name,
      content: `${JSON.stringify(value, null, 2)}\n`,
    })),
    ...textFiles.map(([name, value]) => ({
      name,
      content: value.endsWith('\n') ? value : `${value}\n`,
    })),
  ];
  const maxArchivedFileBytes = 16 * 1024 * 1024;
  const oversizedFiles = candidateBatch
    .filter((file) => new TextEncoder().encode(file.content).byteLength > maxArchivedFileBytes)
    .map((file) => file.name);
  const batch = candidateBatch.filter((file) => !oversizedFiles.includes(file.name));
  const saved = await writeProjectTextFilesBestEffort(projectId, batch, canonicalBuild);
  saved.failed.push(...oversizedFiles);
  const latestFile = 'pixflow/handoffs/bricks/latest.json';
  const latest = await writeBricksHandoffProjectTextFiles(projectId, [{
    name: latestFile,
    content: `${JSON.stringify({
      handoffId,
      root,
      sourceFile: sourceFile.path || sourceFile.name,
      files: saved.files,
      omittedFiles: saved.failed,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
  }], canonicalBuild);
  if (latest.ok) {
    saved.files.push(latestFile);
  } else {
    saved.failed.push(latestFile);
  }

  if (saved.files.length === 0) {
    return {
      handoffId,
      files: [],
      warning: 'Project artifact archive was not saved; the Bricks page apply can still continue.',
    };
  }

  return {
    handoffId,
    files: saved.files,
    warning: saved.failed.length > 0
      ? `Project artifact archive saved with ${saved.failed.length} omitted file(s).`
      : undefined,
  };
}

async function writeProjectTextFilesBestEffort(
  projectId: string,
  files: Array<{ name: string; content: string }>,
  canonicalBuild: boolean,
): Promise<{ files: string[]; failed: string[] }> {
  const saved: string[] = [];
  const failed: string[] = [];
  for (let start = 0; start < files.length; start += 16) {
    const chunk = files.slice(start, start + 16);
    const result = await writeBricksHandoffProjectTextFiles(projectId, chunk, canonicalBuild);
    if (result.ok) {
      saved.push(...chunk.map((file) => file.name));
      continue;
    }
    for (const file of chunk) {
      const fallback = await writeBricksHandoffProjectTextFiles(projectId, [file], canonicalBuild);
      if (fallback.ok) {
        saved.push(file.name);
      } else {
        failed.push(file.name);
      }
    }
  }
  return { files: saved, failed };
}

async function writeBricksHandoffProjectTextFiles(
  projectId: string,
  files: Array<{ name: string; content: string }>,
  canonicalBuild: boolean,
): Promise<{ ok: boolean; message?: string }> {
  // Canonical Build workspaces are bridge/daemon-owned scratch projects.
  // Using the generic project transport from an embedded WordPress shell can
  // remap evidence writes into durable WP project storage, away from the
  // source workspace. Compatibility flows retain their historical transport.
  return canonicalBuild
    ? writeBuildInBricksScratchProjectTextFiles(projectId, files)
    : writeProjectTextFiles(projectId, files);
}

export function compactBricksHandoffResultForWordPressApply(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const applyResult = { ...result };
  applyResult.content = pruneDanglingBricksChildReferences(result.content);
  for (const area of ['stage_b_header', 'stage_b_footer'] as const) {
    const spec = result[area];
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
    applyResult[area] = {
      ...spec,
      content: pruneDanglingBricksChildReferences((spec as { content?: unknown }).content),
    };
  }
  const sourceProvenance = compactSourceProvenanceForWordPressApply(applyResult);
  if (sourceProvenance.length > 0) {
    applyResult.stage_b_source_provenance = sourceProvenance;
  } else {
    delete applyResult.stage_b_source_provenance;
  }
  delete applyResult.stageBSourceProvenance;
  for (const key of [
    'diagnostics',
    'stage_b_structure_ir',
    'stage_b_structure_report',
    'stage_b_style_ownership_report',
    'stage_b_class_lifecycle_report',
    'stage_b_token_graph_report',
    'color_system',
    'font_system',
    'icon_system',
    'baselinePreviewContent',
    'pageSettings',
  ]) {
    delete applyResult[key];
  }
  return applyResult;
}

export const BRICKS_MEASURED_STYLE_OWNERSHIP_EVIDENCE_FILE = 'bricks-measured-style-ownership.json' as const;

/**
 * Expose the converter's existing measured-source projection as handoff
 * evidence. This is a diagnostic projection only; the converter report
 * remains the sole ownership authority.
 */
export function extractBricksMeasuredStyleOwnershipEvidence(
  bricksHandoffResult: Record<string, unknown>,
): Record<string, unknown> {
  const diagnostics = bricksHandoffResult.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) return {};
  const projection = (diagnostics as Record<string, unknown>).measuredSourceProjection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return {};
  return projection as Record<string, unknown>;
}

function compactSourceProvenanceForWordPressApply(
  result: Record<string, unknown>,
): Array<{ bricksElementId: string; sourceNodeId: string; kind?: string }> {
  const elementIds = new Set<string>();
  const collectIds = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const element of value) {
      if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
      const id = String((element as { id?: unknown }).id || '').trim();
      if (id) elementIds.add(id);
    }
  };
  collectIds(result.content);
  for (const area of ['stage_b_header', 'stage_b_footer'] as const) {
    const spec = result[area];
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
    collectIds((spec as { content?: unknown }).content);
  }

  const raw = Array.isArray(result.stage_b_source_provenance)
    ? result.stage_b_source_provenance
    : Array.isArray(result.stageBSourceProvenance)
      ? result.stageBSourceProvenance
      : [];
  const compacted = new Map<string, { bricksElementId: string; sourceNodeId: string; kind?: string }>();
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const bricksElementId = String(record.bricksElementId || record.bricks_element_id || '').trim();
    const sourceNodeId = String(record.sourceNodeId || record.source_node_id || '').trim();
    if (!bricksElementId || !sourceNodeId || !elementIds.has(bricksElementId)) continue;
    const kind = String(record.kind || '').trim();
    compacted.set(`${bricksElementId}:${sourceNodeId}`, {
      bricksElementId,
      sourceNodeId,
      ...(kind ? { kind } : {}),
    });
  }
  return [...compacted.values()];
}

function pruneDanglingBricksChildReferences(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(value.map((element) => element && typeof element === 'object' && !Array.isArray(element)
    ? String((element as { id?: unknown }).id || '').trim()
    : '').filter(Boolean));
  return value.map((element) => {
    if (!element || typeof element !== 'object' || Array.isArray(element)) return element;
    const children = (element as { children?: unknown }).children;
    if (!Array.isArray(children)) return element;
    return {
      ...element,
      children: children.filter((child) => ids.has(String(child || '').trim())),
    };
  });
}

function buildHandoffArtifactBundle(
  bricksHandoff: BricksHandoffFetchResult,
  sourceFile: PixflowBricksAgentSourceFile,
  frameworkContext: Record<string, unknown>,
): Record<string, unknown> {
  // Pixflow-owned: Phase 10 apply endpoint consumes the stored handoff
  // artifacts as a bundle. The source remains the local bridge project for
  // now; shared WP project storage can replace the reader without changing
  // this apply contract.
  return {
    result: bricksHandoff.result,
    qa: bricksHandoff.artifacts.json.qa ?? (bricksHandoff.result as { stage_b_qa?: unknown }).stage_b_qa ?? {},
    // Pixflow-owned: sidecars are part of the controlled apply contract. Keep
    // them beside the result so WordPress can apply Theme Styles/fonts/icons
    // even if a repair model did not copy every sidecar into bricks-result.json.
    sidecars: extractHandoffSidecarBundle(bricksHandoff),
    sourceFile: {
      name: sourceFile.name,
      path: sourceFile.path,
      kind: sourceFile.kind,
      mime: sourceFile.mime,
      artifactKind: sourceFile.artifactKind,
      size: sourceFile.size,
      mtime: sourceFile.mtime,
    },
    frameworkContext,
    metadata: {
      artifactFiles: bricksHandoff.artifacts.files,
      generatedAt: new Date().toISOString(),
    },
  };
}

function withHandoffSidecars(handoff: BricksHandoffFetchResult): BricksHandoffFetchResult {
  const sidecars = extractHandoffSidecarBundle(handoff);
  return {
    ...handoff,
    result: {
      ...handoff.result,
      ...Object.fromEntries(
        Object.entries(sidecars).filter(([key, value]) => {
          return isPlainObject(value) && !isPlainObject(handoff.result[key]);
        }),
      ),
    },
  };
}

function extractHandoffSidecarBundle(handoff: BricksHandoffFetchResult): Record<string, unknown> {
  const result = handoff.result;
  const json = handoff.artifacts.json;
  return {
    stage_b_color_system: json.colorSystem ?? (result as { stage_b_color_system?: unknown }).stage_b_color_system ?? {},
    stage_b_font_system: json.fontSystem ?? (result as { stage_b_font_system?: unknown }).stage_b_font_system ?? {},
    stage_b_icon_system: json.iconSystem ?? (result as { stage_b_icon_system?: unknown }).stage_b_icon_system ?? {},
    stage_b_theme_style_payload: json.themeStylePayload ?? (result as { stage_b_theme_style_payload?: unknown }).stage_b_theme_style_payload ?? {},
    stage_b_theme_style_contract: json.themeStyleContract ?? (result as { stage_b_theme_style_contract?: unknown }).stage_b_theme_style_contract ?? {},
    stage_b_theme_style_health: json.themeStyleHealth ?? (result as { stage_b_theme_style_health?: unknown }).stage_b_theme_style_health ?? {},
    stage_b_route_contract: json.routeContract ?? (result as { stage_b_route_contract?: unknown }).stage_b_route_contract ?? {},
    stage_b_bricks_schema_catalog: json.bricksSchemaCatalog ?? (result as { stage_b_bricks_schema_catalog?: unknown }).stage_b_bricks_schema_catalog ?? {},
    stage_b_bricks_focused_schemas: json.bricksFocusedSchemas ?? (result as { stage_b_bricks_focused_schemas?: unknown }).stage_b_bricks_focused_schemas ?? {},
    stage_b_bricks_schema_validation: json.bricksSchemaValidation ?? (result as { stage_b_bricks_schema_validation?: unknown }).stage_b_bricks_schema_validation ?? {},
    stage_b_bricks_runtime_knowledge: json.bricksRuntimeKnowledge ?? (result as { stage_b_bricks_runtime_knowledge?: unknown }).stage_b_bricks_runtime_knowledge ?? {},
    stage_b_media_intent: json.mediaIntent ?? (result as { stage_b_media_intent?: unknown }).stage_b_media_intent ?? {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function fallbackFrameworkContext(): PixflowHtmlFrameworkContext {
  return createPixflowHtmlFrameworkContext({
    frameworkState: null,
    routeContext: null,
    fetchOutcome: 'unavailable',
  });
}

async function fetchOptionalFrameworkContext(postId = 0): Promise<PixflowHtmlFrameworkContext> {
  try {
    const [state, routeContext, colorScheme] = await Promise.all([
      withPixflowTimeout<PixflowFrameworkState | null>(
        fetchPixflowFrameworkState(),
        4000,
        null,
        'Pixflow framework route state',
      ),
      withPixflowTimeout<Record<string, unknown> | null>(
        fetchPixflowRouteContext('', postId) as Promise<Record<string, unknown>>,
        4000,
        null,
        'Pixflow live route context',
      ),
      fetchOptionalBricksColorScheme(),
    ]);
    return createPixflowHtmlFrameworkContext({
      frameworkState: state,
      routeContext,
      bricksColorScheme: colorScheme,
      fetchOutcome: state && routeContext ? 'completed' : (state || routeContext ? 'partial' : 'unavailable'),
    });
  } catch {
    return createPixflowHtmlFrameworkContext({
      frameworkState: null,
      routeContext: null,
      fetchOutcome: 'failed',
    });
  }
}

async function fetchOptionalBricksColorScheme(): Promise<Record<string, unknown>> {
  try {
    const response = await withPixflowTimeout(
      requestWordPressRest<BricksColorSchemeSnapshotResponse>('bricks/color-scheme'),
      4000,
      { ok: false, status: 0, body: {} as BricksColorSchemeSnapshotResponse },
      'Bricks color scheme snapshot',
    );
    if (!response.ok || !response.body?.colorScheme) return {};
    return response.body.colorScheme;
  } catch {
    return {};
  }
}

function sourcePath(sourceFile: PixflowBricksAgentSourceFile | null): string {
  return String(sourceFile?.path || sourceFile?.name || '').trim();
}

type HandoffPrimaryHtmlTransfer = {
  html: string;
} | {
  htmlProjectFile: {
    projectFile: true;
    path: string;
    size: number;
    mime: string;
  };
};

export async function prepareHandoffPrimaryHtmlTransfer(
  payload: PixflowBricksAgentSessionPayload,
  sourceFile: PixflowBricksAgentSourceFile,
  filePath: string,
  signal?: AbortSignal,
  readHtml: typeof fetchGeneratedStageAHtml = fetchGeneratedStageAHtml,
): Promise<HandoffPrimaryHtmlTransfer> {
  const projectId = String(payload.projectId || '').trim();
  const normalizedPath = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const scopeNeedsSynthesis = payload.generationScope === 'section' || payload.generationScope === 'component';
  const stageASource = getPixflowBricksAgentSource(payload);
  const stageANeedsSynthesis = stageASource?.format === 'split_html_css_js'
    || stageASource?.format === 'inline_recovered';

  if (projectId && normalizedPath && !normalizedPath.split('/').includes('..')
    && !scopeNeedsSynthesis && !stageANeedsSynthesis
    && (!getPixflowWordPressConfig() || stageASource?.daemonSourceMirror === true)) {
    return {
      htmlProjectFile: {
        projectFile: true,
        path: normalizedPath,
        size: Math.max(0, Number(sourceFile.size) || 0),
        mime: String(sourceFile.mime || 'text/html'),
      },
    };
  }

  return {
    html: await readHtml(projectId, filePath, stageASource, payload.generationScope, signal),
  };
}

async function fetchBricksHandoffBaseline(
  payload: PixflowBricksAgentSessionPayload,
  sourceFile: PixflowBricksAgentSourceFile,
  filePath: string,
  frameworkContext: Record<string, unknown>,
  frameworkDurationMs: number,
  onRunObservation?: PixflowRunObservationRecorder,
  onLifecycleMark?: (mark: PrototypeBricksRunMark) => void,
  signal?: AbortSignal,
  onChatEvents?: (events: unknown[]) => void,
  primaryHtml?: string,
): Promise<BricksHandoffFetchResult> {
  const projectId = String(payload.projectId || '');
  const buildSource = getPixflowBricksAgentSource(payload);
  onChatEvents?.(buildHandoffLifecycleEvents({
    stage: 'reading-source',
    sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
    targetLabel: payload.targetContext?.postTitle
      ? `${payload.targetContext.postTitle} (#${payload.targetContext.postId || 'new'})`
      : payload.targetContext?.postId
        ? `page #${payload.targetContext.postId}`
        : 'selected Bricks page',
  }));
  onLifecycleMark?.('bricks_schema_fetch_start');
  onLifecycleMark?.('runtime_knowledge_fetch_start');
  const schemaStartedAt = Date.now();
  const knowledgeStartedAt = Date.now();
  const [primaryHtmlTransfer, bricksSchemaSnapshot, bricksKnowledgeSnapshot, contextFiles, converterSkillPack] = await Promise.all([
    prepareHandoffPrimaryHtmlTransfer(
      payload,
      sourceFile,
      filePath,
      signal,
      typeof primaryHtml === 'string' ? async () => primaryHtml : fetchGeneratedStageAHtml,
    ),
    withPixflowTimeout(
      fetchOptionalBricksSchemaSnapshot(),
      8000,
      {},
      'Bricks schema snapshot',
    ),
    withPixflowTimeout(
      fetchOptionalBricksKnowledgeSnapshot(),
      8000,
      {},
      'Bricks runtime knowledge snapshot',
    ),
    fetchPixflowHandoffContextFiles(
      projectId,
      payload.handoffFiles,
      signal,
      buildSource?.daemonSourceMirror === true,
    ),
    fetchPixflowBricksConverterSkillPack(),
  ]);
  onLifecycleMark?.('bricks_schema_fetch_end');
  onLifecycleMark?.('runtime_knowledge_fetch_end');
  const preflightFinishedAt = Date.now();
  onRunObservation?.({
    kind: 'preflight',
    frameworkDurationMs,
    schemaDurationMs: preflightFinishedAt - schemaStartedAt,
    runtimeKnowledgeDurationMs: preflightFinishedAt - knowledgeStartedAt,
    fallbackUsed: [
      ...(!('activeRouteId' in frameworkContext) ? ['framework' as const] : []),
      ...(Object.keys(bricksSchemaSnapshot).length === 0 ? ['schema' as const] : []),
      ...(Object.keys(bricksKnowledgeSnapshot).length === 0 ? ['runtime_knowledge' as const] : []),
    ],
  });
  const baselineAbort = createLinkedAbortController(signal);
  let response: Response;
  try {
    response = await withPixflowRequiredTimeout(fetch(toPixflowRuntimeUrl('/api/pixflow/bricks-handoff/baseline'), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...primaryHtmlTransfer,
        title: sourceFile.name || sourceFile.path || 'Pixflow Bricks Handoff',
        sourceId: projectId,
        sourcePath: filePath,
        sourceInputKind: payload.sourceDiagnostics?.inputKind,
        sourceSelectionReason: payload.sourceDiagnostics?.inputKind === 'document_bundle'
          ? 'Canonical HTML selected by the floating panel; attached project files are its declared bundle.'
          : 'Canonical HTML selected and persisted by the floating panel.',
        sourceResourceBase: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '.',
        handoffFiles: normalizePixflowHandoffFilesForBridge(payload.handoffFiles, sourceFile),
        contextFiles,
        converterSkillPack,
        runnerId: payload.session.runnerId || undefined,
        model: payload.session.selectedModel || undefined,
        reasoning: payload.session.reasoning || undefined,
        conversionProfile: payload.conversionProfile || 'uploaded_html',
        generationScope: payload.generationScope,
        sourceContract: payload.sourceContract,
        themeStylePolicy: payload.themeStylePolicy || undefined,
        themeStyleContext: payload.themeStyleContext || undefined,
        themeStyleSnapshotHash: payload.themeStyleSnapshotHash || undefined,
        generationRequirements: payload.generationRequirements,
        generationPrompt: payload.generationPrompt,
        buildAttempt: payload.buildAttempt || undefined,
        ...(isBuildInBricksHtmlFirstPayload(payload)
          ? { buildSource: buildSource || undefined }
          : { stageASource: buildSource || undefined }),
        prototypeHtmlCritique: payload.prototypeHtmlCritique || undefined,
        frameworkContext,
        bricksSchemaSnapshot,
        bricksKnowledgeSnapshot,
      }),
      signal: baselineAbort.signal,
    }), 3 * 60 * 1000, 'Bricks baseline conversion', {
      onTimeout: baselineAbort.abort,
    });
  } finally {
    baselineAbort.cleanup();
  }
  const value = await response.json().catch(() => null) as {
    ok?: boolean;
    result?: unknown;
    artifacts?: unknown;
    localMediaAssets?: unknown;
    sourceManifest?: unknown;
    compatibility?: unknown;
    workspaceDir?: unknown;
    message?: string;
  } | null;
  if (!response.ok || value?.ok !== true || !value.result || typeof value.result !== 'object' || Array.isArray(value.result)) {
    throw new Error(value?.message || `Bricks baseline conversion failed (${response.status}).`);
  }

  return {
    result: value.result as Record<string, unknown>,
    artifacts: normalizeHandoffArtifacts(value.artifacts),
    localMediaAssets: normalizeHandoffLocalMediaAssets(value.localMediaAssets),
    compatibility: normalizePixflowBricksCompatibilityContext(
      value.compatibility ?? (value.result as Record<string, unknown>).bricks_compatibility,
    ),
    workspaceDir: typeof value.workspaceDir === 'string' && value.workspaceDir.trim()
      ? value.workspaceDir.trim()
      : undefined,
    ...(normalizeHtmlSourceManifest(value.sourceManifest) ? { sourceManifest: normalizeHtmlSourceManifest(value.sourceManifest) } : {}),
  };
}

export async function fetchBricksHandoffStreamWithRetry(
  url: string,
  init: RequestInit,
  options: { maxAttempts?: number; retryDelaysMs?: number[] } = {},
): Promise<Response> {
  const maxAttempts = Math.max(1, Math.min(4, Math.round(options.maxAttempts ?? 3)));
  const retryDelaysMs = options.retryDelaysMs || [150, 500, 1_000];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (![502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) return response;
      lastError = new Error(`Bricks bridge returned ${response.status} before streaming began.`);
    } catch (error) {
      if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error || '');
      if (!/failed to fetch|networkerror|network request|econnreset|socket hang up|connection (?:closed|reset)/i.test(detail)) {
        throw error;
      }
      lastError = error;
    }
    const delayMs = Math.max(0, retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] || 0);
    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(resolve, delayMs);
        const onAbort = () => {
          globalThis.clearTimeout(timer);
          reject(new DOMException('Bricks handoff was stopped.', 'AbortError'));
        };
        if (init.signal?.aborted) return onAbort();
        init.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Bricks bridge connection failed before streaming began.');
}
async function fetchBricksHandoffResult(
  payload: PixflowBricksAgentSessionPayload,
  sourceFile: PixflowBricksAgentSourceFile,
  filePath: string,
  frameworkContext: Record<string, unknown> = fallbackFrameworkContext(),
  frameworkDurationMs = 0,
  onRunObservation?: PixflowRunObservationRecorder,
  signal?: AbortSignal,
  onChatEvents?: (events: unknown[]) => void,
  onLifecycleMark?: (mark: PrototypeBricksRunMark) => void,
  onBaseline?: (baseline: BricksHandoffFetchResult) => Promise<void> | void,
  onMutation?: (mutation: Record<string, unknown>) => Promise<void> | void,
  visualRepairEvidence?: Record<string, unknown> | null,
  repairWorkspaceDir?: string,
  primaryHtml?: string,
): Promise<BricksHandoffFetchResult> {
  const projectId = String(payload.projectId || '');
  const buildSource = getPixflowBricksAgentSource(payload);
  onChatEvents?.(buildHandoffLifecycleEvents({
    stage: 'reading-source',
    sourceLabel: sourceFile.name || sourceFile.path || 'HTML source',
    targetLabel: payload.targetContext?.postTitle
      ? `${payload.targetContext.postTitle} (#${payload.targetContext.postId || 'new'})`
      : payload.targetContext?.postId
        ? `page #${payload.targetContext.postId}`
        : 'selected Bricks page',
  }));
  onLifecycleMark?.('bricks_schema_fetch_start');
  onLifecycleMark?.('runtime_knowledge_fetch_start');
  const schemaStartedAt = Date.now();
  const knowledgeStartedAt = Date.now();
  const [primaryHtmlTransfer, bricksSchemaSnapshot, bricksKnowledgeSnapshot, contextFiles, converterSkillPack] = await Promise.all([
    prepareHandoffPrimaryHtmlTransfer(
      payload,
      sourceFile,
      filePath,
      signal,
      typeof primaryHtml === 'string' ? async () => primaryHtml : fetchGeneratedStageAHtml,
    ),
    withPixflowTimeout(
      fetchOptionalBricksSchemaSnapshot(),
      8000,
      {},
      'Bricks schema snapshot',
    ),
    withPixflowTimeout(
      fetchOptionalBricksKnowledgeSnapshot(),
      8000,
      {},
      'Bricks runtime knowledge snapshot',
    ),
    fetchPixflowHandoffContextFiles(
      projectId,
      payload.handoffFiles,
      signal,
      buildSource?.daemonSourceMirror === true,
    ),
    fetchPixflowBricksConverterSkillPack(),
  ]);
  onLifecycleMark?.('bricks_schema_fetch_end');
  onLifecycleMark?.('runtime_knowledge_fetch_end');
  const preflightFinishedAt = Date.now();
  onRunObservation?.({
    kind: 'preflight',
    frameworkDurationMs,
    schemaDurationMs: preflightFinishedAt - schemaStartedAt,
    runtimeKnowledgeDurationMs: preflightFinishedAt - knowledgeStartedAt,
    fallbackUsed: [
      ...(!('activeRouteId' in frameworkContext) ? ['framework' as const] : []),
      ...(Object.keys(bricksSchemaSnapshot).length === 0 ? ['schema' as const] : []),
      ...(Object.keys(bricksKnowledgeSnapshot).length === 0 ? ['runtime_knowledge' as const] : []),
    ],
  });
  const streamAbort = createLinkedAbortController(signal);
  let response: Response;
  try {
    response = await withPixflowRequiredTimeout(fetchBricksHandoffStreamWithRetry(toPixflowRuntimeUrl('/api/pixflow/bricks-handoff/convert-stream'), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' },
      body: JSON.stringify({
        ...primaryHtmlTransfer,
        title: sourceFile.name || sourceFile.path || 'Pixflow Bricks Handoff',
        sourceId: projectId,
        sourcePath: filePath,
        sourceInputKind: payload.sourceDiagnostics?.inputKind,
        sourceSelectionReason: payload.sourceDiagnostics?.inputKind === 'document_bundle'
          ? 'Canonical HTML selected by the floating panel; attached project files are its declared bundle.'
          : 'Canonical HTML selected and persisted by the floating panel.',
        sourceResourceBase: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '.',
        handoffFiles: normalizePixflowHandoffFilesForBridge(payload.handoffFiles, sourceFile),
        contextFiles,
        converterSkillPack,
        // Pixflow-owned: the bridge conversion endpoint performs the actual
        // handoff model run. Pass the active composer execution settings so the
        // selected local CLI/model receives the baseline, source HTML, and skills.
        runnerId: payload.session.runnerId || undefined,
        model: payload.session.selectedModel || undefined,
        reasoning: payload.session.reasoning || undefined,
        conversionProfile: payload.conversionProfile || 'uploaded_html',
        generationScope: payload.generationScope,
        sourceContract: payload.sourceContract,
        themeStylePolicy: payload.themeStylePolicy || undefined,
        themeStyleContext: payload.themeStyleContext || undefined,
        themeStyleSnapshotHash: payload.themeStyleSnapshotHash || undefined,
        generationRequirements: payload.generationRequirements,
        generationPrompt: payload.generationPrompt,
        buildAttempt: payload.buildAttempt
          ? { ...payload.buildAttempt, repairAttempt: visualRepairEvidence ? Math.max(1, payload.buildAttempt.repairAttempt) : payload.buildAttempt.repairAttempt }
          : undefined,
        ...(isBuildInBricksHtmlFirstPayload(payload)
          ? { buildSource: buildSource || undefined }
          : { stageASource: buildSource || undefined }),
        prototypeHtmlCritique: payload.prototypeHtmlCritique || undefined,
        finalVisualEvidence: visualRepairEvidence || undefined,
        repairWorkspaceDir: repairWorkspaceDir || undefined,
        frameworkContext,
        // Pixflow-owned: keep the schema snapshot behind the explicit handoff
        // boundary. Normal generation never receives Bricks schemas or tools.
        bricksSchemaSnapshot,
        bricksKnowledgeSnapshot,
      }),
      signal: streamAbort.signal,
    }), 10 * 60 * 1000, 'Bricks handoff conversion', {
      onTimeout: streamAbort.abort,
    });
  } finally {
    streamAbort.cleanup();
  }

  const value = await readBricksHandoffStreamResponse(
    response,
    signal,
    (events) => {
      onLifecycleMark?.('first_model_output');
      onChatEvents?.(events);
    },
    onBaseline,
    BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS,
    onMutation,
  ) as {
    ok?: boolean;
    code?: string;
    result?: unknown;
    artifacts?: unknown;
    message?: string;
    runtimeDiagnostics?: Array<Record<string, unknown>>;
    workspaceDir?: string;
    localMediaAssets?: unknown;
    resultSignature?: unknown;
    summary?: { modelInvocationCount?: number };
    sourceManifest?: unknown;
    compatibility?: unknown;
  } | null;
  if (!response.ok || value?.ok !== true || !value.result || typeof value.result !== 'object' || Array.isArray(value.result)) {
    const error = new Error(value?.message || `Bricks handoff conversion failed (${response.status}).`) as Error & {
      code?: string;
      status?: number;
      runtimeDiagnostics?: Array<Record<string, unknown>>;
    };
    error.code = value?.code;
    error.status = response.status;
    error.runtimeDiagnostics = value?.runtimeDiagnostics;
    throw error;
  }

  const resultSignature = normalizeBricksResultSignature(value.resultSignature);
  return {
    result: value.result as Record<string, unknown>,
    ...(resultSignature ? { resultSignature } : {}),
    artifacts: normalizeHandoffArtifacts(value.artifacts),
    workspaceDir: typeof value.workspaceDir === 'string' ? value.workspaceDir : undefined,
    localMediaAssets: normalizeHandoffLocalMediaAssets(value.localMediaAssets),
    summary: value.summary,
    compatibility: normalizePixflowBricksCompatibilityContext(
      value.compatibility ?? (value.result as Record<string, unknown>).bricks_compatibility,
    ),
    ...(normalizeHtmlSourceManifest(value.sourceManifest) ? { sourceManifest: normalizeHtmlSourceManifest(value.sourceManifest) } : {}),
  };
}

function normalizeHtmlSourceManifest(value: unknown): PixflowHtmlSourceManifest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const manifest = value as Partial<PixflowHtmlSourceManifest>;
  if (manifest.schema !== 'pixflow.html_to_bricks.source_manifest.v1'
    || manifest.version !== 1
    || !manifest.canonicalHtml
    || !Array.isArray(manifest.files)
    || !Array.isArray(manifest.capabilities)) return undefined;
  return manifest as PixflowHtmlSourceManifest;
}

function normalizeBricksResultSignature(value: unknown): BricksResultSignature | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const signature = value as Record<string, unknown>;
  const sha256 = typeof signature.sha256 === 'string' ? signature.sha256.trim().toLowerCase() : '';
  const size = Number(signature.size);
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(size) || size < 0) return undefined;
  return { sha256, size };
}

function normalizePixflowHandoffFilesForBridge(
  files: PixflowBricksAgentSessionPayload['handoffFiles'] | undefined,
  sourceFile: PixflowBricksAgentSourceFile,
): Array<Record<string, unknown>> {
  const list = Array.isArray(files) && files.length > 0
    ? files
    : [{ ...sourceFile, role: 'primary_html' as const, order: 0 }];
  return list.map((file, index) => {
    const filePath = file.path || file.name;
    const isPrimary = filePath === (sourceFile.path || sourceFile.name);
    const role = isPrimary
      ? 'primary_html'
      : isPixflowHandoffVisualFile(filePath, file.mime)
        ? 'reference_screenshot'
        : (file.role || 'context');
    return {
      name: file.name,
      path: filePath,
      kind: file.kind,
      mime: file.mime,
      artifactKind: file.artifactKind,
      size: file.size,
      mtime: file.mtime,
      title: file.title,
      identifier: file.identifier,
      role,
      order: Number.isFinite(file.order) ? file.order : index,
    };
  });
}

const MAX_PIXFLOW_HANDOFF_BINARY_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PIXFLOW_HANDOFF_BINARY_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_PIXFLOW_HANDOFF_TEXT_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_PIXFLOW_HANDOFF_CONTEXT_FILES = 128;

export async function fetchPixflowHandoffContextFiles(
  projectId: string,
  files: PixflowBricksAgentSessionPayload['handoffFiles'] | undefined,
  signal?: AbortSignal,
  daemonSourceMirror = false,
): Promise<Array<Record<string, unknown>>> {
  const handoffFiles = Array.isArray(files) ? files : [];
  const contextFiles = handoffFiles
    .filter((file) => file.role !== 'primary_html')
    .slice(0, MAX_PIXFLOW_HANDOFF_CONTEXT_FILES);
  const results: Array<Record<string, unknown>> = [];
  let binaryBytes = 0;
  for (const file of contextFiles) {
    const path = sourcePath(file);
    if (!path) continue;
    const declaredRole = String(file.role || 'context');
    const mime = String(file.mime || '').toLowerCase();
    const isVisual = isPixflowHandoffVisualFile(path, mime);
    const handoffMime = normalizePixflowHandoffVisualMime(path, file.mime, isVisual);
    // Authored images are conversion inputs, not visual references. Keeping
    // their declared asset role is what makes the daemon materialize them at
    // stage-a/source/assets (or drafts/assets), where the compiled HTML and
    // deterministic converter expect to find them.
    const role = declaredRole === 'asset'
      ? 'asset'
      : (isVisual ? 'reference_screenshot' : declaredRole);
    const isTextLike = !isVisual && (
      mime.startsWith('text/')
      || /\.(?:md|markdown|txt|json|csv|css|js|svg)$/i.test(path)
    );
    const declaredSize = Number(file.size || 0);
    const transferProjectBytes = Boolean(getPixflowWordPressConfig()) && !daemonSourceMirror;
    if (isTextLike) {
      const text = transferProjectBytes && declaredSize <= MAX_PIXFLOW_HANDOFF_TEXT_RESOURCE_BYTES
        ? await fetchProjectFileText(projectId, path, { cache: 'no-store' })
        : null;
      results.push({
        role,
        name: file.name,
        path,
        mime: handoffMime,
        size: file.size,
        ...(text != null ? { text } : { projectFile: true }),
        ...(declaredSize > MAX_PIXFLOW_HANDOFF_TEXT_RESOURCE_BYTES
          ? { readError: 'Required text resource exceeds the HTML-to-Bricks transfer limit.' }
          : {}),
      });
      continue;
    }
    if (declaredSize > MAX_PIXFLOW_HANDOFF_BINARY_FILE_BYTES
      || binaryBytes + declaredSize > MAX_PIXFLOW_HANDOFF_BINARY_TOTAL_BYTES) {
      results.push({
        role,
        name: file.name,
        path,
        mime: handoffMime,
        size: file.size,
        readError: 'Binary handoff file exceeds the Stage B evidence transfer limit.',
      });
      continue;
    }
    binaryBytes += declaredSize;
    let content: string | null = null;
    if (transferProjectBytes) {
      if (signal?.aborted) throw new DOMException('Bricks handoff was stopped.', 'AbortError');
      const response = await (window.__PIXFLOW_DESIGN_NATIVE_FETCH__ ?? window.fetch.bind(window))(
        projectRawUrl(projectId, path),
        { cache: 'no-store', signal },
      ).catch(() => null);
      if (response?.ok) content = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
    }
    results.push({
      role,
      name: file.name,
      path,
      mime: handoffMime,
      size: file.size,
      ...(content ? { encoding: 'base64', content } : { projectFile: true }),
    });
  }
  return results;
}

function isPixflowHandoffVisualFile(path: string, mime: string | undefined): boolean {
  return String(mime || '').toLowerCase().startsWith('image/')
    || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(path);
}

function normalizePixflowHandoffVisualMime(path: string, mime: string | undefined, isVisual: boolean): string | undefined {
  if (!isVisual) return mime;
  const extension = String(path || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase();
  const inferred = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension && ['avif', 'gif', 'png', 'webp'].includes(extension)
      ? `image/${extension}`
      : '';
  const declared = String(mime || '').trim().toLowerCase();
  return declared.startsWith('image/') ? declared : (inferred || mime);
}

export async function readBricksHandoffStreamResponse(
  response: Response,
  signal?: AbortSignal,
  onChatEvents?: (events: unknown[]) => void,
  onBaseline?: (baseline: BricksHandoffFetchResult) => Promise<void> | void,
  idleTimeoutMs = BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS,
  onMutation?: (mutation: Record<string, unknown>) => Promise<void> | void,
): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/x-ndjson') || !response.body) {
    return response.json().catch(() => null);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: unknown = null;
  let abortError: DOMException | null = null;
  let idleTimeout: number | null = null;
  const onAbort = () => {
    abortError = new DOMException('Bricks handoff was stopped.', 'AbortError');
    void reader.cancel(abortError).catch(() => undefined);
  };
  const resetIdleTimeout = () => {
    if (idleTimeout !== null) {
      window.clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    if (idleTimeoutMs > 0 && typeof window !== 'undefined') {
      idleTimeout = window.setTimeout(() => {
        abortError = new DOMException('Bricks handoff Stage B stream went idle before returning a final result.', 'TimeoutError');
        void reader.cancel(abortError).catch(() => undefined);
      }, idleTimeoutMs);
    }
  };
  if (signal?.aborted) {
    await reader.cancel().catch(() => undefined);
    throw new DOMException('Bricks handoff was stopped.', 'AbortError');
  }
  signal?.addEventListener('abort', onAbort, { once: true });
  resetIdleTimeout();

  const handleLine = async (line: string): Promise<boolean> => {
    if (signal?.aborted || abortError) {
      throw abortError || new DOMException('Bricks handoff was stopped.', 'AbortError');
    }
    if (!line.trim()) return false;
    let record: { type?: unknown; events?: unknown; result?: unknown; diagnostic?: unknown; mutation?: unknown };
    try {
      record = JSON.parse(line) as { type?: unknown; events?: unknown; result?: unknown };
    } catch {
      return false;
    }
    if (record.type === 'events' && Array.isArray(record.events)) {
      onChatEvents?.(record.events);
      return false;
    }
    if (record.type === 'diagnostic' && record.diagnostic && typeof record.diagnostic === 'object') {
      onChatEvents?.([{
        kind: 'status',
        label: 'stage-b-runtime',
        metadata: record.diagnostic,
      }]);
      return false;
    }
    if (record.type === 'mutation' && record.mutation && typeof record.mutation === 'object' && !Array.isArray(record.mutation)) {
      await Promise.resolve(onMutation?.(record.mutation as Record<string, unknown>));
      return false;
    }
    if (record.type === 'baseline' && record.result && typeof record.result === 'object') {
      const baseline = record.result as {
        ok?: unknown;
        result?: unknown;
        artifacts?: unknown;
        localMediaAssets?: unknown;
        sourceManifest?: unknown;
      };
      if (baseline.ok === true && baseline.result && typeof baseline.result === 'object' && !Array.isArray(baseline.result)) {
        // The baseline is a hard handoff gate. Do not continue reading Stage B
        // events (or the terminal result) until the caller has persisted and
        // verified this payload in the live Bricks canvas.
        await Promise.resolve(onBaseline?.({
          result: baseline.result as Record<string, unknown>,
          artifacts: normalizeHandoffArtifacts(baseline.artifacts),
          localMediaAssets: normalizeHandoffLocalMediaAssets(baseline.localMediaAssets),
          ...(normalizeHtmlSourceManifest(baseline.sourceManifest) ? { sourceManifest: normalizeHtmlSourceManifest(baseline.sourceManifest) } : {}),
        }));
      }
      return false;
    }
    if (record.type === 'result') {
      finalResult = record.result;
      return true;
    }
    return false;
  };

  try {
    let terminalResultReceived = false;
    for (;;) {
      if (signal?.aborted || abortError) {
        throw abortError || new DOMException('Bricks handoff was stopped.', 'AbortError');
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      resetIdleTimeout();
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (await handleLine(line)) {
          terminalResultReceived = true;
          break;
        }
      }
      if (terminalResultReceived) {
        // Pixflow-owned: `type: result` is the terminal NDJSON contract. Some
        // browser/loopback combinations keep the HTTP body readable after the
        // daemon has completed and archived the handoff, so waiting for EOF can
        // strand the builder in "Working" for the full idle timeout.
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    if (!terminalResultReceived) {
      buffer += decoder.decode();
      await handleLine(buffer);
    }
  } catch (error) {
    // Closing the reader also closes the loopback response, which lets the
    // daemon abort its Stage B runner when the mandatory baseline gate fails.
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (idleTimeout !== null) {
      window.clearTimeout(idleTimeout);
    }
    signal?.removeEventListener('abort', onAbort);
  }
  if (abortError) {
    throw abortError;
  }
  return finalResult;
}

function normalizeHandoffArtifacts(value: unknown): BricksHandoffStoredArtifacts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { files: [], json: {}, text: {} };
  }
  const object = value as { files?: unknown; json?: unknown; text?: unknown };
  const json = object.json && typeof object.json === 'object' && !Array.isArray(object.json)
    ? object.json as Record<string, unknown>
    : {};
  const text = object.text && typeof object.text === 'object' && !Array.isArray(object.text)
    ? Object.fromEntries(Object.entries(object.text as Record<string, unknown>).map(([key, item]) => [key, String(item)]))
    : {};

  return {
    files: Array.isArray(object.files) ? object.files.map((item) => String(item)) : [],
    json,
    text,
  };
}

export function evaluateHandoffQa(value: unknown): {
  ok: boolean;
  message: string;
  warnings: string[];
  assessmentStatus: PixflowBricksQaAssessment['status'];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: true,
      message: 'Structural QA diagnostics were unavailable; structural validation will still protect the insert.',
      warnings: ['Structural QA diagnostics were unavailable. Visual parity is unscored; review the result before publishing.'],
      assessmentStatus: 'unavailable',
    };
  }

  const qa = value as Record<string, unknown>;
  const status = String(qa.status || qa.result || '').toLowerCase();
  const warnings: string[] = [];
  if (qa.blocking === true) warnings.push('Structural QA reported unresolved findings.');
  if (['failed', 'fail', 'blocking', 'blocked', 'repair_required', 'repairs_required', 'blocking_repairs_required'].includes(status)) {
    warnings.push(`Structural QA status is ${status}; the structurally valid conversion was retained.`);
  }
  for (const key of ['ok', 'passed', 'pass', 'qaPassed']) {
    if (Object.prototype.hasOwnProperty.call(qa, key) && qa[key] === false) {
      warnings.push(`Structural QA field ${key} is false; review the converted result.`);
    }
  }
  const score = Number(qa.score ?? qa.qualityScore);
  if (Number.isFinite(score) && score < 80) {
    warnings.push(`Structural QA score is ${score}; this is not a visual-parity score. Review before publishing.`);
  }

  const failedAssessment = status === 'failed'
    || status === 'fail'
    || status === 'blocking'
    || status === 'blocked'
    || status === 'repair_required'
    || status === 'repairs_required'
    || status === 'blocking_repairs_required'
    || qa.blocking === true;
  return {
    ok: true,
    message: warnings.length > 0 ? 'Structural QA completed with warnings.' : 'Structural QA passed; visual parity is scored separately.',
    warnings: [...new Set(warnings)],
    assessmentStatus: failedAssessment ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
  };
}

export function resolveBricksStageAScratchRawUrl(
  projectId: string,
  filePath: string,
  bridgeBaseUrl = getPixflowBridgeBaseUrl(),
): string {
  const normalizedBridgeBaseUrl = String(bridgeBaseUrl || '').trim().replace(/\/+$/, '');
  const safePath = filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const rawPath = `/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`;
  return normalizedBridgeBaseUrl ? `${normalizedBridgeBaseUrl}${rawPath}` : projectRawUrl(projectId, filePath);
}

async function fetchGeneratedHtml(
  projectId: string,
  filePath: string,
  signal?: AbortSignal,
  daemonScratchProject = false,
): Promise<string> {
  const url = daemonScratchProject
    ? resolveBricksStageAScratchRawUrl(projectId, filePath)
    : projectRawUrl(projectId, filePath);
  // The WordPress workspace replaces window.fetch to broker daemon-shaped
  // routes. Raw HTML must bypass that broker: an Accept: text/html request can
  // otherwise be mistaken for an app navigation and return the multi-megabyte
  // workspace shell, which the converter correctly rejects as html_too_large.
  const rawFileFetch = window.__PIXFLOW_DESIGN_NATIVE_FETCH__ ?? window.fetch.bind(window);
  let lastStatus = 0;

  // Pixflow-owned: direct HTML-to-Bricks uploads can appear in the project file
  // list before the raw-file endpoint has finished exposing the bytes. Retry
  // briefly so handoff preparation does not fail before the user-uploaded HTML
  // is actually readable.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Bricks handoff was stopped.', 'AbortError');
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const abortForwarder = () => controller?.abort();
    if (controller && signal) {
      signal.addEventListener('abort', abortForwarder, { once: true });
    }
    const timeout = controller
      ? window.setTimeout(() => controller.abort(), 10000)
      : null;
    try {
      // Use the same project-file transport as the live source drawer first.
      // It is already proven inside the WordPress embed and cannot confuse a
      // raw artifact read with an application-document navigation.
      const projectFileText = daemonScratchProject
        ? null
        : await fetchProjectFileText(projectId, filePath, {
            cache: 'no-store',
            cacheBustKey: `${Date.now()}-${attempt}`,
          });
      if (projectFileText != null) {
        return projectFileText;
      }
      const htmlResponse = await rawFileFetch(url, {
        cache: 'no-store',
        headers: { Accept: 'text/html,*/*;q=0.8' },
        signal: controller?.signal || signal,
      });
      lastStatus = htmlResponse.status;
      if (htmlResponse.ok) {
        return htmlResponse.text();
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new DOMException('Bricks handoff was stopped.', 'AbortError');
      }
      if (attempt >= 7) {
        throw error;
      }
    } finally {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      if (controller && signal) {
        signal.removeEventListener('abort', abortForwarder);
      }
    }

    await abortableDelay(1200, signal);
  }

  throw new Error(`Could not fetch generated HTML (${lastStatus || 'unavailable'}).`);
}

export async function fetchGeneratedStageAHtml(
  projectId: string,
  filePath: string,
  stageASource?: PixflowBricksStageASourceMetadata | null,
  generationScope?: 'full_page' | 'section' | 'component',
  signal?: AbortSignal,
  readProjectFile: typeof fetchProjectFileText = fetchProjectFileText,
): Promise<string> {
  const compiledPath = String(stageASource?.compiledPath || '').trim();
  const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase();
  const isScopedCompiledPreview = generationScope !== 'full_page'
    && normalizedFilePath === 'stage-a/compiled/index.html';
  const metadataHtmlPath = String(stageASource?.htmlPath || stageASource?.sourcePath || '').trim();
  const htmlPath = isScopedCompiledPreview
    ? (
        metadataHtmlPath
        && metadataHtmlPath.replace(/\\/g, '/').toLowerCase() !== normalizedFilePath
          ? metadataHtmlPath
          : 'stage-a/source/index.html'
      )
    : metadataHtmlPath;
  if (
    (isScopedCompiledPreview || stageASource?.format === 'split_html_css_js')
    && (isScopedCompiledPreview || (compiledPath && filePath === compiledPath))
    && htmlPath
    && htmlPath.replace(/\\/g, '/').toLowerCase() !== normalizedFilePath
  ) {
    const cssPath = String(stageASource?.cssPath || (isScopedCompiledPreview ? 'stage-a/source/styles.css' : '')).trim();
    const jsPath = String(stageASource?.jsPath || '').trim();
    const readCanonicalProjectFile = async (path: string): Promise<string | null> => {
      const projectFileText = readProjectFile === fetchProjectFileText
        ? null
        : await readProjectFile(projectId, path, {
            cache: 'no-store',
            cacheBustKey: Date.now(),
          });
      if (projectFileText != null) return projectFileText;

      // WordPress replaces window.fetch so daemon-shaped requests can cross
      // the embedded builder boundary. A split Stage A artifact may already be
      // visible to the source drawer while that broker still rejects the same
      // raw-file URL. Reuse the proven native-fetch fallback rather than
      // failing the run after Stage A has completed successfully.
      try {
        return await fetchGeneratedHtml(projectId, path, signal, true);
      } catch {
        return null;
      }
    };
    const [fragment, css, js] = await Promise.all([
      readCanonicalProjectFile(htmlPath),
      cssPath
        ? readCanonicalProjectFile(cssPath)
        : Promise.resolve(null),
      jsPath
        ? readCanonicalProjectFile(jsPath)
        : Promise.resolve(null),
    ]);
    if (!fragment?.trim()) {
      throw new Error(`Could not fetch canonical scoped Stage A HTML (${htmlPath}).`);
    }
    // Compose the canonical authored fragment into the host-owned browser
    // document consumed by the deterministic bridge. The agent never owns the
    // WordPress/browser shell, including for full-page Build source.
    return composeBuildInBricksSourceHtml(fragment, {
      css: String(css || ''),
      cssPath: cssPath || null,
      js: String(js || ''),
      jsPath: jsPath || null,
    });
  }
  // Build-in-Bricks Stage A files live in the daemon scratch project. A
  // source-fidelity HTML/Website Clone bundle remains owned by the WordPress
  // project store even though it carries Stage A metadata for conversion.
  return fetchGeneratedHtml(
    projectId,
    filePath,
    signal,
    Boolean(stageASource && (
      stageASource.daemonSourceMirror === true
      || stageASource.sourceFidelityClone !== true
    )),
  );
}

function abortableDelay(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException('Bricks handoff was stopped.', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, timeoutMs);
    function onAbort() {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Bricks handoff was stopped.', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createLinkedAbortController(signal?: AbortSignal): {
  signal?: AbortSignal;
  abort: () => void;
  cleanup: () => void;
} {
  if (typeof AbortController !== 'function') {
    return {
      signal,
      abort: () => undefined,
      cleanup: () => undefined,
    };
  }
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', forwardAbort, { once: true });
  }
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => {
      signal?.removeEventListener('abort', forwardAbort);
    },
  };
}

async function fetchOptionalBricksSchemaSnapshot(): Promise<Record<string, unknown>> {
  const elements = [
    'section',
    'container',
    'block',
    'div',
    'heading',
    'text-basic',
    'text',
    'text-link',
    'button',
    'image',
    'icon',
    'svg',
    'form',
    'nav-menu',
    'tabs-nested',
    'accordion-nested',
    'slider-nested',
    'video',
    'image-gallery',
    'map',
    'counter',
    'social-icons',
    'post-title',
    'post-excerpt',
    'post-content',
    'post-taxonomy',
    'filter-search',
    'product-title',
    'product-price',
    'product-gallery',
    'product-add-to-cart',
  ];
  try {
    const response = await requestWordPressRest<BricksSchemaCatalogResponse>('bricks/schema/catalog', {
      method: 'POST',
      body: {
        elements,
        // Pixflow-owned: Stage B needs the complete installed Bricks control
        // metadata for focused elements so the model can prefer native JSON
        // controls and only leave unsupported selectors in _cssCustom.
        controlTree: true,
      },
    });
    if (!response.ok || !response.body?.ok) return {};
    return response.body as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fetchOptionalBricksKnowledgeSnapshot(): Promise<Record<string, unknown>> {
  try {
    const response = await requestWordPressRest<BricksKnowledgeSnapshotResponse>('bricks/schema/knowledge', {
      method: 'POST',
      body: {
        topics: [
          'dynamic-tags',
          'query-types',
          'filters',
          'conditions',
          'forms',
          'interactions',
          'woocommerce',
        ],
      },
    });
    if (!response.ok || !response.body?.ok) return {};
    return response.body as Record<string, unknown>;
  } catch {
    return {};
  }
}
