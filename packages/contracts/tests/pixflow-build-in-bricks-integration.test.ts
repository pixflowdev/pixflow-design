import { describe, expect, it } from 'vitest';

import {
  formatPixflowBuildInBricksDesignContext,
  listPixflowBuildInBricksEligibleCssVariables,
  normalizePixflowBuildInBricksDesignContext,
  validatePixflowBuildInBricksSourceArtifacts,
} from '../src/api/pixflow-build-in-bricks-context.js';
import {
  createPixflowBuildInBricksSourceRequestBundle,
  PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS,
} from '../src/api/pixflow-build-in-bricks-source.js';
import {
  formatPixflowStageADesignContext,
  normalizePixflowStageADesignContext,
  validatePixflowStageASourceArtifacts,
} from '../src/api/pixflow-build-in-bricks-stage-a.js';
import { PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST } from '../src/api/pixflow-build-in-bricks-skills.js';

describe('Build in Bricks integration context fixtures', () => {
  it('allows provenance-approved palette references without exposing palette record IDs as CSS variables', () => {
    const context = normalizePixflowBuildInBricksDesignContext({
      revision: 'palette-route',
      capturedAt: '2026-08-30T00:00:00.000Z',
      route: { id: 'bricks', family: 'bricks', available: true },
      colours: [{
        id: 'main-scheme',
        name: 'Main Scheme',
        provenance: { designContextEligible: true },
        colors: [{
          id: 'opaque-internal-id',
          name: 'opaque-internal-id',
          raw: 'var(--background)',
          hex: '#f1f0ee',
          provenance: { designContextEligible: true },
        }],
      }],
    });

    expect(listPixflowBuildInBricksEligibleCssVariables(context)).toEqual(['--background']);
    expect(listPixflowBuildInBricksEligibleCssVariables(context)).not.toContain('--opaque-internal-id');
  });

  it('strips compatibility artifact paths from canonical Build request bundles', () => {
    const context = normalizePixflowBuildInBricksDesignContext({
      revision: 'canonical-write-boundary',
      route: { id: 'native', family: 'bricks', available: true },
      breakpoints: [],
      tokens: { all: [] },
    });
    const input = {
      requestId: 'canonical-write-boundary',
      scope: 'section' as const,
      userRequest: 'Build a section.',
      targetTitle: 'Home',
      skill: { id: 'build-in-bricks-html-first' as const, version: '1.1.0' },
      skillManifest: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      context,
      businessContext: {},
      pageContext: { scope: 'section' },
      pagePlan: null,
      existingSource: null,
      artifacts: {
        htmlPath: 'build-source/source/index.html' as const,
        cssPath: 'build-source/source/styles.css' as const,
        jsPath: 'build-source/source/script.js' as const,
        jsOptional: true as const,
      },
      compatibilityArtifacts: {
        htmlPath: 'stage-a/source/index.html',
        cssPath: 'stage-a/source/styles.css',
        jsPath: 'stage-a/source/script.js',
      },
    } as Parameters<typeof createPixflowBuildInBricksSourceRequestBundle>[0] & {
      compatibilityArtifacts: Record<string, string>;
    };

    const bundle = createPixflowBuildInBricksSourceRequestBundle(input);
    expect(bundle).not.toHaveProperty('compatibilityArtifacts');
    expect(JSON.stringify(bundle)).not.toContain('stage-a/');
  });

  it('keeps framework membership separate from design-context eligibility', () => {
    const context = normalizePixflowBuildInBricksDesignContext({
      revision: 'route-matrix-1',
      route: { id: 'core-framework', family: 'core-framework', available: true },
      breakpoints: [
        { key: 'tablet', label: 'Tablet', width: 991, base: false },
        { key: 'mobile', label: 'Mobile', width: 767, base: false },
        { key: 'portrait', label: 'Portrait', width: 478, base: false },
      ],
      tokens: {
        all: [
          { cssVar: '--core-primary', provenance: { origin: 'framework', frameworkMembership: 'member', designContextEligible: true } },
          { cssVar: '--acss-space-m', provenance: { origin: 'framework', frameworkMembership: 'member', designContextEligible: true } },
          { cssVar: '--mapped-accent', provenance: { origin: 'custom_mapped', frameworkMembership: 'member', frameworkEligible: true, designContextEligible: true } },
          { cssVar: '--pf-heading', provenance: { origin: 'pixflow_design_system', frameworkMembership: 'not_member', designContextEligible: true } },
          { cssVar: '--native-user-colour', provenance: { origin: 'user', frameworkMembership: 'not_member', frameworkEligible: false, designContextEligible: true } },
          { cssVar: '--clone-colour', provenance: { origin: 'pixflow_generated', generator: 'website_clone', frameworkMembership: 'unknown', designContextEligible: false } },
          { cssVar: '--html-to-bricks-gap', provenance: { origin: 'pixflow_generated', generator: 'html_to_bricks', designContextEligible: false } },
          { cssVar: '--imported-value', provenance: { origin: 'imported', designContextEligible: false } },
          { cssVar: '--unknown-value', provenance: { origin: 'unknown' } },
        ],
      },
      pageSpecificGeneratedTokens: [
        { cssVar: '--clone-card-offset', provenance: { origin: 'pixflow_generated', generator: 'website_clone', designContextEligible: false } },
      ],
    });

    expect(context.tokens.all.map((token) => token.cssVar)).toEqual([
      '--core-primary', '--acss-space-m', '--mapped-accent', '--pf-heading', '--native-user-colour',
    ]);
    expect(context.pageSpecificGeneratedTokens.map((token) => token.cssVar)).toEqual(['--clone-card-offset']);
    const formatted = formatPixflowBuildInBricksDesignContext(context);
    expect(formatted).toContain('Tablet (tablet): 991px');
    expect(formatted).toContain('PAGE-SPECIFIC GENERATED TOKENS');
    expect(formatted).toContain('--clone-card-offset');
    expect(formatted).not.toContain('--clone-colour');
    expect(formatted).not.toContain('--imported-value');
  });

  it('gives Local and BYOK the same canonical semantic bundle and validation boundary', () => {
    const input = {
      requestId: 'integration-parity',
      scope: 'section' as const,
      userRequest: 'Make the hero editorial.',
      targetTitle: 'Home',
      skill: { id: 'build-in-bricks-html-first' as const, version: '1.0.0' },
      skillManifest: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      context: normalizePixflowBuildInBricksDesignContext({
        revision: 'route-parity-1',
        route: { id: 'acss', family: 'acss', available: true },
        breakpoints: [{ key: 'tablet', label: 'Tablet', width: 991, base: false }],
        tokens: { all: [{ cssVar: '--space-m', provenance: { origin: 'framework', designContextEligible: true } }] },
      }),
      businessContext: { audience: 'local businesses' },
      pageContext: { scope: 'section' },
      pagePlan: null,
      existingSource: { html: '<section class="hero"><h1>Home</h1></section>', css: '.hero{color:var(--space-m)}', hash: 'sha256:existing' },
      artifacts: {
        htmlPath: PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.html,
        cssPath: PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.css,
        jsPath: PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.js,
        jsOptional: true as const,
      },
    };
    const local = createPixflowBuildInBricksSourceRequestBundle(input);
    const byok = createPixflowBuildInBricksSourceRequestBundle(input);
    expect(byok).toEqual(local);
    const source = {
      html: '<section class="hero"><h1>Home</h1></section>',
      css: '.hero { --hero-glow-size: 42rem; color: var(--space-m); }',
      js: '',
      scope: 'section' as const,
      allowedCssVariables: ['--space-m'],
    };
    expect(validatePixflowBuildInBricksSourceArtifacts(source)).toEqual(validatePixflowBuildInBricksSourceArtifacts({ ...source }));
  });

  it('keeps Stage-A helpers as compatibility aliases over canonical primitives', () => {
    const input = {
      revision: 'legacy-reader',
      route: { id: 'native', family: 'bricks', available: true },
      breakpoints: [],
      tokens: { all: [] },
    };
    const canonical = normalizePixflowBuildInBricksDesignContext(input);
    const compatibility = normalizePixflowStageADesignContext(input);
    expect(compatibility).toEqual(canonical);
    expect(formatPixflowStageADesignContext(compatibility)).toBe(
      formatPixflowBuildInBricksDesignContext(canonical),
    );
    const source = { html: '<section><h2>Legacy</h2></section>', css: 'section { display: grid; }', scope: 'section' as const };
    expect(validatePixflowStageASourceArtifacts(source)).toEqual(
      validatePixflowBuildInBricksSourceArtifacts(source),
    );
  });
});
