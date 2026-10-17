import fs from 'node:fs/promises';
import path from 'node:path';

export async function buildProjectManifest({ projectId, projectPath, title = '', wpProjectUuid = '', files = [], metadata = {} }) {
  const stat = await fs.stat(projectPath);
  const detectedTitle = title || await inferProjectTitle(projectPath) || projectId;

  return {
    schema: 1,
    source: 'pixflow-design-bridge',
    project: {
      localProjectId: projectId,
      wpProjectUuid,
      title: detectedTitle,
      pathName: path.basename(projectPath),
    },
    files,
    metadata,
    createdAt: new Date().toISOString(),
    localUpdatedAt: stat.mtime.toISOString(),
  };
}

export async function inferProjectTitle(projectPath) {
  for (const file of ['project.json', 'metadata.json', 'pixflow-project-manifest.json']) {
    const decoded = await readJson(path.join(projectPath, file));
    const title = decoded?.title || decoded?.project?.title || decoded?.name;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }

  return path.basename(projectPath);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}
