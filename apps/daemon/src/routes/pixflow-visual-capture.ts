import type { Express, RequestHandler } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE,
  type PixflowVisualCaptureRequest,
  type PixflowWebsiteCloneSourceRequest,
} from '@open-design/contracts';
import { capturePixflowBrowserScreenshots } from '../pixflow/browser-screenshot.js';
import { capturePixflowWebsiteCloneSource } from '../pixflow/website-clone-source.js';

export function registerPixflowVisualCaptureRoutes(
  app: Express,
  requireLocalDaemonRequest: RequestHandler,
  options: { dataDir: string },
): void {
  app.post('/api/pixflow/visual-capture', requireLocalDaemonRequest, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Partial<PixflowVisualCaptureRequest> : {};
    const result = await capturePixflowBrowserScreenshots({
      url: String(body.url || ''),
      viewports: Array.isArray(body.viewports) ? body.viewports : [],
      ...(body.captureMode === 'live-reference' ? { captureMode: body.captureMode } : {}),
      ...(body.fidelityProfile === 'visual-clone' ? { fidelityProfile: body.fidelityProfile } : {}),
      ...(Array.isArray(body.references) ? { references: body.references } : {}),
      ...(typeof body.fidelityReferenceUrl === 'string' ? { fidelityReferenceUrl: body.fidelityReferenceUrl } : {}),
      ...(typeof body.waitMs === 'number' ? { waitMs: body.waitMs } : {}),
      ...(body.renderEnvironmentProfile === PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE
        ? { renderEnvironmentProfile: body.renderEnvironmentProfile }
        : {}),
      ...(typeof body.themeStylePreviewCss === 'string' ? { themeStylePreviewCss: body.themeStylePreviewCss.slice(0, 80_000) } : {}),
      ...(typeof body.themeStyleSnapshotHash === 'string' ? { themeStyleSnapshotHash: body.themeStyleSnapshotHash.slice(0, 160) } : {}),
    });
    return res.status(result.ok ? 200 : 422).json(result);
  });

  app.post('/api/pixflow/website-clone-source', requireLocalDaemonRequest, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Partial<PixflowWebsiteCloneSourceRequest> : {};
    try {
      const result = await capturePixflowWebsiteCloneSource(
        String(body.url || ''),
        typeof body.waitMs === 'number' ? body.waitMs : undefined,
      );
      if (result.ok && result.html && result.canonicalPath && Array.isArray(result.resources)) {
        await persistWebsiteCloneSourceMirror(options.dataDir, String(body.projectId || ''), {
          html: result.html,
          canonicalPath: result.canonicalPath,
          resources: result.resources,
        });
      }
      return res.status(result.ok ? 200 : 422).json(result);
    } catch (error) {
      return res.status(422).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Website Clone source capture failed.',
      });
    }
  });
}

export async function persistWebsiteCloneSourceMirror(
  dataDir: string,
  projectId: string,
  capture: {
    html: string;
    canonicalPath: string;
    resources: Array<{ path: string; base64: string }>;
  },
): Promise<void> {
  if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId === '.' || projectId === '..') {
    throw new Error('Website Clone requires a safe project identifier.');
  }
  const projectRoot = path.resolve(dataDir, 'projects', projectId);
  const writeRelative = async (relativePath: string, bytes: string | Buffer, encoding?: BufferEncoding) => {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part === '..')) {
      throw new Error(`Website Clone produced an unsafe project path: ${relativePath}`);
    }
    const target = path.resolve(projectRoot, ...parts);
    if (!target.startsWith(`${projectRoot}${path.sep}`)) {
      throw new Error(`Website Clone project path escaped its mirror: ${relativePath}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, encoding);
  };
  await writeRelative(capture.canonicalPath, capture.html, 'utf8');
  for (const resource of capture.resources) {
    await writeRelative(resource.path, Buffer.from(resource.base64, 'base64'));
  }
}
