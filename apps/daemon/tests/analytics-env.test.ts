import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const posthogCapture = vi.hoisted(() => vi.fn());
const posthogShutdown = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(function PostHogMock() {
    return {
      capture: posthogCapture,
      on: vi.fn(),
      shutdown: posthogShutdown,
    };
  }),
}));

describe('analytics telemetry environment', () => {
  it('keeps legacy telemetry disabled even with a configured key', async () => {
    const { readPublicConfigResponse } = await import('../src/analytics.js');

    expect(readPublicConfigResponse({
      POSTHOG_KEY: 'phc_test',
      OD_TELEMETRY_ENV: 'local_development',
    })).toMatchObject({
      enabled: false,
      env: 'disabled',
      key: null,
    });
  });

  it('does not send legacy telemetry even when an old installation opted in', async () => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-env-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      installationId: 'install-1',
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: {
        POSTHOG_KEY: 'phc_test',
        OD_TELEMETRY_ENV: 'local_development',
      },
    });

    analytics.capture({
      eventName: 'unit_event',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      insertId: 'insert-1',
      properties: {},
    });

    await analytics.shutdown();
    expect(posthogCapture).not.toHaveBeenCalled();
    expect(posthogShutdown).not.toHaveBeenCalled();
    await rm(dataDir, { recursive: true, force: true });
  });
});
