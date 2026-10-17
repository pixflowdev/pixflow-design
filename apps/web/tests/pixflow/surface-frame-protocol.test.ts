import { describe, expect, it } from 'vitest';

import {
  createPixflowSurfaceFrameMessage,
  isPixflowSurfaceFrameMessage,
  isTrustedPixflowSurfaceFrameMessage,
  PIXFLOW_SURFACE_FRAME_SOURCE,
} from '../../src/pixflow/surface-frame-protocol';

describe('surface-neutral frame protocol', () => {
  it('requires an explicit surface and session', () => {
    const message = createPixflowSurfaceFrameMessage(
      PIXFLOW_SURFACE_FRAME_SOURCE,
      'wp_admin',
      'session-1',
      'ready',
      { ok: true },
      { messageId: 'message-1' },
    );
    expect(isPixflowSurfaceFrameMessage(message)).toBe(true);
    expect(isPixflowSurfaceFrameMessage({ ...message, surface: 'unknown' })).toBe(false);
    expect(isPixflowSurfaceFrameMessage({ ...message, sessionId: '' })).toBe(false);
  });

  it('rejects the wrong window, origin, surface, session, and protocol source', () => {
    const frameWindow = {} as Window;
    const otherWindow = {} as Window;
    const message = createPixflowSurfaceFrameMessage(
      PIXFLOW_SURFACE_FRAME_SOURCE,
      'wp_admin',
      'session-1',
      'ready',
      {},
      { messageId: 'message-1' },
    );
    const event = (overrides: Partial<MessageEvent>) => ({
      data: message,
      source: frameWindow,
      origin: 'https://example.test',
      ...overrides,
    } as MessageEvent);

    expect(isTrustedPixflowSurfaceFrameMessage(event({}), {
      expectedWindow: frameWindow,
      expectedOrigin: 'https://example.test',
      surface: 'wp_admin',
      sessionId: 'session-1',
    })).toBe(true);
    expect(isTrustedPixflowSurfaceFrameMessage(event({ source: otherWindow }), {
      expectedWindow: frameWindow,
      expectedOrigin: 'https://example.test',
      surface: 'wp_admin',
      sessionId: 'session-1',
    })).toBe(false);
    expect(isTrustedPixflowSurfaceFrameMessage(event({ origin: 'https://evil.test' }), {
      expectedWindow: frameWindow,
      expectedOrigin: 'https://example.test',
      surface: 'wp_admin',
      sessionId: 'session-1',
    })).toBe(false);
    expect(isTrustedPixflowSurfaceFrameMessage(event({}), {
      expectedWindow: frameWindow,
      expectedOrigin: 'https://example.test',
      surface: 'bricks_builder',
      sessionId: 'session-1',
    })).toBe(false);
    expect(isTrustedPixflowSurfaceFrameMessage(event({}), {
      expectedWindow: frameWindow,
      expectedOrigin: 'https://example.test',
      surface: 'wp_admin',
      sessionId: 'other-session',
    })).toBe(false);
  });
});
