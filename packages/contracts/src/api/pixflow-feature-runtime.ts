/** Authenticated, request-current UI contributions; never an authorization grant. */
export interface PixflowFeatureRuntime {
  schema: 'pixflow.feature-runtime.v1';
  configuration?: Record<string, Record<string, unknown>>;
  features: string[];
  builders: { bricks: boolean; etch: boolean; elementor: boolean; generateblocks: boolean };
  assets: Array<{ handle: string; kind: 'script' | 'style'; url: string }>;
}
