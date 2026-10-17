import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES,
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT,
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION,
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_SCHEMA,
  type PixflowBricksConverterSkillPack,
} from '@open-design/contracts';

const MAX_PACK_BYTES = 512 * 1024;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function canonicalContent(value: unknown): string {
  return `${String(value ?? '').replace(/\r\n?/g, '\n').trim()}\n`;
}

/**
 * Treat the browser payload as transport evidence, never authority. The
 * daemon accepts only the plugin-owned closed manifest and independently
 * verifies every file plus the aggregate pack identity before model use.
 */
export function validatePixflowBricksConverterSkillPack(
  value: unknown,
): PixflowBricksConverterSkillPack {
  const pack = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<PixflowBricksConverterSkillPack>
    : null;
  if (!pack || pack.schema !== PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_SCHEMA) {
    throw new Error('Pixflow Bricks converter skill pack is missing or has an unsupported schema.');
  }
  if (pack.revision !== PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION) {
    throw new Error('Pixflow Bricks converter skill pack revision does not match this runtime.');
  }
  if (pack.fingerprint !== PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT) {
    throw new Error('Pixflow Bricks converter skill pack identity does not match this runtime.');
  }
  if (pack.sourceRoot !== 'wordpress/resources/mcp-skills/bricks/converter') {
    throw new Error('Pixflow Bricks converter skill pack is not plugin-owned.');
  }
  if (!Array.isArray(pack.files) || pack.files.length !== PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES.length) {
    throw new Error('Pixflow Bricks converter skill pack file inventory is incomplete.');
  }

  let totalBytes = 0;
  let aggregate = '';
  const files = pack.files.map((rawFile, index) => {
    const expectedPath = PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES[index];
    const file = rawFile && typeof rawFile === 'object' && !Array.isArray(rawFile)
      ? rawFile
      : null;
    if (!file || file.path !== expectedPath) {
      throw new Error(`Pixflow Bricks converter skill path mismatch at entry ${index + 1}.`);
    }
    if (!/^[a-z0-9._/-]+\.md$/i.test(expectedPath) || expectedPath.split('/').includes('..')) {
      throw new Error(`Unsafe Pixflow Bricks converter skill path: ${expectedPath}.`);
    }
    const content = canonicalContent(file.content);
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > MAX_PACK_BYTES) {
      throw new Error('Pixflow Bricks converter skill pack exceeds its bounded size.');
    }
    const fingerprint = sha256(content);
    if (file.fingerprint !== fingerprint) {
      throw new Error(`Pixflow Bricks converter skill hash mismatch: ${expectedPath}.`);
    }
    aggregate += `${expectedPath}\n${fingerprint}\n`;
    return { path: expectedPath, fingerprint, content };
  });

  if (sha256(aggregate) !== PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT) {
    throw new Error('Pixflow Bricks converter skill pack aggregate hash mismatch.');
  }

  return {
    schema: PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_SCHEMA,
    revision: PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION,
    fingerprint: PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT,
    sourceRoot: 'wordpress/resources/mcp-skills/bricks/converter',
    files,
  };
}

export async function materializePixflowBricksConverterSkillPack(
  value: unknown,
  targetRoot: string,
): Promise<string> {
  const pack = validatePixflowBricksConverterSkillPack(value);
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });
  for (const file of pack.files) {
    const target = path.resolve(targetRoot, ...file.path.split('/'));
    if (!target.startsWith(`${path.resolve(targetRoot)}${path.sep}`)) {
      throw new Error(`Unsafe Pixflow Bricks converter skill target: ${file.path}.`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
  }
  return targetRoot;
}
