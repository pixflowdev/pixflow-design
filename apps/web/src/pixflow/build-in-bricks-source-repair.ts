import type { AgentEvent, AppConfig, ChatMessage } from '../types';
import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  type PixflowBuildInBricksSkillAuthority,
} from '@open-design/contracts';
import { streamMessage } from '../providers/anthropic';
import { streamViaDaemon } from '../providers/daemon';
import {
  fetchBuildInBricksScratchProjectFileText,
  writeBuildInBricksScratchProjectTextFile,
} from './build-in-bricks-scratch-project-files';
import { extractBuildSourceEnvelope } from './bricks-html-source-shared';
import { normalizeBuildInBricksOptionalJavaScript } from './build-in-bricks-source-contract';

export type BuildInBricksRepairFinding = {
  code: string;
  severity: 'blocking' | 'warning';
  message: string;
  category?: string;
  selector?: string;
  element?: string;
  property?: string;
  breakpoint?: string | null;
  authoredValue?: string;
  effectiveValue?: string;
  viewport?: string;
  remediation?: string;
  requirement?: string;
  requirementKind?: 'semantic_content' | 'structural';
  matchingPolicy?: 'literal_phrase_in_normalized_visible_text' | 'required_html_structure';
  inspectedSurface?: 'normalized_user_visible_text' | 'authored_html_structure';
  retainedEditKind?: 'literal_text_replacement';
  retainedFrom?: string;
  retainedTo?: string;
};

type BuildInBricksRepairRetainedSource = {
  html?: string;
  css?: string;
  js?: string;
};

export function buildBuildInBricksSourceRepairTransportIds(suffix: string): {
  assistantMessageId: string;
  clientRequestId: string;
  userMessageId: string;
} {
  return {
    assistantMessageId: `build-in-bricks-source-repair-assistant:${suffix}`,
    clientRequestId: `build-in-bricks-source-repair:${suffix}`,
    userMessageId: `build-in-bricks-source-repair-user:${suffix}`,
  };
}

export function buildBuildInBricksSourceRepairPrompt({
  prompt,
  targetTitle,
  findings,
  html,
  css,
  js,
  retainedSource,
}: {
  prompt: string;
  targetTitle: string;
  findings: BuildInBricksRepairFinding[];
  html: string;
  css: string;
  js?: string | null;
  retainedSource?: BuildInBricksRepairRetainedSource | null;
}): string {
  return [
    'Repair the existing canonical Build source once. This is not a new design pass.',
    'Fix only the structured deterministic findings below while preserving user intent and unaffected source.',
    'Do not add unsupported facts, duplicate inherited Theme Style defaults, or redefine supplied site variables.',
    'When palette context shows an opaque resource label followed by `= var(--name)`, reference `--name`; never turn the opaque resource label into a CSS variable.',
    'Theme Style remediation rules:',
    '- For theme_style_redundant_inheritance, remove the authored declaration that duplicates the inherited Theme Style value. Do not copy the same inherited value into another base or responsive authored rule.',
    '- For theme_style_responsive_shadow, the higher-specificity authored declaration prevents the native responsive Theme Style declaration from taking effect. Unless the original request explicitly requires local ownership of this property, remove or appropriately scope the authored override so native Theme Style owns the responsive value.',
    '- Do not repair a responsive shadow by adding authored CSS equal to the inherited breakpoint value. That merely converts a shadow finding into redundant inherited CSS.',
    '- If the original request explicitly requires a genuine local design override, preserve a genuine local override explicitly required by the original request and author a deliberate responsive treatment only when the design requires one. Do not copy the inherited value merely to silence validation.',
    'Required-content remediation rules:',
    '- For semantic_content, add the requirement to appropriate user-visible copy. Class names, IDs, CSS, scripts, comments, metadata, and clearly hidden text do not satisfy semantic content.',
    '- For structural, add the actual requested HTML structure described by the finding. Merely mentioning its name in paragraph text does not satisfy a structural requirement.',
    ...(retainedSource ? [
      'Retained-source remediation rule:',
      '- The verified retained source below is authoritative. For retained_source_scope_violation, restore that baseline, apply only the structured literal replacement, and keep every other HTML, CSS, and JavaScript byte unchanged.',
    ] : []),
    'Keep index.html as page-content HTML only. If a finding reports an authored document shell, extract and preserve its body content and remove doctype/html/head/body without redesigning the page.',
    'Write the repaired files to build-source/source/index.html, styles.css, and optional script.js.',
    'Use only the closed Build skill authority. Do not author Bricks JSON or load any unrelated workflow authority.',
    `Target: ${targetTitle}`,
    `Original request: ${prompt}`,
    'Structured findings (JSON):',
    JSON.stringify(findings, null, 2),
    ...(retainedSource ? [
      'Verified retained source baseline:',
      '<pixflow-retained-source-file path="build-source/source/index.html">',
      retainedSource.html || '',
      '</pixflow-retained-source-file>',
      '<pixflow-retained-source-file path="build-source/source/styles.css">',
      retainedSource.css || '',
      '</pixflow-retained-source-file>',
      '<pixflow-retained-source-file path="build-source/source/script.js">',
      retainedSource.js || '',
      '</pixflow-retained-source-file>',
    ] : []),
    'Source artifact: build-source/source/index.html',
    '',
    '<pixflow-build-source-file path="build-source/source/index.html">',
    html,
    '</pixflow-build-source-file>',
    '<pixflow-build-source-file path="build-source/source/styles.css">',
    css,
    '</pixflow-build-source-file>',
    ...(js ? ['<pixflow-build-source-file path="build-source/source/script.js">', js, '</pixflow-build-source-file>'] : []),
  ].join('\n');
}

export async function repairBuildInBricksSource({
  projectId,
  prompt,
  targetTitle,
  findings,
  retainedSource,
  html,
  css,
  js,
  agentId,
  apiConfig,
  model,
  reasoning,
  signal,
  cancelSignal,
  evidenceRunId,
  onDelta,
  onAgentEvent,
  buildSkillAuthority,
}: {
  projectId: string;
  prompt: string;
  targetTitle: string;
  findings: BuildInBricksRepairFinding[];
  retainedSource?: BuildInBricksRepairRetainedSource | null;
  html: string;
  css: string;
  js?: string | null;
  agentId: string;
  apiConfig?: AppConfig | null;
  model?: string | null;
  reasoning?: string | null;
  signal: AbortSignal;
  cancelSignal?: AbortSignal;
  evidenceRunId: string;
  onDelta?: (delta: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  buildSkillAuthority: PixflowBuildInBricksSkillAuthority;
}): Promise<void> {
  const repairPrompt = buildBuildInBricksSourceRepairPrompt({ prompt, targetTitle, findings, html, css, js, retainedSource });
  let responseText = '';
  let streamError: Error | null = null;
  const ids = buildBuildInBricksSourceRepairTransportIds(evidenceRunId);
  const history: ChatMessage[] = [{ id: ids.userMessageId, role: 'user', content: repairPrompt, createdAt: Date.now() }];
  const handlers = {
    onDelta(delta: string) { responseText += delta; onDelta?.(delta); },
    onDone(fullText: string) { responseText = fullText || responseText; },
    onError(error: Error) { streamError = error; },
  };
  if (apiConfig) {
    await streamMessage(apiConfig, buildSkillAuthority.instruction, history, signal, handlers);
  } else {
    await streamViaDaemon({
      agentId,
      projectId,
      conversationId: `build-source:${projectId}:repair:${evidenceRunId}`,
      assistantMessageId: ids.assistantMessageId,
      clientRequestId: ids.clientRequestId,
      history,
      signal,
      cancelSignal: cancelSignal || signal,
      skillId: null,
      skillIds: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills.map((skill) => skill.id),
      wordpressPluginAssetSync: null,
      projectMetadata: { kind: 'build-in-bricks', intent: 'pixflow_build_in_bricks_html_first', skipDiscoveryBrief: true },
      pixflowBuildSkillAuthority: buildSkillAuthority,
      attachments: [
        'build-source/source/index.html',
        'build-source/source/styles.css',
        ...(js ? ['build-source/source/script.js'] : []),
      ],
      commentAttachments: [],
      sessionMode: 'design',
      model: model ?? null,
      reasoning: reasoning ?? null,
      handlers: { ...handlers, onAgentEvent: onAgentEvent || (() => {}) },
    });
  }
  if (streamError) throw streamError;
  if (apiConfig) {
    const envelope = extractBuildSourceEnvelope(responseText);
    if (!envelope.html || !envelope.css) throw new Error('Build repair did not return both canonical HTML and CSS source files.');
    const normalizedJs = normalizeBuildInBricksOptionalJavaScript(envelope.js);
    await Promise.all([
      writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/index.html', envelope.html),
      writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/styles.css', envelope.css),
      envelope.js ? writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/script.js', normalizedJs) : Promise.resolve(null),
    ]);
  }
  const [nextHtml, nextCss] = await Promise.all([
    fetchBuildInBricksScratchProjectFileText(projectId, 'build-source/source/index.html'),
    fetchBuildInBricksScratchProjectFileText(projectId, 'build-source/source/styles.css'),
  ]);
  if (!nextHtml || !nextCss) throw new Error('Build repair did not persist the canonical HTML/CSS source pair.');
}
