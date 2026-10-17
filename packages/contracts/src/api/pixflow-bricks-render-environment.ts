export const PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE = 'canonical-build-bricks' as const;
export const PIXFLOW_BRICKS_DESTINATION_BASELINE_ID = 'pixflow.bricks.destination_baseline' as const;
export const PIXFLOW_BRICKS_DESTINATION_BASELINE_REVISION = 'bricks-2.4-generic.1' as const;
export const PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT = 'sha256:1abfd32e49405823727487144a0b1b28b3ee1b6645183e028ea78492896fe2bc' as const;

/**
 * Bounded generic frontend semantics reproduced from the supported Bricks 2.4
 * destination. Native `.brxe-*` component rules deliberately stay out of the
 * pre-conversion source renderer.
 */
export const PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS = [
  'html { box-sizing: border-box; font-size: 62.5%; line-height: 1.15; -webkit-text-size-adjust: 100%; text-size-adjust: auto; }',
  '*, *::before, *::after { box-sizing: border-box; }',
  'body { margin: 0; }',
  'h1, h2, h3, h4, h5, h6 { margin: 0; text-rendering: optimizeLegibility; }',
  'img { height: auto; max-width: 100%; outline: none; vertical-align: middle; }',
  'button, input, optgroup, select, textarea { font-family: inherit; text-align: inherit; }',
  'button { border: none; cursor: pointer; outline: none; padding: 0; }',
  'a { color: currentColor; }',
].join('\n');

export type PixflowVisualRenderEnvironmentProfile =
  typeof PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE;

export type PixflowVisualRenderEnvironmentIdentity = {
  profile: PixflowVisualRenderEnvironmentProfile;
  owner: 'pixflow-renderer';
  destination: 'bricks';
  baseline: {
    id: typeof PIXFLOW_BRICKS_DESTINATION_BASELINE_ID;
    revision: typeof PIXFLOW_BRICKS_DESTINATION_BASELINE_REVISION;
    fingerprint: typeof PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT;
  };
};

export type PixflowVisualRenderEnvironmentEvidence = PixflowVisualRenderEnvironmentIdentity & {
  applied: true;
  computed?: {
    rootFontSizePx: number;
    rootBoxSizing: string;
    bodyMarginTopPx: number;
    bodyMarginRightPx: number;
    bodyMarginBottomPx: number;
    bodyMarginLeftPx: number;
  };
};

export function resolvePixflowVisualRenderEnvironment(
  profile: unknown,
): { identity: PixflowVisualRenderEnvironmentIdentity; css: string } | null {
  if (profile !== PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE) return null;
  return {
    identity: {
      profile: PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE,
      owner: 'pixflow-renderer',
      destination: 'bricks',
      baseline: {
        id: PIXFLOW_BRICKS_DESTINATION_BASELINE_ID,
        revision: PIXFLOW_BRICKS_DESTINATION_BASELINE_REVISION,
        fingerprint: PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT,
      },
    },
    css: PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS,
  };
}
