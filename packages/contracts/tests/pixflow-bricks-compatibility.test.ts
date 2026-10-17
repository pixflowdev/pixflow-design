import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA,
  PIXFLOW_BRICKS_PROFILE_VERSION,
  createPixflowBricksCompatibilityContext,
} from '../src/index.js';

describe('Pixflow Bricks compatibility context', () => {
  it('is deterministic when an optional runtime capture timestamp is absent', async () => {
    const first = createPixflowBricksCompatibilityContext({});
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(createPixflowBricksCompatibilityContext({})).toEqual(first);
  });

  it('resolves the verified Bricks 2.4 family from safe runtime facts', () => {
    const context = createPixflowBricksCompatibilityContext({
      bricksVersion: '2.4-beta2',
      source: 'wordpress_runtime',
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'phone', label: 'Phone', width: 520, base: false },
      ],
      breakpointMode: { baseKey: 'desktop', baseWidth: 1279, mobileFirst: false },
      pseudoStates: ['hover', ':focus', 'active'],
      themeStyleLoadingMethod: 'specific',
      runtimeCapabilities: {
        globalClasses: true,
        variables: true,
        palettes: true,
        themeStyles: true,
        pageSettings: true,
      },
    });

    expect(context).toMatchObject({
      schema: PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA,
      version: 1,
      profileVersion: PIXFLOW_BRICKS_PROFILE_VERSION,
      profileId: 'bricks-2.4',
      status: 'supported',
      bricksVersion: '2.4-beta2',
      source: 'wordpress_runtime',
      fallbackUsed: false,
      breakpointMode: { baseKey: 'desktop', baseWidth: 1279, mobileFirst: false },
      themeStyleLoadingMethod: 'specific',
      globalData: {
        globalClasses: 'supported',
        variables: 'supported',
        palettes: 'supported',
        themeStyles: 'supported',
        pageSettings: 'supported',
      },
    });
    expect(context.breakpoints.map((item) => item.key)).toEqual(['desktop', 'tablet_portrait', 'phone']);
    expect(context.pseudoStates).toEqual(['hover', 'focus', 'active']);
  });

  it('uses a version-labelled Pixflow fallback when optional runtime facts are absent', () => {
    const context = createPixflowBricksCompatibilityContext({});

    expect(context).toMatchObject({
      profileId: 'bricks-2.4',
      status: 'partial',
      bricksVersion: null,
      source: 'pixflow_profile',
      fallbackUsed: true,
      fallbackReason: 'runtime_context_unavailable',
      breakpointMode: { baseKey: 'desktop', baseWidth: 1279, mobileFirst: false },
    });
    expect(context.breakpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'mobile_portrait', width: 478 }),
    ]));
  });

  it('separates partially supported, unknown, and incompatible versions', () => {
    expect(createPixflowBricksCompatibilityContext({ bricksVersion: '2.3.7' }).status).toBe('partial');
    expect(createPixflowBricksCompatibilityContext({ bricksVersion: '2.5.0' }).status).toBe('unknown');
    expect(createPixflowBricksCompatibilityContext({ bricksVersion: '1.12.2' }).status).toBe('incompatible');
  });
});
