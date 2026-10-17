import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('source-fidelity header hierarchy', () => {
  it('keeps source-owned header children instead of creating a synthetic navigation wrapper', () => {
    const bridgeModuleUrl = new URL('../../../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { applyPixflowStageBHeaderBaselineContract } = await import(${JSON.stringify(bridgeModuleUrl)});
       const content = [
         { id: 'header', name: 'section', parent: '', children: ['nav', 'hero'], settings: { tag: 'header' } },
         { id: 'nav', name: 'div', parent: 'header', children: [], settings: {} },
         { id: 'hero', name: 'div', parent: 'header', children: [], settings: {} },
       ];
       applyPixflowStageBHeaderBaselineContract(content, {}, { globalClasses: [] }, { preserveSourceHierarchy: true });
       process.stdout.write(JSON.stringify(content));`,
    ], { encoding: 'utf8' });
    const content = JSON.parse(output) as Array<{ id: string; parent: string; children: string[] }>;

    expect(content).toHaveLength(3);
    expect(content[0]?.children).toEqual(['nav', 'hero']);
    expect(content.slice(1).map((element) => element.parent)).toEqual(['header', 'header']);
  });
});
