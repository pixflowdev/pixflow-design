import type { ChatAttachment, ChatCommentAttachment } from '../types';
import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  createPixflowBuildInBricksSourceRequestBundle,
  createPixflowPromptProvenance,
  formatPixflowBuildInBricksDesignContext,
  normalizePixflowBuildInBricksDesignContext,
  normalizePixflowBuildInBricksThemeStyleContext,
  resolvePixflowBuildInBricksSkillManifest,
  type PixflowBuildInBricksDesignContext,
  type PixflowBuildInBricksPagePlan,
  type PixflowBuildInBricksSourceRequestBundle,
  type PixflowPromptProvenance,
  type PixflowPromptSourceReference,
  type WorkspaceContextItem,
} from '@open-design/contracts';
import type { PixflowRouteContextSnapshot } from './framework';
import {
  buildBuildInBricksDesignPlan,
  type BuildInBricksDesignPlan,
} from './build-in-bricks-source-contract';

export type BuildInBricksContextFile = { path: string; content: string };

export function buildBuildInBricksThemeStyleContext(
  routeContext?: PixflowRouteContextSnapshot | null,
): NonNullable<PixflowBuildInBricksDesignContext['themeStyle']> {
  const bricks = (routeContext?.sources?.bricks || {}) as unknown as Record<string, unknown>;
  const framework = (routeContext?.sources?.framework || {}) as unknown as Record<string, unknown>;
  const diagnostics = bricks.themeStyleDiagnostics && typeof bricks.themeStyleDiagnostics === 'object'
    ? bricks.themeStyleDiagnostics as Record<string, unknown>
    : {};
  const resolutionError = String(diagnostics.resolutionError || '').trim();
  return normalizePixflowBuildInBricksThemeStyleContext({
    policy: 'inherit_effective',
    targetPostId: Number(routeContext?.postId || 0) || null,
    route: {
      id: routeContext?.activeRouteId || '',
      family: String(framework.routeFamily || 'bricks'),
      source: String(bricks.source || 'wordpress_route_context'),
    },
    loadingMethod: bricks.themeStylesLoadingMethod,
    activeStyleIds: bricks.themeStyleActiveIds,
    themeStyles: bricks.themeStyles,
    breakpoints: routeContext?.breakpoints,
    breakpointMode: routeContext?.breakpointMode,
    diagnostics,
    resolutionStatus: routeContext && bricks.available !== false && !resolutionError ? 'available' : 'unavailable',
    resolutionReason: routeContext
      ? (bricks.available === false
          ? 'Bricks route context did not contain an authoritative Theme Style source.'
          : resolutionError || undefined)
      : 'Live WordPress Theme Style context was unavailable.',
  });
}

export function buildBuildInBricksDesignContext(
  routeContext?: PixflowRouteContextSnapshot | null,
  designSystem?: Record<string, unknown> | null,
  generationScope?: 'full_page' | 'section' | 'component',
): PixflowBuildInBricksDesignContext {
  const route = routeContext?.route && typeof routeContext.route === 'object'
    ? routeContext.route as Record<string, unknown>
    : {};
  const sourceContext = routeContext?.designContext && typeof routeContext.designContext === 'object'
    ? routeContext.designContext as Record<string, unknown>
    : {};
  const framework = (routeContext?.sources?.framework || {}) as unknown as Record<string, unknown>;
  const bricks = (routeContext?.sources?.bricks || {}) as unknown as Record<string, unknown>;
  const activeTokens = Array.isArray(sourceContext.activeTokens)
    ? sourceContext.activeTokens
    : Array.isArray((sourceContext.tokens as Record<string, unknown> | undefined)?.all)
      ? (sourceContext.tokens as Record<string, unknown>).all as unknown[]
      : [];
  const globalClasses = Array.isArray(sourceContext.globalClasses)
    ? sourceContext.globalClasses
    : Array.isArray(bricks.globalClasses) ? bricks.globalClasses : [];
  const frameworkClasses = new Set(
    (Array.isArray(framework.utilityClasses) ? framework.utilityClasses : [])
      .map((item) => typeof item === 'string' ? item : String((item as Record<string, unknown>)?.name || ''))
      .map((name) => name.replace(/^\./, '').trim())
      .filter(Boolean),
  );
  const annotatedClasses = globalClasses.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const value = item as Record<string, unknown>;
    const name = String(value.name || '').replace(/^\./, '').trim();
    return value.collision || !name ? value : { ...value, collision: frameworkClasses.has(name) ? 'framework' : 'unknown' };
  });
  return normalizePixflowBuildInBricksDesignContext({
    revision: `route-${routeContext?.schemaVersion || 'unknown'}-${routeContext?.activeRouteId || 'unknown'}`,
    capturedAt: new Date().toISOString(),
    generationScope,
    route: {
      id: routeContext?.activeRouteId || '',
      family: String(framework.routeFamily || 'bricks'),
      label: String(route.label || route.title || routeContext?.activeRouteId || 'Native Bricks'),
      available: routeContext?.fallbackUsed !== true,
    },
    breakpoints: routeContext?.breakpoints || [],
    breakpointMode: routeContext?.breakpointMode || {},
    tokens: {
      all: activeTokens,
      utilities: Array.isArray(framework.utilityClasses)
        ? framework.utilityClasses.map((item) => typeof item === 'string' ? item : String((item as Record<string, unknown>)?.name || ''))
        : [],
    },
    colours: Array.isArray(sourceContext.activeColorPalettes) ? sourceContext.activeColorPalettes : [],
    typography: {},
    pixflowDesignSystem: designSystem || {},
    themeStyle: buildBuildInBricksThemeStyleContext(routeContext),
    globalClasses: annotatedClasses,
    pageSpecificGeneratedTokens: Array.isArray(sourceContext.pageSpecificGeneratedTokens) ? sourceContext.pageSpecificGeneratedTokens : [],
    diagnostics: {
      eligibleTokenCount: 0,
      excludedTokenCount: 0,
      unknownTokenCount: 0,
      collisionClassCount: annotatedClasses.filter((item) => Boolean(item && typeof item === 'object' && (item as Record<string, unknown>).collision)).length,
      omissions: routeContext ? [] : ['live route context unavailable'],
    },
  });
}

export function buildBuildInBricksPagePlan(
  designPlan: BuildInBricksDesignPlan,
  scope: 'full_page' | 'section' | 'component',
): PixflowBuildInBricksPagePlan {
  // This is a structural source envelope, not an intent engine. The selected
  // agent already interpreted the user's request before source generation.
  // Never manufacture sections by matching words in the prompt: doing so can
  // contradict the agent-owned scoped placement and turn a bounded insertion
  // into a duplicate page region.
  const title = scope === 'full_page'
    ? 'Requested page'
    : scope === 'section'
      ? 'Requested section'
      : 'Requested component';
  return {
    schema: 'pixflow.build_in_bricks.page_plan.v1',
    scope,
    sections: [{
      id: `requested-${scope.replace('_', '-')}`,
      title,
      purpose: designPlan.pageIntent,
      ...(designPlan.requiredMedia[0]?.reason ? { mediaIntent: designPlan.requiredMedia[0].reason } : {}),
      interactionIntent: designPlan.conversionGoal,
      responsiveTransformations: ['Recompose hierarchy, spacing, and alignment at supplied site breakpoints.'],
    }],
  };
}

export function buildBuildInBricksRequestBundle({
  prompt,
  targetTitle,
  generationScope,
  context,
  workspaceItems,
  pageInventory,
  existingSource,
  pagePlan,
}: {
  prompt: string;
  targetTitle: string;
  generationScope: 'full_page' | 'section' | 'component';
  context: PixflowBuildInBricksDesignContext;
  workspaceItems: WorkspaceContextItem[];
  pageInventory?: Record<string, unknown> | null;
  existingSource?: { html?: string; css?: string; js?: string; hash?: string } | null;
  pagePlan: PixflowBuildInBricksPagePlan;
}): PixflowBuildInBricksSourceRequestBundle {
  const skill = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills.find((entry) => entry.id === 'build-in-bricks-html-first');
  if (!skill) throw new Error('Build in Bricks skill manifest is empty.');
  return createPixflowBuildInBricksSourceRequestBundle({
    requestId: `build-source-${Date.now().toString(36)}`,
    scope: generationScope,
    userRequest: prompt.trim(),
    targetTitle: targetTitle.trim(),
    skill: { id: 'build-in-bricks-html-first', version: skill.revision },
    skillManifest: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
    context,
    themeStylePolicy: 'inherit_effective',
    themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
    businessContext: Object.fromEntries(workspaceItems.slice(0, 24).map((item, index) => [`item_${index + 1}`, String(item.content || item.label || '').slice(0, 2_000)])),
    pageContext: { ...(pageInventory || {}), scope: generationScope },
    pagePlan,
    existingSource: existingSource || null,
    artifacts: {
      htmlPath: 'build-source/source/index.html',
      cssPath: 'build-source/source/styles.css',
      jsPath: 'build-source/source/script.js',
      jsOptional: true,
    },
  });
}

export function buildBuildInBricksPromptProvenance({
  provider,
  context,
  requestedSkillIds,
  workspaceItems,
  pageInventory,
  existingSource,
  pagePlan,
}: {
  provider: 'local-cli' | 'byok-api';
  context: PixflowBuildInBricksDesignContext;
  requestedSkillIds: string[];
  workspaceItems: WorkspaceContextItem[];
  pageInventory?: Record<string, unknown> | null;
  existingSource?: { html?: string; css?: string; js?: string; hash?: string } | null;
  pagePlan: PixflowBuildInBricksPagePlan;
}): PixflowPromptProvenance {
  const resolution = resolvePixflowBuildInBricksSkillManifest(requestedSkillIds);
  const omissions: PixflowPromptSourceReference[] = resolution.rejectedSkillIds.map((id) => ({
    id: `skill:${id}`,
    owner: 'compatibility',
    present: false,
    reason: 'not approved by the closed ordinary Build manifest',
  }));
  return createPixflowPromptProvenance({
    pipeline: 'build-in-bricks',
    transport: provider,
    layers: [
      { id: 'pixflow-agent-core', kind: 'system', owner: 'pixflow-agent-core', order: 1, present: true, revision: 'build-source-core.v1' },
      { id: 'build-in-bricks-source-generation', kind: 'system', owner: 'build-in-bricks', order: 2, present: true, revision: 'build-in-bricks-source-generation.v1' },
      ...resolution.manifest.skills.map((skill) => ({ id: skill.id, kind: 'skill' as const, owner: skill.owner, order: 3 + skill.order / 100, present: true, revision: skill.revision, fingerprint: skill.contentFingerprint, sourcePath: skill.sourcePath })),
      { id: 'site-design-context', kind: 'dynamic', owner: 'site', order: 4, present: context.route.available, revision: context.revision },
      { id: 'site-theme-style-context', kind: 'dynamic', owner: 'site', order: 5, present: Boolean(context.themeStyle), revision: context.themeStyle?.snapshotHash },
      { id: 'business-project-context', kind: 'dynamic', owner: 'user', order: 6, present: workspaceItems.length > 0 },
      { id: 'page-context', kind: 'dynamic', owner: 'site', order: 7, present: Boolean(pageInventory) },
      { id: 'page-plan', kind: 'context', owner: 'build-in-bricks', order: 8, present: pagePlan.sections.length > 0, revision: pagePlan.schema },
      { id: 'existing-source', kind: 'dynamic', owner: 'build-in-bricks', order: 9, present: Boolean(existingSource), reason: existingSource ? undefined : 'new generation' },
      { id: `provider-transport:${provider}`, kind: 'provider', owner: 'provider', order: 10, present: true, reason: 'transport only' },
      { id: 'user-request', kind: 'user', owner: 'user', order: 11, present: true },
    ],
    crafts: [],
    presets: [],
    plugins: [],
    scenarios: [],
    omissions,
  });
}

export function buildBuildInBricksContextFiles({
  targetTitle,
  context,
  attachments,
  commentAttachments,
  workspaceItems,
  pageInventory,
  designSystem,
  existingSource,
}: {
  targetTitle: string;
  context: PixflowBuildInBricksDesignContext;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  workspaceItems: WorkspaceContextItem[];
  pageInventory?: Record<string, unknown> | null;
  designSystem?: Record<string, unknown> | null;
  existingSource?: { html?: string; css?: string; js?: string; hash?: string } | null;
}): BuildInBricksContextFile[] {
  const root = 'build-source/context';
  const files: BuildInBricksContextFile[] = [
    { path: `${root}/design-system.md`, content: `# Active site design system\n\n${formatPixflowBuildInBricksDesignContext(context)}\n\nDesign profile:\n${JSON.stringify(designSystem || {}, null, 2)}\n` },
    { path: `${root}/framework-route.json`, content: `${JSON.stringify({ operation: 'build-source', context }, null, 2)}\n` },
    { path: `${root}/page-site-inventory.md`, content: `# Page and site inventory\n\nTarget: ${targetTitle}\nInventory: ${JSON.stringify(pageInventory || {})}\n\n${workspaceItems.slice(0, 24).map((item) => `- ${item.label || item.kind}: ${String(item.content || '').slice(0, 1_000)}`).join('\n')}\n` },
    { path: `${root}/attachments.md`, content: `# Attachments\n\n${attachments.map((item) => `- ${item.name}`).join('\n') || 'None'}\n${commentAttachments.map((item) => `- ${item.comment}`).join('\n')}\n` },
  ];
  if (existingSource) files.push({ path: `${root}/existing-source.md`, content: `# Verified retained Build source\n\nHTML:\n\`\`\`html\n${existingSource.html || ''}\n\`\`\`\nCSS:\n\`\`\`css\n${existingSource.css || ''}\n\`\`\`\nJavaScript:\n\`\`\`js\n${existingSource.js || ''}\n\`\`\`\n` });
  files.push({ path: `${root}/manifest.json`, content: `${JSON.stringify({ schema: 'pixflow.build_in_bricks.source_context.v1', files: files.map((file) => file.path), contextRevision: context.revision }, null, 2)}\n` });
  return files;
}

export function buildBuildInBricksSelectedSourceAnchor(
  pageInventory?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const record = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );
  const builderContext = record(record(pageInventory).builderContext);
  const retainedBuild = record(builderContext.retainedBuild);
  const anchor = record(retainedBuild.selectedSourceAnchor);
  const sourceElement = String(anchor.sourceElement || '').trim().slice(0, 32);
  const sourcePath = String(anchor.sourcePath || '').trim().slice(0, 1_200);
  const currentVisibleText = String(anchor.currentVisibleText || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  if (!sourceElement || !sourcePath || !currentVisibleText) return null;
  const relation = (value: unknown): Record<string, unknown> | null => {
    const candidate = record(value);
    const element = String(candidate.sourceElement || '').trim().slice(0, 32);
    if (!element) return null;
    return {
      sourceElement: element,
      sourceId: String(candidate.sourceId || '').trim().slice(0, 160) || null,
      sourceClasses: Array.isArray(candidate.sourceClasses)
        ? candidate.sourceClasses.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
        : [],
      label: String(candidate.label || '').trim().replace(/\s+/g, ' ').slice(0, 240),
    };
  };
  return {
    sourceElement,
    sourceId: String(anchor.sourceId || '').trim().slice(0, 160) || null,
    sourceClasses: Array.isArray(anchor.sourceClasses)
      ? anchor.sourceClasses.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    sourcePath,
    currentVisibleText,
    parent: relation(anchor.parent),
    previousSibling: relation(anchor.previousSibling),
    nextSibling: relation(anchor.nextSibling),
  };
}

export function buildBuildInBricksSourcePrompt({
  prompt,
  targetTitle,
  generationScope,
  context,
  existingSource,
  pageInventory,
  historicalDocumentShellNormalized = false,
}: {
  prompt: string;
  targetTitle: string;
  generationScope: 'full_page' | 'section' | 'component';
  context: PixflowBuildInBricksDesignContext;
  existingSource?: { html?: string; css?: string; js?: string; hash?: string } | null;
  pageInventory?: Record<string, unknown> | null;
  historicalDocumentShellNormalized?: boolean;
}): string {
  const manifest = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST;
  const selectedSourceAnchor = existingSource
    ? buildBuildInBricksSelectedSourceAnchor(pageInventory)
    : null;
  return [
    'Design and build the requested website source using semantic HTML, modern CSS, and optional JavaScript.',
    'The AI understands the web. The deterministic converter understands Bricks.',
    `Closed Build skill manifest: ${manifest.schema} / ${manifest.revision}; ${manifest.skills.map((skill) => `${skill.id}@${skill.revision}`).join(', ')}.`,
    'Do not load Prototype, Website Clone, HTML-to-Bricks, craft, preset, scenario, or numbered-stage authority.',
    `Scope: ${generationScope}. Target: ${targetTitle}.`,
    'Write build-source/source/index.html and build-source/source/styles.css. Write build-source/source/script.js only when interaction requires it.',
    'Author page-content HTML only: do not write doctype, html, head, or body. Pixflow supplies that document shell; scope page-wide CSS to authored content selectors. Full-page scope may use multiple top-level semantic regions, while section/component scope requires one bounded root.',
    'Use normal web semantics. Do not author Bricks JSON or builder internals.',
    'Reference trusted supplied site variables where appropriate, but never redeclare supplied site tokens globally.',
    'Bricks Theme Style is the destination rendering environment: inherit matching defaults and explicitly override only genuine design differences.',
    'Do not copy inherited Theme Style defaults into authored source.',
    'Do not invent metrics, products, claims, certifications, guarantees, testimonials, addresses, or contact facts.',
    existingSource ? 'This is a retained-source edit. Preserve unaffected source and make only the requested change.' : 'This is an initial source generation.',
    ...(selectedSourceAnchor ? [
      `Factual selected retained-source anchor: ${JSON.stringify(selectedSourceAnchor)}`,
      'This anchor maps the selected native element to its unique accepted HTML source node. Use its sourcePath and parent/sibling relations for placement. Do not substitute a similar source node elsewhere.',
    ] : []),
    ...(historicalDocumentShellNormalized
      ? ['This historical retained source used the former complete-document format. Its body was normalized in memory; persist the edited index.html as page-content HTML only.']
      : []),
    formatPixflowBuildInBricksDesignContext(context),
    ...(existingSource ? [
      '',
      'Verified retained Build source (authoritative edit baseline):',
      '<pixflow-retained-source-file path="build-source/source/index.html">',
      existingSource.html || '',
      '</pixflow-retained-source-file>',
      '<pixflow-retained-source-file path="build-source/source/styles.css">',
      existingSource.css || '',
      '</pixflow-retained-source-file>',
      '<pixflow-retained-source-file path="build-source/source/script.js">',
      existingSource.js || '',
      '</pixflow-retained-source-file>',
    ] : []),
    '',
    'User request:',
    prompt.trim(),
  ].join('\n');
}

export function createDefaultBuildInBricksPlan(
  prompt: string,
  targetTitle: string,
  generationScope: 'full_page' | 'section' | 'component',
  routeContext?: PixflowRouteContextSnapshot | null,
): BuildInBricksDesignPlan {
  return buildBuildInBricksDesignPlan({ prompt, targetTitle, generationScope, routeContext });
}
