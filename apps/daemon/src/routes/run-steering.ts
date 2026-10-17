import type { Express } from 'express';
import type { ChatRunSteerRequest, PixflowDirectSiteSteerResponse } from '@open-design/contracts';

type SteerRun = { status: string; nativeSteer?: (id: string, prompt: string, references?: Record<string, unknown>) => Promise<PixflowDirectSiteSteerResponse> };

/** Same authenticated run owner and authorization boundary as run cancellation. */
export function registerRunSteering(app: Express, getRun: (id: string) => SteerRun | undefined) {
  app.post('/api/runs/:id/steer', async (req, res) => {
    const input = req.body as ChatRunSteerRequest;
    if (!input || typeof input.messageId !== 'string' || !/^[\w-]{1,128}$/.test(input.messageId) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 100_000
      || [input.attachments, input.commentAttachments].some(value => value !== undefined && (!Array.isArray(value) || value.length > 100))) {
      res.status(400).json({ messageId: input?.messageId, state: 'rejected', message: 'Provide a queued message and valid guidance. Nothing was sent.' }); return;
    }
    const run = getRun(req.params.id);
    if (!run?.nativeSteer || !['running', 'starting'].includes(run.status)) {
      res.status(409).json({ messageId: input.messageId, state: 'rejected', message: 'This run cannot accept steering now. Keep the message queued.' }); return;
    }
    try {
      const result = await run.nativeSteer(input.messageId, input.prompt, {
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.commentAttachments?.length ? { commentAttachments: input.commentAttachments } : {}),
      });
      res.json(result);
    } catch {
      res.status(503).json({ messageId: input.messageId, state: 'unconfirmed', message: 'Delivery could not be confirmed. Check the conversation before retrying.' });
    }
  });
}
