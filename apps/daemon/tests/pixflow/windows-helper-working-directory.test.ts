import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { windowsHelperLauncher } from '../../src/pixflow/windows-helper-launcher.js';

it.runIf(process.platform === 'win32')('resolves helper output in the PowerShell location after changing directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'helper-location-'));
  try {
    const target = path.join(root, 'space and apostrophe\'s');
    await mkdir(target);
    await writeFile(path.join(target, 'site-tool.ps1'), windowsHelperLauncher('site-tool.mjs'));
    await writeFile(path.join(target, 'site-tool.mjs'), "import fs from 'node:fs'; fs.writeFileSync('result.json', JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));");
    await writeFile(path.join(root, 'run.ps1'), "Set-Location -LiteralPath './space and apostrophe''s'\n& ./site-tool.ps1 skills.read --paths bricks/operations/live-builder.md --output result.json\n");
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'run.ps1')], {cwd:root});
    const result = JSON.parse(await readFile(path.join(target, 'result.json'), 'utf8'));
    expect(result.cwd).toBe(target);
    expect(result.args).toEqual(['skills.read', '--paths', 'bricks/operations/live-builder.md', '--output', 'result.json']);
  } finally { await rm(root, {recursive:true, force:true}); }
});
