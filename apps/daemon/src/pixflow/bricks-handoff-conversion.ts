import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  PIXFLOW_BRICKS_MUTATION_SCHEMA,
  type PixflowBricksCompatibilityContext,
  type PixflowBricksMutationBatch,
  type PixflowBricksMutationEvent,
  type PixflowHtmlSourceInputKind,
  type PixflowHtmlSourceManifest,
  normalizePixflowBricksCompatibilityContext,
  normalizePixflowHtmlFrameworkContext,
} from '@open-design/contracts';
import { readBricksHandoffArtifacts, type BricksHandoffArtifacts } from './bricks-handoff/artifacts.js';
import {
  prepareHtmlToBricksSourceSnapshot,
  type HtmlToBricksSourceResource,
} from './html-to-bricks-source-snapshot.js';
import { materializePixflowBricksConverterSkillPack } from './bricks-converter-skill-pack.js';

type BricksHandoffConversionProfile = 'uploaded_html' | 'prototype_bricks';
type BricksHandoffGenerationScope = 'full_page' | 'section' | 'component';

type BricksHandoffConvertInput = {
  html: string;
  htmlProjectFile?: unknown;
  title?: string;
  sourceId?: string;
  sourcePath?: string;
  sourceInputKind?: PixflowHtmlSourceInputKind | string;
  sourceSelectionReason?: string;
  sourceResourceBase?: string;
  runId?: string;
  handoffFiles?: unknown[];
  contextFiles?: unknown[];
  conversionProfile?: BricksHandoffConversionProfile | string;
  generationScope?: BricksHandoffGenerationScope | string;
  sourceContract?: string;
  themeStylePolicy?: string;
  themeStyleContext?: unknown;
  themeStyleSnapshotHash?: string;
  generationRequirements?: unknown;
  generationPrompt?: string;
  /** Canonical ordinary Build source metadata. */
  buildSource?: unknown;
  /** Historical converter-boundary compatibility field. */
  stageASource?: unknown;
  prototypeHtmlCritique?: unknown;
  finalVisualEvidence?: unknown;
  repairWorkspaceDir?: string;
  frameworkContext?: unknown;
  // Pixflow-owned: when a focused visual repair is required it must use the
  // user's selected local execution route. A compiler-certified clean
  // Prototype Bricks baseline may skip the initial model audit entirely.
  runnerId?: string;
  model?: string;
  reasoning?: string;
  // Pixflow-owned: WordPress provides the installed Bricks schema snapshot at
  // the explicit handoff boundary only. The bridge writes it as a sidecar for
  // the model repair pass.
  bricksSchemaSnapshot?: unknown;
  bricksKnowledgeSnapshot?: unknown;
  converterSkillPack?: unknown;
};

type BricksHandoffConvertResult = {
  ok: true;
  result: Record<string, unknown>;
  resultSignature: BricksResultSignature;
  artifacts: BricksHandoffArtifacts;
  workspaceDir: string;
  localMediaAssets: ConverterLocalMediaAsset[];
  sourceManifest: PixflowHtmlSourceManifest;
  compatibility: PixflowBricksCompatibilityContext;
  runtimeDiagnostics?: Array<Record<string, unknown>>;
  summary: {
    mode: string;
    runnerId: string;
    model: string | null;
    reasoning: string | null;
    modelEventsCount: number;
    modelInvocationCount: number;
    resultChangedFromBaseline: boolean;
    elementCount: number;
    globalClassCount: number;
    headerElementCount: number;
    footerElementCount: number;
    pageSettingsApplied: boolean;
    compatibilityProfileId: string;
    compatibilityProfileVersion: string;
    compatibilityStatus: PixflowBricksCompatibilityContext['status'];
    compatibilityBricksVersion: string | null;
    compatibilityFallbackUsed: boolean;
  };
} | {
  ok: false;
  code: string;
  message: string;
  status: number;
  stderr?: string;
  runtimeDiagnostics?: Array<Record<string, unknown>>;
};

type BricksResultSignature = {
  sha256: string;
  size: number;
};

export type ConverterLocalMediaAsset = {
  ref: string;
  projectPath: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
};

export function buildBricksResultSignature(bytes: Uint8Array): BricksResultSignature {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  };
}

// Uploaded HTML often includes inlined framework payloads and hydrated route
// data. Keep one bounded ceiling for both baseline and Stage B conversion,
// but do not reject ordinary saved-page exports before the converter can
// materialize their assets and structure.
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_HTML_TO_BRICKS_TEXT_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_HTML_TO_BRICKS_CONTEXT_FILES = 128;
const HANDOFF_RUN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_CONVERTER_MEDIA_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CONVERTER_MEDIA_TOTAL_BYTES = 24 * 1024 * 1024;
// Complete saved pages commonly exceed 48 distinct referenced images (for
// example product/category grids). The byte caps remain the primary transport
// bound; this count cap protects pathological payloads without rejecting a
// legitimate image-heavy page before WordPress import.
const MAX_CONVERTER_MEDIA_FILES = 96;

export type HandoffPrimaryHtmlInput = {
  html?: unknown;
  sourcePath?: unknown;
  htmlProjectFile?: unknown;
};

class HandoffPrimaryHtmlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HandoffPrimaryHtmlError';
  }
}

export async function hydrateHandoffPrimaryHtml(
  input: HandoffPrimaryHtmlInput,
  sourceProjectRoot: string | undefined,
): Promise<string> {
  const inlineHtml = String(input.html || '');
  if (inlineHtml.trim() !== '') {
    if (Buffer.byteLength(inlineHtml, 'utf8') > MAX_HTML_BYTES) {
      throw new HandoffPrimaryHtmlError(
        'html_too_large',
        'The generated HTML artifact is too large for Bricks handoff conversion.',
        413,
      );
    }
    return inlineHtml;
  }

  const reference = objectValue(input.htmlProjectFile);
  if (reference.projectFile !== true) {
    throw new HandoffPrimaryHtmlError(
      'missing_html',
      'No generated HTML was supplied for Bricks handoff conversion.',
      422,
    );
  }
  const declaredSize = Number(reference.size);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_HTML_BYTES) {
    throw new HandoffPrimaryHtmlError(
      'html_too_large',
      'The generated HTML artifact is too large for Bricks handoff conversion.',
      413,
    );
  }
  const projectPath = String(reference.path || input.sourcePath || '').trim();
  const resolvedPath = resolveProjectContextFilePath(sourceProjectRoot, projectPath);
  if (!resolvedPath) {
    throw new HandoffPrimaryHtmlError(
      'html_project_file_unsafe',
      'The canonical HTML project-file reference could not be resolved safely.',
      422,
    );
  }

  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new HandoffPrimaryHtmlError(
      'html_project_file_not_found',
      'The canonical HTML project file could not be read from the selected project.',
      422,
    );
  }
  if (!stat.isFile()) {
    throw new HandoffPrimaryHtmlError(
      'html_project_file_not_found',
      'The canonical HTML project-file reference is not a regular file.',
      422,
    );
  }
  if (stat.size > MAX_HTML_BYTES) {
    throw new HandoffPrimaryHtmlError(
      'html_too_large',
      'The generated HTML artifact is too large for Bricks handoff conversion.',
      413,
    );
  }
  const html = await fs.readFile(resolvedPath, 'utf8');
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new HandoffPrimaryHtmlError(
      'html_too_large',
      'The generated HTML artifact is too large for Bricks handoff conversion.',
      413,
    );
  }
  if (html.trim() === '') {
    throw new HandoffPrimaryHtmlError(
      'missing_html',
      'The canonical HTML project file is empty.',
      422,
    );
  }
  return html;
}

const CONVERTER_MEDIA_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/**
 * Carries media materialized by the deterministic converter across the daemon
 * boundary without exposing its temporary workspace to the browser. Only
 * referenced, regular media files contained by that workspace are eligible.
 */
export async function collectConverterLocalMediaAssets(
  workspaceDir: string,
  result: Record<string, unknown>,
): Promise<ConverterLocalMediaAsset[]> {
  const refs: string[] = [];
  const addRef = (candidate: string) => {
    const ref = candidate.trim();
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|[\\/]|#)/i.test(ref)) return;
    const clean = ref.replace(/\\/g, '/').split(/[?#]/, 1)[0] || '';
    if (!clean || clean.split('/').some((part) => part === '..')) return;
    const extension = path.extname(clean).toLowerCase();
    if (!CONVERTER_MEDIA_MIME_BY_EXTENSION[extension] && (extension || !clean.includes('/'))) return;
    refs.push(ref);
  };
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      addRef(value);
      for (const match of value.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi)) {
        addRef(match[2] || '');
      }
      for (const match of value.matchAll(/\b(?:src|poster)\s*=\s*(['"])(.*?)\1/gi)) {
        addRef(match[2] || '');
      }
      for (const match of value.matchAll(/\bsrcset\s*=\s*(['"])(.*?)\1/gi)) {
        for (const candidate of (match[2] || '').split(',')) {
          addRef(candidate.trim().split(/\s+/, 1)[0] || '');
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(result);

  const root = await fs.realpath(workspaceDir);
  const assets: ConverterLocalMediaAsset[] = [];
  let totalBytes = 0;
  for (const ref of [...new Set(refs)]) {
    const clean = ref.replace(/\\/g, '/').split(/[?#]/, 1)[0] || '';
    const parts = clean.split('/');
    // Saved-page supporting files are materialized beneath source-resources
    // before the deterministic compiler runs, while its Bricks output keeps
    // the bundle-relative URL authored by the canonical HTML. Resolve that
    // Pixflow-owned storage layout without broadening which result references
    // are eligible for transport.
    const candidates = [
      path.resolve(root, ...parts),
      path.resolve(root, 'stage-a', 'source-resources', ...parts),
    ];
    let realPath = '';
    for (const candidate of candidates) {
      if (!candidate.startsWith(`${root}${path.sep}`)) continue;
      try {
        const resolved = await fs.realpath(candidate);
        if (resolved.startsWith(`${root}${path.sep}`)) {
          realPath = resolved;
          break;
        }
      } catch {
        // Try the next Pixflow-owned materialization location.
      }
    }
    if (!realPath) continue;
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) continue;
    if (stat.size <= 0 || stat.size > MAX_CONVERTER_MEDIA_FILE_BYTES) {
      throw new Error(`Converter media ${ref} is empty or exceeds the 8 MB per-file handoff limit.`);
    }
    if (assets.length >= MAX_CONVERTER_MEDIA_FILES) {
      throw new Error(`The converter result exceeds the ${MAX_CONVERTER_MEDIA_FILES}-file media handoff limit.`);
    }
    totalBytes += stat.size;
    if (totalBytes > MAX_CONVERTER_MEDIA_TOTAL_BYTES) {
      throw new Error('Converter media exceeds the 24 MB Bricks handoff limit.');
    }
    const bytes = await fs.readFile(realPath);
    const mimeType = CONVERTER_MEDIA_MIME_BY_EXTENSION[path.extname(clean).toLowerCase()]
      || detectConverterMediaMime(bytes);
    if (!mimeType) continue;
    assets.push({
      ref,
      projectPath: clean,
      filename: path.basename(clean),
      mimeType,
      contentBase64: bytes.toString('base64'),
      sizeBytes: bytes.byteLength,
    });
  }
  return assets;
}

function detectConverterMediaMime(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && /^(?:GIF87a|GIF89a)$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString('ascii').includes('ftypavif')) return 'image/avif';
  return '';
}

export function buildBricksHandoffCliArgs(input: {
  stageAWorkspace: string;
  handoffRoot: string;
  sourceId: string;
  runnerId: string;
  deterministic: boolean;
  includePageTemplates?: boolean;
  model?: string;
  reasoning?: string;
}): string[] {
  const args = [
    'run-bricks-handoff',
    '--stage-a-workspace',
    input.stageAWorkspace,
    '--workspace',
    input.handoffRoot,
    '--force',
    '--include-header',
    input.includePageTemplates === false ? 'no' : 'yes',
    '--header-scope',
    'current-page',
    '--include-footer',
    input.includePageTemplates === false ? 'no' : 'yes',
    '--footer-scope',
    'current-page',
    '--project-id',
    input.sourceId,
    '--runner',
    input.runnerId,
  ];
  if (input.deterministic) {
    args.push('--deterministic', 'true');
  }
  args.push('--repair-attempts', '0');
  // The deterministic payload is streamed as a reversible preview baseline.
  // A normal run can accept it only when the bridge emits the strict certified
  // fast-path evidence; otherwise the selected model still owns Stage B.
  if (input.deterministic) {
    args.push('--allow-low-stage-b-qa');
  }
  args.push('--json');
  if (input.model) args.push('--model', input.model);
  if (input.reasoning) args.push('--reasoning', input.reasoning);
  return args;
}

export function buildBricksHandoffRepairCliArgs(input: {
  workspaceDir: string;
  runnerId: string;
  model?: string;
  reasoning?: string;
}): string[] {
  const args = [
    'repair-bricks-handoff',
    '--workspace',
    input.workspaceDir,
    '--runner',
    input.runnerId,
    '--repair-attempts',
    '1',
    '--json',
  ];
  if (input.model) args.push('--model', input.model);
  if (input.reasoning) args.push('--reasoning', input.reasoning);
  return args;
}

// Pixflow-owned: bridge-side Bricks handoff conversion wrapper. The actual
// converter is the proven Pixflow AI HTML-to-Bricks CLI copied into
// tools/pixflow-design-bridge; this file creates an isolated workspace, runs
// the model cleanup/QA/repair flow, and returns the final Bricks result for
// WordPress insertion.
export async function convertHtmlForBricksHandoff(
  input: BricksHandoffConvertInput,
  options: {
    projectRoot: string;
    dataDir: string;
    signal?: AbortSignal;
    // Pixflow-owned: live Bricks handoff panels tail the runner events while
    // the isolated handoff model is still running. Normal generation is
    // unaffected because this callback is only provided by the explicit
    // Handoff to Bricks streaming route.
    onChatEvents?: (events: Array<Record<string, unknown>>) => void;
    onBaseline?: (baseline: {
      result: Record<string, unknown>;
      artifacts: BricksHandoffArtifacts;
      workspaceDir: string;
      localMediaAssets: ConverterLocalMediaAsset[];
      sourceManifest: PixflowHtmlSourceManifest;
    }) => Promise<void> | void;
    onMutation?: (mutation: PixflowBricksMutationBatch) => void;
    onRuntimeDiagnostic?: (diagnostic: Record<string, unknown>) => void;
  },
): Promise<BricksHandoffConvertResult> {
  const sourceProjectRoot = resolveHandoffSourceProjectRoot(options.dataDir, input.sourceId);
  let html: string;
  try {
    html = await hydrateHandoffPrimaryHtml(input, sourceProjectRoot);
  } catch (error) {
    if (error instanceof HandoffPrimaryHtmlError) {
      return failure(error.code, error.message, error.status);
    }
    throw error;
  }

  const sourceId = slugify(input.sourceId || input.title || 'pixflow-bricks-handoff');
  const title = String(input.title || sourceId || 'Pixflow Bricks Handoff').trim();
  const conversionProfile = normalizeConversionProfile(input.conversionProfile);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-bricks-handoff-'));
  const stageAWorkspace = path.join(root, 'stage-a');
  const stageADrafts = path.join(stageAWorkspace, 'drafts');
  const handoffRoot = path.join(root, 'bricks-handoff-conversion');
  const artifactPath = path.join(stageADrafts, 'index.html');

  await fs.mkdir(stageADrafts, { recursive: true });
  await fs.writeFile(artifactPath, html, 'utf8');
  await fs.writeFile(
    path.join(stageAWorkspace, 'prompt.md'),
    `${normalizeGenerationPrompt(input.generationPrompt)}\n`,
    'utf8',
  );
  const sourceManifest = normalizeSourceManifest(input.handoffFiles, {
    title,
    sourcePath: input.sourcePath || 'index.html',
  });
  const handoffContext = await hydrateHandoffProjectTextContextFiles(
    normalizeHandoffContextFiles(input.contextFiles),
    sourceProjectRoot,
  );
  await fs.writeFile(path.join(stageAWorkspace, 'metadata.json'), `${JSON.stringify({
    sourceId,
    title,
    sourcePath: input.sourcePath || 'index.html',
    conversionProfile,
    sourceContract: input.sourceContract || null,
    themeStylePolicy: input.themeStylePolicy || null,
    themeStyleSnapshotHash: input.themeStyleSnapshotHash || null,
    stageASource: normalizeStageASource(input.buildSource ?? input.stageASource),
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  let sourceSnapshot: Awaited<ReturnType<typeof prepareStageAHtmlSource>>;
  try {
    sourceSnapshot = await prepareStageAHtmlSource({
      input,
      html,
      stageAWorkspace,
      sourceId,
      sourceProjectRoot,
      contextFiles: handoffContext,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('HTML_SOURCE_RENDER_INCOMPLETE')) {
      return failure(
        'html_source_render_incomplete',
        'The saved HTML source did not produce a complete visible page in the isolated converter. Check that its required local files were uploaded, then retry the source step.',
        422,
        message,
      );
    }
    return failure('html_source_evidence_failed', message || 'HTML source evidence could not be prepared.', 422);
  }
  await fs.writeFile(artifactPath, sourceSnapshot.html, 'utf8');
  await writeHandoffSourceSidecars(stageAWorkspace, sourceManifest, handoffContext, {
    conversionProfile,
    generationScope: input.generationScope,
    sourceContract: input.sourceContract,
    themeStylePolicy: input.themeStylePolicy,
    themeStyleContext: input.themeStyleContext,
    themeStyleSnapshotHash: input.themeStyleSnapshotHash,
    generationRequirements: input.generationRequirements,
    generationPrompt: input.generationPrompt,
    stageASource: input.buildSource ?? input.stageASource,
    prototypeHtmlCritique: input.prototypeHtmlCritique,
    frameworkContext: input.frameworkContext,
    sourceProjectRoot,
  });
  if (input.finalVisualEvidence && typeof input.finalVisualEvidence === 'object') {
    const finalVisualEvidence = await materializeFinalVisualEvidenceScreenshots(
      stageAWorkspace,
      sourceProjectRoot,
      input.finalVisualEvidence,
    );
    await fs.writeFile(
      path.join(stageAWorkspace, 'stage-b-visual-parity.json'),
      `${JSON.stringify(finalVisualEvidence, null, 2)}\n`,
      'utf8',
    );
  }
  if (input.bricksSchemaSnapshot && typeof input.bricksSchemaSnapshot === 'object') {
    await fs.writeFile(
      path.join(stageAWorkspace, 'bricks-schema-snapshot.json'),
      `${JSON.stringify(input.bricksSchemaSnapshot, null, 2)}\n`,
      'utf8',
    );
  }
  if (input.bricksKnowledgeSnapshot && typeof input.bricksKnowledgeSnapshot === 'object') {
    await fs.writeFile(
      path.join(stageAWorkspace, 'bricks-runtime-knowledge.json'),
      `${JSON.stringify(input.bricksKnowledgeSnapshot, null, 2)}\n`,
      'utf8',
    );
  }

  const cliPath = resolveHandoffCliPath(options.projectRoot);
  if (!cliPath) {
    return failure('bricks_handoff_cli_missing', 'Pixflow Bricks handoff converter is not available in the local bridge.', 500);
  }

  let converterSkillRoot: string;
  try {
    converterSkillRoot = await materializePixflowBricksConverterSkillPack(
      input.converterSkillPack,
      path.join(root, 'plugin-owned-converter-skills'),
    );
  } catch (error) {
    return failure(
      'bricks_converter_skill_pack_invalid',
      error instanceof Error ? error.message : 'The plugin-owned Pixflow Bricks converter abilities are invalid.',
      422,
    );
  }

  const runnerId = normalizeRunnerId(input.runnerId);
  const model = normalizeOptionalString(input.model);
  const reasoning = normalizeOptionalString(input.reasoning);
  const reusableWorkspace = resolveReusableBricksHandoffWorkspace(input.repairWorkspaceDir);
  if (String(input.repairWorkspaceDir || '').trim() && !reusableWorkspace) {
    return failure(
      'bricks_handoff_repair_workspace_invalid',
      'The prior Stage B workspace is unavailable or is not a Pixflow-owned temporary handoff workspace. Refusing to rebuild a different baseline for visual repair.',
      422,
    );
  }
  const workspaceDir = reusableWorkspace || path.join(handoffRoot, sourceId);
  if (reusableWorkspace && input.finalVisualEvidence && typeof input.finalVisualEvidence === 'object') {
    const currentResultFile = path.join(reusableWorkspace, 'bricks-result.json');
    const currentResultBytes = await fs.readFile(currentResultFile);
    const signedEvidence = {
      ...objectValue(input.finalVisualEvidence),
      resultSignature: {
        sha256: createHash('sha256').update(currentResultBytes).digest('hex'),
        size: currentResultBytes.length,
      },
    };
    const materializedEvidence = await materializeFinalVisualEvidenceScreenshots(
      path.join(reusableWorkspace, 'stage-a'),
      sourceProjectRoot,
      signedEvidence,
    );
    await fs.writeFile(
      path.join(reusableWorkspace, 'stage-b-visual-parity.json'),
      `${JSON.stringify(materializedEvidence, null, 2)}\n`,
      'utf8',
    );
  }
  const cliArgs = reusableWorkspace
    ? buildBricksHandoffRepairCliArgs({
        workspaceDir,
        runnerId,
        ...(model ? { model } : {}),
        ...(reasoning ? { reasoning } : {}),
      })
    : buildBricksHandoffCliArgs({
        stageAWorkspace,
        handoffRoot,
        sourceId,
        runnerId,
        deterministic: false,
        includePageTemplates: conversionProfile !== 'prototype_bricks',
        ...(model ? { model } : {}),
        ...(reasoning ? { reasoning } : {}),
      });
  const runtimeDiagnostics: Array<Record<string, unknown>> = [];
  const recordRuntimeDiagnostic = (diagnostic: Record<string, unknown>) => {
    const entry = {
      ...diagnostic,
      timestamp: typeof diagnostic.timestamp === 'number' ? diagnostic.timestamp : Date.now(),
    };
    runtimeDiagnostics.push(entry);
    if (runtimeDiagnostics.length > 200) runtimeDiagnostics.splice(0, runtimeDiagnostics.length - 200);
    options.onRuntimeDiagnostic?.(entry);
  };
  recordRuntimeDiagnostic({
    type: 'runner_preparing',
    runnerId,
    model,
    reasoning,
    workspaceDir,
    repairMode: Boolean(reusableWorkspace),
    timeoutMs: HANDOFF_RUN_TIMEOUT_MS,
  });
  const eventTailer = options.onChatEvents
    ? createRunnerEventTailer(workspaceDir, options.onChatEvents)
    : null;
  const baselineTailer = options.onBaseline
    ? createBaselineTailer(workspaceDir, (baseline) => options.onBaseline?.({ ...baseline, sourceManifest: sourceSnapshot.manifest }))
    : null;
  const mutationTailer = options.onMutation
    ? createStageBMutationTailer(workspaceDir, options.onMutation, {
        seedCurrentResult: Boolean(reusableWorkspace),
      })
    : null;
  eventTailer?.start();
  baselineTailer?.start();
  mutationTailer?.start();

  let run: Awaited<ReturnType<typeof runNode>>;
  try {
    run = await runNodeWithFailureWatch(
      cliPath,
      cliArgs,
      options.projectRoot,
      workspaceDir,
      options.signal,
      recordRuntimeDiagnostic,
      { PIXFLOW_BRICKS_SKILL_PACK_ROOT: converterSkillRoot },
    );
  } finally {
    await mutationTailer?.stop();
    await baselineTailer?.stop();
    await eventTailer?.stop();
  }

  if (run.timedOut) {
    return failure(
      'bricks_handoff_runner_timeout',
      'Bricks handoff model run timed out before the runner could finish.',
      504,
      run.stderr,
      runtimeDiagnostics,
    );
  }
  const resultFile = path.join(workspaceDir, 'bricks-result.json');
  if (run.code !== 0) {
    return failure(
      'bricks_handoff_runner_failed',
      run.stderr || run.stdout || `Bricks handoff runner exited with code ${run.code}.`,
      500,
      run.stderr,
      runtimeDiagnostics,
    );
  }
  if (!existsSync(resultFile)) {
    return failure(
      'bricks_handoff_result_missing',
      run.stderr || run.stdout || 'Bricks handoff model runner did not produce bricks-result.json.',
      500,
      run.stderr,
      runtimeDiagnostics,
    );
  }

  const resultBytes = await fs.readFile(resultFile);
  const parsed = JSON.parse(resultBytes.toString('utf8')) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failure(
      'bricks_handoff_result_invalid',
      'Bricks handoff model runner wrote an invalid bricks-result.json.',
      500,
      run.stderr,
      runtimeDiagnostics,
    );
  }
  const content = Array.isArray(parsed.content) ? parsed.content : [];
  const globalClasses = Array.isArray(parsed.global_classes)
    ? parsed.global_classes
    : (Array.isArray(parsed.globalClasses) ? parsed.globalClasses : []);
  const header = objectValue(parsed.stage_b_header);
  const footer = objectValue(parsed.stage_b_footer);
  const headerContent = Array.isArray(header.content) ? header.content : [];
  const footerContent = Array.isArray(footer.content) ? footer.content : [];
  const diagnostics = objectValue(parsed.diagnostics);
  const artifacts = await readBricksHandoffArtifacts(workspaceDir);
  const modelRunEvidence = await buildModelRunEvidence({
    workspaceDir,
    runnerId,
    model,
    reasoning,
    baselineFile: path.join(workspaceDir, 'bricks-baseline.json'),
    resultFile,
  });
  artifacts.json.modelRunEvidence = modelRunEvidence;
  artifacts.json.runnerEvents = await readRunnerEventsForChat(workspaceDir);
  artifacts.files.push('pixflow-model-run-evidence.json');
  const runnerPrompt = await readFirstExistingText([
    path.join(workspaceDir, `${runnerId}-stage-b-prompt.txt`),
    path.join(workspaceDir, 'codex-stage-b-prompt.txt'),
  ]);
  if (runnerPrompt) {
    artifacts.text.runnerPrompt = runnerPrompt;
    artifacts.files.push('bricks-runner-prompt.txt');
  }
  const critique = await readFirstExistingText([path.join(workspaceDir, 'handoff-critique.md')]);
  if (critique) {
    artifacts.text.handoffCritique = critique;
    artifacts.files.push('bricks-handoff-critique.md');
  }
  const qa = objectValue(artifacts.json.qa ?? parsed.stage_b_qa);
  const qaStatus = String(qa.status || qa.result || '').toLowerCase();
  if (qa.blocking === true || ['failed', 'fail', 'blocking', 'blocked', 'repair_required', 'repairs_required', 'blocking_repairs_required'].includes(qaStatus)) {
    return failure(
      'bricks_handoff_qa_failed',
      `Bricks handoff model QA failed${qaStatus ? ` with status ${qaStatus}` : ''}.`,
      422,
      run.stderr || run.stdout,
      runtimeDiagnostics,
    );
  }
  const certifiedFastPath = !reusableWorkspace && isCertifiedPrototypeBricksStageBFastPath(diagnostics, qa);
  modelRunEvidence.certifiedFastPath = certifiedFastPath;
  if (!certifiedFastPath && modelRunEvidence.resultChangedFromBaseline !== true) {
    recordRuntimeDiagnostic({
      type: 'stage_b_noop_baseline_retained',
      hasCritique: modelRunEvidence.hasCritique === true,
      reason: 'The one bounded model pass made no structurally verified improvement.',
    });
  }
  const agentReport = await ensureStageBAgentReport({
    workspaceDir,
    qa,
    modelRunEvidence,
    summary: {
      runnerId,
      model,
      reasoning,
      elementCount: content.length,
      globalClassCount: globalClasses.length,
      headerElementCount: headerContent.length,
      footerElementCount: footerContent.length,
      pageSettingsApplied: objectValue(parsed.page_settings).customScriptsBodyFooter !== undefined,
    },
  });
  artifacts.text.agentReport = agentReport;
  if (!artifacts.files.includes('stage-b-agent-report.md')) {
    artifacts.files.push('stage-b-agent-report.md');
  }
  if (run.code !== 0) {
    artifacts.json.runnerExit = {
      code: run.code,
      acceptedBecause: 'valid_result_and_passing_qa',
    };
  }
  recordRuntimeDiagnostic({
    type: 'handoff_result_ready',
    modelInvocationCount: certifiedFastPath ? 0 : 1,
    resultChangedFromBaseline: modelRunEvidence.resultChangedFromBaseline === true,
    eventsCount: Number(modelRunEvidence.eventsCount || 0),
    certifiedFastPath,
  });

  const compatibility = normalizePixflowBricksCompatibilityContext(parsed.bricks_compatibility);

  return {
    ok: true,
    result: parsed,
    resultSignature: buildBricksResultSignature(resultBytes),
    artifacts,
    workspaceDir,
    localMediaAssets: await collectConverterLocalMediaAssets(workspaceDir, parsed),
    sourceManifest: sourceSnapshot.manifest,
    compatibility,
    runtimeDiagnostics,
    summary: {
      mode: certifiedFastPath
        ? 'pixflow_certified_fast_path'
        : (Number(modelRunEvidence.eventsCount || 0) > 0 && modelRunEvidence.resultChangedFromBaseline === true
            ? 'pixflow_model_handoff'
            : (typeof diagnostics.stage_b_mode === 'string' ? diagnostics.stage_b_mode : 'pixflow_model_handoff')),
      runnerId,
      model,
      reasoning,
      modelEventsCount: Number(modelRunEvidence.eventsCount || 0),
      modelInvocationCount: certifiedFastPath ? 0 : 1,
      resultChangedFromBaseline: modelRunEvidence.resultChangedFromBaseline === true,
      elementCount: content.length,
      globalClassCount: globalClasses.length,
      headerElementCount: headerContent.length,
      footerElementCount: footerContent.length,
      pageSettingsApplied: objectValue(parsed.page_settings).customScriptsBodyFooter !== undefined,
      compatibilityProfileId: compatibility.profileId,
      compatibilityProfileVersion: compatibility.profileVersion,
      compatibilityStatus: compatibility.status,
      compatibilityBricksVersion: compatibility.bricksVersion,
      compatibilityFallbackUsed: compatibility.fallbackUsed,
    },
  };
}

export function isCertifiedPrototypeBricksStageBFastPath(
  diagnosticsInput: unknown,
  qaInput: unknown,
): boolean {
  const diagnostics = objectValue(diagnosticsInput);
  const certificate = objectValue(diagnostics.certifiedFastPath ?? diagnostics.certified_fast_path);
  const qa = objectValue(qaInput);
  const qualityGate = objectValue(qa.qualityGate ?? qa.quality_gate);
  const severity = objectValue(qa.severity);
  const summary = objectValue(qa.summary);
  return diagnostics.stage_b_mode === 'certified_fast_path'
    && certificate.certified === true
    && certificate.schema === 'pixflow.prototype_bricks.stage_b_fast_path.v1'
    && certificate.conversionProfile === 'prototype_bricks'
    && certificate.schemaPassed === true
    && certificate.qualityPassed === true
    && certificate.nextGate === 'atomic_apply_then_frontend_visual_capture'
    && qa.status === 'passed'
    && qa.blocking !== true
    && Number(qa.score || 0) === 100
    && qualityGate.passed === true
    && Number(severity.p0 || 0) === 0
    && Number(severity.p1 || 0) === 0
    && Number(severity.p2 || 0) === 0
    && Number(summary.elementCount || certificate.elementCount || 0) > 0;
}

export function resolveReusableBricksHandoffWorkspace(value: unknown): string | null {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempRoot}${path.sep}`)) return null;
  const relativeParts = path.relative(tempRoot, resolved).split(path.sep).filter(Boolean);
  if (!relativeParts[0] || !/^(?:pixflow-bricks-handoff-|pixflow-bricks-baseline-)/.test(relativeParts[0])) return null;
  if (!existsSync(path.join(resolved, 'bricks-result.json'))
    || !existsSync(path.join(resolved, 'bricks-baseline.json'))
    || !existsSync(path.join(resolved, 'AGENTS.md'))) {
    return null;
  }
  return resolved;
}

export async function materializeFinalVisualEvidenceScreenshots(
  stageAWorkspace: string,
  sourceProjectRoot: string | undefined,
  value: unknown,
): Promise<Record<string, unknown>> {
  const evidence = structuredClone(objectValue(value));
  if (!sourceProjectRoot) return evidence;

  const sourceRoot = path.resolve(sourceProjectRoot);
  const targetDir = path.join(stageAWorkspace, 'screenshots');
  const rewrittenPaths = new Map<string, string>();
  for (const screenshotPath of Array.isArray(evidence.finalScreenshots) ? evidence.finalScreenshots : []) {
    const relativePath = String(screenshotPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relativePath || relativePath.split('/').some((part) => part === '..')) continue;
    const sourcePath = path.resolve(sourceRoot, ...relativePath.split('/'));
    if (!sourcePath.startsWith(`${sourceRoot}${path.sep}`) || !existsSync(sourcePath)) continue;
    const baseName = path.basename(sourcePath);
    const targetPath = path.join(targetDir, `rejected-stage-b-${baseName}`);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    rewrittenPaths.set(relativePath, `stage-a/screenshots/${path.basename(targetPath)}`);
  }

  if (rewrittenPaths.size === 0) return evidence;
  evidence.finalScreenshots = (evidence.finalScreenshots as unknown[]).map((entry) => {
    const normalized = String(entry || '').replace(/\\/g, '/').replace(/^\/+/, '');
    return rewrittenPaths.get(normalized) || entry;
  });
  if (Array.isArray(evidence.captures)) {
    evidence.captures = evidence.captures.map((capture) => {
      const record = objectValue(capture);
      const normalized = String(record.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      return rewrittenPaths.has(normalized) ? { ...record, path: rewrittenPaths.get(normalized) } : record;
    });
  }
  return evidence;
}

export async function convertHtmlForBricksBaseline(
  input: BricksHandoffConvertInput,
  options: {
    projectRoot: string;
    dataDir: string;
  },
): Promise<BricksHandoffConvertResult> {
  const sourceProjectRoot = resolveHandoffSourceProjectRoot(options.dataDir, input.sourceId);
  let html: string;
  try {
    html = await hydrateHandoffPrimaryHtml(input, sourceProjectRoot);
  } catch (error) {
    if (error instanceof HandoffPrimaryHtmlError) {
      const message = error.code === 'missing_html'
        ? 'No generated HTML was supplied for Bricks baseline conversion.'
        : error.message;
      return failure(error.code, message, error.status);
    }
    throw error;
  }

  const sourceId = slugify(input.sourceId || input.title || 'pixflow-bricks-handoff');
  const title = String(input.title || sourceId || 'Pixflow Bricks Handoff').trim();
  const conversionProfile = normalizeConversionProfile(input.conversionProfile);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-bricks-baseline-'));
  const stageAWorkspace = path.join(root, 'stage-a');
  const stageADrafts = path.join(stageAWorkspace, 'drafts');
  const handoffRoot = path.join(root, 'bricks-handoff-baseline');
  const artifactPath = path.join(stageADrafts, 'index.html');

  await fs.mkdir(stageADrafts, { recursive: true });
  await fs.writeFile(artifactPath, html, 'utf8');
  await fs.writeFile(
    path.join(stageAWorkspace, 'prompt.md'),
    `${normalizeGenerationPrompt(input.generationPrompt)}\n`,
    'utf8',
  );
  const sourceManifest = normalizeSourceManifest(input.handoffFiles, {
    title,
    sourcePath: input.sourcePath || 'index.html',
  });
  const handoffContext = await hydrateHandoffProjectTextContextFiles(
    normalizeHandoffContextFiles(input.contextFiles),
    sourceProjectRoot,
  );
  await fs.writeFile(path.join(stageAWorkspace, 'metadata.json'), `${JSON.stringify({
    sourceId,
    title,
    sourcePath: input.sourcePath || 'index.html',
    conversionProfile,
    stageASource: normalizeStageASource(input.buildSource ?? input.stageASource),
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  const sourceSnapshot = await prepareStageAHtmlSource({
    input,
    html,
    stageAWorkspace,
    sourceId,
    sourceProjectRoot,
    contextFiles: handoffContext,
  });
  await fs.writeFile(artifactPath, sourceSnapshot.html, 'utf8');
  await writeHandoffSourceSidecars(stageAWorkspace, sourceManifest, handoffContext, {
    conversionProfile,
    generationScope: input.generationScope,
    sourceContract: input.sourceContract,
    themeStylePolicy: input.themeStylePolicy,
    themeStyleContext: input.themeStyleContext,
    themeStyleSnapshotHash: input.themeStyleSnapshotHash,
    generationRequirements: input.generationRequirements,
    generationPrompt: input.generationPrompt,
    stageASource: input.buildSource ?? input.stageASource,
    prototypeHtmlCritique: input.prototypeHtmlCritique,
    frameworkContext: input.frameworkContext,
    sourceProjectRoot,
  });
  if (input.bricksSchemaSnapshot && typeof input.bricksSchemaSnapshot === 'object') {
    await fs.writeFile(
      path.join(stageAWorkspace, 'bricks-schema-snapshot.json'),
      `${JSON.stringify(input.bricksSchemaSnapshot, null, 2)}\n`,
      'utf8',
    );
  }
  if (input.bricksKnowledgeSnapshot && typeof input.bricksKnowledgeSnapshot === 'object') {
    await fs.writeFile(
      path.join(stageAWorkspace, 'bricks-runtime-knowledge.json'),
      `${JSON.stringify(input.bricksKnowledgeSnapshot, null, 2)}\n`,
      'utf8',
    );
  }

  const cliPath = resolveHandoffCliPath(options.projectRoot);
  if (!cliPath) {
    return failure('bricks_handoff_cli_missing', 'Pixflow Bricks handoff converter is not available in the local bridge.', 500);
  }
  const cliArgs = buildBricksHandoffCliArgs({
    stageAWorkspace,
    handoffRoot,
    sourceId,
    runnerId: 'deterministic',
    deterministic: true,
    includePageTemplates: conversionProfile !== 'prototype_bricks',
  });

  const workspaceDir = path.join(handoffRoot, sourceId);
  const run = await runNode(cliPath, cliArgs, options.projectRoot);
  if (run.timedOut) {
    return failure(
      'bricks_baseline_runner_timeout',
      'Bricks baseline conversion timed out before the runner could finish.',
      504,
      run.stderr,
    );
  }

  const resultFile = path.join(workspaceDir, 'bricks-result.json');
  const baselineFile = path.join(workspaceDir, 'bricks-baseline.json');
  const outputFile = existsSync(resultFile) ? resultFile : baselineFile;
  if (!existsSync(outputFile)) {
    return failure(
      'bricks_baseline_result_missing',
      run.stderr || run.stdout || 'Bricks baseline converter did not produce bricks-result.json.',
      500,
      run.stderr,
    );
  }
  const outputBytes = await fs.readFile(outputFile);
  const parsed = JSON.parse(outputBytes.toString('utf8')) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failure(
      'bricks_baseline_result_invalid',
      'Bricks baseline converter wrote an invalid bricks-result.json.',
      500,
      run.stderr,
    );
  }
  await copyOptionalFile(
    path.join(stageAWorkspace, 'stage-b-media-intent.json'),
    path.join(workspaceDir, 'stage-b-media-intent.json'),
  );
  const artifacts = await readBricksHandoffArtifacts(workspaceDir);
  artifacts.json.runnerEvents = await readRunnerEventsForChat(workspaceDir);
  const content = Array.isArray(parsed.content) ? parsed.content : [];
  const globalClasses = Array.isArray(parsed.global_classes)
    ? parsed.global_classes
    : (Array.isArray(parsed.globalClasses) ? parsed.globalClasses : []);
  const header = objectValue(parsed.stage_b_header);
  const footer = objectValue(parsed.stage_b_footer);
  const headerContent = Array.isArray(header.content) ? header.content : [];
  const footerContent = Array.isArray(footer.content) ? footer.content : [];
  const compatibility = normalizePixflowBricksCompatibilityContext(parsed.bricks_compatibility);

  return {
    ok: true,
    result: parsed,
    resultSignature: buildBricksResultSignature(outputBytes),
    artifacts,
    workspaceDir,
    localMediaAssets: await collectConverterLocalMediaAssets(workspaceDir, parsed),
    sourceManifest: sourceSnapshot.manifest,
    compatibility,
    summary: {
      mode: 'pixflow_html_baseline',
      runnerId: 'deterministic',
      model: null,
      reasoning: null,
      modelEventsCount: 0,
      modelInvocationCount: 0,
      resultChangedFromBaseline: false,
      elementCount: content.length,
      globalClassCount: globalClasses.length,
      headerElementCount: headerContent.length,
      footerElementCount: footerContent.length,
      pageSettingsApplied: Object.keys(objectValue(parsed.page_settings ?? parsed.pageSettings)).length > 0,
      compatibilityProfileId: compatibility.profileId,
      compatibilityProfileVersion: compatibility.profileVersion,
      compatibilityStatus: compatibility.status,
      compatibilityBricksVersion: compatibility.bricksVersion,
      compatibilityFallbackUsed: compatibility.fallbackUsed,
    },
  };
}

type HandoffSourceManifestEntry = {
  name: string;
  path: string;
  role: 'primary_html' | 'context' | 'reference_screenshot' | 'asset';
  order: number;
  mime?: string;
  kind?: string;
  artifactKind?: string;
  size?: number;
  title?: string;
  identifier?: string;
};

export type HandoffContextEntry = HandoffSourceManifestEntry & {
  text?: string;
  readError?: string;
  projectFile?: boolean;
  encoding?: 'base64';
  content?: string;
};

function normalizeSourceManifest(
  files: unknown[] | undefined,
  fallback: { title: string; sourcePath: string },
): HandoffSourceManifestEntry[] {
  const list = Array.isArray(files) && files.length > 0 ? files : [{
    name: fallback.title || 'index.html',
    path: fallback.sourcePath || 'index.html',
    role: 'primary_html',
    order: 0,
  }];
  return list
    .map((entry, index) => normalizeHandoffSourceEntry(entry, index))
    .filter((entry): entry is HandoffSourceManifestEntry => Boolean(entry))
    .sort((a, b) => a.order - b.order)
    .slice(0, 40);
}

export function normalizeHandoffContextFiles(files: unknown[] | undefined): HandoffContextEntry[] {
  if (!Array.isArray(files)) return [];
  return files
    .map((entry, index) => {
      const normalized = normalizeHandoffSourceEntry(entry, index);
      if (!normalized) return null;
      const record = objectValue(entry);
      const binaryContext = isBinaryHandoffContext(normalized);
      const mime = normalizeHandoffContextMime(normalized, binaryContext);
      const text = !binaryContext && typeof record.text === 'string'
        ? record.text
        : undefined;
      const textTooLarge = typeof text === 'string'
        && Buffer.byteLength(text, 'utf8') > MAX_HTML_TO_BRICKS_TEXT_RESOURCE_BYTES;
      const projectTextTooLarge = !binaryContext
        && record.projectFile === true
        && typeof normalized.size === 'number'
        && normalized.size > MAX_HTML_TO_BRICKS_TEXT_RESOURCE_BYTES;
      return {
        ...normalized,
        ...(mime ? { mime } : {}),
        ...(typeof text === 'string' && !textTooLarge ? { text } : {}),
        ...(textTooLarge || projectTextTooLarge
          ? { readError: 'Required text resource exceeds the HTML-to-Bricks transfer limit.' }
          : typeof record.readError === 'string' ? { readError: record.readError.slice(0, 500) } : {}),
        ...(record.projectFile === true ? { projectFile: true } : {}),
        ...(record.encoding === 'base64' && typeof record.content === 'string'
          ? { encoding: 'base64' as const, content: record.content }
          : {}),
      };
    })
    .filter((entry): entry is HandoffContextEntry => Boolean(entry))
    .slice(0, MAX_HTML_TO_BRICKS_CONTEXT_FILES);
}

export async function hydrateHandoffProjectTextContextFiles(
  files: HandoffContextEntry[],
  sourceProjectRoot: string | undefined,
): Promise<HandoffContextEntry[]> {
  return Promise.all(files.map(async (file) => {
    if (file.projectFile !== true
      || isBinaryHandoffContext(file)
      || typeof file.text === 'string'
      || file.readError) {
      return file;
    }
    const sourcePath = resolveProjectContextFilePath(sourceProjectRoot, file.path);
    if (!sourcePath) {
      return { ...file, readError: 'Project-local handoff text could not be resolved safely.' };
    }
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) {
        return { ...file, readError: 'Project-local handoff text is not a file.' };
      }
      if (stat.size > MAX_HTML_TO_BRICKS_TEXT_RESOURCE_BYTES) {
        return { ...file, readError: 'Required text resource exceeds the HTML-to-Bricks transfer limit.' };
      }
      const text = await fs.readFile(sourcePath, 'utf8');
      if (Buffer.byteLength(text, 'utf8') > MAX_HTML_TO_BRICKS_TEXT_RESOURCE_BYTES) {
        return { ...file, readError: 'Required text resource exceeds the HTML-to-Bricks transfer limit.' };
      }
      return { ...file, text };
    } catch {
      return { ...file, readError: 'Could not read this file from the project store before handoff.' };
    }
  }));
}

const HANDOFF_BINARY_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function isBinaryHandoffContext(file: HandoffSourceManifestEntry): boolean {
  if (file.role === 'reference_screenshot') return true;
  const mime = String(file.mime || '').trim().toLowerCase();
  if (/^(?:image|audio|video)\//.test(mime) || mime === 'application/pdf') return true;
  const extension = path.extname(file.path || file.name).toLowerCase();
  return Boolean(HANDOFF_BINARY_MIME_BY_EXTENSION[extension]);
}

function normalizeHandoffContextMime(
  file: HandoffSourceManifestEntry,
  binaryContext: boolean,
): string | undefined {
  const declaredMime = String(file.mime || '').trim().toLowerCase();
  if (!binaryContext) return declaredMime || undefined;
  const extension = path.extname(file.path || file.name).toLowerCase();
  const inferredMime = HANDOFF_BINARY_MIME_BY_EXTENSION[extension];
  if (inferredMime && !/^(?:image|audio|video)\//.test(declaredMime) && declaredMime !== 'application/pdf') {
    return inferredMime;
  }
  return declaredMime || inferredMime;
}

function normalizeHandoffSourceEntry(entry: unknown, index: number): HandoffSourceManifestEntry | null {
  const record = objectValue(entry);
  if (Object.keys(record).length === 0) return null;
  const name = normalizeOptionalString(record.name) || normalizeOptionalString(record.path) || `source-${index + 1}`;
  const filePath = normalizeOptionalString(record.path) || name;
  const role = normalizeHandoffRole(record.role);
  return {
    name,
    path: filePath,
    role,
    order: normalizeFiniteNumber(record.order, index),
    ...(normalizeOptionalString(record.mime) ? { mime: normalizeOptionalString(record.mime) as string } : {}),
    ...(normalizeOptionalString(record.kind) ? { kind: normalizeOptionalString(record.kind) as string } : {}),
    ...(normalizeOptionalString(record.artifactKind) ? { artifactKind: normalizeOptionalString(record.artifactKind) as string } : {}),
    ...(normalizeFiniteNumber(record.size, NaN) >= 0 ? { size: normalizeFiniteNumber(record.size, 0) } : {}),
    ...(normalizeOptionalString(record.title) ? { title: normalizeOptionalString(record.title) as string } : {}),
    ...(normalizeOptionalString(record.identifier) ? { identifier: normalizeOptionalString(record.identifier) as string } : {}),
  };
}

function normalizeHandoffRole(value: unknown): HandoffSourceManifestEntry['role'] {
  const role = String(value || '').trim();
  if (role === 'primary_html' || role === 'context' || role === 'reference_screenshot' || role === 'asset') {
    return role;
  }
  return 'context';
}

function normalizeConversionProfile(value: unknown): BricksHandoffConversionProfile {
  const profile = String(value || '').trim();
  return profile === 'prototype_bricks' ? 'prototype_bricks' : 'uploaded_html';
}

function normalizeGenerationScope(value: unknown): BricksHandoffGenerationScope {
  const scope = String(value || '').trim().toLowerCase();
  return scope === 'section' || scope === 'component' ? scope : 'full_page';
}

function normalizeGenerationPrompt(value: unknown): string {
  return String(value || '')
    .replace(/\0/gu, '')
    .replace(/\r\n?/gu, '\n')
    .trim()
    .slice(0, 4_000);
}

const GENERATION_REQUIREMENT_KINDS = new Set([
  'query_loop',
  'conditions',
  'dynamic_data',
  'interactions',
  'form',
]);

/**
 * The browser normally sends typed generation requirements, but the daemon is
 * the last trustworthy boundary before a converter workspace is created. A
 * stale panel bundle, a resumed handoff, or a local CLI caller may provide
 * only the natural prompt. Infer the small, structurally-verifiable
 * capability contract here as a backstop so a request such as “cards pulling
 * the post title and featured image” cannot silently become static HTML.
 */
export function inferGenerationRequirementsFromPrompt(prompt: unknown): Array<Record<string, unknown>> {
  const text = normalizeGenerationPrompt(prompt).toLowerCase();
  if (!text) return [];
  const requirements: Array<Record<string, unknown>> = [];
  if (/\bquery\s+loops?\b|\b(?:latest|newest|recent|most\s+recent|last)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:blog\s+)?posts?\b|\bposts?\s+per\s+page\b/.test(text)) {
    requirements.push({ kind: 'query_loop', minimumMatches: 1, source: 'prompt' });
  }
  if (/\b(?:pull(?:s|ing)?|fetch(?:es|ing)?|bind(?:s|ing)?|populate(?:s|d)?|show(?:s|ing)?|display(?:s|ing)?|use(?:s|ing)?)\b[\s\S]{0,120}\b(?:post\s+title|post\s+excerpt|post\s+date|published\s+date|featured\s+image|post\s+(?:url|link)|post\s+data)\b/.test(text)
    || /\bdynamic\s+(?:data|tags?)\b|\{(?:post|query|term|user|echo):/i.test(text)) {
    requirements.push({ kind: 'dynamic_data', minimumMatches: 1, source: 'prompt' });
  }
  if (/\bconditions?\b/.test(text)
    || (/\b(?:visible|visibility|show|shown|hide|hidden)\b/.test(text)
      && /\b(?:only|when|if|unless|logged|role|weekday|browser|operating\s+system|device|date|time)\b/.test(text))) {
    requirements.push({ kind: 'conditions', minimumMatches: 1, source: 'prompt' });
  }
  if (/\binteractions?\b|\b(?:animate|animation|reveal|entrance\s+effect)\b/.test(text)) {
    requirements.push({ kind: 'interactions', minimumMatches: 1, source: 'prompt' });
  }
  if (/\bforms?\b/.test(text)) {
    requirements.push({ kind: 'form', minimumMatches: 1, source: 'prompt' });
  }
  return requirements;
}

export function normalizeGenerationRequirements(value: unknown): Array<Record<string, unknown>> {
  const entries = Array.isArray(value) ? value : [];
  const byKind = new Map<string, Record<string, unknown>>();
  for (const item of entries.slice(0, 12)) {
    const record: Record<string, unknown> = item && typeof item === 'object' && !Array.isArray(item)
      ? item as Record<string, unknown>
      : { kind: item };
    const kind = String(record.kind || '').trim().toLowerCase();
    if (!GENERATION_REQUIREMENT_KINDS.has(kind)) continue;
    const minimumMatches = Math.max(1, Math.min(4, Math.round(Number(record.minimumMatches || 1)) || 1));
    const source = String(record.source || '').trim().toLowerCase() === 'prompt' ? 'prompt' : 'skill';
    const previous = byKind.get(kind);
    byKind.set(kind, {
      kind,
      minimumMatches: Math.max(Number(previous?.minimumMatches || 0), minimumMatches),
      source: previous?.source === 'prompt' || source === 'prompt' ? 'prompt' : 'skill',
    });
  }
  return [...byKind.values()];
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function prepareStageAHtmlSource(input: {
  input: BricksHandoffConvertInput;
  html: string;
  stageAWorkspace: string;
  sourceId: string;
  sourceProjectRoot: string | undefined;
  contextFiles: HandoffContextEntry[];
}): Promise<{ html: string; manifest: PixflowHtmlSourceManifest }> {
  const sourcePath = normalizeManifestSourcePath(input.input.sourcePath || 'index.html');
  const resources = await buildHtmlToBricksSourceResources(input.contextFiles, input.sourceProjectRoot);
  const requestedKind = String(input.input.sourceInputKind || '').trim();
  const inputKind: PixflowHtmlSourceInputKind = requestedKind === 'generated_document'
    ? 'generated_document'
    : (requestedKind === 'document_bundle' || resources.length > 0 ? 'document_bundle' : 'single_document');
  const resourceBase = normalizeManifestSourcePath(
    input.input.sourceResourceBase || path.posix.dirname(sourcePath),
    { allowCurrentDirectory: true },
  );
  const selectionReason = String(input.input.sourceSelectionReason || '').trim()
    || (inputKind === 'document_bundle'
      ? 'Canonical HTML selected from the persisted primary handoff file; declared supporting files form its document bundle.'
      : 'The persisted primary handoff file is the canonical HTML source.');
  return prepareHtmlToBricksSourceSnapshot({
    html: input.html,
    workspaceDir: input.stageAWorkspace,
    sourceId: input.sourceId,
    ...(input.input.runId ? { runId: input.input.runId } : {}),
    canonicalPath: sourcePath,
    inputKind,
    selectionReason,
    resourceBase,
    resources,
  });
}

async function buildHtmlToBricksSourceResources(
  contextFiles: HandoffContextEntry[],
  sourceProjectRoot: string | undefined,
): Promise<HtmlToBricksSourceResource[]> {
  const resources: HtmlToBricksSourceResource[] = [];
  for (const file of contextFiles) {
    if (file.readError) continue;
    const resourcePath = normalizeManifestSourcePath(file.path || file.name, { allowCurrentDirectory: false, rejectUnsafe: false });
    if (!resourcePath) continue;
    let bytes: Buffer | null = null;
    if (typeof file.text === 'string') {
      bytes = Buffer.from(file.text, 'utf8');
    } else if (file.encoding === 'base64' && typeof file.content === 'string' && file.content) {
      bytes = Buffer.from(file.content, 'base64');
    } else if (file.projectFile === true) {
      const sourcePath = resolveProjectContextFilePath(sourceProjectRoot, file.path);
      if (sourcePath) bytes = await fs.readFile(sourcePath).catch(() => null);
    }
    if (!bytes || bytes.byteLength === 0) continue;
    const mimeType = normalizeHandoffContextMime(file, isBinaryHandoffContext(file))
      || mimeTypeForSourceResource(resourcePath);
    resources.push({
      path: resourcePath,
      role: sourceManifestRoleForResource(resourcePath, mimeType),
      mimeType,
      bytes,
    });
  }
  return resources;
}

function sourceManifestRoleForResource(
  filePath: string,
  mimeType: string,
): HtmlToBricksSourceResource['role'] {
  if (/text\/css/i.test(mimeType) || /\.css$/i.test(filePath)) return 'stylesheet';
  if (/font|woff|ttf|otf/i.test(mimeType) || /\.(?:woff2?|ttf|otf)$/i.test(filePath)) return 'font';
  if (/^image\//i.test(mimeType) || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(filePath)) return 'image';
  if (/^(?:audio|video)\//i.test(mimeType)) return 'media';
  if (/javascript/i.test(mimeType) || /\.(?:js|mjs)$/i.test(filePath)) return 'script';
  return 'context';
}

function mimeTypeForSourceResource(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.css') return 'text/css';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.js' || extension === '.mjs') return 'text/javascript';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.ttf') return 'font/ttf';
  if (extension === '.otf') return 'font/otf';
  return 'application/octet-stream';
}

function normalizeManifestSourcePath(
  value: string,
  options: { allowCurrentDirectory?: boolean; rejectUnsafe?: boolean } = {},
): string {
  const raw = String(value || '').replace(/\\/g, '/').trim();
  if (options.allowCurrentDirectory && (raw === '' || raw === '.')) return '';
  if (!raw || raw.startsWith('/') || /^[a-z]:\//i.test(raw) || raw.split('/').includes('..')) {
    if (options.rejectUnsafe === false) return '';
    throw new Error(`HTML source manifest path is unsafe: ${value}`);
  }
  return raw.replace(/^\.\//, '').split('/').filter((part) => part && part !== '.').join('/');
}

async function writeHandoffSourceSidecars(
  stageAWorkspace: string,
  sourceManifest: HandoffSourceManifestEntry[],
  contextFiles: HandoffContextEntry[],
  policy: {
    conversionProfile: BricksHandoffConversionProfile;
    generationScope?: unknown;
    sourceContract?: unknown;
    themeStylePolicy?: unknown;
    themeStyleContext?: unknown;
    themeStyleSnapshotHash?: unknown;
    generationRequirements?: unknown;
    generationPrompt?: unknown;
    stageASource?: unknown;
    prototypeHtmlCritique?: unknown;
    frameworkContext?: unknown;
    sourceProjectRoot?: string | undefined;
  },
): Promise<void> {
  const contextDir = path.join(stageAWorkspace, 'context');
  const referenceFiles = sourceManifest.filter((file) => file.role === 'reference_screenshot' || file.role === 'asset');
  const conversionPolicy = buildConversionPolicySidecar(policy);
  await fs.writeFile(
    path.join(stageAWorkspace, 'handoff-files.json'),
    `${JSON.stringify({ files: sourceManifest }, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(stageAWorkspace, 'conversion-policy.json'),
    `${JSON.stringify(conversionPolicy, null, 2)}\n`,
    'utf8',
  );
  const qualityGate = objectValue(objectValue(conversionPolicy.prototypeHtmlCritique).qualityGate);
  if (Object.keys(qualityGate).length > 0) {
    const reportsDir = path.join(stageAWorkspace, 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(
      path.join(reportsDir, 'quality-gate-report.json'),
      `${JSON.stringify(qualityGate, null, 2)}\n`,
      'utf8',
    );
  }
  const mediaIntent = objectValue(objectValue(objectValue(conversionPolicy.prototypeHtmlCritique).qualityGate).evidence).mediaIntent;
  if (mediaIntent && typeof mediaIntent === 'object' && !Array.isArray(mediaIntent)) {
    await fs.writeFile(
      path.join(stageAWorkspace, 'stage-b-media-intent.json'),
      `${JSON.stringify(mediaIntent, null, 2)}\n`,
      'utf8',
    );
  }
  await fs.writeFile(
    path.join(stageAWorkspace, 'route-context.json'),
    `${JSON.stringify(normalizePixflowHtmlFrameworkContext(policy.frameworkContext), null, 2)}\n`,
    'utf8',
  );
  if (policy.sourceContract || policy.themeStylePolicy || policy.themeStyleSnapshotHash || policy.themeStyleContext) {
    await fs.writeFile(
      path.join(stageAWorkspace, 'build-context.json'),
      `${JSON.stringify({
        sourceContract: normalizeOptionalString(policy.sourceContract) || null,
        themeStylePolicy: normalizeOptionalString(policy.themeStylePolicy) || null,
        themeStyleSnapshotHash: normalizeOptionalString(policy.themeStyleSnapshotHash) || null,
        themeStyleContext: policy.themeStyleContext && typeof policy.themeStyleContext === 'object'
          ? policy.themeStyleContext
          : null,
      }, null, 2)}\n`,
      'utf8',
    );
  }
  await materializeStageACompositionDna(stageAWorkspace, contextFiles);
  await fs.writeFile(
    path.join(stageAWorkspace, 'stage-b-visual-references.json'),
    `${JSON.stringify({ files: referenceFiles }, null, 2)}\n`,
    'utf8',
  );
  if (contextFiles.length === 0) return;

  await materializeHandoffBinaryContextFiles(stageAWorkspace, contextFiles, {
    sourceProjectRoot: policy.sourceProjectRoot,
  });

  await fs.mkdir(contextDir, { recursive: true });
  const contextIndex: Array<Record<string, unknown>> = [];
  const briefParts: string[] = [
    '# Handoff Context Files',
    '',
    'Use these supporting files to preserve the user brief, copy requirements, visual references, and conversion constraints. The primary HTML remains `drafts/index.html`.',
    '',
  ];
  for (const [index, file] of contextFiles.entries()) {
    const fileName = `${String(index + 1).padStart(2, '0')}-${slugify(file.name || file.path || 'context')}.md`;
    const outputPath = path.join(contextDir, fileName);
    contextIndex.push({
      name: file.name,
      path: file.path,
      role: file.role,
      mime: file.mime,
      size: file.size,
      contextFile: path.relative(stageAWorkspace, outputPath).replace(/\\/g, '/'),
      hasText: typeof file.text === 'string' && file.text.trim() !== '',
      readError: file.readError,
    });
    const body = [
      `# ${file.name || file.path || `Context ${index + 1}`}`,
      '',
      `- Role: ${file.role}`,
      `- Source path: ${file.path}`,
      file.mime ? `- MIME: ${file.mime}` : '',
      typeof file.size === 'number' ? `- Size: ${file.size}` : '',
      file.readError ? `- Read error: ${file.readError}` : '',
      '',
      typeof file.text === 'string' && file.text.trim() !== ''
        ? file.text
        : 'This file was provided as non-text context or could not be read as text before handoff.',
      '',
    ].filter(Boolean).join('\n');
    await fs.writeFile(outputPath, body, 'utf8');
    briefParts.push(`## ${file.name || file.path || `Context ${index + 1}`}`, '');
    briefParts.push(body, '');
  }
  await fs.writeFile(
    path.join(stageAWorkspace, 'context-manifest.json'),
    `${JSON.stringify({ files: contextIndex }, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(stageAWorkspace, 'stage-b-brief-context.md'),
    briefParts.join('\n'),
    'utf8',
  );
}

export async function materializeStageACompositionDna(
  stageAWorkspace: string,
  contextFiles: HandoffContextEntry[],
): Promise<string | null> {
  const composition = contextFiles.find((file) => {
    const filePath = String(file.path || file.name || '').replace(/\\/g, '/').toLowerCase();
    return filePath === 'composition-dna.md' || filePath.endsWith('/composition-dna.md');
  });
  const content = typeof composition?.text === 'string' ? composition.text.trim() : '';
  if (!content) return null;
  const outputPath = path.join(stageAWorkspace, 'composition-dna.md');
  await fs.writeFile(outputPath, `${content}\n`, 'utf8');
  return outputPath;
}

const MAX_HANDOFF_BINARY_CONTEXT_BYTES = 8 * 1024 * 1024;
const MAX_HANDOFF_BINARY_CONTEXT_TOTAL_BYTES = 16 * 1024 * 1024;

export async function materializeHandoffBinaryContextFiles(
  stageAWorkspace: string,
  contextFiles: HandoffContextEntry[],
  options: { sourceProjectRoot?: string | undefined } = {},
): Promise<void> {
  let materializedBytes = 0;
  for (const file of contextFiles) {
    const relativePath = handoffBinaryWorkspacePath(file);
    if (!relativePath) {
      if (file.projectFile === true || file.encoding === 'base64') {
        file.readError = 'Binary handoff file path is not safe for the Stage B workspace.';
      }
      continue;
    }
    let bytes: Buffer;
    if (file.projectFile === true) {
      const sourcePath = resolveProjectContextFilePath(options.sourceProjectRoot, file.path);
      if (!sourcePath) {
        file.readError = 'Project-local handoff evidence could not be resolved safely.';
        continue;
      }
      try {
        bytes = await fs.readFile(sourcePath);
      } catch {
        file.readError = 'Project-local handoff evidence could not be read by the Stage B daemon.';
        continue;
      }
    } else if (file.encoding === 'base64' && typeof file.content === 'string' && file.content !== '') {
      bytes = Buffer.from(file.content, 'base64');
    } else {
      continue;
    }
    if (bytes.byteLength === 0
      || bytes.byteLength > MAX_HANDOFF_BINARY_CONTEXT_BYTES
      || materializedBytes + bytes.byteLength > MAX_HANDOFF_BINARY_CONTEXT_TOTAL_BYTES) {
      file.readError = 'Binary handoff file exceeds the Stage B evidence transfer limit.';
      continue;
    }
    materializedBytes += bytes.byteLength;
    const targetPath = path.resolve(stageAWorkspace, relativePath);
    const workspaceRoot = `${path.resolve(stageAWorkspace)}${path.sep}`;
    if (!targetPath.startsWith(workspaceRoot)) {
      file.readError = 'Binary handoff file path escaped the Stage B workspace.';
      continue;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, bytes);
  }
}

function resolveHandoffSourceProjectRoot(dataDir: string, sourceId: unknown): string | undefined {
  const projectId = String(sourceId || '').trim();
  if (!projectId || projectId === '.' || projectId === '..' || !/^[A-Za-z0-9._-]+$/.test(projectId)) {
    return undefined;
  }
  return path.resolve(dataDir, 'projects', projectId);
}

function resolveProjectContextFilePath(sourceProjectRoot: string | undefined, filePath: string): string | null {
  if (!sourceProjectRoot) return null;
  const normalized = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '..')) return null;
  const root = path.resolve(sourceProjectRoot);
  const candidate = path.resolve(root, ...parts);
  if (!candidate.startsWith(`${root}${path.sep}`)) return null;
  if (existsSync(candidate) || parts.length === 1) return candidate;

  // Older WordPress multipart storage replaced bundle path separators with
  // underscores. Preserve the authored nested path as source identity, but
  // recover only its exact deterministic flattened counterpart when the
  // canonical project file is absent. This mirrors the bounded media fallback
  // and never searches by basename or outside the selected project root.
  const flattened = path.resolve(root, parts.join('_'));
  return flattened.startsWith(`${root}${path.sep}`) && existsSync(flattened)
    ? flattened
    : candidate;
}

function handoffBinaryWorkspacePath(file: HandoffContextEntry): string | null {
  const normalized = String(file.path || file.name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^stage-a\//i, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '..')) return null;
  const fileName = path.posix.basename(normalized);
  if (!fileName || fileName === '.' || fileName === '..') return null;
  if (file.role === 'reference_screenshot') {
    return path.join('screenshots', fileName);
  }
  if (file.role === 'asset') {
    if (/^source\/assets\//i.test(normalized)) return normalized.replace(/\//g, path.sep);
    if (/^drafts\/assets\//i.test(normalized)) return normalized.replace(/\//g, path.sep);
    if (/^assets\//i.test(normalized)) return path.join('drafts', normalized.replace(/\//g, path.sep));
    return path.join('drafts', 'assets', fileName);
  }
  return null;
}

function buildConversionPolicySidecar(policy: {
  conversionProfile: BricksHandoffConversionProfile;
  generationScope?: unknown;
  sourceContract?: unknown;
  themeStylePolicy?: unknown;
  themeStyleContext?: unknown;
  themeStyleSnapshotHash?: unknown;
  generationRequirements?: unknown;
  generationPrompt?: unknown;
  stageASource?: unknown;
  prototypeHtmlCritique?: unknown;
}): Record<string, unknown> {
  const conversionProfile = policy.conversionProfile;
  const profileRules = conversionProfile === 'prototype_bricks'
    ? {
        sourceAssumption: 'agent_generated_for_conversion',
        priority: 'preserve_intent_and_optimise_native_bricks_editability',
        themeStyleDefault: 'do_not_create_page_scoped_theme_style',
        colorPolicy: 'map_repeated_semantic_colors_to_bricks_palette_scheme_entries_with_short_prefixed_names',
        tokenPolicy: 'map_spacing_typography_radius_shadow_and_layout_to_active_framework_route_tokens_when_confidence_is_high',
        classPolicy: 'enforce_bem_tree_and_prefix_entire_block_tree_on_any_collision',
        cssPolicy: 'native_controls_and_global_classes_before_css_custom',
        mediaPolicy: 'import_source_media_to_wordpress_media_when_possible_before_stage_b',
        stageBPolicy: 'prototype_bricks',
      }
    : {
        sourceAssumption: 'user_supplied_or_unknown_html',
        priority: 'preserve_source_parity_and_clean_cautiously',
        themeStyleDefault: 'avoid_new_theme_style_unless_required_by_source_parity',
        colorPolicy: 'map_repeated_colors_cautiously_without_renaming_source_intent',
        tokenPolicy: 'map_tokens_only_when_safe_for_visual_parity',
        classPolicy: 'preserve_existing_classes_unless_collision_or_invalid_shape_requires_repair',
        cssPolicy: 'preserve_intent_then_move_supported_rules_to_native_controls_or_global_classes',
        mediaPolicy: 'preserve_and_import_source_media_when_possible',
        stageBPolicy: 'uploaded_html',
      };

  return {
    version: 2,
    conversionProfile,
    sourceContract: normalizeOptionalString(policy.sourceContract) || null,
    themeStylePolicy: normalizeOptionalString(policy.themeStylePolicy) || null,
    themeStyleSnapshotHash: normalizeOptionalString(policy.themeStyleSnapshotHash) || null,
    themeStyleContext: policy.themeStyleContext && typeof policy.themeStyleContext === 'object'
      ? policy.themeStyleContext
      : null,
    generationScope: normalizeGenerationScope(policy.generationScope),
    generationPrompt: normalizeGenerationPrompt(policy.generationPrompt),
    generationRequirements: normalizeGenerationRequirements([
      ...normalizeGenerationRequirements(policy.generationRequirements),
      ...inferGenerationRequirementsFromPrompt(policy.generationPrompt),
    ]),
    ...profileRules,
    stageASource: normalizeStageASource(policy.stageASource),
    prototypeHtmlCritique: conversionProfile === 'prototype_bricks'
      ? normalizePrototypeHtmlCritique(policy.prototypeHtmlCritique)
      : null,
  };
}

function normalizeStageASource(value: unknown): Record<string, unknown> | null {
  const record = objectValue(value);
  if (Object.keys(record).length === 0) return null;
  const format = normalizeOptionalString(record.format);
  const safeFormat = format === 'split_html_css_js' || format === 'inline_recovered' || format === 'single_html'
    ? format
    : 'single_html';
  return {
    format: safeFormat,
    sourcePath: normalizeOptionalString(record.sourcePath) || null,
    compiledPath: normalizeOptionalString(record.compiledPath) || null,
    htmlPath: normalizeOptionalString(record.htmlPath) || null,
    cssPath: normalizeOptionalString(record.cssPath) || null,
    jsPath: normalizeOptionalString(record.jsPath) || null,
    sourceFidelityClone: record.sourceFidelityClone === true || record.source_fidelity_clone === true,
  };
}

function normalizePrototypeHtmlCritique(value: unknown): Record<string, unknown> | null {
  const record = objectValue(value);
  if (Object.keys(record).length === 0) return null;
  const designPlan = objectValue(record.designPlan);
  const qualityGate = objectValue(record.qualityGate);
  const qualityGateEvidence = objectValue(qualityGate.evidence);
  const mediaIntent = objectValue(qualityGateEvidence.mediaIntent);
  return {
    ok: record.ok === true,
    repaired: record.repaired === true,
    issues: Array.isArray(record.issues)
      ? record.issues.map((issue) => String(issue || '').trim()).filter(Boolean).slice(0, 50)
      : [],
    designPlan: Object.keys(designPlan).length > 0
      ? {
          schema: normalizeOptionalString(designPlan.schema) || 'pixflow.prototype_bricks.stage_a_design_plan.v1',
          pageIntent: normalizeOptionalString(designPlan.pageIntent) || null,
          visualConcept: normalizeOptionalString(designPlan.visualConcept) || null,
          conversionGoal: normalizeOptionalString(designPlan.conversionGoal) || null,
          requiredMedia: Array.isArray(designPlan.requiredMedia)
            ? designPlan.requiredMedia.slice(0, 12)
            : [],
          requiredProof: Array.isArray(designPlan.requiredProof)
            ? designPlan.requiredProof.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12)
            : [],
        }
      : null,
    qualityGate: Object.keys(qualityGate).length > 0
      ? {
          schema: normalizeOptionalString(qualityGate.schema) || 'pixflow.prototype_bricks.stage_a_quality_gate.v1',
          ok: qualityGate.ok === true,
          status: normalizeOptionalString(qualityGate.status) || null,
          score: typeof qualityGate.score === 'number' && Number.isFinite(qualityGate.score)
            ? qualityGate.score
            : null,
          issues: Array.isArray(qualityGate.issues)
            ? qualityGate.issues.slice(0, 50)
            : [],
          evidence: {
            ...qualityGateEvidence,
            mediaIntent: Object.keys(mediaIntent).length > 0
              ? normalizePrototypeBricksMediaIntent(mediaIntent)
              : null,
          },
        }
      : null,
  };
}

function normalizePrototypeBricksMediaIntent(value: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: normalizeOptionalString(value.schema) || 'pixflow.prototype_bricks.stage_a_media_intent.v1',
    required: Array.isArray(value.required) ? value.required.slice(0, 12) : [],
    requiredVisualMediaCount: normalizeMediaIntentNumber(value.requiredVisualMediaCount),
    recoverableImageCount: normalizeMediaIntentNumber(value.recoverableImageCount),
    recoverableBackgroundCount: normalizeMediaIntentNumber(value.recoverableBackgroundCount),
    inlineSvgCount: normalizeMediaIntentNumber(value.inlineSvgCount),
    importableSourceCount: normalizeMediaIntentNumber(value.importableSourceCount),
    decorativeOnly: value.decorativeOnly === true,
    images: Array.isArray(value.images)
      ? value.images.map((item) => normalizePrototypeBricksMediaIntentItem(item, 'image')).filter(Boolean).slice(0, 24)
      : [],
    backgroundImages: Array.isArray(value.backgroundImages)
      ? value.backgroundImages.map((item) => normalizePrototypeBricksMediaIntentItem(item, 'background')).filter(Boolean).slice(0, 24)
      : [],
  };
}

function normalizePrototypeBricksMediaIntentItem(value: unknown, kind: 'image' | 'background'): Record<string, unknown> | null {
  const record = objectValue(value);
  if (Object.keys(record).length === 0) return null;
  const src = normalizeOptionalString(kind === 'image' ? record.src : record.url);
  if (!src) return null;
  return {
    kind,
    src,
    alt: kind === 'image' ? normalizeOptionalString(record.alt) || null : null,
    importable: record.importable === true,
    issue: normalizeOptionalString(record.issue) || null,
  };
}

function normalizeMediaIntentNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveHandoffCliPath(projectRoot: string): string | null {
  const processResourcesPath = typeof (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath === 'string'
    ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    : '';
  const resourcesFromExecPath = resolveResourcesRootFromExecPath(process.execPath);
  const appDirResources = path.join(path.dirname(process.execPath), 'resources');
  const candidates = [
    path.join(projectRoot, 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs'),
    path.join(projectRoot, 'runtime', 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs'),
    path.join(projectRoot, 'open-design', 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs'),
    path.join(appDirResources, 'open-design', 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs'),
    ...(processResourcesPath
      ? [path.join(processResourcesPath, 'open-design', 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs')]
      : []),
    ...(resourcesFromExecPath
      ? [path.join(resourcesFromExecPath, 'open-design', 'tools', 'pixflow-design-bridge', 'bricks-handoff-cli.mjs')]
      : []),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function resolveResourcesRootFromExecPath(execPath: string): string | null {
  const normalized = execPath.toLowerCase();
  const windowsMarker = `${path.sep}resources${path.sep}open-design${path.sep}bin${path.sep}`.toLowerCase();
  const windowsMarkerIndex = normalized.indexOf(windowsMarker);
  if (windowsMarkerIndex !== -1) {
    return execPath.slice(0, windowsMarkerIndex + `${path.sep}resources`.length);
  }

  const macMarker = `${path.sep}Contents${path.sep}Resources${path.sep}`;
  const macMarkerIndex = execPath.indexOf(macMarker);
  if (macMarkerIndex !== -1) {
    return execPath.slice(0, macMarkerIndex + macMarker.length - 1);
  }

  return null;
}

function runNode(
  file: string,
  args: string[],
  cwd: string,
  options: {
    signal?: AbortSignal;
    onDiagnostic?: (diagnostic: Record<string, unknown>) => void;
    env?: Record<string, string>;
  } = {},
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [file, ...args], {
      cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let firstOutputAt: number | null = null;
    let lastActivityDiagnosticAt = 0;
    options.onDiagnostic?.({
      type: 'runner_spawned',
      pid: child.pid ?? null,
      startedAt,
      command: path.basename(file),
    });
    const recordOutput = (stream: 'stdout' | 'stderr') => {
      const now = Date.now();
      if (firstOutputAt === null) {
        firstOutputAt = now;
        options.onDiagnostic?.({
          type: 'runner_first_output',
          stream,
          elapsedMs: now - startedAt,
        });
      }
      if (now - lastActivityDiagnosticAt >= 30_000) {
        lastActivityDiagnosticAt = now;
        options.onDiagnostic?.({
          type: 'runner_output_activity',
          stream,
          elapsedMs: now - startedAt,
          stdoutBytes,
          stderrBytes,
        });
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      stderr += `\nPixflow Bricks handoff runner timed out after ${HANDOFF_RUN_TIMEOUT_MS}ms.`;
      killProcessTree(child.pid);
    }, HANDOFF_RUN_TIMEOUT_MS);
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortChild);
      options.onDiagnostic?.({
        type: 'runner_finished',
        pid: child.pid ?? null,
        code,
        timedOut,
        elapsedMs: Date.now() - startedAt,
        stdoutBytes,
        stderrBytes,
        firstOutputAt,
      });
      resolve({ code, stdout, stderr, timedOut });
    };
    const abortChild = () => {
      stderr += stderr === '' ? 'Bricks handoff runner was stopped.' : '\nBricks handoff runner was stopped.';
      killProcessTree(child.pid);
      options.onDiagnostic?.({
        type: 'runner_aborted',
        pid: child.pid ?? null,
        elapsedMs: Date.now() - startedAt,
      });
      finish(1);
    };
    if (options.signal?.aborted) {
      abortChild();
    } else {
      options.signal?.addEventListener('abort', abortChild, { once: true });
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      recordOutput('stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      stderrBytes += Buffer.byteLength(chunk, 'utf8');
      recordOutput('stderr');
    });
    child.on('close', (code) => finish(code ?? (timedOut ? 124 : 0)));
    child.on('error', (error) => {
      stderr += stderr === '' ? error.message : `\n${error.message}`;
      finish(1);
    });
  });
}

function runNodeWithFailureWatch(
  file: string,
  args: string[],
  cwd: string,
  workspaceDir: string,
  signal?: AbortSignal,
  onDiagnostic?: (diagnostic: Record<string, unknown>) => void,
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  const abort = new AbortController();
  const forwardAbort = () => abort.abort();
  if (signal?.aborted) {
    abort.abort();
  } else {
    signal?.addEventListener('abort', forwardAbort, { once: true });
  }
  const childRun = runNode(file, args, cwd, {
    signal: abort.signal,
    ...(onDiagnostic ? { onDiagnostic } : {}),
    ...(env ? { env } : {}),
  });
  const failureRun = new Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    let settled = false;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      void (async () => {
        if (settled) return;
        const failure = await readRunnerFailure(workspaceDir).catch(() => null);
        if (!failure) {
          if (Date.now() - startedAt > HANDOFF_RUN_TIMEOUT_MS) {
            onDiagnostic?.({
              type: 'runner_watch_timeout',
              elapsedMs: Date.now() - startedAt,
              timeoutMs: HANDOFF_RUN_TIMEOUT_MS,
            });
            settled = true;
            clearInterval(timer);
            abort.abort();
            resolve({
              code: 124,
              stdout: '',
              stderr: `Pixflow Bricks handoff runner timed out after ${HANDOFF_RUN_TIMEOUT_MS}ms.`,
              timedOut: true,
            });
          }
          return;
        }
        settled = true;
        onDiagnostic?.({
          type: 'runner_failure_artifact',
          elapsedMs: Date.now() - startedAt,
          message: failure.slice(-2000),
        });
        clearInterval(timer);
        abort.abort();
        resolve({ code: 1, stdout: '', stderr: failure, timedOut: false });
      })();
    }, 750);

    childRun.finally(() => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
    }).catch(() => {
      // The child promise is already part of the outer race. This branch only
      // prevents the watcher cleanup hook from creating an unhandled rejection.
    });
  });

  return Promise.race([
    childRun,
    failureRun,
  ]).finally(() => {
    signal?.removeEventListener('abort', forwardAbort);
    abort.abort();
  });
}

function killProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The process may have already exited.
  }
}

async function readRunnerFailure(workspaceDir: string): Promise<string | null> {
  const eventFiles = await findWorkspaceFiles(workspaceDir, /^stage-b-.+-events\.jsonl$/);
  for (const eventFile of eventFiles) {
    const fullPath = path.join(workspaceDir, eventFile);
    const text = await fs.readFile(fullPath, 'utf8').catch(() => '');
    if (!text) continue;
    for (const line of text.split(/\r?\n/).filter(Boolean).reverse()) {
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.type === 'turn.failed') {
          const error = objectValue(record.error);
          const message = typeof error.message === 'string' ? error.message : '';
          return message || 'Bricks handoff model runner failed.';
        }
        if (record.type === 'error') {
          const message = typeof record.message === 'string' ? record.message : '';
          return message || 'Bricks handoff model runner failed.';
        }
      } catch {
        // Ignore partial event lines while the runner is writing.
      }
    }
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeRunnerId(value: unknown): string {
  const id = String(value || '').trim().toLowerCase();
  if (id === 'codex-cli') return 'codex';
  if (id === 'claude-code') return 'claude';
  return id || 'codex';
}

function normalizeOptionalString(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== 'default' ? text : null;
}

async function buildModelRunEvidence({
  workspaceDir,
  runnerId,
  model,
  reasoning,
  baselineFile,
  resultFile,
}: {
  workspaceDir: string;
  runnerId: string;
  model: string | null;
  reasoning: string | null;
  baselineFile: string;
  resultFile: string;
}): Promise<Record<string, unknown>> {
  const eventFiles = await findWorkspaceFiles(workspaceDir, /^stage-b-.+-events\.jsonl$/);
  const stderrFiles = await findWorkspaceFiles(workspaceDir, /^stage-b-.+-stderr\.log$/);
  const promptFiles = await findWorkspaceFiles(workspaceDir, /stage-b-prompt\.txt$/);
  const eventFile = eventFiles[0] || '';
  const stderrFile = stderrFiles[0] || '';
  const eventsCount = eventFile ? await countLines(path.join(workspaceDir, eventFile)) : 0;
  // Pixflow-owned: `bricks-baseline.json` is the canonical compiler baseline.
  // Keep a quiet fallback for workspaces created before the rename.
  const resolvedBaselineFile = existsSync(baselineFile)
    ? baselineFile
    : path.join(workspaceDir, 'bricks-baseline-result.json');
  const hasBaseline = existsSync(resolvedBaselineFile);
  const baselineHash = hasBaseline ? await sha256File(resolvedBaselineFile) : '';
  const resultHash = existsSync(resultFile) ? await sha256File(resultFile) : '';
  const resultChangedFromBaseline = Boolean(baselineHash && resultHash && baselineHash !== resultHash);
  const stderrTail = stderrFile
    ? await readTail(path.join(workspaceDir, stderrFile), 4000)
    : '';
  const critiquePath = path.join(workspaceDir, 'handoff-critique.md');
  let critiqueText = await fs.readFile(critiquePath, 'utf8').catch(() => '');
  if (!isModelAuthoredHandoffCritique(critiqueText) && eventFile) {
    const eventText = await fs.readFile(path.join(workspaceDir, eventFile), 'utf8').catch(() => '');
    const recoveredCritique = modelAuthoredCritiqueFromRunnerEventsText(eventText);
    if (recoveredCritique) {
      critiqueText = recoveredCritique;
      await fs.writeFile(critiquePath, recoveredCritique, 'utf8');
    }
  }

  // Pixflow-owned: this evidence is persisted with the handoff so support can
  // prove whether the gated Bricks model pass ran, which files it received,
  // and whether it changed the baseline before WordPress apply.
  return {
    type: 'pixflow_bricks_handoff_model_run_evidence',
    version: 1,
    runnerId,
    model,
    reasoning,
    eventFiles,
    eventsCount,
    promptFiles,
    stderrFiles,
    resultChangedFromBaseline,
    baselineHash,
    resultHash,
    hasBaseline,
    hasResult: existsSync(resultFile),
    hasCritique: isModelAuthoredHandoffCritique(critiqueText),
    hasRunnerPrompt: promptFiles.length > 0,
    stderrTail,
  };
}

export function isModelAuthoredHandoffCritique(value: string): boolean {
  const text = String(value || '').trim();
  if (text.length < 80) return false;
  if (/pixflow-owned fallback critique generated by the stage b normalizer/i.test(text)) return false;
  return /stage\s*a|source|baseline/i.test(text) && /repair|compar|preserv|gap|fidelity/i.test(text);
}

export function modelAuthoredCritiqueFromRunnerEventsText(value: string): string | null {
  const messages: string[] = [];
  for (const line of String(value || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const item = objectValue(event.item);
      if (String(event.type || '') !== 'item.completed' || String(item.type || '') !== 'agent_message') continue;
      const text = String(item.text || '').trim();
      if (text && !messages.includes(text)) messages.push(text);
    } catch {
      // Ignore incomplete JSONL fragments; the runner tail may end mid-write.
    }
  }
  const evidence = messages.join('\n\n');
  if (!isModelAuthoredHandoffCritique(evidence)) return null;
  return [
    '# Stage B Handoff Critique',
    '',
    'Recovered from the Stage B model\'s own completed comparison and repair messages:',
    '',
    ...messages.map((message) => `- ${message.replace(/\s+/g, ' ').trim()}`),
    '',
  ].join('\n');
}

async function ensureStageBAgentReport({
  workspaceDir,
  qa,
  modelRunEvidence,
  summary,
}: {
  workspaceDir: string;
  qa: Record<string, unknown>;
  modelRunEvidence: Record<string, unknown>;
  summary: {
    runnerId: string;
    model: string | null;
    reasoning: string | null;
    elementCount: number;
    globalClassCount: number;
    headerElementCount: number;
    footerElementCount: number;
    pageSettingsApplied: boolean;
  };
}): Promise<string> {
  const reportPath = path.join(workspaceDir, 'stage-b-agent-report.md');
  const existing = await fs.readFile(reportPath, 'utf8').catch(() => '');
  if (existing.trim() !== '') return existing;

  const qaStatus = String(qa.status || qa.result || 'unknown');
  const qaScore = qa.score;
  const severity = objectValue(qa.severity);
  const lines = [
    '# Stage B Agent Report',
    '',
    '## Summary',
    '',
    `- Runner: ${summary.runnerId}`,
    `- Model: ${summary.model || 'default'}`,
    `- Reasoning: ${summary.reasoning || 'default'}`,
    `- Result changed from baseline: ${modelRunEvidence.resultChangedFromBaseline === true ? 'yes' : 'no'}`,
    `- Runner events: ${Number(modelRunEvidence.eventsCount || 0)}`,
    `- Source-fidelity critique present: ${modelRunEvidence.hasCritique === true ? 'yes' : 'no'}`,
    '',
    '## Output',
    '',
    `- Elements: ${summary.elementCount}`,
    `- Global classes: ${summary.globalClassCount}`,
    `- Header elements: ${summary.headerElementCount}`,
    `- Footer elements: ${summary.footerElementCount}`,
    `- Page settings applied: ${summary.pageSettingsApplied ? 'yes' : 'no'}`,
    '',
    '## QA',
    '',
    `- Status: ${qaStatus}`,
    `- Score: ${qaScore === undefined ? 'unknown' : String(qaScore)}`,
    `- P0: ${Number(severity.p0 || 0)}`,
    `- P1: ${Number(severity.p1 || 0)}`,
    `- P2: ${Number(severity.p2 || 0)}`,
    '',
    '## Evidence',
    '',
    '- `stage-b-qa.json` contains the structured QA result.',
    '- `handoff-critique.md` contains source-fidelity critique and repair notes.',
    '- `pixflow-model-run-evidence.json` records the runner events and baseline/result hash comparison.',
    '',
  ].join('\n');
  await fs.writeFile(reportPath, lines, 'utf8');
  return lines;
}

async function readRunnerEventsForChat(workspaceDir: string): Promise<Array<Record<string, unknown>>> {
  const eventFiles = await findWorkspaceFiles(workspaceDir, /^stage-b-.+-events\.jsonl$/);
  const eventFile = eventFiles[0] ? path.join(workspaceDir, eventFiles[0]) : '';
  if (!eventFile) return [];

  const text = await fs.readFile(eventFile, 'utf8').catch(() => '');
  const events: Array<Record<string, unknown>> = [];
  const parserState = createRunnerChatParserState();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const converted = convertRunnerJsonLineToChatEvents(line, parserState);
    for (const event of converted) {
      events.push(event);
      if (events.length >= 160) {
        return events;
      }
    }
  }
  return events;
}

async function copyOptionalFile(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to).catch(() => undefined);
}

function createRunnerEventTailer(
  workspaceDir: string,
  onChatEvents: (events: Array<Record<string, unknown>>) => void,
): { start: () => void; stop: () => Promise<void> } {
  const offsets = new Map<string, number>();
  const parserStates = new Map<string, RunnerChatParserState>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const eventFiles = await findWorkspaceFiles(workspaceDir, /^stage-b-.+-events\.jsonl$/);
      for (const entry of eventFiles) {
        const file = path.join(workspaceDir, entry);
        const text = await fs.readFile(file, 'utf8').catch(() => '');
        const previous = offsets.get(file) || 0;
        if (text.length <= previous) {
          continue;
        }
        const chunk = text.slice(previous);
        const lastNewline = Math.max(chunk.lastIndexOf('\n'), chunk.lastIndexOf('\r'));
        if (lastNewline < 0) {
          // Do not advance past a JSONL record observed mid-write. The next
          // poll will retry it once the runner appends the line terminator.
          continue;
        }
        const completeChunk = chunk.slice(0, lastNewline + 1);
        offsets.set(file, previous + completeChunk.length);
        const events: Array<Record<string, unknown>> = [];
        const parserState = parserStates.get(file) || createRunnerChatParserState();
        parserStates.set(file, parserState);
        for (const line of completeChunk.split(/\r?\n/)) {
          if (!line.trim()) continue;
          events.push(...convertRunnerJsonLineToChatEvents(line, parserState));
        }
        if (events.length > 0) {
          onChatEvents(events);
        }
      }
    } finally {
      flushing = false;
    }
  };

  return {
    start: () => {
      if (timer) return;
      // Pixflow-owned: poll instead of subscribing to fs events because the
      // events file is created by a child process and Windows file watchers can
      // miss rapid append bursts. A short poll keeps the panel responsive.
      timer = setInterval(() => {
        void flush();
      }, 750);
      void flush();
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await flush();
    },
  };
}

function createBaselineTailer(
  workspaceDir: string,
  onBaseline: (baseline: {
    result: Record<string, unknown>;
    artifacts: BricksHandoffArtifacts;
    workspaceDir: string;
    localMediaAssets: ConverterLocalMediaAsset[];
  }) => Promise<void> | void,
): { start: () => void; stop: () => Promise<void> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let emitted = false;
  let flushing = false;

  const flush = async () => {
    if (emitted || flushing) return;
    flushing = true;
    try {
      const baselineFile = path.join(workspaceDir, 'bricks-baseline.json');
      if (!existsSync(baselineFile)) return;
      const parsed = JSON.parse(await fs.readFile(baselineFile, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const artifacts = await readBricksHandoffArtifacts(workspaceDir);
      const localMediaAssets = await collectConverterLocalMediaAssets(
        workspaceDir,
        parsed as Record<string, unknown>,
      );
      await Promise.resolve(onBaseline({
        result: parsed as Record<string, unknown>,
        artifacts,
        workspaceDir,
        localMediaAssets,
      }));
      emitted = true;
    } catch {
      // The baseline file can be observed while it is still being written.
      // Keep polling and emit the first complete JSON payload only.
    } finally {
      flushing = false;
    }
  };

  return {
    start: () => {
      if (timer) return;
      timer = setInterval(() => {
        void flush();
      }, 500);
      void flush();
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await flush();
    },
  };
}

export type RunnerChatParserState = {
  openTools: Set<string>;
  previousEventWasText: boolean;
  lastTextEndedWithBlankLine: boolean;
};

export function createRunnerChatParserState(): RunnerChatParserState {
  return {
    openTools: new Set<string>(),
    previousEventWasText: false,
    lastTextEndedWithBlankLine: false,
  };
}

function markRunnerChatNonTextEvent(state: RunnerChatParserState): void {
  state.previousEventWasText = false;
  state.lastTextEndedWithBlankLine = false;
}

function runnerChatTextEvent(
  text: string,
  state: RunnerChatParserState,
  separateCompletedBlock = true,
): Array<Record<string, unknown>> {
  if (!text || (separateCompletedBlock && !text.trim())) return [];
  const alreadySeparated = state.lastTextEndedWithBlankLine || /^\s*\r?\n\r?\n/u.test(text);
  const boundedText = separateCompletedBlock && state.previousEventWasText && !alreadySeparated
    ? `\n\n${text.replace(/^\s+/u, '')}`
    : text;
  state.previousEventWasText = true;
  state.lastTextEndedWithBlankLine = /(?:\r?\n){2,}\s*$/u.test(boundedText);
  return [{ kind: 'text', text: boundedText }];
}

export function convertRunnerJsonLineToChatEvents(
  line: string,
  state: RunnerChatParserState = createRunnerChatParserState(),
): Array<Record<string, unknown>> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }

  const type = String(parsed.type || '');
  const part = objectValue(parsed.part);
  if (type === 'step_start') {
    markRunnerChatNonTextEvent(state);
    return [{ kind: 'status', label: 'running' }];
  }
  if (type === 'text' && typeof part.text === 'string') {
    return runnerChatTextEvent(part.text, state);
  }
  if (
    type === 'tool_use'
    && typeof part.tool === 'string'
    && typeof part.callID === 'string'
  ) {
    markRunnerChatNonTextEvent(state);
    const toolState = objectValue(part.state);
    const events: Array<Record<string, unknown>> = [];
    if (!state.openTools.has(part.callID)) {
      state.openTools.add(part.callID);
      events.push({
        kind: 'tool_use',
        id: part.callID,
        name: part.tool,
        input: toolState.input,
      });
    }
    if (toolState.status === 'completed' || toolState.status === 'error') {
      state.openTools.delete(part.callID);
      const rawOutput = toolState.output;
      const content = typeof rawOutput === 'string'
        ? rawOutput
        : JSON.stringify(rawOutput ?? '');
      events.push({
        kind: 'tool_result',
        toolUseId: part.callID,
        content,
        isError: toolState.status === 'error',
      });
    }
    return events;
  }
  if (type === 'step_finish') {
    const tokens = objectValue(part.tokens);
    markRunnerChatNonTextEvent(state);
    return [{
      kind: 'usage',
      inputTokens: Number(tokens.input || 0),
      outputTokens: Number(tokens.output || 0),
    }];
  }
  if (type === 'text_delta') {
    return runnerChatTextEvent(String(parsed.delta || ''), state, false);
  }
  if (type === 'thinking_delta') {
    const text = String(parsed.delta || '');
    if (!text) return [];
    markRunnerChatNonTextEvent(state);
    return [{ kind: 'thinking', text }];
  }
  if (type === 'status') {
    markRunnerChatNonTextEvent(state);
    return [{
      kind: 'status',
      label: String(parsed.label || 'running'),
      ...(parsed.detail ? { detail: String(parsed.detail) } : {}),
    }];
  }
  if (type === 'tool_use' && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
    markRunnerChatNonTextEvent(state);
    state.openTools.add(parsed.id);
    return [{ kind: 'tool_use', id: parsed.id, name: parsed.name, input: parsed.input }];
  }
  if (type === 'tool_result' && typeof parsed.toolUseId === 'string') {
    markRunnerChatNonTextEvent(state);
    state.openTools.delete(parsed.toolUseId);
    return [{
      kind: 'tool_result',
      toolUseId: parsed.toolUseId,
      content: String(parsed.content || ''),
      isError: Boolean(parsed.isError),
    }];
  }
  if (type === 'usage') {
    const usage = objectValue(parsed.usage);
    markRunnerChatNonTextEvent(state);
    return [{
      kind: 'usage',
      inputTokens: Number(usage.input_tokens || parsed.inputTokens || 0),
      outputTokens: Number(usage.output_tokens || parsed.outputTokens || 0),
    }];
  }

  const item = objectValue(parsed.item);
  if (type === 'item.completed' && item.type === 'agent_message') {
    return runnerChatTextEvent(String(item.text || ''), state);
  }

  if (
    (type === 'item.started' || type === 'item.updated' || type === 'item.completed')
    && item.type === 'todo_list'
    && typeof item.id === 'string'
    && Array.isArray(item.items)
  ) {
    markRunnerChatNonTextEvent(state);
    return [{
      kind: 'tool_use',
      id: item.id,
      name: 'TodoWrite',
      input: {
        todos: item.items
          .map((todo) => objectValue(todo))
          .filter((todo) => typeof todo.content === 'string' && todo.content.trim())
          .map((todo) => ({
            content: todo.content,
            status: typeof todo.status === 'string' ? todo.status : 'pending',
            priority: typeof todo.priority === 'string' ? todo.priority : 'medium',
            ...(typeof todo.id === 'string' && todo.id ? { id: todo.id } : {}),
          })),
      },
    }];
  }

  if ((type === 'item.started' || type === 'item.completed') && item.type === 'command_execution') {
    markRunnerChatNonTextEvent(state);
    const id = String(item.id || `tool-${state.openTools.size + 1}`);
    const command = String(item.command || '').trim();
    const output = String(item.aggregated_output || '').trim();
    const events: Array<Record<string, unknown>> = [];

    if (!state.openTools.has(id)) {
      state.openTools.add(id);
      events.push({
        kind: 'tool_use',
        id,
        name: 'Bash',
        input: { command },
      });
    }

    if (type === 'item.completed') {
      state.openTools.delete(id);
      events.push({
        kind: 'tool_result',
        toolUseId: id,
        content: output || `Command finished with status ${String(item.status || 'completed')}.`,
        isError: Number(item.exit_code || 0) !== 0,
      });
    }

    return events;
  }

  if (type === 'turn.completed') {
    markRunnerChatNonTextEvent(state);
    return [{ kind: 'usage', inputTokens: 0, outputTokens: 0 }];
  }

  if (type === 'error' || type === 'turn.failed') {
    const error = objectValue(parsed.error);
    const message = typeof parsed.message === 'string'
      ? parsed.message
      : (typeof error.message === 'string' ? error.message : '');
    return message ? runnerChatTextEvent(`Bricks handoff runner failed: ${message}`, state) : [];
  }

  return [];
}

async function findWorkspaceFiles(workspaceDir: string, pattern: RegExp): Promise<string[]> {
  const entries = await fs.readdir(workspaceDir).catch(() => []);
  return entries.filter((entry) => pattern.test(entry)).sort();
}

async function countLines(filePath: string): Promise<number> {
  const text = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!text) return 0;
  return text.split(/\r?\n/).filter((line) => line.trim() !== '').length;
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function readFirstExistingText(files: string[]): Promise<string> {
  for (const file of files) {
    if (!existsSync(file)) continue;
    return fs.readFile(file, 'utf8').catch(() => '');
  }
  return '';
}

async function readTail(filePath: string, maxChars: number): Promise<string> {
  const text = await fs.readFile(filePath, 'utf8').catch(() => '');
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

function slugify(value: string): string {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'pixflow-bricks-handoff';
}

function failure(
  code: string,
  message: string,
  status: number,
  stderr?: string,
  runtimeDiagnostics?: Array<Record<string, unknown>>,
): BricksHandoffConvertResult {
  return {
    ok: false,
    code,
    message,
    status,
    ...(stderr ? { stderr } : {}),
    ...(runtimeDiagnostics ? { runtimeDiagnostics } : {}),
  };
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function stageBMutationPayloadHash(value: Record<string, unknown>): string {
  const content = Array.isArray(value.content) ? value.content : [];
  const globalClasses = Array.isArray(value.global_classes)
    ? value.global_classes
    : (Array.isArray(value.globalClasses) ? value.globalClasses : []);
  return hashText(JSON.stringify(canonicalizeJson({ content, globalClasses })));
}

export function buildStageBMutationBatch(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  input: { sequence: number; source: 'draft' | 'result' },
): PixflowBricksMutationBatch | null {
  const previousContent = Array.isArray(previous.content) ? previous.content as Array<Record<string, unknown>> : [];
  const nextContent = Array.isArray(next.content) ? next.content as Array<Record<string, unknown>> : [];
  if (nextContent.length === 0) return null;
  const previousClasses = Array.isArray(previous.global_classes)
    ? previous.global_classes as Array<Record<string, unknown>>
    : (Array.isArray(previous.globalClasses) ? previous.globalClasses as Array<Record<string, unknown>> : []);
  const nextClasses = Array.isArray(next.global_classes)
    ? next.global_classes as Array<Record<string, unknown>>
    : (Array.isArray(next.globalClasses) ? next.globalClasses as Array<Record<string, unknown>> : []);
  const previousById = recordsById(previousContent);
  const nextById = recordsById(nextContent);
  const events: PixflowBricksMutationEvent[] = [];
  const removedIds = Array.from(previousById.keys()).filter((id) => !nextById.has(id));
  const added = nextContent.filter((element) => {
    const id = recordId(element);
    return id !== '' && !previousById.has(id);
  });
  const patches = nextContent.flatMap((element) => {
    const id = recordId(element);
    const before = id ? previousById.get(id) : null;
    if (!before || canonicalJson(before) === canonicalJson(element)) return [];
    const changes = Object.fromEntries(Object.entries(element).filter(([key]) => key !== 'id'));
    const removeKeys = Object.keys(before).filter((key) => key !== 'id' && !(key in element));
    return [{ id, changes, ...(removeKeys.length > 0 ? { removeKeys } : {}) }];
  });
  if (removedIds.length > 0) events.push({ type: 'remove', elementIds: removedIds });
  if (added.length > 0) events.push({ type: 'add', elements: added });
  if (patches.length > 0) events.push({ type: 'patch', patches });
  const previousOrder = previousContent.map(recordId).filter(Boolean);
  const nextOrder = nextContent.map(recordId).filter(Boolean);
  if (previousOrder.join('\u0000') !== nextOrder.join('\u0000')) {
    events.push({ type: 'reorder', orderedIds: nextOrder });
  }
  const previousClassById = recordsById(previousClasses);
  const nextClassById = recordsById(nextClasses);
  const removedClassIds = Array.from(previousClassById.keys()).filter((id) => !nextClassById.has(id));
  const upsertClasses = nextClasses.filter((entry) => {
    const id = recordId(entry);
    return id !== '' && canonicalJson(previousClassById.get(id)) !== canonicalJson(entry);
  });
  if (removedClassIds.length > 0 || upsertClasses.length > 0) {
    events.push({ type: 'classes', upsert: upsertClasses, removeIds: removedClassIds });
  }
  const sidecars = changedStageBSidecars(previous, next);
  if (Object.keys(sidecars).length > 0) events.push({ type: 'sidecar_delta', sidecars });
  const focusId = recordId(added[0]) || patches[0]?.id || '';
  if (focusId) events.push({ type: 'focus', elementId: focusId });
  const payloadHash = stageBMutationPayloadHash(next);
  const checkpointId = `${input.source}-${input.sequence}-${payloadHash.slice(0, 12)}`;
  const nextClassIds = new Set(nextClasses.map(recordId).filter(Boolean));
  const referencedGlobalClassIds = collectReferencedGlobalClassIds(nextContent)
    .filter((id) => nextClassIds.has(id));
  events.push({
    type: 'checkpoint',
    checkpointId,
    payloadHash,
    elementCount: nextContent.length,
    elementIds: nextContent.map(recordId).filter(Boolean),
    // The live page canvas retains classes referenced by its element tree. The
    // result can also carry header/footer-only or now-unused class definitions;
    // requiring those in a page checkpoint creates false rejections even when
    // every visible element and referenced class was applied correctly.
    globalClassCount: referencedGlobalClassIds.length,
    globalClassIds: referencedGlobalClassIds,
    status: typeof next.status === 'string' ? next.status : null,
  });
  return {
    schema: PIXFLOW_BRICKS_MUTATION_SCHEMA,
    sequence: input.sequence,
    source: input.source,
    checkpointId,
    payloadHash,
    events,
  };
}

function collectReferencedGlobalClassIds(content: Array<Record<string, unknown>>): string[] {
  const ids: string[] = [];
  for (const element of content) {
    const settings = objectValue(element.settings);
    if (!Array.isArray(settings._cssGlobalClasses)) continue;
    for (const value of settings._cssGlobalClasses) {
      const id = String(value || '').trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function recordId(value: Record<string, unknown> | undefined): string {
  return String(value?.id || '').trim();
}

function recordsById(values: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const value of values) {
    const id = recordId(value);
    if (id) entries.push([id, value]);
  }
  return new Map(entries);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value)) ?? 'undefined';
}

function changedStageBSidecars(previous: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const sidecars: Record<string, unknown> = {};
  const mappings = [
    ['stage_b_color_system', 'colorSystem'],
    ['stage_b_font_system', 'fontSystem'],
    ['stage_b_icon_system', 'iconSystem'],
  ] as const;
  for (const [sourceKey, liveKey] of mappings) {
    if (canonicalJson(previous[sourceKey]) !== canonicalJson(next[sourceKey])) {
      sidecars[liveKey] = next[sourceKey] ?? null;
    }
  }
  if (canonicalJson(previous.stage_b_theme_style_payload) !== canonicalJson(next.stage_b_theme_style_payload)) {
    sidecars.themeStylePayload = next.stage_b_theme_style_payload ?? null;
  }
  if (canonicalJson(previous.page_settings) !== canonicalJson(next.page_settings)) {
    sidecars.pageSettings = next.page_settings ?? null;
  }
  return sidecars;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]),
  );
}

function createStageBMutationTailer(
  workspaceDir: string,
  onMutation: (mutation: PixflowBricksMutationBatch) => void,
  options: { seedCurrentResult?: boolean } = {},
): { start: () => void; stop: () => Promise<void> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let sequence = 0;
  const seenHashes = new Set<string>();
  let previousPayload: Record<string, unknown> | null = null;
  let flushing = false;
  let seeded = false;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const baselineText = await fs.readFile(path.join(workspaceDir, 'bricks-baseline.json'), 'utf8').catch(() => '');
      const baseline = baselineText.trim() ? JSON.parse(baselineText) as Record<string, unknown> : null;
      if (!seeded && options.seedCurrentResult) {
        const currentText = await fs.readFile(path.join(workspaceDir, 'bricks-result.json'), 'utf8').catch(() => '');
        const current = currentText.trim() ? JSON.parse(currentText) as Record<string, unknown> : null;
        if (current) {
          const currentHash = stageBMutationPayloadHash(current);
          seenHashes.add(currentHash);
          previousPayload = current;
        }
        seeded = true;
      }
      if (!previousPayload && baseline) previousPayload = baseline;
      const baselineHash = baseline ? stageBMutationPayloadHash(baseline) : '';
      for (const [source, fileName] of [['draft', 'bricks-draft.json'], ['result', 'bricks-result.json']] as const) {
        const file = path.join(workspaceDir, fileName);
        const text = await fs.readFile(file, 'utf8').catch(() => '');
        if (!text.trim()) continue;
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const hash = stageBMutationPayloadHash(parsed);
        if (seenHashes.has(hash) || hash === baselineHash) continue;
        seenHashes.add(hash);
        sequence += 1;
        const batch = buildStageBMutationBatch(previousPayload || {}, parsed, { sequence, source });
        if (batch) onMutation(batch);
        previousPayload = parsed;
      }
    } catch {
      // Draft/result files can be observed between truncate and rename/write.
      // Keep polling until a complete JSON checkpoint is available.
    } finally {
      flushing = false;
    }
  };

  return {
    start: () => {
      if (timer) return;
      timer = setInterval(() => void flush(), 500);
      void flush();
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await flush();
    },
  };
}
