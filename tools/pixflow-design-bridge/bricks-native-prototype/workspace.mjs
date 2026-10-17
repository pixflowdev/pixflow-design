import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_WORKSPACE_ID = 'bricks-native-prototype';
const ATTACHMENT_PREVIEW_MAX_BYTES = 256 * 1024;
const ATTACHMENT_PREVIEW_MAX_CHARS = 12000;

export async function prepareBricksNativePrototypeWorkspace(input = {}) {
  const workspaceRoot = path.resolve(String(input.workspace || input.workspaceRoot || '.'));
  const projectId = slugify(input.projectId || input.project_id || input.title || DEFAULT_WORKSPACE_ID);
  const workspaceDir = path.join(workspaceRoot, projectId);
  const force = input.force === true;

  await fs.mkdir(workspaceDir, { recursive: true });
  const context = buildWorkspaceContext(input, { workspaceDir, projectId });
  context.request.attachments = await materializeAttachments(context.request.attachments, workspaceDir, { force });
  const files = buildWorkspaceFiles(context);

  const written = [];
  for (const file of files) {
    const filePath = path.join(workspaceDir, file.name);
    if (!force && await exists(filePath)) {
      written.push({ file: file.name, skipped: true });
      continue;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, 'utf8');
    written.push({ file: file.name, skipped: false });
  }

  return {
    ok: true,
    workspaceDir,
    projectId,
    files: written,
    context,
  };
}

export function buildWorkspaceContext(input = {}, computed = {}) {
  const now = new Date().toISOString();
  const prompt = normalizeString(input.prompt || input.brief || '');
  const title = normalizeString(input.title || input.pageTitle || input.page_title || 'Bricks native prototype');
  const designSystem = objectValue(input.designSystem || input.design_system);
  const frameworkRoute = objectValue(input.frameworkRoute || input.framework_route);
  const siteContext = objectValue(input.siteContext || input.site_context);
  const existingGlobalClasses = collectExistingGlobalClasses(siteContext, input);
  const existingColorContext = collectExistingColorContext(siteContext, input);
  const targetPage = objectValue(input.targetPage || input.target_page);
  const generationIntent = objectValue(input.generationIntent || input.generation_intent);
  const schemaCatalog = objectValue(input.schemaCatalog || input.schema_catalog);
  const runtimeKnowledge = objectValue(input.runtimeKnowledge || input.runtime_knowledge);
  const runtimeSnapshots = buildRuntimeSnapshots(input, {
    siteContext,
    targetPage,
    generationIntent,
    schemaCatalog,
    runtimeKnowledge,
  });
  const attachments = arrayValue(input.attachments).map(normalizeAttachment).filter(Boolean);

  return {
    type: 'bricks_native_prototype_workspace',
    version: 1,
    createdAt: now,
    projectId: computed.projectId || slugify(title || DEFAULT_WORKSPACE_ID),
    workspaceDir: computed.workspaceDir || null,
    request: {
      title,
      prompt,
      targetPage,
      generationIntent,
      attachments,
    },
    designSystem,
    frameworkRoute,
    siteContext,
    existingGlobalClasses,
    existingColorContext,
    schemaCatalog,
    runtimeKnowledge,
    runtimeSnapshots,
    outputContract: {
      canonicalResultFile: 'bricks-result.json',
      draftFile: 'bricks-draft.json',
      applyMode: 'controlled_apply',
      primaryDeliverable: 'editable_bricks_json',
      noPrimaryHtmlDeliverable: true,
    },
    requiredArtifacts: [
      'bricks-native-context.json',
      'bricks-native-brief.md',
      'attachments/manifest.json',
      'bricks-native-design-system.md',
      'bricks-native-framework-route.json',
      'bricks-native-site-context.json',
      'bricks-native-existing-global-classes.json',
      'bricks-native-existing-colors.json',
      'bricks-native-schema-catalog.json',
      'bricks-native-runtime-knowledge.json',
      'bricks-native-runtime-snapshots.json',
      'bricks-page-plan.json',
      'bricks-theme-style-plan.json',
      'bricks-color-scheme-plan.json',
      'bricks-section-plan.json',
      'bricks-draft.json',
      'bricks-validation.json',
      'bricks-critique.md',
      'bricks-result.json',
      'conversion-report.md',
      'TODO.md',
      'runner-prompt.md',
    ],
  };
}

function buildWorkspaceFiles(context) {
  return [
    jsonFile('bricks-native-context.json', context),
    textFile('bricks-native-brief.md', renderBrief(context)),
    jsonFile('attachments/manifest.json', {
      status: 'ready',
      attachments: context.request.attachments,
    }),
    textFile('bricks-native-design-system.md', renderDesignSystem(context.designSystem)),
    jsonFile('bricks-native-framework-route.json', context.frameworkRoute),
    jsonFile('bricks-native-site-context.json', context.siteContext),
    jsonFile('bricks-native-existing-global-classes.json', context.existingGlobalClasses),
    jsonFile('bricks-native-existing-colors.json', context.existingColorContext),
    jsonFile('bricks-native-schema-catalog.json', context.schemaCatalog),
    jsonFile('bricks-native-runtime-knowledge.json', context.runtimeKnowledge),
    jsonFile('bricks-native-runtime-snapshots.json', context.runtimeSnapshots),
    jsonFile('bricks-page-plan.json', {
      status: 'pending',
      pageTitle: context.request.title,
      pageGoal: context.request.prompt,
      sections: [],
      notes: [],
    }),
    jsonFile('bricks-theme-style-plan.json', {
      status: 'pending',
      rule: 'Create or reuse a Bricks Theme Style with an explicit condition/assignment for the target page. Do not overwrite the site default style. The final payload is not apply-ready without visible target page scoping.',
      styles: {},
    }),
    jsonFile('bricks-color-scheme-plan.json', {
      status: 'pending',
      rule: 'Home Prototype (Bricks): create a project/page-named Bricks color scheme with short prefixed token names. Floating panel @Pixflow Generation: if the current page already has Bricks colors/sections, reuse those colors and write a reuse-existing color plan instead of creating new variables; only seed a new prefixed scheme from framework route colors when the page has no usable colors.',
      colors: [],
    }),
    jsonFile('bricks-section-plan.json', {
      status: 'pending',
      sections: [],
    }),
    jsonFile('bricks-draft.json', {
      type: 'bricks_native_prototype_draft',
      status: 'pending',
      content: [],
    }),
    jsonFile('bricks-validation.json', {
      status: 'pending',
      checks: [],
      errors: [],
      warnings: [],
    }),
    textFile('bricks-critique.md', '# Bricks Native Prototype Critique\n\nPending.\n'),
    jsonFile('bricks-result.json', {
      type: 'bricks_native_prototype',
      generation_mode: 'bricks_native_prototype',
      status: 'pending',
      content: [],
      diagnostics: {
        readyToApply: false,
        reason: 'Runner has not produced a Bricks result yet.',
      },
    }),
    textFile('conversion-report.md', '# Bricks Native Prototype Report\n\nPending.\n'),
    textFile('TODO.md', renderTodo(context)),
    textFile('runner-prompt.md', renderRunnerPrompt(context)),
  ];
}

function buildRuntimeSnapshots(input, normalized) {
  const explicit = objectValue(input.runtimeSnapshots || input.runtime_snapshots);
  const tools = arrayValue(input.availableTools || input.available_tools);
  const promptSkills = arrayValue(input.promptSkills || input.prompt_skills);
  return {
    status: 'captured',
    capturedAt: new Date().toISOString(),
    source: normalizeString(input.runtimeSnapshotSource || input.runtime_snapshot_source || 'workspace-input'),
    targetPage: normalized.targetPage,
    generationIntent: normalized.generationIntent,
    siteContext: normalized.siteContext,
    schemaCatalog: normalized.schemaCatalog,
    runtimeKnowledge: normalized.runtimeKnowledge,
    availableTools: tools,
    promptSkills,
    topics: {
      elementSchemas: hasContent(normalized.schemaCatalog),
      dynamicTags: hasRuntimeTopic(normalized.runtimeKnowledge, 'dynamicTags'),
      queryTypes: hasRuntimeTopic(normalized.runtimeKnowledge, 'queryTypes'),
      filterSchema: hasRuntimeTopic(normalized.runtimeKnowledge, 'filterSchema'),
      conditionSchema: hasRuntimeTopic(normalized.runtimeKnowledge, 'conditionSchema'),
      formSchema: hasRuntimeTopic(normalized.runtimeKnowledge, 'formSchema'),
      interactionSchema: hasRuntimeTopic(normalized.runtimeKnowledge, 'interactionSchema'),
      breakpoints: hasRuntimeTopic(normalized.runtimeKnowledge, 'breakpoints'),
      woocommerce: hasRuntimeTopic(normalized.runtimeKnowledge, 'woocommerce'),
    },
    ...explicit,
  };
}

function collectExistingGlobalClasses(siteContext, input = {}) {
  const candidates = [
    siteContext?.globalClasses,
    siteContext?.global_classes,
    siteContext?.bricksContext?.globalClasses,
    siteContext?.bricksContext?.global_classes,
    siteContext?.bricksContext?.bricksState?.globalClasses,
    input.globalClasses,
    input.global_classes,
    input.runtimeSnapshots?.globalClasses,
    input.runtimeSnapshots?.global_classes,
    input.runtime_snapshots?.globalClasses,
    input.runtime_snapshots?.global_classes,
  ];
  const seen = new Set();
  const classes = [];
  for (const candidate of candidates) {
    for (const item of arrayValue(candidate)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = normalizeString(item.id || item.key || item.name);
      const name = normalizeString(item.name || item.label || item.id || item.key);
      const normalized = slugify(name || id);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      classes.push({
        id,
        name,
        normalized,
      });
    }
  }
  return {
    status: 'captured',
    count: classes.length,
    classes,
    normalizedNames: classes.map((item) => item.normalized).filter(Boolean),
    rule: 'Choose new BEM block names that do not collide with any normalizedNames entry.',
  };
}

function collectExistingColorContext(siteContext, input = {}) {
  const candidates = [
    siteContext?.colorSchemes,
    siteContext?.color_schemes,
    siteContext?.bricksContext?.colorSchemes,
    siteContext?.bricksContext?.color_schemes,
    siteContext?.bricksContext?.bricksState?.colorSchemes,
    siteContext?.bricksContext?.bricksState?.globalColors,
    siteContext?.bricksContext?.pageColors,
    input.colorSchemes,
    input.color_schemes,
    input.runtimeSnapshots?.colorSchemes,
    input.runtimeSnapshots?.color_schemes,
    input.runtime_snapshots?.colorSchemes,
    input.runtime_snapshots?.color_schemes,
  ];
  const colors = [];
  for (const candidate of candidates) {
    for (const item of arrayValue(candidate)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      colors.push(item);
    }
  }
  return {
    status: 'captured',
    count: colors.length,
    colors,
    rule: 'For @Pixflow Generation, reuse existing page/scheme colors where possible; for Home Prototype (Bricks), create a new prefixed Bricks scheme unless a same-project/page scheme is safe.',
  };
}

function renderBrief(context) {
  const attachments = context.request.attachments.length > 0
    ? context.request.attachments.map((item) => {
      const location = item.workspacePath || item.path || 'not materialized';
      const status = item.materialized ? 'ready' : `not copied: ${item.reason || 'unavailable'}`;
      return `- ${item.name} (${location}) - ${status}`;
    }).join('\n')
    : '- None';
  const attachmentContent = renderAttachmentContent(context.request.attachments);
  return [
    '# Bricks Native Prototype Brief',
    '',
    `Project: ${context.projectId}`,
    `Title: ${context.request.title}`,
    '',
    '## Prompt',
    '',
    context.request.prompt || 'No prompt supplied.',
    '',
    '## Attachments',
    '',
    attachments,
    '',
    '## Attachment Content',
    '',
    attachmentContent,
    '',
  ].join('\n');
}

function renderDesignSystem(value) {
  if (!value || Object.keys(value).length === 0) {
    return '# Design System\n\nNo design-system context was supplied.\n';
  }
  return `# Design System\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function renderTodo(context) {
  return [
    '# Bricks Native Prototype TODO',
    '',
    '- [ ] Read prompt, files, design-system, framework route, site context, schema catalog, and runtime knowledge.',
    '- [ ] Read attachment content/previews and use them as source material for page strategy, copy, and visual direction.',
    '- [ ] Ask compact discovery questions only if required inputs cannot be inferred safely.',
    '- [ ] Plan page narrative and section flow.',
    '- [ ] Plan page-scoped Theme Style and the correct color strategy for this entry point.',
    '- [ ] Inspect existing Bricks global classes before choosing BEM block names; never reuse an existing block name.',
    '- [ ] Build editable Bricks JSON using native element controls first.',
    '- [ ] Validate schema, parent/child tree, Theme Style, color, font, icon, and no-orphan rules.',
    '- [ ] Run critique and repair.',
    '- [ ] Write bricks-result.json and final report for Bricks insertion.',
    '',
    `Target page: ${context.request.targetPage?.id ? `#${context.request.targetPage.id}` : 'not selected'}`,
    `Generation scope: ${normalizeString(context.request.generationIntent?.scope || 'full_page') || 'full_page'}`,
    `Mutation boundary: ${normalizeString(context.request.generationIntent?.mutationBoundary || context.request.generationIntent?.mutation_boundary || 'target_page_generation') || 'target_page_generation'}`,
    '',
  ].join('\n');
}

function renderRunnerPrompt(context) {
  return [
    '# Runner Prompt',
    '',
    'You are generating a Bricks-native Pixflow Design prototype.',
    '',
    'Primary deliverable: `bricks-result.json` containing editable Bricks JSON and required sidecar data.',
    '',
    'Do not create HTML as the primary output.',
    'Attachment rule: if `bricks-native-brief.md` includes readable Attachment Content, use it as source truth for page strategy, copy, audience, offers, and visual direction. Do not replace supplied brief details with generic Pixflow or placeholder copy.',
    'If attachments are listed but content is unavailable in the brief, inspect the materialized file paths from `attachments/manifest.json` before planning.',
    'Framework route rule: use the active framework route for non-color tokens only: spacing, typography scale, radius, grids, layout rhythm, and container rhythm. Do not ignore the route when it is present. Do not use framework route colors for Bricks output.',
    'Class rule: use Bricks global classes for repeated styling. Use BEM for section structures (`block`, `block__element`, `block--modifier`). Before naming a block, inspect `bricks-native-existing-global-classes.json` and avoid any existing class name/id. If a block would collide, add a short page/project suffix or prefix.',
    'Theme Style rule: `bricks_native_theme_style_contract` must visibly include a condition/assignment for the target page id. Never mark the result apply-ready when the Theme Style would overwrite or replace an existing sitewide/default style.',
    'Color rule for Home Prototype (Bricks): create a new project/page-named Bricks color scheme with short prefixed token names unless a same-project/page scheme is clearly reusable. Token names must share a short namespace and must not be bare names like primary, text, background, surface, or accent.',
    'Color rule for floating panel @Pixflow Generation: inspect existing page colors and Bricks color schemes first. If the page already has sections/colors, reuse existing colors and write a `bricks_native_color_system` plan such as `{ "strategy": "reuse_existing", "reuseExisting": true, "evidence": [...] }` instead of creating new variables. If the page has no sections or usable colors, fall back to framework route colors only as seed values for a new prefixed Bricks color scheme.',
    'Use Bricks Theme Styles, color schemes, native element settings, global classes, and scoped custom CSS only where native controls cannot express the design.',
    'Use canonical sidecar keys in `bricks-result.json`: `bricks_native_theme_style_contract`, `bricks_native_color_system`, `bricks_native_font_system`, and `bricks_native_icon_system`.',
    '`global_classes` must be an array of Bricks global class objects with `id`, `name`, and `settings`; never write bare class-name strings.',
    'Do not write directly to WordPress or Bricks from this runner. The host builder will validate and insert eligible Home full-page prototype results; manual edits stay behind controlled Apply.',
    context.request.generationIntent && Object.keys(context.request.generationIntent).length > 0
      ? `Generation intent: ${JSON.stringify(context.request.generationIntent)}`
      : '',
    '',
    'Read these files first:',
    '',
    ...context.requiredArtifacts
      .filter((name) => name.startsWith('bricks-native-') || name === 'attachments/manifest.json' || name === 'TODO.md')
      .map((name) => `- ${name}`),
    '',
    'Read this skill pack before writing Bricks artifacts:',
    '',
    '- pixflow-skills/bricks-native-prototype/SKILL.md',
    '- pixflow-skills/bricks-native-prototype/references/native/bricks-native-prototype.md',
    '- pixflow-skills/bricks-native-prototype/references/native/implementation/artifact-contract.md',
    '- pixflow-skills/bricks-native-prototype/references/native/implementation/theme-style-and-colors.md',
    '- pixflow-skills/bricks-native-prototype/references/native/implementation/layout-and-elements.md',
    '- pixflow-skills/bricks-native-prototype/references/native/implementation/page-flow-and-copy.md',
    '- pixflow-skills/bricks-native-prototype/references/native/implementation/validation-and-repair.md',
    '',
  ].join('\n');
}

async function materializeAttachments(attachments, workspaceDir, options = {}) {
  if (!attachments.length) return [];

  const attachmentsDir = path.join(workspaceDir, 'attachments');
  await fs.mkdir(attachmentsDir, { recursive: true });

  const usedNames = new Set();
  const materialized = [];
  for (const attachment of attachments) {
    const safeName = uniqueFileName(safeBasename(attachment.name || attachment.path || 'attachment'), usedNames);
    const targetPath = path.join(attachmentsDir, safeName);
    const workspacePath = path.relative(workspaceDir, targetPath).replace(/\\/g, '/');
    const sourcePath = normalizeString(
      attachment.sourcePath
      || attachment.source_path
      || attachment.absolutePath
      || attachment.absolute_path
      || attachment.path
    );

    const result = {
      ...attachment,
      originalPath: attachment.path || '',
      workspacePath,
      materialized: false,
    };

    try {
      if (attachment.content || attachment.text) {
        const text = String(attachment.content || attachment.text);
        if (!options.force && await exists(targetPath)) {
          result.materialized = true;
          result.reason = 'already_exists';
        } else {
          await fs.writeFile(targetPath, text, 'utf8');
          result.materialized = true;
        }
        result.contentPreview = previewText(text);
        result.contentPreviewSource = 'inline';
      } else if (attachment.base64) {
        if (!options.force && await exists(targetPath)) {
          result.materialized = true;
          result.reason = 'already_exists';
        } else {
          await fs.writeFile(targetPath, Buffer.from(String(attachment.base64), 'base64'));
          result.materialized = true;
        }
        if (result.materialized) {
          const preview = await readAttachmentPreview(targetPath, attachment);
          if (preview) {
            result.contentPreview = preview;
            result.contentPreviewSource = 'base64';
          }
        }
      } else if (sourcePath) {
        const resolvedSource = path.resolve(sourcePath);
        if (!await exists(resolvedSource)) {
          result.reason = 'source_missing';
        } else if (!options.force && await exists(targetPath)) {
          result.materialized = true;
          result.reason = 'already_exists';
        } else {
          await fs.copyFile(resolvedSource, targetPath);
          result.materialized = true;
        }
        if (result.materialized) {
          const preview = await readAttachmentPreview(targetPath, attachment);
          if (preview) {
            result.contentPreview = preview;
            result.contentPreviewSource = 'file';
          }
        }
      } else {
        result.reason = 'no_source';
      }
    } catch (error) {
      result.reason = error instanceof Error ? error.message : String(error);
    }

    delete result.content;
    delete result.text;
    delete result.base64;
    materialized.push(result);
  }

  return materialized;
}

function renderAttachmentContent(attachments) {
  const readable = attachments.filter((item) => normalizeString(item.contentPreview));
  if (!readable.length) {
    return 'No readable attachment content was available. For binary images/screenshots, inspect the materialized attachment files directly.';
  }

  return readable.map((item) => {
    const source = item.contentPreviewSource ? ` (${item.contentPreviewSource})` : '';
    return [
      `### ${item.name}${source}`,
      '',
      `Path: ${item.workspacePath || item.path || 'unknown'}`,
      '',
      '```text',
      item.contentPreview,
      '```',
    ].join('\n');
  }).join('\n\n');
}

async function readAttachmentPreview(filePath, attachment) {
  if (!isPreviewableAttachment(attachment, filePath)) return '';
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > ATTACHMENT_PREVIEW_MAX_BYTES) return '';
    const text = await fs.readFile(filePath, 'utf8');
    if (text.includes('\u0000')) return '';
    return previewText(text);
  } catch {
    return '';
  }
}

function previewText(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return '';
  if (text.length <= ATTACHMENT_PREVIEW_MAX_CHARS) return text;
  return `${text.slice(0, ATTACHMENT_PREVIEW_MAX_CHARS).trimEnd()}\n\n[Attachment preview truncated.]`;
}

function isPreviewableAttachment(attachment, filePath) {
  const mime = normalizeString(attachment?.mime).toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (/(json|javascript|xml|csv|markdown|yaml|html)/.test(mime)) return true;
  const extension = path.extname(filePath || attachment?.name || '').toLowerCase();
  return new Set([
    '.txt',
    '.md',
    '.markdown',
    '.html',
    '.htm',
    '.json',
    '.csv',
    '.tsv',
    '.css',
    '.js',
    '.xml',
    '.yaml',
    '.yml',
  ]).has(extension);
}

function jsonFile(name, value) {
  return { name, content: `${JSON.stringify(value ?? {}, null, 2)}\n` };
}

function textFile(name, content) {
  return { name, content };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeAttachment(value) {
  if (!value || typeof value !== 'object') return null;
  const name = normalizeString(value.name || value.fileName || value.file_name || value.path || '');
  if (!name) return null;
  return {
    name,
    path: normalizeString(value.path || ''),
    sourcePath: normalizeString(value.sourcePath || value.source_path || value.absolutePath || value.absolute_path || ''),
    mime: normalizeString(value.mime || value.type || ''),
    size: Number.isFinite(Number(value.size)) ? Number(value.size) : null,
    content: typeof value.content === 'string' ? value.content : undefined,
    text: typeof value.text === 'string' ? value.text : undefined,
    base64: typeof value.base64 === 'string' ? value.base64 : undefined,
  };
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasContent(value) {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

function hasRuntimeTopic(value, key) {
  if (!hasContent(value)) return false;
  const topic = value[key];
  if (Array.isArray(topic)) return topic.length > 0;
  if (topic && typeof topic === 'object') return Object.keys(topic).length > 0;
  return topic !== undefined && topic !== null && topic !== '';
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  const text = normalizeString(value).toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return text || DEFAULT_WORKSPACE_ID;
}

function safeBasename(value) {
  const base = path.basename(normalizeString(value)).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-');
  return base.replace(/^-+|-+$/g, '') || 'attachment';
}

function uniqueFileName(fileName, usedNames) {
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}
