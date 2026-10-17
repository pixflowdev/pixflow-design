import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const bridgeUrl = pathToFileURL(resolve(process.cwd(), '../tools/pixflow-design-bridge/bricks-handoff-cli.mjs')).href;

function evaluateBridge(expression: string): unknown {
  const stdout = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const bridge = await import(${JSON.stringify(bridgeUrl)}); process.stdout.write(JSON.stringify(${expression}));`,
  ], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

describe('optional Stage B user refinement', () => {
  it('[P1] does not invoke a model when the converter already passes important QA', () => {
    const plan = evaluateBridge(`bridge.buildStageBUserRefinementPlan({
      status: 'passed',
      score: 97,
      severity: { p0: 0, p1: 0, p2: 2 },
      issues: [
        { id: 'advisory_a', severity: 'p2', message: 'Advisory only.' },
        { id: 'advisory_b', severity: 'p2', message: 'Advisory only.' },
      ],
    }, { minScore: 97 })`) as { requiresModel: boolean; issues: unknown[]; reason: string };

    expect(plan.requiresModel).toBe(false);
    expect(plan.issues).toEqual([]);
    expect(plan.reason).toContain('no important cleanup');
  });

  it('[P1] creates a compact issue-led prompt when repair-required findings remain', () => {
    const result = evaluateBridge(`(() => {
      const plan = bridge.buildStageBUserRefinementPlan({
      status: 'failed',
      score: 92,
      severity: { p0: 0, p1: 1, p2: 1 },
      issues: [
        { id: 'missing_hero_layout', severity: 'p1', message: 'Hero layout does not match.' },
        { id: 'responsive_gap', severity: 'p2', message: 'Mobile gap is incorrect.' },
      ],
      }, { minScore: 97 });
      return { plan, prompt: bridge.renderStageBUserRefinementPrompt({ resultFile: 'C:/tmp/bricks-result.json' }, plan) };
    })()`) as { plan: { requiresModel: boolean }; prompt: string };
    const { plan, prompt } = result;

    expect(plan.requiresModel).toBe(true);
    expect(prompt).toContain('missing_hero_layout');
    expect(prompt).toContain('responsive_gap');
    expect(prompt).toContain('Edit bricks-result.json only');
    expect(prompt).not.toContain('Required source-fidelity repair pass');
    expect(prompt).not.toContain('Read stage-b-source-map.json');
  });
});
