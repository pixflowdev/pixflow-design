import { describe, expect, it } from 'vitest';

// @ts-expect-error The packaged bridge compatibility entrypoint intentionally
// remains directly executable JavaScript and does not ship TypeScript declarations.
import { normalizeStageBRouteTokenValues } from '../../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs';

describe('Stage B route token fallback evidence', () => {
  it('records preserved uploaded-HTML literals without rewriting their source values', () => {
    const result = {
      content: [
        {
          id: 'pricing-section',
          name: 'section',
          parent: 0,
          children: [],
          settings: {
            _padding: {
              top: '48px',
              right: '24px',
              bottom: '48px',
              left: '24px',
            },
          },
        },
      ],
      global_classes: [],
      stage_b_page_settings: {},
    };

    const diagnostics = normalizeStageBRouteTokenValues(
      result,
      {
        routeId: 'direct-bricks',
        routeFamily: 'direct',
        variableAuthority: {
          mode: 'live_route_context',
          allowedCssVariables: ['--space-l'],
          variables: [
            {
              id: 'space-l',
              name: 'space-l',
              cssName: '--space-l',
              value: '3rem',
              category: 'spacing',
            },
          ],
        },
      },
      { conversionProfile: 'uploaded_html' },
    );

    expect(result.content[0]?.settings._padding).toEqual({
      top: '48px',
      right: '24px',
      bottom: '48px',
      left: '24px',
    });
    expect(diagnostics.literalRewriteMode).toBe('uploaded_html_preserve_literals');
    expect(diagnostics.routeTokenFallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'top',
          value: '48px',
          reason: 'uploaded_html_source_value_preserved',
        }),
        expect.objectContaining({
          property: 'right',
          value: '24px',
          reason: 'uploaded_html_source_value_preserved',
        }),
      ]),
    );
  });

  it('records observed literal provenance for source-fidelity clone results', () => {
    const result = {
      content: [
        {
          id: 'source-hero',
          name: 'section',
          parent: 0,
          children: [],
          settings: { _heightMin: '720px' },
        },
      ],
      global_classes: [],
      stage_b_page_settings: {},
    };

    const diagnostics = normalizeStageBRouteTokenValues(
      result,
      {
        variableAuthority: {
          mode: 'live_route_context',
          allowedCssVariables: ['--content-height'],
          variables: [
            {
              name: 'content-height',
              cssName: '--content-height',
              value: '45rem',
              category: 'layout',
            },
          ],
        },
      },
      { conversionProfile: 'website_clone', sourceFidelityClone: true },
    );

    expect(result.content[0]?.settings._heightMin).toBe('720px');
    expect(diagnostics.status).toBe('skipped');
    expect(diagnostics.routeTokenFallbacks).toEqual([
      expect.objectContaining({
        property: '_heightMin',
        value: '720px',
        reason: 'source_fidelity_clone_observed_value_preserved',
      }),
    ]);
  });
});
