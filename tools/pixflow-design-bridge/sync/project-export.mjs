import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { zipDirectory } from './archive.mjs';
import { buildProjectManifest, inferProjectTitle } from './project-manifest.mjs';
import { ensureSyncDirs, projectDir, readSyncState, resolveSyncContext, writeSyncState } from './paths.mjs';
import { WordPressProjectClient } from './wordpress-client.mjs';

export async function exportProject(options = {}) {
  const context = resolveSyncContext(options);
  await ensureSyncDirs(context);

  const projectId = String(options.projectId || '').trim();
  if (!projectId) throw new Error('A local project id is required.');

  const localDir = projectDir(context, projectId);
  if (!existsSync(localDir)) throw new Error(`Local project not found: ${projectId}`);

  const state = await readSyncState(context);
  const existing = state.projects?.[projectId] || {};
  const client = new WordPressProjectClient({
    restBaseUrl: options.restBaseUrl,
    nonce: options.nonce,
    token: options.token,
  });

  let wpProjectUuid = String(options.wpProjectUuid || existing.wpProjectUuid || '');
  const title = String(options.title || existing.title || await inferProjectTitle(localDir));
  if (!wpProjectUuid) {
    const created = await client.createProject({
      title,
      kind: options.kind || 'project',
      source_bridge_id: options.bridgeId || '',
      visibility: options.visibility || 'site',
      context: options.context || {},
      metadata: {
        localProjectId: projectId,
        ...objectOrEmpty(options.metadata),
      },
    });
    wpProjectUuid = String(created?.project?.uuid || '');
  }

  if (!wpProjectUuid) {
    throw new Error('WordPress did not return a project UUID.');
  }

  const versionNumber = Number(options.versionNumber || 0) || null;
  const zipPath = path.join(context.queueRoot, `${projectId}-${Date.now()}.zip`);
  const manifest = await buildProjectManifest({
    projectId,
    projectPath: localDir,
    title,
    wpProjectUuid,
    metadata: objectOrEmpty(options.metadata),
  });
  const zipped = await zipDirectory(localDir, zipPath, { manifest });
  manifest.files = zipped.files;
  manifest.archive = {
    sha256: zipped.sha256,
    bytes: zipped.bytes,
  };
  await fs.writeFile(path.join(context.queueRoot, `${projectId}-${Date.now()}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const uploaded = await client.uploadVersion(wpProjectUuid, {
    archivePath: zipPath,
    manifest,
    previewPath: options.previewPath || '',
    summary: options.summary || '',
    metadata: {
      localProjectId: projectId,
      archiveSha256: zipped.sha256,
      ...objectOrEmpty(options.metadata),
    },
    versionNumber,
    // Pixflow-owned: optimistic version checks prevent one teammate's bridge
    // from silently replacing another teammate's newer shared project version.
    expectedVersionNumber: options.expectedVersionNumber ?? existing.latestVersion ?? null,
    expectedFileHash: options.expectedFileHash ?? existing.lastSyncedHash ?? '',
    lockSessionId: options.lockSessionId || '',
    saveAsNewVersion: options.saveAsNewVersion === true || options.allowConflict === true,
  });

  state.projects ||= {};
  state.projects[projectId] = {
    localProjectId: projectId,
    wpProjectUuid,
    title,
    latestVersion: uploaded?.version?.versionNumber || null,
    lastSyncedHash: zipped.sha256,
    lastSyncedAt: new Date().toISOString(),
    restBaseUrl: options.restBaseUrl || '',
  };
  await writeSyncState(context, state);

  return {
    ok: true,
    projectId,
    wpProjectUuid,
    title,
    archive: zipped,
    remote: uploaded,
  };
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
