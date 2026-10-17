import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_ATTACHMENTS = 12;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

type RawPromptAttachment = {
  projectId?: unknown;
  project_id?: unknown;
  name?: unknown;
  path?: unknown;
  mime?: unknown;
  type?: unknown;
  size?: unknown;
};

export type MaterializedPixflowBricksPromptAttachment = {
  projectId: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  availability: 'local_copy' | 'metadata_only' | 'too_large';
};

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeProjectId(value: unknown): string {
  const projectId = boundedString(value, 128);
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(projectId) ? projectId : '';
}

function safeAttachmentName(value: unknown, fallback: string): string {
  const base = path.basename(boundedString(value, 260) || fallback)
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return base || fallback;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function materializePixflowBricksPromptAttachments(options: {
  attachments: unknown[];
  runtimeDataDir: string;
  workspace: string;
}): Promise<MaterializedPixflowBricksPromptAttachment[]> {
  const rawItems = Array.isArray(options.attachments) ? options.attachments.slice(0, MAX_ATTACHMENTS) : [];
  if (rawItems.length === 0) return [];

  const attachmentsDir = path.join(options.workspace, 'attachments');
  await mkdir(attachmentsDir, { recursive: true });
  let totalBytes = 0;
  const results: MaterializedPixflowBricksPromptAttachment[] = [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index] && typeof rawItems[index] === 'object'
      ? rawItems[index] as RawPromptAttachment
      : {};
    const projectId = safeProjectId(raw.projectId ?? raw.project_id);
    const relativePath = boundedString(raw.path, 500);
    const fallbackName = `attachment-${index + 1}`;
    const name = safeAttachmentName(raw.name, safeAttachmentName(relativePath, fallbackName));
    const mime = boundedString(raw.mime ?? raw.type, 160).toLowerCase();
    const metadataOnly = (availability: 'metadata_only' | 'too_large', size = Number(raw.size || 0)) => ({
      projectId,
      name,
      path: '',
      mime,
      size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0,
      availability,
    } as MaterializedPixflowBricksPromptAttachment);

    if (!projectId || !relativePath || path.isAbsolute(relativePath)) {
      results.push(metadataOnly('metadata_only'));
      continue;
    }

    try {
      const projectRoot = path.resolve(options.runtimeDataDir, 'projects', projectId);
      const sourceCandidate = path.resolve(projectRoot, relativePath);
      if (!isWithin(projectRoot, sourceCandidate)) {
        results.push(metadataOnly('metadata_only'));
        continue;
      }

      const [realProjectRoot, realSource] = await Promise.all([
        realpath(projectRoot),
        realpath(sourceCandidate),
      ]);
      if (!isWithin(realProjectRoot, realSource)) {
        results.push(metadataOnly('metadata_only'));
        continue;
      }

      const sourceStat = await stat(realSource);
      if (!sourceStat.isFile()) {
        results.push(metadataOnly('metadata_only'));
        continue;
      }
      if (sourceStat.size > MAX_FILE_BYTES || totalBytes + sourceStat.size > MAX_TOTAL_BYTES) {
        results.push(metadataOnly('too_large', sourceStat.size));
        continue;
      }

      const destination = path.join(attachmentsDir, `${String(index + 1).padStart(2, '0')}-${name}`);
      await copyFile(realSource, destination);
      totalBytes += sourceStat.size;
      results.push({
        projectId,
        name,
        path: destination,
        mime,
        size: sourceStat.size,
        availability: 'local_copy',
      });
    } catch {
      results.push(metadataOnly('metadata_only'));
    }
  }

  return results;
}
