import fs from 'node:fs/promises';
import path from 'node:path';
import { critiqueBricksNativePrototypeWorkspace } from './critique.mjs';
import { runBricksNativePrototypeWorkspace } from './runner.mjs';
import { validateBricksNativePrototypeWorkspace } from './validation.mjs';

const DEFAULT_REPAIR_ATTEMPTS = 2;

export async function repairBricksNativePrototypeWorkspace(input = {}) {
  const workspaceDir = path.resolve(String(input.workspaceDir || input.workspace || '.'));
  const maxAttempts = positiveInteger(firstDefined(input.repairAttempts, input.repair_attempts, input.attempts), DEFAULT_REPAIR_ATTEMPTS);
  const files = repairFiles(workspaceDir);
  const attempts = [];

  await assertWorkspace(workspaceDir);
  let validation = await validateBricksNativePrototypeWorkspace({ workspaceDir });
  let critique = await critiqueBricksNativePrototypeWorkspace({ workspaceDir });

  if (isApplyReady(validation, critique)) {
    const summary = await writeRepairSummary(files.summary, {
      ok: true,
      status: 'already_ready',
      attempts,
      validation,
      critique,
      message: 'Workspace is already validated and ready for Bricks insertion.',
    });
    return summary;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const repairInstructions = buildRepairInstructions({ attempt, maxAttempts, validation, critique });
    await fs.writeFile(files.currentPrompt, repairInstructions, 'utf8');
    const runResult = await runBricksNativePrototypeWorkspace({
      ...input,
      workspace: workspaceDir,
      dryRun: false,
      repairInstructions,
    });
    validation = await validateBricksNativePrototypeWorkspace({ workspaceDir });
    critique = await critiqueBricksNativePrototypeWorkspace({ workspaceDir });
    attempts.push({
      attempt,
      ok: runResult.ok,
      status: runResult.status,
      message: runResult.message,
      validationStatus: validation.status,
      validationErrors: Array.isArray(validation.errors) ? validation.errors.length : 0,
      validationWarnings: Array.isArray(validation.warnings) ? validation.warnings.length : 0,
      critiqueStatus: critique.status,
      critiqueOk: critique.ok,
    });
    if (isApplyReady(validation, critique)) {
      return writeRepairSummary(files.summary, {
        ok: true,
        status: 'repaired',
        attempts,
        validation,
        critique,
        message: `Repair passed after ${attempt} attempt(s).`,
      });
    }
  }

  return writeRepairSummary(files.summary, {
    ok: false,
    status: 'failed',
    attempts,
    validation,
    critique,
    message: `Repair did not pass after ${maxAttempts} attempt(s).`,
  });
}

function buildRepairInstructions({ attempt, maxAttempts, validation, critique }) {
  const lines = [
    `Repair attempt ${attempt} of ${maxAttempts}.`,
    '',
    'You are repairing an existing Bricks-native prototype workspace.',
    'Do not restart the project from scratch.',
    'Do not redo completed work that is already valid.',
    'Do not apply changes to WordPress or Bricks.',
    'Only update workspace artifacts, primarily `bricks-draft.json`, `bricks-result.json`, planning sidecars, and report files.',
    'When all gates pass, set `bricks-result.json` to `status: "ready"` and `diagnostics.readyToApply: true`.',
    '',
  ];

  if (Array.isArray(validation?.errors) && validation.errors.length) {
    lines.push('## Blocking Validation Errors', '');
    for (const issue of validation.errors) lines.push(`- ${formatIssue(issue)}`);
    lines.push('');
  }

  if (Array.isArray(validation?.warnings) && validation.warnings.length) {
    lines.push('## Validation Warnings To Review', '');
    for (const issue of validation.warnings.slice(0, 16)) lines.push(`- ${formatIssue(issue)}`);
    lines.push('');
  }

  if (critique?.repairPrompt) {
    lines.push('## Critique Repair Prompt', '', String(critique.repairPrompt), '');
  }

  lines.push(
    '## Required Final Checks',
    '',
    '- Preserve Bricks-native JSON as the primary output.',
    '- Preserve `section > container > children` structure.',
    '- Use native Bricks controls before custom CSS.',
    '- Keep Theme Styles and color schemes page/project scoped; do not overwrite site defaults.',
    '- Do not write directly to WordPress or Bricks from this repair runner.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

async function writeRepairSummary(filePath, summary) {
  const payload = {
    type: 'bricks_native_prototype_repair',
    generatedAt: new Date().toISOString(),
    ...summary,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function isApplyReady(validation, critique) {
  return validation?.ok === true && critique?.ok === true;
}

function repairFiles(workspaceDir) {
  return {
    context: path.join(workspaceDir, 'bricks-native-context.json'),
    currentPrompt: path.join(workspaceDir, 'runner-prompt.repair.md'),
    summary: path.join(workspaceDir, 'bricks-repair-summary.json'),
  };
}

async function assertWorkspace(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, 'bricks-native-context.json'));
  } catch {
    throw new Error(`Missing Bricks-native workspace contract: ${workspaceDir}`);
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function formatIssue(issue) {
  if (!issue || typeof issue !== 'object') return String(issue ?? '');
  const pathName = issue.path ? `${issue.path}: ` : '';
  return `${pathName}${issue.message || JSON.stringify(issue)}`;
}
