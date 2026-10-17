import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT,
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION,
  PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES,
} from '@open-design/contracts';

it('keeps WordPress converter resources and the Bridge contract identical', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const php = "define('ABSPATH', getcwd()); require 'wordpress/src/Mcp/PromptSkillCatalog.php'; echo json_encode((new \\PixflowDesign\\WordPress\\Mcp\\PromptSkillCatalog())->bricks_converter_skill_pack());";
  const pack = JSON.parse(execFileSync('php', ['-r', php], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000,
  })) as { revision: string; fingerprint: string; files: {path: string; content: string; fingerprint: string}[] };
  expect(pack.revision).toBe(PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION);
  expect(pack.fingerprint).toBe(PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT);
  expect(pack.files.map(file => file.path)).toEqual([...PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES]);
  for (const file of pack.files) {
    expect(file.fingerprint).toBe(`sha256:${createHash('sha256').update(file.content).digest('hex')}`);
  }
  const aggregate = pack.files.map(file => `${file.path}\n${file.fingerprint}\n`).join('');
  expect(pack.fingerprint).toBe(`sha256:${createHash('sha256').update(aggregate).digest('hex')}`);
});
