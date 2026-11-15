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
    await writeFile(path.join(target, 'site-tool.cmd'), windowsHelperLauncher('site-tool.mjs'));
    await writeFile(path.join(target, 'site-tool.mjs'), "import fs from 'node:fs'; fs.writeFileSync('result.json', JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));");
    const command = "Set-Location -LiteralPath './space and apostrophe''s'\n& ./site-tool.cmd skills.read --paths bricks/operations/live-builder.md --output result.json\n";
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Restricted', '-Command', command], {cwd:root});
    const result = JSON.parse(await readFile(path.join(target, 'result.json'), 'utf8'));
    expect(result.cwd).toBe(target);
    expect(result.args).toEqual(['skills.read', '--paths', 'bricks/operations/live-builder.md', '--output', 'result.json']);
  } finally { await rm(root, {recursive:true, force:true}); }
});

it.runIf(process.platform === 'win32')('runs both native helper launchers under Restricted without changing policy', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'helper-policy-'));
  const target = path.join(root, "spaces and apostrophe's & bang!");
  try {
    await mkdir(target);
    await writeFile(path.join(target, 'blocked.ps1'), 'Write-Output blocked');
    const shell = promisify(execFile);
    await expect(shell('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Restricted', '-File', path.join(target, 'blocked.ps1')])).rejects.toThrow();
    for (const name of ['site-tool', 'builder-tool']) {
      await writeFile(path.join(target, name + '.cmd'), windowsHelperLauncher((name + '.mjs') as 'site-tool.mjs'));
      await writeFile(path.join(target, name + '.mjs'), "console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),text:'caf\\u00e9 \\u65e5\\u672c'}));process.exitCode=7;");
      const command = "Set-Location -LiteralPath '" + target.replaceAll("'", "''") + "'; & ./" + name + ".cmd help '@arguments with spaces.json'; exit $LASTEXITCODE";
      const result = await shell('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Restricted', '-Command', command]).catch(e => e);
      expect(result.code).toBe(7);
      expect(JSON.parse(result.stdout)).toEqual({cwd:target,args:['help','@arguments with spaces.json'],text:'caf\u00e9 \u65e5\u672c'});
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});
