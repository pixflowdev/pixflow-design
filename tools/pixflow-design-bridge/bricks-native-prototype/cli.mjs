#!/usr/bin/env node

import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { critiqueBricksNativePrototypeWorkspace } from './critique.mjs';
import { repairBricksNativePrototypeWorkspace } from './repair.mjs';
import { prepareBricksNativePrototypeWorkspace } from './workspace.mjs';
import { runBricksNativePrototypeWorkspace } from './runner.mjs';
import { validateBricksNativePrototypeWorkspace } from './validation.mjs';

async function main(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (
    command !== 'prepare-workspace'
    && command !== 'run-workspace'
    && command !== 'validate-workspace'
    && command !== 'critique-workspace'
    && command !== 'repair-workspace'
  ) {
    printHelp();
    process.exitCode = command ? 1 : 0;
    return;
  }

  const input = await inputFromFlags(flags);
  const result = command === 'prepare-workspace'
    ? await prepareBricksNativePrototypeWorkspace(input)
    : command === 'validate-workspace'
      ? await validateBricksNativePrototypeWorkspace(input)
      : command === 'critique-workspace'
        ? await critiqueBricksNativePrototypeWorkspace(input)
        : command === 'repair-workspace'
          ? await repairBricksNativePrototypeWorkspace(input)
      : await runBricksNativePrototypeWorkspace(input);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'prepare-workspace') {
    process.stdout.write(`Bricks native prototype workspace prepared: ${result.workspaceDir}\n`);
    process.stdout.write(`Files: ${result.files.length}\n`);
    return;
  }
  if (command === 'validate-workspace') {
    process.stdout.write(`Bricks native prototype validation completed: ${input.workspace || input.workspaceDir}\n`);
    process.stdout.write(`Status: ${result.status}\n`);
    process.stdout.write(`Errors: ${result.errors.length}\n`);
    process.stdout.write(`Warnings: ${result.warnings.length}\n`);
    return;
  }
  if (command === 'critique-workspace') {
    process.stdout.write(`Bricks native prototype critique completed: ${input.workspace || input.workspaceDir}\n`);
    process.stdout.write(`Status: ${result.status}\n`);
    process.stdout.write(`Checks: ${result.checks.length}\n`);
    return;
  }
  if (command === 'repair-workspace') {
    process.stdout.write(`Bricks native prototype repair completed: ${input.workspace || input.workspaceDir}\n`);
    process.stdout.write(`Status: ${result.status}\n`);
    process.stdout.write(`Attempts: ${result.attempts.length}\n`);
    return;
  }
  process.stdout.write(`Bricks native prototype runner completed: ${result.workspaceDir}\n`);
  process.stdout.write(`Status: ${result.status}\n`);
  process.stdout.write(`Result: ${result.bricksResultFile}\n`);
}

async function inputFromFlags(flags) {
  const input = {};
  if (flags['input-file']) {
    Object.assign(input, await readJson(flags['input-file']));
  }
  if (flags.workspace) input.workspace = flags.workspace;
  if (flags['project-id']) input.projectId = flags['project-id'];
  if (flags.title) input.title = flags.title;
  if (flags.prompt) input.prompt = flags.prompt;
  if (flags['prompt-file']) input.prompt = await fs.readFile(flags['prompt-file'], 'utf8');
  if (flags['runner-command']) input.runnerCommand = flags['runner-command'];
  if (flags.runner) input.runnerId = flags.runner;
  if (flags.agent) input.runnerId = flags.agent;
  if (flags.model) input.model = flags.model;
  if (flags.reasoning) input.reasoning = flags.reasoning;
  if (flags['reasoning-effort']) input.reasoning = flags['reasoning-effort'];
  if (flags['timeout-ms']) input.timeoutMs = Number(flags['timeout-ms']);
  if (flags['repair-attempts']) input.repairAttempts = Number(flags['repair-attempts']);
  if (flags['dry-run']) input.dryRun = true;
  if (flags.force) input.force = true;
  return input;
}

async function readJson(filePath) {
  const text = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${filePath} to contain a JSON object.`);
  }
  return value;
}

function parseArgs(argv) {
  const [command = '', ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  process.stdout.write(`Pixflow Bricks Native Prototype CLI

Usage:
  node tools/pixflow-design-bridge/bricks-native-prototype/cli.mjs prepare-workspace --workspace <dir> [options]
  node tools/pixflow-design-bridge/bricks-native-prototype/cli.mjs run-workspace --workspace <workspace-dir> [options]
  node tools/pixflow-design-bridge/bricks-native-prototype/cli.mjs validate-workspace --workspace <workspace-dir> [options]
  node tools/pixflow-design-bridge/bricks-native-prototype/cli.mjs critique-workspace --workspace <workspace-dir> [options]
  node tools/pixflow-design-bridge/bricks-native-prototype/cli.mjs repair-workspace --workspace <workspace-dir> [options]

Options:
  --input-file <json>   JSON request/context object.
  --workspace <dir>     Parent directory for prepare-workspace; workspace directory for run-workspace.
  --project-id <id>     Stable workspace folder id.
  --title <title>       Page/project title.
  --prompt <text>       User prompt.
  --prompt-file <file>  User prompt file.
  --runner <id>         Runner preset: codex, claude, gemini, opencode, cursor-agent, qwen.
  --model <model>       Optional model for the selected runner.
  --reasoning <effort>  Optional reasoning effort for runners that support it.
  --runner-command <cmd> Command to run for run-workspace. Supports {workspace}, {prompt}, {draft}, {result}.
  --repair-attempts <n> Maximum repair attempts for repair-workspace. Defaults to 2.
  --timeout-ms <ms>     Runner timeout. Defaults to 1200000.
  --dry-run             Build runner prompt and placeholder artifacts without invoking a model.
  --force               Overwrite existing contract files.
  --json                Print JSON result.
`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { main };
