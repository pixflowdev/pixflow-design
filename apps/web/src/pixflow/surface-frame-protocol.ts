import {
  isPixflowFrameEnvelope,
  PIXFLOW_FRAME_ENVELOPE_SCHEMA,
  PIXFLOW_FRAME_ENVELOPE_VERSION,
  type PixflowFrameEnvelope,
  type PixflowSurface,
} from '@open-design/contracts';

export const PIXFLOW_SURFACE_FRAME_SOURCE = 'pixflow-design:surface-frame' as const;
export const PIXFLOW_SURFACE_SHELL_SOURCE = 'pixflow-design:surface-shell' as const;

export type PixflowSurfaceFrameSource =
  | typeof PIXFLOW_SURFACE_FRAME_SOURCE
  | typeof PIXFLOW_SURFACE_SHELL_SOURCE;

export type PixflowSurfaceFrameMessage<TPayload = unknown> = PixflowFrameEnvelope<TPayload> & {
  source: PixflowSurfaceFrameSource;
};

export function createPixflowSurfaceFrameMessage<TPayload>(
  source: PixflowSurfaceFrameSource,
  surface: PixflowSurface,
  sessionId: string,
  type: string,
  payload: TPayload,
  options: { messageId?: string } = {},
): PixflowSurfaceFrameMessage<TPayload> {
  const messageId = options.messageId
    || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  return {
    schema: PIXFLOW_FRAME_ENVELOPE_SCHEMA,
    version: PIXFLOW_FRAME_ENVELOPE_VERSION,
    source,
    surface,
    messageId,
    sessionId,
    type,
    payload,
  };
}
export function isPixflowSurfaceFrameMessage(
  value: unknown,
): value is PixflowSurfaceFrameMessage {
  if (!isPixflowFrameEnvelope(value)) return false;
  const source = (value as { source?: unknown }).source;
  return source === PIXFLOW_SURFACE_FRAME_SOURCE || source === PIXFLOW_SURFACE_SHELL_SOURCE;
}

export type PixflowSurfaceFrameTrustOptions = {
  expectedWindow: Window;
  expectedOrigin?: string | null;
  surface: PixflowSurface;
  sessionId: string;
  source?: PixflowSurfaceFrameSource;
};

/**
 * Validate the complete browser boundary, not merely the message shape. The
 * caller supplies the iframe window and negotiated origin from its own host;
 * a wildcard origin is intentionally not accepted here.
 */
export function isTrustedPixflowSurfaceFrameMessage(
  event: MessageEvent,
  options: PixflowSurfaceFrameTrustOptions,
): event is MessageEvent<PixflowSurfaceFrameMessage> {
  if (event.source !== options.expectedWindow) return false;
  if (options.expectedOrigin && event.origin !== options.expectedOrigin) return false;
  if (!isPixflowSurfaceFrameMessage(event.data)) return false;
  if (event.data.surface !== options.surface || event.data.sessionId !== options.sessionId) return false;
  if (options.source && event.data.source !== options.source) return false;
  return true;
}
