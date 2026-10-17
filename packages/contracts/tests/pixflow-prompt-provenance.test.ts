import { describe, expect, it } from 'vitest';

import { createPixflowPromptProvenance } from '../src/api/pixflow-prompt-provenance.js';

describe('Pixflow prompt provenance', () => {
  it('normalizes a bounded, ordered source manifest without prompt content', () => {
    const result = createPixflowPromptProvenance({
      pipeline: 'build-in-bricks',
      transport: 'local-cli',
      layers: [
        { id: 'site-design-context', kind: 'dynamic', owner: 'site', order: 3, present: true, reason: 'revision-42' },
        { id: 'build-in-bricks-html-first', kind: 'skill', owner: 'build-in-bricks', order: 2, present: true, revision: '1.1.0', sourcePath: 'wordpress/resources/mcp-skills/bricks/workflows/build-in-bricks-html-first.md' },
        { id: 'pixflow-agent-core', kind: 'system', owner: 'pixflow-agent-core', order: 1, present: true },
      ],
      crafts: [],
      presets: [],
      plugins: [],
      scenarios: [],
    });

    expect(result.layers.map((layer) => layer.id)).toEqual([
      'pixflow-agent-core',
      'build-in-bricks-html-first',
      'site-design-context',
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.crafts).toEqual([]);
    expect(result.layers[1]?.sourcePath).toBe('wordpress/resources/mcp-skills/bricks/workflows/build-in-bricks-html-first.md');
  });

  it('keeps explicit omissions visible and deduplicates source ids', () => {
    const result = createPixflowPromptProvenance({
      pipeline: 'build-in-bricks',
      transport: 'byok-api',
      layers: [],
      omissions: [
        { id: 'example-web-prototype', owner: 'compatibility', present: false, reason: 'ordinary Build is not allowed to stage Prototype presets' },
        { id: 'example-web-prototype', owner: 'compatibility', present: false, reason: 'duplicate' },
      ],
    });
    expect(result.omissions).toHaveLength(1);
    expect(result.omissions[0]?.present).toBe(false);
  });
});
