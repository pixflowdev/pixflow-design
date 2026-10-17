import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const bridgeModuleUrl = new URL('../../../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs', import.meta.url).href;

function infer(metadata: Record<string, unknown>, fallbackTitle: string): { key: string; name: string } {
  return JSON.parse(execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { inferStageBColorSystemIdentity } = await import(${JSON.stringify(bridgeModuleUrl)});
     process.stdout.write(JSON.stringify(inferStageBColorSystemIdentity(${JSON.stringify(metadata)}, ${JSON.stringify(fallbackTitle)})));`,
  ], { encoding: 'utf8' })) as { key: string; name: string };
}

describe('Stage B color-system identity', () => {
  it('names systems from the HTML file but scopes their stable key to the source project', () => {
    const first = infer({ sourceId: 'project-alpha' }, 'index.html');
    const second = infer({ sourceId: 'project-beta' }, 'index.html');

    expect(first.name).toBe('index.html');
    expect(second.name).toBe('index.html');
    expect(first.key).not.toBe(second.key);
    expect(first.key).toContain('project-alpha');
    expect(second.key).toContain('project-beta');
  });

  it('keeps an explicitly selected design system as the primary identity', () => {
    const identity = infer({
      sourceId: 'project-alpha',
      selectedPixflowDesignSystem: { key: 'brand-system', label: 'Brand System' },
    }, 'index.html');

    expect(identity).toEqual({ key: 'brand-system', name: 'Brand System' });
  });
});
