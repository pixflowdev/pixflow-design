import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBricksNativePrototypeWorkspace } from './validation.mjs';

export async function critiqueBricksNativePrototypeWorkspace(input = {}) {
  const workspaceDir = path.resolve(String(input.workspaceDir || input.workspace || '.'));
  const files = critiqueFiles(workspaceDir);
  const result = await readJsonSafe(files.result);
  const validation = await readJsonSafe(files.validation)
    || await validateBricksNativePrototypeWorkspace({ workspaceDir });
  const context = await readJsonSafe(files.context);
  const pagePlan = await readJsonSafe(files.pagePlan);
  const sectionPlan = await readJsonSafe(files.sectionPlan);
  const content = extractContent(result);
  const sections = content.filter((element) => elementName(element) === 'section');
  const containers = content.filter((element) => elementName(element) === 'container');
  const textElements = content.filter((element) => ['heading', 'text-basic', 'text', 'text-link', 'button'].includes(elementName(element)));
  const globalClasses = Array.isArray(result?.global_classes)
    ? result.global_classes
    : Array.isArray(result?.globalClasses)
      ? result.globalClasses
      : [];
  const status = validation?.ok === false ? 'blocked' : validation?.warnings?.length ? 'needs_review' : 'passed';
  const blockingIssues = Array.isArray(validation?.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  const checks = buildCritiqueChecks({ result, context, validation, pagePlan, sectionPlan, content, sections, containers, textElements, globalClasses });
  const repairPrompt = buildRepairPrompt({ status, blockingIssues, warnings, checks });
  const markdown = renderCritiqueMarkdown({
    status,
    context,
    result,
    validation,
    content,
    sections,
    containers,
    textElements,
    globalClasses,
    checks,
    repairPrompt,
  });

  await fs.writeFile(files.critique, markdown, 'utf8');
  const payload = {
    type: 'bricks_native_prototype_critique',
    generatedAt: new Date().toISOString(),
    ok: status !== 'blocked',
    status,
    blockingIssues,
    warnings,
    checks,
    repairPrompt,
    files,
  };
  await fs.writeFile(files.critiqueJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function buildCritiqueChecks(data) {
  const checks = [];
  const ready = data.result?.diagnostics?.readyToApply === true || data.result?.readyToApply === true;
  checks.push(critiqueCheck(
    'controlled-apply',
    ready && data.validation?.ok === true,
    ready
      ? 'Result declares controlled Apply readiness.'
      : 'Result is not marked ready for Bricks insertion.',
    'Apply must stay disabled until validation, critique, and required work are complete.',
  ));
  checks.push(critiqueCheck(
    'section-container-ratio',
    data.sections.length === 0 || data.containers.length >= data.sections.length,
    `${data.sections.length} section(s), ${data.containers.length} container(s).`,
    'Each section should have a direct Bricks container child.',
  ));
  checks.push(critiqueCheck(
    'native-bricks-output',
    data.result?.type === 'bricks_native_prototype' && data.result?.generation_mode === 'bricks_native_prototype',
    'Result identifies itself as Bricks-native output.',
    'Do not ship HTML prototype artifacts as the primary deliverable.',
  ));
  checks.push(critiqueCheck(
    'theme-style-contract',
    hasObject(data.result?.bricks_native_theme_style_contract)
      || hasObject(data.result?.bricksNativeThemeStyleContract)
      || hasObject(data.result?.stage_b_theme_style_contract)
      || hasObject(data.result?.stage_b_theme_style_payload)
      || hasObject(data.result?.themeStylePayload),
    'Checked for a Theme Style contract/sidecar.',
    'Repeated defaults should live in page-scoped Bricks Theme Styles.',
  ));
  checks.push(critiqueCheck(
    'color-system-contract',
    hasObject(data.result?.bricks_native_color_system)
      || hasObject(data.result?.bricksNativeColorSystem)
      || hasObject(data.result?.stage_b_color_system)
      || hasObject(data.result?.colorScheme),
    'Checked for a color scheme contract/sidecar.',
    'Use page/project-prefixed Bricks color tokens instead of ad-hoc color classes.',
  ));
  checks.push(critiqueCheck(
    'bem-global-classes',
    data.sections.length === 0 || hasBemGlobalClass(data.globalClasses),
    `${data.globalClasses.length} global class(es) found.`,
    'Generated sections should use reusable Bricks global classes with BEM block/element/modifier naming.',
  ));
  checks.push(critiqueCheck(
    'framework-route-tokens',
    !hasObject(data.context?.frameworkRoute) || resultMentionsFrameworkRoute(data.result),
    hasObject(data.context?.frameworkRoute)
      ? 'Checked for active framework route token evidence.'
      : 'No active framework route supplied.',
    'Use the selected framework route for non-color spacing, typography, radius, grid, and layout tokens.',
  ));
  checks.push(critiqueCheck(
    'editable-copy',
    data.textElements.length > 0,
    `${data.textElements.length} editable text/button element(s) found.`,
    'Copy should live in native editable Bricks text/button controls.',
  ));
  checks.push(critiqueCheck(
    'page-plan-present',
    hasPlannedSections(data.pagePlan) || hasPlannedSections(data.sectionPlan),
    'Checked page and section planning artifacts.',
    'A Bricks-native run should include a narrative section plan before final JSON.',
  ));
  return checks;
}

function buildRepairPrompt({ status, blockingIssues, warnings, checks }) {
  const lines = [];
  if (status === 'blocked') {
    lines.push('Repair the Bricks-native prototype before marking it ready for Bricks insertion.');
  } else if (warnings.length) {
    lines.push('Review and tighten the Bricks-native prototype warnings before final Apply where practical.');
  } else {
    lines.push('No blocking critique issues were found. Keep the payload stable and do not redo completed work.');
  }
  const failedChecks = checks.filter((item) => !item.ok);
  if (blockingIssues.length) {
    lines.push('', 'Blocking validation issues:');
    for (const issue of blockingIssues) {
      lines.push(`- ${formatIssue(issue)}`);
    }
  }
  if (failedChecks.length) {
    lines.push('', 'Failed critique checks:');
    for (const item of failedChecks) {
      lines.push(`- ${item.name}: ${item.guidance}`);
    }
  }
  if (warnings.length) {
    lines.push('', 'Warnings to consider:');
    for (const warning of warnings.slice(0, 12)) {
      lines.push(`- ${formatIssue(warning)}`);
    }
  }
  return lines.join('\n');
}

function renderCritiqueMarkdown(data) {
  const title = stringValue(data.context?.request?.title || data.result?.page_title || data.result?.pageTitle || 'Bricks Native Prototype');
  const lines = [
    '# Bricks Native Prototype Critique',
    '',
    `Status: ${data.status}`,
    `Project: ${title}`,
    `Elements: ${data.content.length}`,
    `Sections: ${data.sections.length}`,
    `Containers: ${data.containers.length}`,
    `Global classes: ${data.globalClasses.length}`,
    `Editable text/button elements: ${data.textElements.length}`,
    '',
    '## Validation Summary',
    '',
    `Validation status: ${data.validation?.status || 'unknown'}`,
    `Validation errors: ${Array.isArray(data.validation?.errors) ? data.validation.errors.length : 0}`,
    `Validation warnings: ${Array.isArray(data.validation?.warnings) ? data.validation.warnings.length : 0}`,
    '',
    '## Critique Checks',
    '',
    ...data.checks.map((item) => `- [${item.ok ? 'x' : ' '}] ${item.name}: ${item.message} ${item.ok ? '' : `(${item.guidance})`}`.trim()),
    '',
    '## Repair Prompt',
    '',
    data.repairPrompt,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function critiqueFiles(workspaceDir) {
  return {
    context: path.join(workspaceDir, 'bricks-native-context.json'),
    pagePlan: path.join(workspaceDir, 'bricks-page-plan.json'),
    sectionPlan: path.join(workspaceDir, 'bricks-section-plan.json'),
    result: path.join(workspaceDir, 'bricks-result.json'),
    validation: path.join(workspaceDir, 'bricks-validation.json'),
    critique: path.join(workspaceDir, 'bricks-critique.md'),
    critiqueJson: path.join(workspaceDir, 'bricks-critique.json'),
  };
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(cleanJsonText(await fs.readFile(filePath, 'utf8')));
  } catch {
    return null;
  }
}

function extractContent(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  for (const candidate of [
    result.content,
    result.elements,
    result?.bricks?.content,
    result?.bricks?.elements,
    result?.payload?.content,
    result?.payload?.elements,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function hasPlannedSections(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray(value.sections) && value.sections.length > 0;
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function hasBemGlobalClass(globalClasses) {
  return Array.isArray(globalClasses) && globalClasses.some((item) => {
    const name = stringValue(item?.name || item?.id);
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+-?)+|--(?:[a-z0-9]+-?)+)?$/.test(name);
  });
}

function resultMentionsFrameworkRoute(result) {
  const text = JSON.stringify(result || {}).toLowerCase();
  return text.includes('framework route') || text.includes('framework-route') || text.includes('design-tokens');
}

function elementName(element) {
  return stringValue(element?.name || element?.type || element?.element || element?.tag).toLowerCase();
}

function critiqueCheck(name, ok, message, guidance) {
  return { name, ok, message, guidance };
}

function formatIssue(issue) {
  if (!issue || typeof issue !== 'object') return String(issue ?? '');
  const pathName = issue.path ? `${issue.path}: ` : '';
  return `${pathName}${issue.message || JSON.stringify(issue)}`;
}

function stringValue(value) {
  return String(value ?? '').trim();
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
