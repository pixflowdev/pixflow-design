import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('Pixflow Bricks media preflight stream', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('keeps the stream complete when the selected agent contract requires an unavailable provider', async () => {
    const response = await fetch(`${baseUrl}/api/pixflow/bricks-agent/run-stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'design',
        prompt: 'Use the selected agent media decision.',
        mediaProviderCatalog: [],
        intentContract: {
          schema: 'pixflow.bricks.intent.v1',
          intent: 'generated_media',
          scope: 'selected_element',
          mediaPolicy: 'generated',
          mediaSurface: 'audio',
          state: 'ready',
          confidence: 1,
          clarification: null,
          skillIds: [],
          capabilityIds: [],
          rationale: 'The selected agent requested audio.',
          targetElementIds: [],
          placement: null,
          sourceLifecycle: 'initial_source_generation',
          generationRequirements: [],
          retainedEdit: null,
        },
      }),
    });

    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain('media_provider_required');
    expect(stream).toContain('Audio provider required');
    expect(stream).toContain('"mediaProviderRequired":true');
    expect(stream).toContain('"type":"done"');
  });
});
