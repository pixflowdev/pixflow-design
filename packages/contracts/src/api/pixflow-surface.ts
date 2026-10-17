/**
 * Stable renderer/host surface identifiers. These values are deliberately
 * narrower than product labels so an unknown embedding can never inherit the
 * Bricks permissions or feature profile by accident.
 */
export const PIXFLOW_SURFACES = ['bricks_builder', 'wp_admin'] as const;
export type PixflowSurface = (typeof PIXFLOW_SURFACES)[number];

export const PIXFLOW_FRAME_ENVELOPE_SCHEMA = 'pixflow.surface.frame.v1' as const;
export const PIXFLOW_FRAME_ENVELOPE_VERSION = 1 as const;

export type PixflowFrameEnvelope<TPayload = unknown> = {
  schema: typeof PIXFLOW_FRAME_ENVELOPE_SCHEMA;
  version: typeof PIXFLOW_FRAME_ENVELOPE_VERSION;
  surface: PixflowSurface;
  messageId: string;
  sessionId: string;
  type: string;
  payload: TPayload;
};

export type PixflowSurfaceFeatureSet = {
  /** The Stage A HTML/CSS/JavaScript/Preview drawer and its protocol. */
  stageAHtmlCssJsPreview: boolean;
  /** Native canvas/selection context can only be supplied by a builder host. */
  selectedElementContext: boolean;
  /** Native builder mutation dispatch and acknowledgement. */
  builderMutationDispatch: boolean;
  /** WordPress admin screen/resource context is available. */
  wpAdminContext: boolean;
  settingsProfile: 'full' | 'wp_admin_slim';
};

export const PIXFLOW_SURFACE_FEATURES = {
  bricks_builder: {
    stageAHtmlCssJsPreview: true,
    selectedElementContext: true,
    builderMutationDispatch: true,
    wpAdminContext: false,
    settingsProfile: 'full',
  },
  wp_admin: {
    stageAHtmlCssJsPreview: false,
    selectedElementContext: false,
    builderMutationDispatch: false,
    wpAdminContext: true,
    settingsProfile: 'wp_admin_slim',
  },
} as const satisfies Record<PixflowSurface, PixflowSurfaceFeatureSet>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function resolvePixflowSurface(value: unknown): PixflowSurface | null {
  return typeof value === 'string' && (PIXFLOW_SURFACES as readonly string[]).includes(value)
    ? value as PixflowSurface
    : null;
}

/**
 * Structural guard used at postMessage/host boundaries. It intentionally does
 * not infer a surface from a missing field or from legacy Bricks message
 * names; callers must explicitly adapt legacy messages before they cross the
 * surface-neutral boundary.
 */
export function isPixflowFrameEnvelope(value: unknown): value is PixflowFrameEnvelope {
  if (!isRecord(value)) return false;
  return value.schema === PIXFLOW_FRAME_ENVELOPE_SCHEMA
    && value.version === PIXFLOW_FRAME_ENVELOPE_VERSION
    && resolvePixflowSurface(value.surface) !== null
    && typeof value.messageId === 'string'
    && value.messageId.length > 0
    && typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    && typeof value.type === 'string'
    && value.type.length > 0
    && Object.prototype.hasOwnProperty.call(value, 'payload');
}
