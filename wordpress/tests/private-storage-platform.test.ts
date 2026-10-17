import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const php = process.env.PIXFLOW_TEST_PHP;
assert.ok(php, 'Set PIXFLOW_TEST_PHP to the PHP executable');
const source = resolve('wordpress/src/Storage/PrivateDirectory.php');
const harness = `<?php
define('ABSPATH', $argv[1].'/public/'); $_SERVER['DOCUMENT_ROOT']=ABSPATH;
define('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR', $argv[2]);
function wp_normalize_path($v){return str_replace('\\\\','/',$v);}
function wp_upload_dir(...$args){return ['basedir'=>ABSPATH.'uploads'];}
function wp_mkdir_p($p){return is_dir($p)||@mkdir($p,0700,true);}
function update_option(...$args){}
require $argv[3];
try {$root=(new PixflowDesign\\WordPress\\Storage\\PrivateDirectory('resource-packs','resources','PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR'))->directory();echo json_encode(['root'=>$root,'denied'=>false]);}
catch(Throwable $e){echo json_encode(['denied'=>true,'error'=>$e->getMessage()]);}
`;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-platform-'));
  const legacy = join(root, 'public/uploads/pixflow-design/resource-packs');
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, 'reference.html'), '<h1>Keep this content</h1>');
  await writeFile(join(root, 'check.php'), harness);
  return { root, legacy };
}
function run(root: string, target: string) {
  const result = spawnSync(php!, [join(root, 'check.php'), root, target, source], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { denied: boolean; root?: string; error?: string };
}
async function cleanFixture(root: string, prefix: string) {
  assert.ok(resolve(root).startsWith(resolve(prefix)), 'Cleanup stays inside the created fixture prefix');
  await rm(root, { recursive: true, force: true });
}

test('a real Windows deny-write ACL preserves the public tree on migration failure', { skip: process.platform !== 'win32' }, async () => {
  const { root, legacy } = await fixture();
  const parent = join(root, 'private');
  await mkdir(parent);
  const script = join(root, 'acl.ps1');
  await writeFile(script, `param($Target,$Mode)
$ErrorActionPreference='Stop'
if ($Mode -eq 'deny') {
 $acl=Get-Acl -LiteralPath $Target
 $acl.Sddl | Set-Content -LiteralPath ($Target+'.sddl')
 $rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'Write','ContainerInherit,ObjectInherit','None','Deny')
 $acl.AddAccessRule($rule)
} else {
 $acl=Get-Acl -LiteralPath $Target
 $acl.SetSecurityDescriptorSddlForm((Get-Content -Raw -LiteralPath ($Target+'.sddl')).Trim())
}
Set-Acl -LiteralPath $Target -AclObject $acl
`);
  const acl = (mode: string) => {
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-File', script, parent, mode], { windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  let denied = false;
  try {
    acl('deny');
    denied = true;
    assert.equal(run(root, join(parent, 'resources')).denied, true);
    assert.equal(await readFile(join(legacy, 'reference.html'), 'utf8'), '<h1>Keep this content</h1>');
  } finally {
    if (denied) acl('restore');
    await cleanFixture(root, join(tmpdir(), 'pixflow-platform-'));
  }
});

test('cross-volume migration fails intact, then an offline verified move reconnects', { skip: process.platform !== 'win32' || !process.env.PIXFLOW_TEST_OTHER_VOLUME }, async () => {
  const { root, legacy } = await fixture();
  const prefix = join(resolve(process.env.PIXFLOW_TEST_OTHER_VOLUME!), 'pixflow-platform-');
  const other = await mkdtemp(prefix);
  const target = join(other, 'resources');
  try {
    assert.notEqual(resolve(root).slice(0, 2), resolve(other).slice(0, 2), 'Use a separate Windows volume');
    assert.equal(run(root, target).denied, true, 'Do not silently copy a live directory across volumes');
    const original = await readFile(join(legacy, 'reference.html'));
    await cp(legacy, target, { recursive: true, errorOnExist: true, force: false });
    assert.deepEqual(await readFile(join(target, 'reference.html')), original);
    assert.ok(resolve(legacy).startsWith(resolve(root) + '\\'));
    await rm(legacy, { recursive: true });
    assert.equal(run(root, target).denied, false);
    assert.deepEqual(await readFile(join(target, 'reference.html')), original);
  } finally {
    await cleanFixture(root, join(tmpdir(), 'pixflow-platform-'));
    await cleanFixture(other, prefix);
  }
});
