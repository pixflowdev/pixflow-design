import type { Project, ProjectFile } from '../types';
import { toPixflowRuntimeUrl } from './bridge-url';
import { getPixflowBridgeBaseUrl } from './wordpress-context';

export type BuildInBricksScratchFileWriteResult =
  | { ok: true; file: ProjectFile }
  | { ok: false; status?: number; code?: string; message: string };

/**
 * Build source projects are daemon-owned even while the app is embedded in
 * WordPress. Keep their file I/O on the bridge instead of allowing the global
 * WordPress project-file remapper to redirect it to durable WP project storage.
 */
export function resolveBuildInBricksScratchProjectUrl(
  path: string,
  bridgeBaseUrl = getPixflowBridgeBaseUrl(),
): string {
  const normalizedBridgeBaseUrl = String(bridgeBaseUrl || '').trim().replace(/\/+$/, '');
  return normalizedBridgeBaseUrl ? `${normalizedBridgeBaseUrl}${path}` : toPixflowRuntimeUrl(path);
}

export function buildInBricksScratchProjectFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveBuildInBricksScratchProjectUrl(path);
  const nativeFetch = typeof window !== 'undefined'
    ? (window as Window & { __PIXFLOW_DESIGN_NATIVE_FETCH__?: typeof fetch }).__PIXFLOW_DESIGN_NATIVE_FETCH__
    : undefined;
  return (nativeFetch || fetch)(url, init);
}

export async function fetchBuildInBricksScratchProjectFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    const response = await buildInBricksScratchProjectFetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { files?: ProjectFile[] };
    return Array.isArray(json.files) ? json.files : [];
  } catch {
    return [];
  }
}

/**
 * List daemon-owned canonical Build projects from the Bridge rather than the
 * paginated WordPress shared-project catalogue. Retained source indexes live
 * in these local scratch projects, including older owners that may no longer
 * appear in the WordPress catalogue's first page.
 */
export async function listBuildInBricksScratchProjectIds(): Promise<string[]> {
  try {
    const response = await buildInBricksScratchProjectFetch('/api/projects', { cache: 'no-store' });
    if (!response.ok) return [];
    const json = (await response.json()) as { projects?: Project[] };
    return (Array.isArray(json.projects) ? json.projects : [])
      .filter((project) => (
        project.metadata?.kind === 'build-in-bricks'
        || project.metadata?.pixflowBuildInBricksSource === true
        || project.metadata?.sourceContract === 'build-in-bricks-html-first'
      ))
      .map((project) => String(project.id || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchBuildInBricksScratchProjectFileText(
  projectId: string,
  filePath: string,
): Promise<string | null> {
  try {
    const safePath = filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const response = await buildInBricksScratchProjectFetch(
      `/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function deleteBuildInBricksScratchProjectFile(
  projectId: string,
  filePath: string,
): Promise<boolean> {
  try {
    const safePath = filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const response = await buildInBricksScratchProjectFetch(
      `/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`,
      { method: 'DELETE' },
    );
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function writeBuildInBricksScratchProjectTextFileDetailed(
  projectId: string,
  name: string,
  content: string,
): Promise<BuildInBricksScratchFileWriteResult> {
  try {
    const response = await buildInBricksScratchProjectFetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
      return {
        ok: false,
        status: response.status,
        code: typeof body?.code === 'string' ? body.code : undefined,
        message: typeof body?.message === 'string' && body.message.trim()
          ? body.message.trim()
          : response.statusText || 'Scratch project file save failed.',
      };
    }
    const json = (await response.json()) as { file?: ProjectFile };
    if (!json.file) return { ok: false, message: 'Scratch project file save returned no file.' };
    return { ok: true, file: json.file };
  } catch {
    return { ok: false, message: 'Network error while saving the scratch project file.' };
  }
}

export async function writeBuildInBricksScratchProjectTextFile(
  projectId: string,
  name: string,
  content: string,
): Promise<ProjectFile | null> {
  const result = await writeBuildInBricksScratchProjectTextFileDetailed(projectId, name, content);
  return result.ok ? result.file : null;
}

export async function writeBuildInBricksScratchProjectTextFiles(
  projectId: string,
  files: Array<{ name: string; content: string }>,
): Promise<{ ok: boolean; message?: string }> {
  for (const file of files) {
    const result = await writeBuildInBricksScratchProjectTextFileDetailed(
      projectId,
      file.name,
      file.content,
    );
    if (!result.ok) {
      return {
        ok: false,
        message: `${file.name}: ${result.message}`,
      };
    }
  }
  return { ok: true };
}

export async function writeBuildInBricksScratchProjectBase64File(
  projectId: string,
  name: string,
  base64: string,
): Promise<ProjectFile | null> {
  try {
    const response = await buildInBricksScratchProjectFetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: base64, encoding: 'base64' }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { file?: ProjectFile };
    return json.file || null;
  } catch {
    return null;
  }
}
