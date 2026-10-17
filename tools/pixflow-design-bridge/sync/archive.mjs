import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.od-skills']);
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export async function zipDirectory(sourceDir, zipPath, options = {}) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Project folder does not exist: ${sourceDir}`);
  }

  const zip = new JSZip();
  const files = [];
  await addDir(zip, sourceDir, '', files);

  if (options.manifest) {
    zip.file('pixflow-project-manifest.json', `${JSON.stringify(options.manifest, null, 2)}\n`);
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.writeFile(zipPath, buffer);

  return {
    path: zipPath,
    bytes: buffer.length,
    sha256: sha256(buffer),
    files,
  };
}

export async function extractZip(zipPath, destination) {
  const data = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(data);
  const root = path.resolve(destination);
  await fs.mkdir(root, { recursive: true });

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const normalized = normalizeZipPath(entry.name);
    if (!normalized) continue;
    const target = path.resolve(root, normalized);
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new Error(`Unsafe zip entry: ${entry.name}`);
    }
    if (entry.dir) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await entry.async('nodebuffer'));
  }

  return { path: root, entries: entries.length };
}

async function addDir(zip, root, relativeDir, files) {
  const absDir = path.join(root, relativeDir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_FILES.has(entry.name)) continue;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const relativePath = normalizeZipPath(path.join(relativeDir, entry.name));
    if (!relativePath) continue;
    const absPath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      await addDir(zip, root, relativePath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const data = await fs.readFile(absPath);
    zip.file(relativePath, data);
    files.push({
      path: relativePath,
      bytes: data.length,
      sha256: sha256(data),
    });
  }
}

function normalizeZipPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')) {
    return '';
  }
  return normalized;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
