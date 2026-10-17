import { describe, expect, it } from 'vitest';

import {
  buildBuildInBricksDesignContext,
  buildBuildInBricksSourcePrompt,
  buildBuildInBricksThemeStyleContext,
} from '../../src/pixflow/build-in-bricks-source';
import type { PixflowRouteContextSnapshot } from '../../src/pixflow/framework';

function routeContext(): PixflowRouteContextSnapshot {
  return {
    schemaVersion: 1,
    postId: 42,
    activeRouteId: 'direct-bricks',
    requestedRouteId: '',
    fallbackUsed: false,
    route: { id: 'direct-bricks', available: true },
    sources: {
      bricks: {
        available: true,
        colorPalettes: [],
        globalVariables: [],
        globalClasses: [],
        themeStylesLoadingMethod: 'specific',
        themeStyleActiveIds: ['editorial'],
        themeStyles: [{
          id: 'editorial',
          label: 'Editorial',
          active: true,
          conditions: {},
          typography: { body: '', headings: '' },
          settings: {
            typography: {
              typographyHeadingH1: {
                'font-family': 'Inter',
                'font-size': 'clamp(3rem, 8vw, 7rem)',
              },
              'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
            },
            button: {
              typography: { fontSize: '1rem', fontWeight: '700' },
              padding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
              'padding:mobile_portrait': { top: '.75rem', right: '1.25rem', bottom: '.75rem', left: '1.25rem' },
            },
            section: { padding: { top: '6rem', bottom: '6rem' } },
            container: { widthMax: '76rem' },
          },
        }],
      },
      framework: {
        routeFamily: 'bricks',
        pixflowRoute: false,
        variables: [],
        utilityClasses: [],
        colorRoots: [],
        source: 'bricks',
      },
    },
    allowlists: {
      routeId: 'direct-bricks',
      cssVariables: [],
      utilityClasses: [],
      globalClassNames: [],
      bricksColorVariables: [],
    },
    usage: {},
    breakpoints: [
      { key: 'desktop', label: 'Desktop', width: null, base: true },
      { key: 'mobile_portrait', label: 'Mobile', width: 478, base: false },
    ],
    breakpointMode: { mobileFirst: false },
  };
}

describe('Build in Bricks Theme Style route-context adapter', () => {
  it('creates the canonical post-aware snapshot used by retained-source checks and generation', () => {
    const first = buildBuildInBricksThemeStyleContext(routeContext());
    const second = buildBuildInBricksThemeStyleContext(routeContext());

    expect(first.policy).toBe('inherit_effective');
    expect(first.targetPostId).toBe(42);
    expect(first.resolution.status).toBe('available');
    expect(first.resolution.activeStyleIds).toEqual(['editorial']);
    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.resolution.styles[0]?.defaults.find((entry) => entry.element === 'h1')?.properties).toMatchObject({
      'font-size': 'clamp(3rem, 8vw, 7rem)',
    });
  });

  it('places actual effective base and responsive declarations in the source-generation prompt once', () => {
    const context = buildBuildInBricksDesignContext(routeContext(), null, 'full_page');
    const prompt = buildBuildInBricksSourcePrompt({
      prompt: 'Build an editorial advisory page.',
      targetTitle: 'Advisory',
      generationScope: 'full_page',
      context,
    });

    expect(prompt.match(/EFFECTIVE BRICKS THEME STYLE/g)).toHaveLength(1);
    expect(prompt).toContain('h1:');
    expect(prompt).toContain('font-size: clamp(3rem, 8vw, 7rem)');
    expect(prompt).toContain('Mobile (478px):');
    expect(prompt).toContain('font-size: 2.25rem');
    expect(prompt).toContain('button:');
    expect(prompt).toContain('padding-left: 2rem');
    expect(prompt).toContain('padding-left: 1.25rem');
    expect(prompt).toContain('section:');
    expect(prompt).toContain('padding-top: 6rem');
    expect(prompt).toContain('container:');
    expect(prompt).toContain('max-width: 76rem');
  });

  it('fails closed into an unavailable but deterministic snapshot when WordPress context is missing', () => {
    const context = buildBuildInBricksThemeStyleContext(null);

    expect(context.resolution.status).toBe('unavailable');
    expect(context.resolution.reason).toContain('unavailable');
    expect(context.snapshotHash).toMatch(/^theme-style-[a-f0-9]{8}$/);
  });
});
