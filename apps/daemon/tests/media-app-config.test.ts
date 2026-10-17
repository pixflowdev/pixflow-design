import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { registerMediaRoutes, type RegisterMediaRoutesDeps } from '../src/media-routes.js';

describe('media route configuration validation', () => {
  it.each([[new TypeError('Invalid preference'), 400], [new Error('Disk unavailable'), 500]])('reports configuration errors accurately', async (error, status) => {
    const handlers = new Map<string, (req: unknown, res: unknown) => Promise<void>>();
    const app = { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: (path: string, handler: (req: unknown, res: unknown) => Promise<void>) => handlers.set(path, handler) };
    const ctx = {
      db: {}, design: {}, http: { isLocalSameOrigin: () => true, resolvedPortRef: { current: 1234 } }, paths: {}, auth: {}, ids: {}, media: {},
      appConfig: { writeAppConfig: vi.fn().mockRejectedValue(error) }, orbit: { orbitService: { configure: vi.fn() } },
      nativeDialogs: {}, projectStore: {}, projectFiles: {}, conversations: {}, research: {},
    } as unknown as RegisterMediaRoutesDeps;
    registerMediaRoutes(app as unknown as Express, ctx);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handlers.get('/api/app-config')!({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: error.message });
  });
});
