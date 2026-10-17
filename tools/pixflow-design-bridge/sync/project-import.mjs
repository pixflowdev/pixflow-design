import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractZip } from './archive.mjs';
import { assertSafeProjectId, ensureSyncDirs, projectDir, readSyncState, resolveSyncContext, writeSyncState } from './paths.mjs';
import { WordPressProjectClient } from './wordpress-client.mjs';

export async function importProject(options = {}) {
  const context = resolveSyncContext(options);
  await ensureSyncDirs(context);

  const wpProjectUuid = String(options.wpProjectUuid || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(wpProjectUuid)) {
    throw new Error('A WordPress project UUID is required.');
  }

  const client = new WordPressProjectClient({
    restBaseUrl: options.restBaseUrl,
    nonce: options.nonce,
    token: options.token,
  });

  const detail = await client.requestJson(client.url(`projects/${encodeURIComponent(wpProjectUuid)}`), { method: 'GET' });
  const project = detail.project || {};
  const version = Number(options.versionNumber || project?.latestVersion?.versionNumber || 0);
  if (!version) throw new Error('The WordPress project does not have a downloadable version.');

  const localProjectId = assertSafeProjectId(String(options.projectId || project.slug || wpProjectUuid));
  const destination = projectDir(context, localProjectId);
  if (existsSync(destination) && options.overwrite !== true) {
    throw new Error(`Local project already exists: ${localProjectId}`);
  }

  const zipPath = path.join(context.cacheRoot, `${wpProjectUuid}-${version}.zip`);
  const extractTarget = path.join(context.cacheRoot, `.import-${wpProjectUuid}-${version}-${Date.now()}`);
  await client.downloadVersion(wpProjectUuid, version, zipPath);
  await fs.rm(extractTarget, { recursive: true, force: true }).catch(() => {});
  await extractZip(zipPath, extractTarget);

  if (options.overwrite === true) {
    await fs.rm(destination, { recursive: true, force: true });
  }
  await moveDirectory(extractTarget, destination);

  const state = await readSyncState(context);
  state.projects ||= {};
  state.projects[localProjectId] = {
    localProjectId,
    wpProjectUuid,
    title: String(project.title || localProjectId),
    latestVersion: version,
    lastSyncedHash: String(project?.latestVersion?.fileHash || ''),
    lastSyncedAt: new Date().toISOString(),
    restBaseUrl: options.restBaseUrl || '',
  };
  await writeSyncState(context, state);

  return {
    ok: true,
    localProjectId,
    wpProjectUuid,
    version,
    path: destination,
  };
}

async function moveDirectory(source, destination) {
  try {
    await fs.rename(source, destination);
  } catch {
    // Pixflow-owned: Windows/volume boundaries can make rename fail. The
    // extraction already succeeded, so copy as a fallback and remove the temp.
    await fs.cp(source, destination, { recursive: true, force: true });
    await fs.rm(source, { recursive: true, force: true }).catch(() => {});
  }
}
