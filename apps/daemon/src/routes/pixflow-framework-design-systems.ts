import type { Express } from 'express';

import type { PublishPixflowFrameworkDesignSystemRequest } from '@open-design/contracts';

import {
  publishPixflowFrameworkDesignSystem,
  readPixflowFrameworkProfile,
} from '../pixflow-framework-design-system.js';
import { inspectDesignSystemWebsite } from '../design-system-website-source.js';

export type RegisterPixflowFrameworkDesignSystemRoutesDeps = {
  userDesignSystemsRoot: string;
};

export function registerPixflowFrameworkDesignSystemRoutes(
  app: Express,
  deps: RegisterPixflowFrameworkDesignSystemRoutesDeps,
): void {
  app.post('/api/design-systems/sources/website', async (req, res) => {
    try {
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      if (!url.trim()) return res.status(400).json({ error: 'url is required' });
      const evidence = await inspectDesignSystemWebsite(url);
      res.json({ evidence });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/design-systems/pixflow-framework', async (req, res) => {
    try {
      const result = await publishPixflowFrameworkDesignSystem(
        deps.userDesignSystemsRoot,
        (req.body ?? {}) as PublishPixflowFrameworkDesignSystemRequest,
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'editable design system not found' ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/design-systems/:id/pixflow-profile', async (req, res) => {
    try {
      const document = await readPixflowFrameworkProfile(
        deps.userDesignSystemsRoot,
        req.params.id,
      );
      if (!document) {
        return res.status(404).json({ error: 'Pixflow Framework profile not found' });
      }
      res.json({ document });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
