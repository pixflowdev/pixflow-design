import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createJsonEventStreamHandler } from '../json-event-stream.js';
import { materializePixflowBricksConverterSkillPack } from './bricks-converter-skill-pack.js';

export interface BricksNativePrototypeInput {
  prompt: string;
  title?: string;
  projectId?: string;
  targetPage?: unknown;
  generationIntent?: unknown;
  designSystem?: unknown;
  frameworkRoute?: unknown;
  siteContext?: unknown;
  schemaCatalog?: unknown;
  runtimeKnowledge?: unknown;
  runtimeSnapshots?: unknown;
  availableTools?: unknown[];
  promptSkills?: unknown[];
  attachments?: unknown[];
  runnerId?: string;
  model?: string;
  reasoning?: string;
  fastMode?: boolean;
  runnerCommand?: string;
  runnerEnv?: Record<string, string>;
  dryRun?: boolean;
  converterSkillPack?: unknown;
}

export interface BricksNativePrototypeOptions {
  projectRoot: string;
  dataDir: string;
  onStreamEvent?: (event: Record<string, unknown>) => void;
}

export interface BricksNativePrototypeResult {
  ok: boolean;
  status: number;
  message: string;
  workspaceDir?: string;
  runnerPromptFile?: string;
  runnerEventsFile?: string;
  bricksDraftFile?: string;
  bricksResultFile?: string;
  runner?: unknown;
  result?: unknown;
}

export async function runBricksNativePrototype(
  input: BricksNativePrototypeInput,
  options: BricksNativePrototypeOptions,
): Promise<BricksNativePrototypeResult> {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, status: 400, message: 'Prompt is required for Prototype (Bricks).' };
  }

  const workspaceRoot = path.join(options.dataDir, 'bricks-native-prototype-runs');
  const rawProjectId = String(input.projectId || '').trim();
  const projectId = safeId(input.projectId || input.title || `bricks-native-${randomUUID()}`);
  const cliFile = path.join(options.projectRoot, 'tools', 'pixflow-design-bridge', 'bricks-native-prototype', 'cli.mjs');
  const requestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-bricks-native-'));
  const prepareInputFile = path.join(requestDir, 'prepare-input.json');
  const runInputFile = path.join(requestDir, 'run-input.json');
  let converterSkillRoot: string;
  try {
    converterSkillRoot = await materializePixflowBricksConverterSkillPack(
      input.converterSkillPack,
      path.join(requestDir, 'plugin-owned-converter-skills'),
    );
  } catch (error) {
    return {
      ok: false,
      status: 422,
      message: error instanceof Error ? error.message : 'The plugin-owned Pixflow Bricks converter abilities are invalid.',
    };
  }
  const attachments = await resolveProjectAttachments(
    Array.isArray(input.attachments) ? input.attachments : [],
    rawProjectId ? path.join(options.dataDir, 'projects', rawProjectId) : '',
  );

  const prepareInput = {
    workspace: workspaceRoot,
    projectId,
    title: input.title || 'Bricks native prototype',
    prompt,
    force: true,
    targetPage: input.targetPage || {},
    generationIntent: asObject(input.generationIntent),
    designSystem: asObject(input.designSystem),
    frameworkRoute: asObject(input.frameworkRoute),
    siteContext: asObject(input.siteContext),
    schemaCatalog: asObject(input.schemaCatalog),
    runtimeKnowledge: asObject(input.runtimeKnowledge),
    runtimeSnapshots: asObject(input.runtimeSnapshots),
    availableTools: Array.isArray(input.availableTools) ? input.availableTools : [],
    promptSkills: Array.isArray(input.promptSkills) ? input.promptSkills : [],
    attachments,
  };
  await fs.writeFile(prepareInputFile, JSON.stringify(prepareInput, null, 2), 'utf8');

  const prepare = await runNodeJson(options.projectRoot, [
    cliFile,
    'prepare-workspace',
    '--input-file',
    prepareInputFile,
    '--json',
  ], { PIXFLOW_BRICKS_SKILL_PACK_ROOT: converterSkillRoot });
  if (!prepare.ok || !prepare.json?.workspaceDir) {
    return {
      ok: false,
      status: 500,
      message: prepare.message || 'Could not prepare Bricks-native workspace.',
      runner: prepare,
    };
  }

  const workspaceDir = String(prepare.json.workspaceDir);
  const stopForwardingRunnerEvents = startRunnerEventForwarder(
    path.join(workspaceDir, 'runner-events.jsonl'),
    input.runnerId || 'codex',
    options.onStreamEvent,
  );
  const runInput = {
    workspace: workspaceDir,
    runner: input.runnerId || 'codex',
    ...(input.model ? { model: input.model } : {}),
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    ...(input.fastMode === true ? { fastMode: true } : {}),
    ...(input.runnerCommand ? { runnerCommand: input.runnerCommand } : {}),
    ...(input.runnerEnv && typeof input.runnerEnv === 'object' ? { runnerEnv: input.runnerEnv } : {}),
    ...(input.dryRun ? { dryRun: true } : {}),
  };
  await fs.writeFile(runInputFile, JSON.stringify(runInput, null, 2), 'utf8');
  let run: Awaited<ReturnType<typeof runNodeJson>>;
  try {
    run = await runNodeJson(options.projectRoot, [
      cliFile,
      'run-workspace',
      '--input-file',
      runInputFile,
      '--json',
    ], { PIXFLOW_BRICKS_SKILL_PACK_ROOT: converterSkillRoot });
  } finally {
    await stopForwardingRunnerEvents();
  }

  if (!run.ok) {
    return {
      ok: false,
      status: 500,
      message: run.message || 'Bricks-native runner failed.',
      workspaceDir,
      runner: run,
    };
  }

  const resultFile = String(run.json?.bricksResultFile || path.join(workspaceDir, 'bricks-result.json'));
  const result = await readJson(resultFile).catch(() => null);
  const resultStatus = String((result as { status?: unknown } | null)?.status || run.json?.status || '').trim().toLowerCase();
  const runnerExitCode = Number(run.json?.runnerExitCode ?? (result as { diagnostics?: { runnerExitCode?: unknown } } | null)?.diagnostics?.runnerExitCode ?? 0);
  const runnerTimedOut = Boolean(run.json?.runnerTimedOut || (result as { diagnostics?: { runnerTimedOut?: unknown } } | null)?.diagnostics?.runnerTimedOut);
  const runnerCrashed =
    runnerTimedOut ||
    resultStatus === 'failed' ||
    resultStatus === 'timeout' ||
    (Number.isFinite(runnerExitCode) && runnerExitCode !== 0);
  const ready = Boolean((result as { diagnostics?: { readyToApply?: boolean }; readyToApply?: boolean } | null)?.diagnostics?.readyToApply === true
    || (result as { readyToApply?: boolean } | null)?.readyToApply === true);
  if (runnerCrashed) {
    const reason = String((result as { diagnostics?: { reason?: unknown } } | null)?.diagnostics?.reason || run.json?.message || 'Bricks-native prototype runner failed before producing a result.').trim();
    return {
      ok: false,
      status: 500,
      message: reason,
      workspaceDir,
      ...optionalString('runnerPromptFile', run.json?.runnerPromptFile),
      ...optionalString('runnerEventsFile', run.json?.runnerEventsFile),
      ...optionalString('bricksDraftFile', run.json?.bricksDraftFile),
      bricksResultFile: resultFile,
      runner: run.json,
      result,
    };
  }

  return {
    ok: ready,
    status: ready ? 200 : 202,
    message: ready
      ? 'Bricks-native prototype result passed validation and is ready for Bricks insertion.'
      : String(run.json?.message || 'Bricks-native prototype result is not apply-ready.'),
    workspaceDir,
    ...optionalString('runnerPromptFile', run.json?.runnerPromptFile),
    ...optionalString('runnerEventsFile', run.json?.runnerEventsFile),
    ...optionalString('bricksDraftFile', run.json?.bricksDraftFile),
    bricksResultFile: resultFile,
    runner: run.json,
    result,
  };
}

function startRunnerEventForwarder(
  eventsFile: string,
  runnerId: unknown,
  onStreamEvent?: (event: Record<string, unknown>) => void,
): () => Promise<void> {
  if (!onStreamEvent) return async () => {};
  const parser = createJsonEventStreamHandler(normalizeRunnerParserKind(runnerId), onStreamEvent);
  let offset = 0;
  let partial = '';
  let stopped = false;
  let reading = false;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let record: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(trimmed);
      record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return;
    }
    if (!record) return;
    const type = String(record.type || '').trim();
    if (type === 'text_delta') {
      parser.feed(String(record.delta || ''));
      return;
    }
    if (type === 'status') {
      onStreamEvent({
        type: 'status',
        label: String(record.label || 'running'),
        ...(record.message ? { detail: String(record.message) } : {}),
      });
      return;
    }
    if (type === 'error' || type === 'runner_failure') {
      onStreamEvent({
        type: 'error',
        message: String(record.message || 'Prototype (Bricks) runner failed.'),
      });
      return;
    }
    if (type === 'validation') {
      emitRunnerCheckTool(onStreamEvent, {
        id: 'pixflow-bricks-native-validation',
        name: 'Bricks validation',
        status: String(record.status || ''),
        ok: record.ok === true,
        errors: Array.isArray(record.errors) ? record.errors : [],
        warnings: Array.isArray(record.warnings) ? record.warnings : [],
      });
      return;
    }
    if (type === 'critique') {
      emitRunnerCheckTool(onStreamEvent, {
        id: 'pixflow-bricks-native-critique',
        name: 'Bricks critique',
        status: String(record.status || ''),
        ok: record.ok === true,
        errors: [],
        warnings: Array.isArray(record.checks) ? record.checks : [],
      });
    }
  };

  const pump = async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      let text = '';
      try {
        text = await fs.readFile(eventsFile, 'utf8');
      } catch {
        return;
      }
      if (text.length < offset) {
        offset = 0;
        partial = '';
      }
      const chunk = text.slice(offset);
      offset = text.length;
      if (!chunk) return;
      const lines = `${partial}${chunk}`.split(/\r?\n/u);
      partial = lines.pop() || '';
      for (const line of lines) handleLine(line);
    } finally {
      reading = false;
    }
  };

  const interval = setInterval(() => {
    void pump();
  }, 250);
  void pump();

  return async () => {
    clearInterval(interval);
    await pump();
    stopped = true;
    if (partial.trim()) {
      handleLine(partial);
      partial = '';
    }
    parser.flush();
  };
}

function emitRunnerCheckTool(
  onStreamEvent: (event: Record<string, unknown>) => void,
  input: {
    id: string;
    name: string;
    status: string;
    ok: boolean;
    errors: unknown[];
    warnings: unknown[];
  },
): void {
  onStreamEvent({
    type: 'tool_use',
    id: input.id,
    name: input.name,
    input: {
      status: input.status,
      ok: input.ok,
      errorCount: input.errors.length,
      warningCount: input.warnings.length,
    },
  });
  const details = [
    `${input.name} ${input.ok ? 'passed' : 'needs attention'}${input.status ? ` (${input.status})` : ''}.`,
    ...input.errors.slice(0, 8).map((item, index) => `${index + 1}. ${summarizeIssue(item)}`),
    ...input.warnings.slice(0, 8).map((item, index) => `${input.errors.length + index + 1}. ${summarizeIssue(item)}`),
  ].join('\n');
  onStreamEvent({
    type: 'tool_result',
    toolUseId: input.id,
    content: details,
    isError: !input.ok,
  });
}

function summarizeIssue(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '').trim();
  const record = value as Record<string, unknown>;
  return String(record.message || record.summary || record.id || record.code || JSON.stringify(record)).trim();
}

function normalizeRunnerParserKind(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (raw === 'codex-cli') return 'codex';
  if (raw === 'gemini-cli') return 'gemini';
  if (raw === 'claude-code') return 'claude';
  return raw || 'codex';
}

async function resolveProjectAttachments(attachments: unknown[], projectDir: string): Promise<unknown[]> {
  if (!attachments.length) return [];
  const resolved: unknown[] = [];
  for (const item of attachments) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      resolved.push(item);
      continue;
    }
    const record = item as Record<string, unknown>;
    const sourcePath = stringValue(record.sourcePath || record.source_path || record.absolutePath || record.absolute_path);
    if (sourcePath && path.isAbsolute(sourcePath) && await exists(sourcePath)) {
      resolved.push(record);
      continue;
    }
    const relativePath = stringValue(record.path || record.name);
    const candidate = projectDir && relativePath && !path.isAbsolute(relativePath)
      ? path.resolve(projectDir, relativePath)
      : '';
    if (candidate && isInside(projectDir, candidate) && await exists(candidate)) {
      resolved.push({
        ...record,
        sourcePath: candidate,
      });
      continue;
    }
    resolved.push(record);
  }
  return resolved;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isInside(parent: string, child: string): boolean {
  if (!parent || !child) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stringValue(value: unknown): string {
  return String(value ?? '').trim();
}

function runNodeJson(cwd: string, args: string[], env: Record<string, string> = {}): Promise<{ ok: boolean; code: number; stdout: string; stderr: string; json?: Record<string, unknown>; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      stderr += error?.message || String(error);
    });
    child.on('close', (code) => {
      const parsed = parseJson(stdout);
      resolve({
        ok: code === 0 && Boolean(parsed),
        code: code ?? 1,
        stdout,
        stderr,
        ...(parsed ? { json: parsed } : {}),
        ...(code === 0 && parsed ? {} : { message: stderr.trim() || `Command failed with code ${code ?? 1}.` }),
      });
    });
  });
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse((await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(key: 'runnerPromptFile' | 'runnerEventsFile' | 'bricksDraftFile', value: unknown): Partial<Pick<BricksNativePrototypeResult, typeof key>> {
  return typeof value === 'string' && value ? { [key]: value } as Partial<Pick<BricksNativePrototypeResult, typeof key>> : {};
}

function safeId(value: unknown): string {
  const text = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return text || `bricks-native-${randomUUID()}`;
}
