import { describe, expect, it } from 'vitest';

import {
  compactQuickTextEditBricksContext,
  compactQuickTextEditMcpRuntimeContext,
} from '../quick-text-edit-context.mjs';

describe('OpenCode quick-text-edit context compaction', () => {
  it('keeps class identities and active route facts without shipping full style trees', () => {
    const globalClasses = Array.from({ length: 500 }, (_, index) => ({
      id: `class-${index}`,
      name: `feature-${index}`,
      settings: {
        _typography: { color: { raw: '#111' }, fontSize: `${index}px` },
        _cssCustom: '.feature { color: red; }'.repeat(100),
      },
    }));
    const compact = compactQuickTextEditBricksContext({
      postId: 42,
      globalClasses,
      tokenRoute: {
        id: 'pixflow-native-bricks',
        activeRouteId: 'pixflow-native-bricks',
        route: { id: 'pixflow-native-bricks', title: 'Native Bricks', available: true },
        nativeBricksMapping: {
          effectiveBundlePresent: true,
          variables: Array.from({ length: 150 }, (_, index) => ({ name: `space-${index}`, value: `${index}px` })),
          colorPalettes: [{ name: 'Brand' }],
        },
      },
    });

    expect(compact.globalClasses).toHaveLength(500);
    expect(compact.globalClasses[0]).toEqual({
      id: 'class-0',
      name: 'feature-0',
      settingKeys: ['_typography', '_cssCustom'],
    });
    expect(compact.tokenRoute.nativeBricksMapping).toMatchObject({
      effectiveBundlePresent: true,
      variableCount: 150,
      paletteCount: 1,
    });
    expect(JSON.stringify(compact)).not.toContain('color: red');
    expect(JSON.stringify(compact).length).toBeLessThan(70000);
  });

  it('retains ability names and bounded evidence but omits large raw payloads', () => {
    const compact = compactQuickTextEditMcpRuntimeContext({
      source: 'runtime',
      topics: ['elements'],
      knowledge: { schema: { fields: Array.from({ length: 300 }, (_, index) => ({ id: index, blob: 'x'.repeat(500) })) } },
      nativeAbilities: {
        read: ['bricks/get-elements'],
        write: ['bricks/update-element'],
        evidence: [{ ability: 'bricks/get-elements', ok: true, summary: 'ready', raw: 'x'.repeat(50000) }],
      },
    });

    expect(compact.nativeAbilities).toMatchObject({
      read: ['bricks/get-elements'],
      write: ['bricks/update-element'],
      evidenceCount: 1,
    });
    expect(JSON.stringify(compact)).not.toContain('"raw"');
    expect(JSON.stringify(compact).length).toBeLessThan(20000);
  });
});
