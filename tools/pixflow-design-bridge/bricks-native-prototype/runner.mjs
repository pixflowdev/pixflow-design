import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { critiqueBricksNativePrototypeWorkspace } from './critique.mjs';
import {
  applyValidationGateToResult,
  validateBricksNativePrototypeWorkspace,
} from './validation.mjs';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 20;

export async function runBricksNativePrototypeWorkspace(input = {}) {
  const workspaceDir = path.resolve(String(input.workspaceDir || input.workspace || '.'));
  const dryRun = input.dryRun === true || input.dry_run === true;
  const runnerId = normalizeRunnerId(input.runnerId || input.runner || input.agentId || input.agent_id || 'codex');
  const model = normalizeString(input.model || input.selectedModel || input.selected_model);
  const reasoning = normalizeString(input.reasoning || input.reasoningEffort || input.reasoning_effort);
  const fastMode = input.fastMode === true || input.fast_mode === true;
  const runnerCommand = normalizeString(input.runnerCommand || input.runner_command);
  const runnerEnv = sanitizeRunnerEnv(input.runnerEnv || input.runner_env);
  const timeoutMs = positiveNumber(input.timeoutMs || input.timeout_ms, DEFAULT_TIMEOUT_MS);
  const repairInstructions = normalizeString(input.repairInstructions || input.repair_instructions);

  await assertWorkspace(workspaceDir);
  await materializeNativePrototypeSkillPack(workspaceDir);
  const files = workspaceFiles(workspaceDir);
  const prompt = await buildRunnerPrompt(workspaceDir, files, { repairInstructions });
  await fs.writeFile(files.runnerPromptResolved, prompt, 'utf8');
  await fs.writeFile(files.events, '', 'utf8');

  const startedAt = new Date().toISOString();
  await writeEvent(files.events, {
    type: 'status',
    label: 'starting',
    message: dryRun ? 'Preparing Bricks-native dry run.' : 'Starting Bricks-native prototype runner.',
    startedAt,
  });

  let runnerResult;
  if (dryRun) {
    runnerResult = await runDry(workspaceDir, files, prompt);
  } else {
    const invocation = runnerCommand
      ? buildCustomInvocation(runnerCommand, { workspaceDir, files })
      : buildPresetInvocation(runnerId, { workspaceDir, files, model, reasoning, fastMode, runnerEnv });
    runnerResult = await runInvocation({
      workspaceDir,
      files,
      prompt,
      invocation,
      timeoutMs,
    });
  }

  const finalized = await finalizeRunnerArtifacts(workspaceDir, files, runnerResult);
  return {
    ok: finalized.ok,
    workspaceDir,
    runnerCommand: dryRun ? 'dry-run' : runnerResult.commandDisplay,
    runnerExitCode: runnerResult.exitCode,
    runnerTimedOut: runnerResult.timedOut,
    runnerPromptFile: files.runnerPromptResolved,
    runnerEventsFile: files.events,
    bricksDraftFile: files.draft,
    bricksResultFile: files.result,
    status: finalized.status,
    message: finalized.message,
  };
}

export async function normalizeBricksNativePrototypeResultFile(resultFile) {
  const resolved = path.resolve(String(resultFile || ''));
  if (!resolved) throw new Error('A bricks-result.json path is required.');
  return normalizeRunnerResultPayload(resolved);
}

export async function buildRunnerPrompt(workspaceDir, files = workspaceFiles(workspaceDir), options = {}) {
  const parts = [];
  const contextSummary = await summarizeJsonFile(files.context, summarizeWorkspaceContext);
  const runtimeSummary = await summarizeJsonFile(files.runtimeSnapshots, summarizeRuntimeSnapshots);
  parts.push(await readOptional(files.runnerPrompt, '# Runner Prompt\n\nNo runner prompt found.\n'));
  parts.push('\n\n---\n\n# Workspace Contract\n\n');
  parts.push(contextSummary);
  parts.push('\n\nFull workspace contract is available at `bricks-native-context.json`. Read only the specific branches you need.\n');
  parts.push('\n\n---\n\n# Brief\n\n');
  parts.push(await readOptional(files.brief, 'No brief found.\n'));
  parts.push('\n\n---\n\n# Attachment Manifest\n\n');
  parts.push(await readOptional(files.attachmentManifest, '{"attachments":[]}\n'));
  parts.push('\n\n---\n\n# Runtime Snapshots\n\n');
  parts.push(runtimeSummary);
  parts.push('\n\nFull runtime snapshot is available at `bricks-native-runtime-snapshots.json`. Read selectively; do not paste large snapshots into chat output.\n');
  parts.push('\n\n---\n\n# Bricks Native Prototype Skill Pack\n\n');
  parts.push('The full skill pack has been materialized inside this workspace at `pixflow-skills/`. If you need to read skill files, read those local files only. Do not attempt to read repository-relative `tools/pixflow-design-bridge/...` paths from this transient workspace.\n\n');
  parts.push(await readNativePrototypeSkillPack());
  parts.push('\n\n---\n\n# Required Output\n\n');
  parts.push([
    'The baseline is inserted into the active Bricks canvas before Stage B. Mutate that visible canvas progressively: write a complete, valid `bricks-draft.json` immediately after every bounded repair (structure/order, native settings and global classes, responsive polish, then interaction/QA). Do not hold all repairs until the end or overwrite several checkpoints without pausing for the host to consume them.',
    'Each draft must preserve stable element and class IDs and contain the entire current Bricks payload, not a partial diff. The host converts consecutive drafts into verified add/remove/patch/reorder/class/sidecar/focus/checkpoint events. Write `bricks-result.json` only after the final draft has passed validation and is ready for persistence.',
    '`bricks-result.json.global_classes` must be an array of objects shaped like `{ "id": "bem-class", "name": "bem-class", "settings": { ... } }`; do not write class-name strings.',
    'Theme Style data must be written as `bricks_native_theme_style_contract` with `id`, `label`, `scope: "current_page"`, explicit target page `conditions` or assignment, and `settings`.',
    'Color strategy data must be written as `bricks_native_color_system`. Home Prototype (Bricks) should use `variableCategory`, prefixed `variables`, and `palette`. Floating-panel @Pixflow Generation must use `{ "strategy": "reuse_existing", "reuseExisting": true, "evidence": [...] }` when current page colors exist, and must not create new variables in that case.',
    'If validation, critique, or TODO work remains, set `status` to `blocked` or `needs_repair` and `diagnostics.readyToApply` to false.',
    'Do not apply changes to WordPress or Bricks from this runner.',
    '',
  ].join('\n'));
  const repairInstructions = normalizeString(options.repairInstructions || options.repair_instructions);
  if (repairInstructions) {
    parts.push('\n\n---\n\n# Repair Instructions\n\n');
    parts.push(repairInstructions);
    parts.push('\n');
  }
  return parts.join('');
}

async function summarizeJsonFile(filePath, summarizer) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return `${JSON.stringify(summarizer(parsed), null, 2)}\n`;
  } catch {
    return await readOptional(filePath, '{}\n');
  }
}

function summarizeWorkspaceContext(context) {
  const request = context?.request && typeof context.request === 'object' ? context.request : {};
  const targetPage = request?.targetPage && typeof request.targetPage === 'object' ? request.targetPage : {};
  const generationIntent = request?.generationIntent && typeof request.generationIntent === 'object' ? request.generationIntent : {};
  const designSystem = context?.designSystem && typeof context.designSystem === 'object' ? context.designSystem : {};
  const frameworkRoute = context?.frameworkRoute && typeof context.frameworkRoute === 'object' ? context.frameworkRoute : {};
  const existingGlobalClasses = context?.existingGlobalClasses && typeof context.existingGlobalClasses === 'object' ? context.existingGlobalClasses : {};
  const existingColorContext = context?.existingColorContext && typeof context.existingColorContext === 'object' ? context.existingColorContext : {};
  const siteContext = context?.siteContext && typeof context.siteContext === 'object' ? context.siteContext : {};
  const elements = Array.isArray(siteContext.elements) ? siteContext.elements : [];
  return {
    type: context?.type || 'bricks_native_prototype_workspace',
    projectId: context?.projectId || '',
    workspaceDir: context?.workspaceDir || '',
    request: {
      title: request.title || '',
      prompt: truncateText(request.prompt || '', 4000),
      targetPage: pick(targetPage, ['id', 'title', 'builderUrl', 'source']),
      generationIntent,
      attachmentCount: Array.isArray(request.attachments) ? request.attachments.length : 0,
    },
    designSystem: pick(designSystem, ['id', 'name', 'label', 'route', 'frameworkRoute']),
    frameworkRoute: summarizeFrameworkRoute(frameworkRoute),
    existingGlobalClasses: {
      count: Number(existingGlobalClasses.count || 0),
      normalizedNames: arrayValue(existingGlobalClasses.normalizedNames).slice(0, 160),
      rule: existingGlobalClasses.rule || '',
    },
    existingColorContext: {
      status: existingColorContext.status || '',
      schemeCount: Number(existingColorContext.schemeCount || existingColorContext.count || 0),
      tokenNames: arrayValue(existingColorContext.tokenNames || existingColorContext.normalizedNames).slice(0, 160),
      colors: arrayValue(existingColorContext.colors).slice(0, 80),
      rule: existingColorContext.rule || '',
    },
    siteContext: {
      postId: siteContext.postId || siteContext.targetPage?.id || null,
      area: siteContext.area || null,
      selectedId: siteContext.selectedId || null,
      elementCount: elements.length || Number(siteContext.elementCount || 0),
      topSections: Number(siteContext.topSections || 0),
      sampleElements: elements.slice(0, 80).map(summarizeElement),
    },
    outputContract: context?.outputContract || {},
    requiredArtifacts: context?.requiredArtifacts || [],
  };
}

function summarizeRuntimeSnapshots(snapshot) {
  const topics = snapshot?.topics && typeof snapshot.topics === 'object' ? snapshot.topics : {};
  const availableTools = arrayValue(snapshot?.availableTools);
  const promptSkills = arrayValue(snapshot?.promptSkills);
  return {
    status: snapshot?.status || '',
    capturedAt: snapshot?.capturedAt || '',
    source: snapshot?.source || '',
    topics,
    availableTools: availableTools.slice(0, 80).map((item) => {
      if (!item || typeof item !== 'object') return item;
      return pick(item, ['id', 'name', 'title', 'label', 'description']);
    }),
    promptSkills: promptSkills.slice(0, 40).map((item) => {
      if (!item || typeof item !== 'object') return item;
      return pick(item, ['id', 'label', 'command', 'role', 'instruction']);
    }),
    note: 'Detailed runtime snapshots remain in bricks-native-runtime-snapshots.json and should be read selectively only when needed.',
  };
}

function summarizeFrameworkRoute(route) {
  if (!route || typeof route !== 'object') return {};
  const result = pick(route, ['id', 'name', 'label', 'route', 'framework', 'description']);
  for (const key of ['spacing', 'typography', 'radius', 'grid', 'layout', 'container', 'tokens']) {
    if (route[key] !== undefined) result[key] = summarizeTokenBranch(route[key]);
  }
  return result;
}

function summarizeTokenBranch(value) {
  if (Array.isArray(value)) return value.slice(0, 80);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).slice(0, 120);
  return Object.fromEntries(entries.map(([key, val]) => [key, summarizeTokenValue(val)]));
}

function summarizeTokenValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20);
  if (!value || typeof value !== 'object') return value;
  return pick(value, ['value', 'css', 'var', 'token', 'label', 'name', 'min', 'max', 'clamp']);
}

function summarizeElement(element) {
  if (!element || typeof element !== 'object') return element;
  const settings = element.settings && typeof element.settings === 'object' ? element.settings : {};
  return {
    id: element.id || '',
    name: element.name || element.type || '',
    parent: element.parent || '',
    label: element.label || '',
    children: Array.isArray(element.children) ? element.children.slice(0, 20) : [],
    settingsKeys: Object.keys(settings).slice(0, 40),
    globalClasses: settings._cssGlobalClasses || settings._cssClasses || settings.classes || undefined,
  };
}

function pick(value, keys) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== '') {
      result[key] = value[key];
    }
  }
  return result;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function truncateText(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}\n\n[Truncated. Full prompt is in bricks-native-context.json.]`;
}

function workspaceFiles(workspaceDir) {
  return {
    context: path.join(workspaceDir, 'bricks-native-context.json'),
    brief: path.join(workspaceDir, 'bricks-native-brief.md'),
    attachmentManifest: path.join(workspaceDir, 'attachments', 'manifest.json'),
    runtimeSnapshots: path.join(workspaceDir, 'bricks-native-runtime-snapshots.json'),
    runnerPrompt: path.join(workspaceDir, 'runner-prompt.md'),
    runnerPromptResolved: path.join(workspaceDir, 'runner-prompt.resolved.md'),
    events: path.join(workspaceDir, 'runner-events.jsonl'),
    rawStream: path.join(workspaceDir, 'runner-raw-stream.txt'),
    rawStderr: path.join(workspaceDir, 'runner-raw-stderr.txt'),
    draft: path.join(workspaceDir, 'bricks-draft.json'),
    result: path.join(workspaceDir, 'bricks-result.json'),
    validation: path.join(workspaceDir, 'bricks-validation.json'),
    critique: path.join(workspaceDir, 'bricks-critique.md'),
    critiqueJson: path.join(workspaceDir, 'bricks-critique.json'),
    report: path.join(workspaceDir, 'conversion-report.md'),
  };
}

async function assertWorkspace(workspaceDir) {
  const contextPath = path.join(workspaceDir, 'bricks-native-context.json');
  if (!await exists(contextPath)) {
    throw new Error(`Missing Bricks-native workspace contract: ${contextPath}`);
  }
}

async function runDry(workspaceDir, files, prompt) {
  await writeEvent(files.events, {
    type: 'text_delta',
    delta: 'Dry run prepared the Bricks-native prototype workspace and runner prompt.\n',
  });
  const draft = {
    type: 'bricks_native_prototype_draft',
    status: 'dry_run',
    content: [],
    diagnostics: {
      readyToApply: false,
      reason: 'Dry run does not invoke a model.',
    },
  };
  const result = {
    type: 'bricks_native_prototype',
    generation_mode: 'bricks_native_prototype',
    status: 'dry_run',
    content: [],
    diagnostics: {
      readyToApply: false,
      reason: 'Dry run does not produce an apply-ready Bricks payload.',
    },
  };
  await fs.writeFile(files.draft, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  await fs.writeFile(files.result, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(files.report, [
    '# Bricks Native Prototype Report',
    '',
    'Dry run completed. The workspace contract and runner prompt were prepared, but no model was invoked.',
    '',
  ].join('\n'), 'utf8');
  await writeEvent(files.events, { type: 'status', label: 'done', message: 'Dry run completed.' });
  return { exitCode: 0, timedOut: false, dryRun: true, promptLength: prompt.length };
}

function runInvocation({ workspaceDir, files, prompt, invocation, timeoutMs }) {
  return new Promise((resolve) => {
    const effectiveInvocation = invocation.promptArg
      ? { ...invocation, args: [...(Array.isArray(invocation.args) ? invocation.args : []), prompt] }
      : invocation.promptFlag
        ? { ...invocation, args: [...(Array.isArray(invocation.args) ? invocation.args : []), invocation.promptFlag, prompt] }
      : invocation;
    const commandDisplay = effectiveInvocation.shell
      ? commandLineForShellInvocation(effectiveInvocation)
      : [effectiveInvocation.command, ...effectiveInvocation.args].map(quoteForDisplay).join(' ');
    const child = effectiveInvocation.shell ? spawn(commandLineForShellInvocation(effectiveInvocation), {
      cwd: workspaceDir,
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(effectiveInvocation.env || {}) },
    }) : spawn(effectiveInvocation.command, effectiveInvocation.args, {
      cwd: workspaceDir,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(effectiveInvocation.env || {}) },
    });
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      timedOut = true;
      void writeEvent(files.events, { type: 'status', label: 'timeout', message: `Runner timed out after ${timeoutMs}ms.` });
      child.kill();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      void writeEvent(files.events, { type: 'text_delta', delta: text });
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      void writeEvent(files.events, { type: 'stderr', delta: text });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      void writeEvent(files.events, { type: 'error', message: error.message });
      resolve({ exitCode: 1, timedOut, stdout, stderr, error: error.message, commandDisplay });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      void writeEvent(files.events, {
        type: 'status',
        label: exitCode === 0 && !timedOut ? 'done' : 'failed',
        exitCode,
        timedOut,
      });
      resolve({ exitCode: exitCode ?? 1, timedOut, stdout, stderr, commandDisplay });
    });
    if (!effectiveInvocation.promptArg && !effectiveInvocation.promptFlag) {
      child.stdin?.end(prompt);
    }
  });
}

function buildCustomInvocation(runnerCommand, { workspaceDir, files }) {
  return {
    command: runnerCommand
      .replace(/\{workspace\}/g, shellValue(workspaceDir))
      .replace(/\{prompt\}/g, shellValue(files.runnerPromptResolved))
      .replace(/\{result\}/g, shellValue(files.result))
      .replace(/\{draft\}/g, shellValue(files.draft)),
    args: [],
    shell: true,
    env: {},
  };
}

export function buildPresetInvocationForTest(runnerId, { workspaceDir, files = workspaceFiles(workspaceDir), model, reasoning, fastMode = false, runnerEnv = {} }) {
  const commandFor = (envKey, fallback) => normalizeString(runnerEnv[envKey] || process.env[envKey]) || fallback;
  if (runnerId === 'codex') {
    const args = process.platform === 'win32'
      ? ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access']
      : [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox',
          'workspace-write',
          '-c',
          'sandbox_workspace_write.network_access=true',
        ];
    args.push('-c', 'default_permissions=":workspace"', '-c', 'web_search="live"', '-C', workspaceDir);
    if (model && model !== 'default') args.push('--model', model);
    if (reasoning && reasoning !== 'default') {
      args.push('-c', `model_reasoning_effort="${clampCodexReasoning(model, reasoning)}"`);
    }
    if (fastMode) args.push('-c', 'service_tier="fast"');
    const command = commandFor('CODEX_BIN', 'codex');
    return { command, args, shell: shouldSpawnThroughShell(command), env: {} };
  }

  if (runnerId === 'claude') {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
    if (model && model !== 'default') args.push('--model', model);
    const command = commandFor('CLAUDE_BIN', 'claude');
    return { command, args, shell: shouldSpawnThroughShell(command), env: {} };
  }

  if (runnerId === 'gemini') {
    const args = ['--output-format', 'stream-json', '--yolo', '--prompt', ''];
    if (model && model !== 'default') args.push('--model', model);
    const command = commandFor('GEMINI_BIN', 'gemini');
    return { command, args, shell: shouldSpawnThroughShell(command), env: { GEMINI_CLI_TRUST_WORKSPACE: 'true' } };
  }

  if (runnerId === 'opencode') {
    const args = [
      'run',
      'Read the attached runner prompt file and complete the Bricks-native prototype task.',
      '--format',
      'json',
      '--dangerously-skip-permissions',
      '--file',
      files.runnerPromptResolved,
    ];
    if (model && model !== 'default') args.push('-m', model);
    const command = commandFor('OPENCODE_BIN', 'opencode');
    return { command, args, shell: shouldSpawnThroughShell(command), env: {} };
  }

  if (runnerId === 'cursor-agent') {
    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--force',
      '--trust',
      '--workspace',
      workspaceDir,
    ];
    if (model && model !== 'default') args.push('--model', model);
    const command = commandFor('CURSOR_AGENT_BIN', 'cursor-agent');
    return { command, args, shell: shouldSpawnThroughShell(command), env: {} };
  }

  if (runnerId === 'qwen') {
    const args = ['--yolo'];
    if (model && model !== 'default') args.push('--model', model);
    const command = commandFor('QWEN_BIN', 'qwen');
    return { command, args, shell: shouldSpawnThroughShell(command), env: {} };
  }

  throw new Error(`Pixflow has no Bricks-native runner adapter for "${runnerId}".`);
}

const buildPresetInvocation = buildPresetInvocationForTest;

function sanitizeRunnerEnv(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set(['CODEX_BIN', 'CLAUDE_BIN', 'GEMINI_BIN', 'OPENCODE_BIN', 'CURSOR_AGENT_BIN', 'QWEN_BIN']);
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key)) continue;
    const text = normalizeString(raw);
    if (text) result[key] = text;
  }
  return result;
}

function shouldSpawnThroughShell(commandPath) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(normalizeString(commandPath));
}

function commandLineForShellInvocation(invocation) {
  return [
    quoteForShell(invocation.command),
    ...(Array.isArray(invocation.args) ? invocation.args : []).map(quoteForShell),
  ].join(' ');
}

async function finalizeRunnerArtifacts(workspaceDir, files, runnerResult) {
  await fs.writeFile(files.rawStream, String(runnerResult.stdout || ''), 'utf8');
  await fs.writeFile(files.rawStderr, String(runnerResult.stderr || ''), 'utf8');
  const draftExists = await exists(files.draft);
  const resultExists = await exists(files.result);
  if (!draftExists) {
    await fs.writeFile(files.draft, `${JSON.stringify({
      type: 'bricks_native_prototype_draft',
      status: 'missing',
      content: [],
      diagnostics: {
        readyToApply: false,
        reason: 'Runner did not write bricks-draft.json.',
      },
    }, null, 2)}\n`, 'utf8');
  }
  if (!resultExists) {
    await fs.writeFile(files.result, `${JSON.stringify(buildMissingRunnerResult(runnerResult), null, 2)}\n`, 'utf8');
  }

  let result = await normalizeRunnerResultPayload(files.result);
  if (shouldReplaceRunnerResultAfterFailure(result, runnerResult)) {
    result = buildRunnerFailureResult(runnerResult);
    await fs.writeFile(files.result, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await writeEvent(files.events, {
      type: 'runner_failure',
      status: result.status,
      message: result.diagnostics?.reason || 'Runner failed before producing a Bricks result.',
      exitCode: runnerResult.exitCode ?? 1,
      timedOut: Boolean(runnerResult.timedOut),
    });
  }
  if (shouldReplacePlaceholderRunnerResult(result, runnerResult)) {
    result = buildMissingRunnerResult(runnerResult);
    await fs.writeFile(files.result, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await writeEvent(files.events, {
      type: 'runner_failure',
      status: result.status,
      message: result.diagnostics?.reason || 'Runner completed without writing an apply-ready Bricks result.',
      exitCode: runnerResult.exitCode ?? 0,
      timedOut: Boolean(runnerResult.timedOut),
    });
  }
  await writeEvent(files.events, {
    type: 'status',
    label: 'validating',
    message: 'Running Bricks-native validation checks.',
  });
  const validation = await validateBricksNativePrototypeWorkspace({ workspaceDir });
  await promoteValidatedResultToReady(files.result, result, validation, runnerResult);
  await writeEvent(files.events, {
    type: 'status',
    label: 'critiquing',
    message: 'Running Bricks-native critique checks.',
  });
  const critique = await critiqueBricksNativePrototypeWorkspace({ workspaceDir });
  const gateChangedResult = await applyValidationGateToResult(workspaceDir, validation);
  const gatedResult = gateChangedResult ? await readJsonSafe(files.result) : await readJsonSafe(files.result) || result;
  const ready = gatedResult?.diagnostics?.readyToApply === true || gatedResult?.readyToApply === true;
  const status = normalizeString(gatedResult?.status || (ready ? 'ready' : 'not_ready'));
  const ok = runnerResult.exitCode === 0 && ready && validation.ok === true && critique.ok === true;
  const message = ok
    ? 'Bricks-native prototype result passed validation and is ready for Bricks insertion.'
    : status === 'failed' || status === 'timeout'
      ? gatedResult?.diagnostics?.reason || 'Bricks-native prototype runner failed before producing an apply-ready result.'
      : validation.ok === false
      ? `Bricks-native prototype result failed validation (${validation.status || 'failed'}).`
      : critique.ok === false
        ? `Bricks-native prototype result failed critique (${critique.status || 'blocked'}).`
      : `Bricks-native prototype result is not apply-ready (${status || 'unknown'}).`;
  await writeEvent(files.events, {
    type: 'validation',
    status: validation.status,
    ok: validation.ok,
    errors: validation.errors || [],
    warnings: validation.warnings || [],
  });
  await writeEvent(files.events, {
    type: 'critique',
    status: critique.status,
    ok: critique.ok,
    checks: critique.checks || [],
    repairPrompt: critique.repairPrompt || '',
  });
  await writeEvent(files.events, { type: 'status', label: ok ? 'apply_ready' : 'not_apply_ready', message });
  return { ok, status, message };
}

function buildMissingRunnerResult(runnerResult) {
  if (runnerCrashed(runnerResult)) return buildRunnerFailureResult(runnerResult);
  return {
    type: 'bricks_native_prototype',
    generation_mode: 'bricks_native_prototype',
    status: runnerResult.exitCode === 0 ? 'missing_result' : 'failed',
    content: [],
    diagnostics: {
      readyToApply: false,
      reason: runnerResult.exitCode === 0
        ? 'Runner completed but did not write bricks-result.json.'
        : 'Runner failed before writing bricks-result.json.',
      runnerExitCode: runnerResult.exitCode ?? 0,
      runnerCommand: runnerResult.commandDisplay || '',
    },
  };
}

function shouldReplaceRunnerResultAfterFailure(result, runnerResult) {
  if (!runnerCrashed(runnerResult)) return false;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return true;
  const status = normalizeString(result.status);
  const content = Array.isArray(result.content) ? result.content : [];
  const reason = normalizeString(result.diagnostics?.reason);
  if (content.length > 0 && status && status !== 'pending' && status !== 'missing_result') return false;
  return (
    !status ||
    status === 'pending' ||
    status === 'missing' ||
    status === 'missing_result' ||
    status === 'dry_run' ||
    reason.includes('runner has not produced') ||
    reason.includes('runner did not write')
  );
}

function shouldReplacePlaceholderRunnerResult(result, runnerResult) {
  if (runnerResult?.dryRun) return false;
  if (runnerCrashed(runnerResult)) return false;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return true;
  const status = normalizeString(result.status);
  const content = Array.isArray(result.content) ? result.content : [];
  const reason = normalizeString(result.diagnostics?.reason);
  const ready = result.readyToApply === true || result.diagnostics?.readyToApply === true;
  if (ready || content.length > 0) return false;
  return (
    !status ||
    status === 'pending' ||
    status === 'missing' ||
    status === 'missing_result' ||
    status === 'dry_run' ||
    reason.includes('runner has not produced') ||
    reason.includes('runner did not write')
  );
}

function runnerCrashed(runnerResult) {
  return Boolean(
    runnerResult?.timedOut ||
    runnerResult?.error ||
    Number(runnerResult?.exitCode ?? 0) !== 0
  );
}

function buildRunnerFailureResult(runnerResult) {
  const timedOut = Boolean(runnerResult?.timedOut);
  const exitCode = Number(runnerResult?.exitCode ?? 1);
  const status = timedOut ? 'timeout' : 'failed';
  const reason = timedOut
    ? 'Prototype (Bricks) runner timed out before producing a Bricks result.'
    : `Prototype (Bricks) runner exited with code ${exitCode} before producing a Bricks result.`;
  return {
    type: 'bricks_native_prototype',
    generation_mode: 'bricks_native_prototype',
    status,
    content: [],
    diagnostics: {
      readyToApply: false,
      reason,
      runnerExitCode: exitCode,
      runnerTimedOut: timedOut,
      runnerCommand: runnerResult?.commandDisplay || '',
      runnerError: normalizeString(runnerResult?.error),
      stderrTail: tailText(runnerResult?.stderr, 2400),
      stdoutTail: tailText(runnerResult?.stdout, 1200),
    },
  };
}

function tailText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}

async function normalizeRunnerResultPayload(resultFile) {
  const result = await readJsonSafe(resultFile);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const context = await readJsonSafe(path.join(path.dirname(resultFile), 'bricks-native-context.json'));

  let changed = false;
  if (result.type !== 'bricks_native_prototype') {
    result.type = 'bricks_native_prototype';
    changed = true;
  }
  if (result.generation_mode !== 'bricks_native_prototype') {
    result.generation_mode = 'bricks_native_prototype';
    changed = true;
  }

  const themeStyle = objectValue(result.themeStyle || result.theme_style);
  if (Object.keys(themeStyle).length > 0 && !objectValue(result.bricks_native_theme_style_contract).settings) {
    result.bricks_native_theme_style_contract = normalizeThemeStyleContract(themeStyle, result);
    changed = true;
  }

  const colorScheme = objectValue(result.colorScheme || result.color_scheme);
  if (Object.keys(colorScheme).length > 0 && !objectValue(result.bricks_native_color_system).palette) {
    result.bricks_native_color_system = normalizeColorSystem(colorScheme, result);
    changed = true;
  }

  const normalizedClasses = normalizeGlobalClasses(result.global_classes || result.globalClasses, {
    scopedCss: firstString(themeStyle.scopedCss, objectValue(result.bricks_native_theme_style_contract).settings?.customCss),
  });
  if (normalizedClasses.changed) {
    result.global_classes = normalizedClasses.classes;
    result.globalClasses = normalizedClasses.classes;
    changed = true;
  }

  if (normalizeRunnerContentShape(result)) {
    changed = true;
  }

  if (normalizeRootParents(result)) {
    changed = true;
  }

  if (normalizeContentTrees(result)) {
    changed = true;
  }

  if (normalizeBemGlobalClassIds(result, context)) {
    changed = true;
  }

  if (changed) {
    await fs.writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  return result;
}

async function promoteValidatedResultToReady(resultFile, result, validation, runnerResult) {
  if (runnerCrashed(runnerResult)) return false;
  if (validation?.ok !== true) return false;
  const current = await readJsonSafe(resultFile) || result;
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
  const content = Array.isArray(current.content) ? current.content : [];
  if (!content.length) return false;

  const diagnostics = objectValue(current.diagnostics);
  let changed = false;
  if (current.status !== 'ready') {
    current.status = 'ready';
    changed = true;
  }
  if (current.readyToApply !== true) {
    current.readyToApply = true;
    changed = true;
  }
  if (diagnostics.readyToApply !== true) {
    diagnostics.readyToApply = true;
    changed = true;
  }
  if (diagnostics.validationStatus !== (validation.status || 'passed')) {
    diagnostics.validationStatus = validation.status || 'passed';
    changed = true;
  }
  if (Array.isArray(diagnostics.validationErrors) && diagnostics.validationErrors.length) {
    diagnostics.validationErrors = [];
    changed = true;
  }
  current.diagnostics = diagnostics;

  if (changed) {
    await fs.writeFile(resultFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }
  return changed;
}

function normalizeThemeStyleContract(themeStyle, result) {
  const name = firstString(themeStyle.label, themeStyle.name, result.page_title, result.pageTitle, 'Pixflow Bricks Native Prototype');
  const id = firstString(themeStyle.id, themeStyle.key, slugify(name));
  const settings = objectValue(themeStyle.settings);
  const scopedCss = firstString(themeStyle.scopedCss, themeStyle.customCss, settings.customCss);
  const tokens = objectValue(themeStyle.tokens);

  return {
    id,
    label: name,
    scope: themeStyle.scope || 'current_page',
    settings: {
      ...settings,
      ...(scopedCss ? { customCss: scopedCss } : {}),
      ...(Object.keys(tokens).length ? { pixflowTokens: tokens } : {}),
    },
  };
}

function normalizeColorSystem(colorScheme, result) {
  const name = firstString(colorScheme.name, colorScheme.label, result.page_title, result.pageTitle, 'pixflow-bricks-native-prototype');
  const categoryId = slugify(name);
  const colors = Array.isArray(colorScheme.colors) ? colorScheme.colors : [];
  const variables = colors
    .map((color, index) => {
      const tokenName = firstString(color?.name, color?.id, color?.key, `${categoryId}-${index + 1}`);
      const value = firstString(color?.value, color?.hex, color?.raw, color?.light);
      if (!tokenName || !value) return null;
      return {
        id: firstString(color?.id, tokenName),
        name: tokenName,
        value,
        category: categoryId,
      };
    })
    .filter(Boolean);

  return {
    variableCategory: {
      id: categoryId,
      name,
    },
    variables,
    palette: {
      id: categoryId,
      name,
      colors: variables.map((variable) => ({
        id: variable.id,
        name: variable.name,
        raw: variable.value,
        light: variable.value,
      })),
    },
  };
}

function normalizeGlobalClasses(value, options = {}) {
  const incoming = Array.isArray(value) ? value : [];
  let changed = !incoming.every((item) => item && typeof item === 'object' && !Array.isArray(item));
  const seen = new Set();
  const classes = [];

  for (const item of incoming) {
    const name = typeof item === 'string'
      ? item
      : firstString(item?.name, item?.id);
    const cleanName = slugify(name);
    if (!cleanName || seen.has(cleanName)) continue;
    seen.add(cleanName);

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      classes.push({
        id: firstString(item.id, cleanName),
        name: firstString(item.name, cleanName),
        settings: objectValue(item.settings),
      });
      continue;
    }

    const customCss = extractScopedClassCss(firstString(options.scopedCss), cleanName);
    classes.push({
      id: cleanName,
      name: cleanName,
      settings: customCss ? { _cssCustom: customCss } : {},
    });
  }

  return { changed, classes };
}

function normalizeBemGlobalClassIds(result, context = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const classes = Array.isArray(result.global_classes)
    ? result.global_classes
    : Array.isArray(result.globalClasses)
      ? result.globalClasses
      : [];
  if (!classes.length) return false;

  const existingNames = new Set(arrayValue(context?.existingGlobalClasses?.normalizedNames).map((item) => slugify(item)).filter(Boolean));
  const currentIds = new Set();
  const targetCounts = new Map();
  for (const item of classes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = firstString(item.id, item.name);
    const name = firstString(item.name, item.id);
    if (id) currentIds.add(id);
    const target = slugify(name);
    if (target) targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
  }

  const idMap = new Map();
  for (const item of classes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = firstString(item.id, item.name);
    const name = firstString(item.name, item.id);
    const target = slugify(name);
    if (!id || !target || id === target) continue;
    if (!isBemClassName(target)) continue;
    if (existingNames.has(target)) continue;
    if ((targetCounts.get(target) || 0) > 1) continue;
    if (currentIds.has(target) && !idMap.has(target)) continue;
    idMap.set(id, target);
  }

  let changed = false;
  if (idMap.size) {
    for (const item of classes) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = firstString(item.id, item.name);
      const mapped = idMap.get(id);
      if (!mapped) continue;
      item.id = mapped;
      item.name = mapped;
      changed = true;
    }

    const rewriteContainers = [
      result.content,
      result.elements,
      result.sections,
      result.bricks,
      result.payload,
    ];
    for (const container of rewriteContainers) {
      if (rewriteClassReferences(container, idMap)) changed = true;
    }
  }

  const addedBlockClasses = ensureBemBlockClasses(result, classes, existingNames);
  if (addedBlockClasses.length) {
    changed = true;
  }

  if (changed) {
    result.global_classes = classes;
    result.globalClasses = classes;
    const diagnostics = objectValue(result.diagnostics);
    diagnostics.classNormalization = {
      ...(objectValue(diagnostics.classNormalization)),
      bemIdRewrites: Array.from(idMap.entries()).map(([from, to]) => ({ from, to })),
      addedBlockClasses,
    };
    result.diagnostics = diagnostics;
  }
  return changed;
}

function ensureBemBlockClasses(result, classes, existingNames) {
  const content = Array.isArray(result.content)
    ? result.content
    : Array.isArray(result.elements)
      ? result.elements
      : [];
  if (!content.length || !classes.length) return [];

  const classIds = new Set(classes.map((item) => firstString(item?.id, item?.name)).filter(Boolean));
  const candidates = new Set();
  for (const classId of classIds) {
    const block = bemBlockNameFromClass(classId);
    if (!block || block === classId) continue;
    if (classIds.has(block) || existingNames.has(slugify(block))) continue;
    candidates.add(block);
  }
  if (!candidates.size) return [];

  const byParent = new Map();
  const byId = new Map();
  for (const element of content) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const id = firstString(element.id);
    if (id) byId.set(id, element);
    const parent = firstString(element.parent, element.parentId);
    const list = byParent.get(parent) || [];
    list.push(element);
    byParent.set(parent, list);
  }

  const added = [];
  for (const block of candidates) {
    classes.push({ id: block, name: block, settings: {} });
    classIds.add(block);
    added.push(block);
  }

  for (const section of content) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    if (firstString(section.name, section.type) !== 'section') continue;
    const sectionId = firstString(section.id);
    const sectionRefs = collectDescendantClassRefs(section, byParent);
    const block = Array.from(sectionRefs)
      .map((classId) => bemBlockNameFromClass(classId))
      .find((candidate) => candidate && candidates.has(candidate));
    if (!block) continue;
    const settings = objectValue(section.settings);
    const refs = Array.isArray(settings._cssGlobalClasses) ? [...settings._cssGlobalClasses] : [];
    if (!refs.includes(block)) refs.unshift(block);
    settings._cssGlobalClasses = refs;
    section.settings = settings;
    if (Array.isArray(result.elements) && result.elements !== content && sectionId && byId.has(sectionId)) {
      const mirror = result.elements.find((element) => firstString(element?.id) === sectionId);
      if (mirror) mirror.settings = settings;
    }
  }

  return added;
}

function bemBlockNameFromClass(className) {
  const text = slugify(className);
  if (!isBemClassName(text)) return '';
  const elementIndex = text.indexOf('__');
  const modifierIndex = text.indexOf('--');
  const cut = [elementIndex, modifierIndex].filter((index) => index > 0).sort((a, b) => a - b)[0];
  return cut ? text.slice(0, cut) : text;
}

function collectDescendantClassRefs(element, byParent, refs = new Set()) {
  for (const ref of collectClassRefs(element)) {
    refs.add(ref);
  }
  const id = firstString(element?.id);
  for (const child of byParent.get(id) || []) {
    collectDescendantClassRefs(child, byParent, refs);
  }
  return refs;
}

function collectClassRefs(value, key = '', refs = new Set()) {
  if (value == null) return refs;
  if (CLASS_REFERENCE_KEYS.has(key)) {
    collectClassReferenceValue(value, refs);
    return refs;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectClassRefs(item, key, refs);
    return refs;
  }
  if (typeof value === 'object') {
    for (const [itemKey, itemValue] of Object.entries(value)) {
      collectClassRefs(itemValue, itemKey, refs);
    }
  }
  return refs;
}

function collectClassReferenceValue(value, refs) {
  if (typeof value === 'string') {
    if (value) refs.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectClassReferenceValue(item, refs);
    return;
  }
  if (value && typeof value === 'object') {
    const id = firstString(value.id, value.name);
    if (id) refs.add(id);
  }
}

const CLASS_REFERENCE_KEYS = new Set([
  '_cssGlobalClasses',
  '_globalClasses',
  '_cssClasses',
  'globalClasses',
  'global_classes',
  'classIds',
  'class_ids',
  'cssClasses',
  'classes',
  'classNames',
]);

function rewriteClassReferences(value, idMap, key = '') {
  if (!value || typeof value !== 'object') return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (CLASS_REFERENCE_KEYS.has(key)) {
        const rewritten = rewriteClassReferenceValue(value[index], idMap);
        if (rewritten !== value[index]) {
          value[index] = rewritten;
          changed = true;
        }
      } else if (rewriteClassReferences(value[index], idMap, key)) {
        changed = true;
      }
    }
    return changed;
  }

  for (const itemKey of Object.keys(value)) {
    if (CLASS_REFERENCE_KEYS.has(itemKey)) {
      const rewritten = rewriteClassReferenceValue(value[itemKey], idMap);
      if (rewritten !== value[itemKey]) {
        value[itemKey] = rewritten;
        changed = true;
      }
      continue;
    }
    if (rewriteClassReferences(value[itemKey], idMap, itemKey)) {
      changed = true;
    }
  }
  return changed;
}

function rewriteClassReferenceValue(value, idMap) {
  if (typeof value === 'string') {
    return idMap.get(value) || value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = rewriteClassReferenceValue(item, idMap);
      if (rewritten !== item) changed = true;
      return rewritten;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next = { ...value };
    const id = firstString(next.id);
    if (id && idMap.has(id)) {
      next.id = idMap.get(id);
      changed = true;
      if (typeof next.name === 'string') next.name = next.id;
    }
    const name = firstString(next.name);
    if (name && idMap.has(name)) {
      next.name = idMap.get(name);
      changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

function isBemClassName(value) {
  const text = slugify(value);
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)|(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*))?$/.test(text);
}

function normalizeRunnerContentShape(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;

  const source = firstArray(
    result.content,
    result.elements,
    result.sections,
    objectValue(result.bricks).content,
    objectValue(result.bricks).elements,
    objectValue(result.bricks).sections,
    objectValue(result.payload).content,
    objectValue(result.payload).elements,
    objectValue(result.payload).sections,
  );
  if (!source) return false;

  const flattened = flattenBricksNativeTree(source);
  if (!flattened.length) return false;

  const existing = Array.isArray(result.content) ? result.content : [];
  const changed = existing !== source || existing.length !== flattened.length || hasNestedOrExternalShape(existing);
  result.content = flattened;
  result.elements = flattened;
  return changed || hasNestedOrExternalShape(flattened);
}

function flattenBricksNativeTree(nodes, parentId = '', output = []) {
  if (!Array.isArray(nodes)) return output;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;

    const rawId = firstString(node.id, node._id, node.key, node.uid, `generated-${output.length + 1}`);
    const childNodes = collectNestedChildren(node);
    const childIds = childNodes
      .map((child, childIndex) => firstString(child?.id, child?._id, child?.key, child?.uid, `${rawId}-child-${childIndex + 1}`))
      .filter(Boolean);
    const explicitChildren = normalizeChildrenList(node.children);
    const element = normalizeBricksNativeTreeNode(node, {
      id: rawId,
      parentId,
      children: childIds.length ? childIds : explicitChildren,
    });

    output.push(element);
    if (childNodes.length) {
      flattenBricksNativeTree(childNodes, rawId, output);
    }
  }

  return output;
}

function normalizeBricksNativeTreeNode(node, options) {
  const settings = objectValue(node.settings);
  const content = firstString(node.content, node.text, node.label);
  const name = normalizeBricksElementName(node);
  const normalized = {
    id: options.id,
    name,
    parent: firstString(node.parent, node.parentId, options.parentId),
    children: options.children,
    settings: { ...settings },
  };

  const tag = firstString(node.tag, node.htmlTag, node.settings?.tag);
  if (tag && !normalized.settings.tag) normalized.settings.tag = tag;

  if (content) {
    if (['heading', 'text', 'button', 'animated-typing'].includes(name)) {
      if (!normalized.settings.text) normalized.settings.text = content;
    }
    if (!normalized.settings.content && !['button'].includes(name)) {
      normalized.settings.content = content;
    }
  }

  if (Array.isArray(node.classNames) && node.classNames.length && !Array.isArray(normalized.settings._cssGlobalClasses)) {
    normalized.settings._cssGlobalClasses = node.classNames.map((item) => firstString(item)).filter(Boolean);
  }

  if (Array.isArray(node.classes) && node.classes.length && !Array.isArray(normalized.settings._cssGlobalClasses)) {
    normalized.settings._cssGlobalClasses = node.classes
      .map((item) => firstString(item?.id, item?.name, item))
      .filter(Boolean);
  }

  return normalized;
}

function normalizeBricksElementName(node) {
  const candidates = [
    node.type,
    node.component,
    node.element,
    node.name,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeString(candidate).toLowerCase().replace(/_/g, '-').trim();
    if (!normalized) continue;
    if (['section', 'container', 'block', 'div', 'heading', 'text', 'button', 'image', 'icon', 'svg', 'video', 'form', 'map', 'slider', 'tabs', 'accordion', 'code', 'shortcode'].includes(normalized)) {
      return normalized;
    }
    if (['paragraph', 'p', 'rich-text', 'copy', 'body-text'].includes(normalized)) return 'text';
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'title', 'headline', 'subheading'].includes(normalized)) return 'heading';
    if (['btn', 'cta', 'link-button'].includes(normalized)) return 'button';
    if (['wrapper', 'group', 'stack', 'row', 'column', 'grid'].includes(normalized)) return 'block';
  }
  return 'div';
}

function collectNestedChildren(node) {
  const children = [];
  for (const key of ['children', 'elements', 'items', 'content']) {
    const value = node?.[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        children.push(item);
      }
    }
  }
  return children;
}

function hasNestedOrExternalShape(elements) {
  if (!Array.isArray(elements)) return false;
  return elements.some((element) => {
    if (!element || typeof element !== 'object' || Array.isArray(element)) return false;
    if (element.type && !element.name) return true;
    if (element.component) return true;
    if (collectNestedChildren(element).length > 0) return true;
    return false;
  });
}

function normalizeRootParents(result) {
  let changed = false;
  for (const element of extractContentArrays(result).flat()) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    if (element.parent === 0 || element.parent === '0' || element.parent === null) {
      element.parent = '';
      changed = true;
    }
  }
  return changed;
}

function normalizeContentTrees(result) {
  let changed = false;
  for (const elements of extractContentArrays(result)) {
    const normalized = normalizeElementArray(elements);
    if (normalized.changed) changed = true;
  }
  return changed;
}

function normalizeElementArray(elements) {
  let changed = false;
  const byOldId = new Map();
  const oldIds = [];

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const oldId = firstString(element.id, element._id, element.key, `generated-${index + 1}`);
    if (element.id !== oldId) {
      element.id = oldId;
      changed = true;
    }
    if (element.name === 'paragraph') {
      element.name = 'text';
      changed = true;
    }
    const children = normalizeChildrenList(element.children);
    if (!arraysEqual(children, element.children)) {
      element.children = children;
      changed = true;
    }
    byOldId.set(oldId, element);
    oldIds.push(oldId);
  }

  const derivedParents = new Map();
  for (const element of byOldId.values()) {
    const parentId = firstString(element.id);
    for (const childId of normalizeChildrenList(element.children)) {
      if (byOldId.has(childId) && !derivedParents.has(childId)) {
        derivedParents.set(childId, parentId);
      }
    }
  }

  for (const [oldId, element] of byOldId.entries()) {
    const parent = firstString(element.parent, element.parentId);
    if (!parent && derivedParents.has(oldId)) {
      element.parent = derivedParents.get(oldId);
      changed = true;
    }
  }

  const idMap = buildBricksIdMap(oldIds);
  for (const [oldId, element] of byOldId.entries()) {
    const newId = idMap.get(oldId) || oldId;
    if (element.id !== newId) {
      element.id = newId;
      changed = true;
    }
    const oldParent = firstString(element.parent, element.parentId);
    const newParent = oldParent ? (idMap.get(oldParent) || oldParent) : '';
    if (element.parent !== newParent) {
      element.parent = newParent;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(element, 'parentId')) {
      delete element.parentId;
      changed = true;
    }
    const newChildren = normalizeChildrenList(element.children).map((childId) => idMap.get(childId) || childId);
    if (!arraysEqual(element.children, newChildren)) {
      element.children = newChildren;
      changed = true;
    }
  }

  return { changed };
}

function normalizeChildrenList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child).trim();
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        return firstString(child.id, child._id, child.key);
      }
      return '';
    })
    .filter(Boolean);
}

function buildBricksIdMap(oldIds) {
  const map = new Map();
  const used = new Set();
  for (let index = 0; index < oldIds.length; index += 1) {
    const oldId = oldIds[index];
    if (/^[a-z0-9]{6}$/.test(oldId) && !used.has(oldId)) {
      map.set(oldId, oldId);
      used.add(oldId);
      continue;
    }
    let candidate = generatedBricksId(index + 1);
    let offset = 1;
    while (used.has(candidate)) {
      candidate = generatedBricksId(index + 1 + offset);
      offset += 1;
    }
    map.set(oldId, candidate);
    used.add(candidate);
  }
  return map;
}

function generatedBricksId(index) {
  return `p${Math.max(1, index).toString(36).padStart(5, '0').slice(-5)}`;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function extractContentArrays(result) {
  return [
    result.content,
    result.elements,
    result.sections,
    objectValue(result.bricks).content,
    objectValue(result.bricks).elements,
    objectValue(result.bricks).sections,
    objectValue(result.payload).content,
    objectValue(result.payload).elements,
    objectValue(result.payload).sections,
  ].filter(Array.isArray);
}

function extractScopedClassCss(css, className) {
  if (!css || !className) return '';
  const selector = `.${className}`;
  const chunks = [];
  for (const rawChunk of css.split('}')) {
    const chunk = rawChunk.trim();
    if (!chunk.includes(selector)) continue;
    chunks.push(`${chunk}}`.replaceAll(selector, '%root%'));
  }
  return chunks.join('\n');
}

async function readOptional(filePath, fallback) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

async function materializeNativePrototypeSkillPack(workspaceDir) {
  const skillsRoot = pluginOwnedConverterSkillRoot();
  const targetRoot = path.join(workspaceDir, 'pixflow-skills');
  await fs.rm(targetRoot, { recursive: true, force: true });
  for (const folder of ['bricks-native-prototype', 'bricks-web-prototype']) {
    const source = path.join(skillsRoot, folder);
    if (await exists(source)) {
      await fs.cp(source, path.join(targetRoot, folder), { recursive: true });
    }
  }
}

async function readNativePrototypeSkillPack() {
  const root = path.join(pluginOwnedConverterSkillRoot(), 'bricks-native-prototype');
  const files = [
    'SKILL.md',
    path.join('references', 'native', 'bricks-native-prototype.md'),
    path.join('references', 'native', 'implementation', 'artifact-contract.md'),
    path.join('references', 'native', 'implementation', 'theme-style-and-colors.md'),
    path.join('references', 'native', 'implementation', 'layout-and-elements.md'),
    path.join('references', 'native', 'implementation', 'page-flow-and-copy.md'),
    path.join('references', 'native', 'implementation', 'validation-and-repair.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-json-shape.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-schema-controls.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-runtime-knowledge.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-project-style-reuse.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-theme-styles.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-element-options.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-framework-tokens.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-layout-structure.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-bem-classes.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-style-mapping.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-handoff-critique.md'),
    path.join('..', 'bricks-web-prototype', 'references', 'handoff', 'bricks-handoff-qa.md'),
  ];
  const sections = [];
  for (const relativePath of files) {
    const fullPath = path.join(root, relativePath);
    const body = await readOptional(fullPath, '');
    if (!body.trim()) continue;
    sections.push([
      `## ${relativePath.replace(/\\/g, '/')}`,
      '',
      body.trim(),
      '',
    ].join('\n'));
  }
  if (!sections.length) {
    return 'The Bricks-native skill pack could not be loaded. Follow the Workspace Contract and Required Output rules strictly.\n';
  }
  return `${sections.join('\n---\n\n')}\n`;
}

function pluginOwnedConverterSkillRoot() {
  const configured = normalizeString(process.env.PIXFLOW_BRICKS_SKILL_PACK_ROOT);
  if (!configured) {
    throw new Error('Missing plugin-owned Pixflow Bricks converter skill pack. Reconnect the Bridge and retry.');
  }
  const root = path.resolve(configured);
  if (!existsSync(path.join(root, 'bricks-native-prototype', 'SKILL.md'))
    || !existsSync(path.join(root, 'bricks-web-prototype', 'SKILL.md'))) {
    throw new Error('The plugin-owned Pixflow Bricks converter skill pack is incomplete.');
  }
  return root;
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(cleanJsonText(await fs.readFile(filePath, 'utf8')));
  } catch {
    return null;
  }
}

async function writeEvent(filePath, event) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify({ ...event, time: new Date().toISOString() })}\n`, 'utf8');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    const text = normalizeString(value);
    if (text) return text;
  }
  return '';
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function normalizeRunnerId(value) {
  const raw = normalizeString(value).toLowerCase().replace(/_/g, '-');
  if (raw === 'claude-code') return 'claude';
  if (raw === 'codex-cli') return 'codex';
  if (raw === 'gemini-cli') return 'gemini';
  if (raw === 'cursor') return 'cursor-agent';
  return raw || 'codex';
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shellValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function quoteForDisplay(value) {
  const text = String(value ?? '');
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function quoteForShell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/(["\\])/g, '\\$1')}"`;
}

function clampCodexReasoning(modelId, effort) {
  if (!effort) return effort;
  const raw = normalizeString(modelId);
  const id = raw.includes('/') ? raw.split('/').pop() : raw;
  const lateGpt5Family =
    !id ||
    id === 'default' ||
    id.startsWith('gpt-5.2') ||
    id.startsWith('gpt-5.3') ||
    id.startsWith('gpt-5.4') ||
    id.startsWith('gpt-5.5');
  if (lateGpt5Family && effort === 'minimal') return 'low';
  if (id === 'gpt-5.1' && effort === 'xhigh') return 'high';
  if (id === 'gpt-5.1-codex-mini') {
    return effort === 'high' || effort === 'xhigh' ? 'high' : 'medium';
  }
  return effort;
}

function cleanJsonText(value) {
  let text = String(value ?? '').replace(/^\uFEFF/, '').trim();
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  return text;
}


