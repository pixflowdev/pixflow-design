import { describe, expect, it } from 'vitest';
import { createPixflowHtmlFrameworkContext } from '@open-design/contracts';

import { buildPixflowBricksAgentSessionPayload } from '../../src/pixflow/bricks-agent-session';
import { validateBuildInBricksThemeStyleSnapshot } from '../../src/pixflow/bricks-initial-insert';
import { buildBuildInBricksThemeStyleContext } from '../../src/pixflow/build-in-bricks-source';
import type { PixflowRouteContextSnapshot } from '../../src/pixflow/framework';

function routeContext(fontSize = '4rem'): PixflowRouteContextSnapshot {
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
        themeStyleActiveIds: ['site-style'],
        themeStyles: [{
          id: 'site-style',
          label: 'Site style',
          active: true,
          conditions: {},
          typography: { body: '', headings: '' },
          settings: { typography: { typographyHeadingH1: { 'font-size': fontSize } } },
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
  };
}

function buildPayload(route = routeContext()) {
  const themeStyleContext = buildBuildInBricksThemeStyleContext(route);
  return buildPixflowBricksAgentSessionPayload({
    projectId: 'project-1',
    activeProjectFileName: 'build-source/source/index.html',
    projectFiles: [],
    workspaceItem: null,
    workspaceItems: [],
    activeDraft: 'Build an editorial page.',
    mode: 'design',
    targetPage: { id: 42, title: 'Editorial' },
    pipelineId: 'build-in-bricks',
    sourceContract: 'build-in-bricks-html-first',
    themeStylePolicy: 'inherit_effective',
    themeStyleContext,
  });
}

function frameworkContext(route = routeContext()) {
  return createPixflowHtmlFrameworkContext({
    frameworkState: { activeRouteId: route.activeRouteId },
    routeContext: route,
    fetchOutcome: 'completed',
  });
}

describe('Build Theme Style snapshot integrity before conversion', () => {
  it('accepts the same canonical WordPress snapshot used for generation and review', () => {
    const result = validateBuildInBricksThemeStyleSnapshot(buildPayload(), frameworkContext());
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects a transported snapshot identity that does not match its context', () => {
    const payload = { ...buildPayload(), themeStyleSnapshotHash: 'theme-style-spoofed' };
    expect(validateBuildInBricksThemeStyleSnapshot(payload, frameworkContext())).toMatchObject({
      ok: false,
      code: 'build_theme_style_snapshot_invalid',
    });
  });

  it('rejects live WordPress Theme Style drift before conversion', () => {
    expect(validateBuildInBricksThemeStyleSnapshot(
      buildPayload(routeContext('4rem')),
      frameworkContext(routeContext('5rem')),
    )).toMatchObject({
      ok: false,
      code: 'build_theme_style_snapshot_drift',
    });
  });

  it('does not apply the ordinary Build snapshot gate to compatibility flows', () => {
    const payload = { ...buildPayload(), sourceContract: undefined, themeStyleContext: null };
    expect(validateBuildInBricksThemeStyleSnapshot(payload, frameworkContext())).toEqual({
      ok: true,
      snapshotHash: '',
    });
  });
});
