import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const bridgeCliPath = resolve(process.cwd(), '../tools/pixflow-design-bridge/bricks-handoff-cli.mjs');

function runBridge(args: string[]): void {
  const run = spawnSync(process.execPath, [bridgeCliPath, ...args], {
    cwd: resolve(process.cwd(), '..'),
    encoding: 'utf8',
  });
  expect(run.status, run.stderr || run.stdout).toBe(0);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Stage B source class vocabulary', () => {
  it('[P1] preserves Web Prototype layout classes instead of manufacturing a BEM block', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-source-classes-'));
    temporaryDirectories.push(directory);
    const htmlFile = join(directory, 'index.html');
    const runnerFile = join(directory, 'run-baseline.mjs');
    writeFileSync(htmlFile, [
      '<!doctype html><html><head><style>',
      '.container{max-width:72rem;margin-inline:auto}',
      '.stack{display:grid;gap:2rem}',
      '.grid-3{display:grid;grid-template-columns:repeat(3,1fr)}',
      '.btn{display:inline-flex;padding:1rem}',
      '.btn-primary{background:#111;color:#fff}',
      '</style></head><body><main class="page-shell">',
      '<section class="section"><div class="container stack">',
      '<div class="grid-3"><article class="card"><a class="btn btn-primary" href="#start">Start free</a></article></div>',
      '</div></section></main></body></html>',
    ].join(''));

    writeFileSync(runnerFile, [
      'const { buildPixflowStageBHtmlBaseline } = await import(process.argv[2]);',
      'const baseline = await buildPixflowStageBHtmlBaseline({',
      '  htmlFile: process.argv[3],',
      "  plan: { conversionPolicy: { conversionProfile: 'prototype_bricks', generationScope: 'section' } },",
      '  iconSystem: {},',
      '  fontSystem: {},',
      '});',
      'console.log(JSON.stringify({',
      '  classNames: baseline.globalClasses.map((classItem) => classItem.name).filter(Boolean),',
      '  sourceClassPreservation: baseline.summary.sourceClassPreservation,',
      '}));',
    ].join('\n'));
    const bridgeUrl = pathToFileURL(resolve(process.cwd(), '../tools/pixflow-design-bridge/bricks-handoff-cli.mjs')).href;
    const run = spawnSync(process.execPath, [runnerFile, bridgeUrl, htmlFile], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(run.status, run.stderr).toBe(0);
    const baseline: {
      classNames: string[];
      sourceClassPreservation: { applied: boolean; reason: string; renamed: number };
    } = JSON.parse(run.stdout);
    const classNames = baseline.classNames;

    expect(classNames).toEqual(expect.arrayContaining([
      'container',
      'stack',
      'grid-3',
      'btn',
      'btn-primary',
    ]));
    expect(classNames.some((name: string) => name.includes('__'))).toBe(false);
    expect(baseline.sourceClassPreservation).toEqual({
      applied: false,
      reason: 'source_class_names_preserved',
      renamed: 0,
    });
  });

  it('[P1] keeps preset button and utility class names through Stage B cleanup', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-source-cleanup-'));
    temporaryDirectories.push(directory);
    const stageA = join(directory, 'stage-a');
    const drafts = join(stageA, 'drafts');
    const stageB = join(directory, 'stage-b');
    mkdirSync(drafts, { recursive: true });
    writeFileSync(join(stageA, 'metadata.json'), JSON.stringify({
      sourceId: 'source-class-cleanup',
      title: 'Source Class Cleanup',
    }));
    writeFileSync(join(drafts, 'index.html'), [
      '<!doctype html><html><head><style>',
      '.container{max-width:72rem;margin-inline:auto}',
      '.grid-3{display:grid;grid-template-columns:repeat(3,1fr)}',
      '.btn-primary{display:inline-flex;background:#111;color:#fff}',
      '</style></head><body><main class="page-shell">',
      '<section class="section"><div class="container grid-3">',
      '<a class="btn-primary" href="#start">Start free</a>',
      '</div></section></main></body></html>',
    ].join(''));

    runBridge([
      'prepare-stage-b',
      '--stage-a-workspace', stageA,
      '--workspace', stageB,
      '--runner', 'deterministic',
      '--force',
      '--skipStatusPreflight', 'true',
      '--json',
    ]);
    const workspace = join(stageB, 'source-class-cleanup');
    runBridge([
      'repair-stage-b',
      '--workspace', workspace,
      '--repair-attempts', '0',
      '--allow-low-stage-b-qa',
      '--json',
    ]);

    const result = JSON.parse(readFileSync(join(workspace, 'bricks-result.json'), 'utf8')) as {
      global_classes?: Array<{ name?: string }>;
      globalClasses?: Array<{ name?: string }>;
    };
    const classNames = (result.global_classes || result.globalClasses || [])
      .map((classItem) => classItem.name)
      .filter((name): name is string => Boolean(name));

    expect(classNames).toEqual(expect.arrayContaining(['container', 'grid-3', 'btn-primary']));
    expect(classNames).not.toContain('btn-main');
  });
});
