import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';

test('concurrent migration keeps all files in one private tree', async () => {
  const php = process.env.PIXFLOW_TEST_PHP;
  assert.ok(php, 'Set PIXFLOW_TEST_PHP to the PHP executable');
  const root = await mkdtemp(join(tmpdir(), 'pixflow-storage-concurrency-'));
  const uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const legacy = join(root, 'public/uploads/pixflow-design/projects', uuid, 'files');
  try {
    await mkdir(legacy, {recursive: true});
    await writeFile(join(legacy, 'saved.txt'), 'preserved original');
    const worker = join(root, 'worker.php');
    await writeFile(worker, `<?php
define('ABSPATH', $argv[1].'/public/');
define('PIXFLOW_DESIGN_PRIVATE_PROJECT_DIR', $argv[1].'/private/projects');
$_SERVER['DOCUMENT_ROOT']=ABSPATH;
function wp_normalize_path($p){return str_replace('\\\\','/',$p);}
function wp_upload_dir(...$a){return ['basedir'=>ABSPATH.'uploads'];}
function wp_mkdir_p($p){return is_dir($p)||@mkdir($p,0700,true)||is_dir($p);}
function update_option(...$a){}
require $argv[2];
$s=new PixflowDesign\\WordPress\\Projects\\ProjectStorage();
$p=$s->ensure_files_dir('${uuid}');
file_put_contents($p.'/worker-'.$argv[3].'.txt', $argv[3]);
`);
    await Promise.all([1, 2, 3, 4].map(id => new Promise<void>((done, fail) => {
      const child = spawn(php, [worker, root, resolve('wordpress/src/Projects/ProjectStorage.php'), String(id)], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      let output = '';
      child.stdout.on('data', bytes => output += bytes);
      child.stderr.on('data', bytes => output += bytes);
      child.on('error', fail);
      child.on('close', code => code === 0 ? done() : fail(Error(output)));
    })));
    const files = join(root, 'private/projects', uuid, 'files');
    assert.equal(await readFile(join(files, 'saved.txt'), 'utf8'), 'preserved original');
    assert.equal((await readdir(files)).length, 5);
    for (let id = 1; id <= 4; id++) assert.equal(await readFile(join(files, `worker-${id}.txt`), 'utf8'), String(id));
    await assert.rejects(readdir(legacy), {code: 'ENOENT'});
  } finally {
    // mkdtemp returns this test's absolute directory; no user paths are removed.
    await rm(root, {recursive: true, force: true});
  }
});
