import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA,
  PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY,
  createPixflowHtmlFrameworkContext,
} from '../src/index.js';

const liveRouteContext = {
  schemaVersion: 3,
  activeRouteId: 'pixflow-core',
  requestedRouteId: 'pixflow-core',
  fallbackUsed: false,
  sources: {
    framework: {
      routeFamily: 'core',
      pixflowRoute: true,
      variables: [{ name: 'space--m', cssName: '--space-m', value: '2rem', categoryName: 'Spacing' }],
      utilityClasses: ['grid-2'],
      colorRoots: ['primary'],
      source: 'wordpress_route_context',
    },
    bricks: { globalVariables: [], globalClasses: [], colorPalettes: [] },
  },
  allowlists: {
    cssVariables: ['--space-m'],
    utilityClasses: ['grid-2'],
    globalClassNames: ['project-card'],
    bricksColorVariables: ['--bricks-color-primary'],
  },
};

describe('HTML-to-Bricks framework context', () => {
  it('versions a live matching route and keeps Library mapping unavailable', () => {
    const result = createPixflowHtmlFrameworkContext({
      frameworkState: { activeRouteId: 'pixflow-core', mapping: { present: true }, routes: [] },
      routeContext: liveRouteContext,
      bricksColorScheme: { id: 'pixflow-design-system' },
      capturedAt: '2026-08-08T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      schema: PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA,
      version: 1,
      status: 'available',
      activeRouteId: 'pixflow-core',
      routeFamily: 'core',
      mappingUsage: 'pixflow_library_template_payloads_only',
      libraryMappingAllowed: false,
      allowlists: {
        utilityClasses: ['grid-2'],
        globalClassNames: ['project-card'],
      },
    });
  });

  it('fails closed for stale, incomplete, and unavailable route evidence', () => {
    expect(createPixflowHtmlFrameworkContext({
      frameworkState: { activeRouteId: 'direct-acss' },
      routeContext: liveRouteContext,
    }).status).toBe('stale');

    expect(createPixflowHtmlFrameworkContext({
      frameworkState: { activeRouteId: 'pixflow-core' },
      routeContext: { activeRouteId: 'pixflow-core', sources: {} },
    }).status).toBe('incomplete');

    expect(createPixflowHtmlFrameworkContext({
      frameworkState: null,
      routeContext: null,
      fetchOutcome: 'timeout',
    })).toMatchObject({
      status: 'unavailable',
      fetchOutcome: 'timeout',
      libraryMappingAllowed: false,
    });
  });

  it('publishes category-specific tolerances and keeps colour separate', () => {
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.spacing).toMatchObject({ relative: 0.03, absolutePx: 0.75 });
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.typography).toMatchObject({ relative: 0.05, absolutePx: 0.25 });
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.radius).toMatchObject({ relative: 0.08, absolutePx: 1 });
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.shadow.mode).toBe('exact_css');
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.container.mode).toBe('near_numeric');
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.layout.mode).toBe('exact_css');
    expect(PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY.colour.mode).toBe('separate_authority');
  });
});
