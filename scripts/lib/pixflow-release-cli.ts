import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareRelease } from './pixflow-release-build.ts';
import type { BuildOptions } from './pixflow-release-build.ts';
import { check, publishPlan, readBase, serialize } from './pixflow-release-store.ts';
import type { Base, Product, Store } from './pixflow-release-store.ts';

export const nodeImage = 'node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553';
const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
async function command(executable: string, args: string[]): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', fail); child.on('close', code => code === 0 ? done(stdout) : fail(new Error(`${executable} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}
/** Explicit bind roots and a network-disabled one-shot runtime; the website containers are untouched. */
export function containerArgs(bundle: string, store: Store, operation: 'read' | 'publish', apply: boolean): string[] {
  for (const path of [bundle, store.privateRoot, store.publicRoot]) check(/^\/[A-Za-z0-9._/-]+$/.test(path) && !path.split('/').includes('..'), 'Remote roots must be absolute POSIX paths without shell metacharacters');
  return ['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--mount',`type=bind,src=${bundle},dst=/bundle,readonly`,
    '--mount',`type=bind,src=${store.privateRoot},dst=/private${apply ? '' : ',readonly'}`,
    '--mount',`type=bind,src=${store.publicRoot},dst=/public${apply ? '' : ',readonly'}`,
    nodeImage,'node','/bundle/pixflow-release-store.ts',operation,'/bundle/request.json'];
}
export async function main(product: Product): Promise<void> {
  try {
    const { values } = parseArgs({ options: { help: {type:'boolean'}, local: {type:'boolean'}, apply: {type:'boolean'}, json: {type:'boolean'}, target:{type:'string'}, source:{type:'string'}, 'private-root':{type:'string'}, 'public-root':{type:'string'}, host:{type:'string'}, identity:{type:'string'}, notes:{type:'string'}, edition:{type:'string'}, 'pro-source':{type:'string'}, 'allow-windows-only':{type:'boolean'} } });
    if (values.help) {
      console.log(`Usage: node scripts/deploy-${product}.ts --target staging|production --source <built ZIP or release directory> --private-root <absolute path> --public-root <absolute path> (--local | --host user@host) [--identity <SSH key>] [--apply] [--json] [--notes <changelog HTML>] [--edition bundled|free] [--pro-source <Pro ZIP>] [--allow-windows-only]\nDry run is the default. Existing artifacts/history are retained. No build or publication occurs without --apply. Remote runs require Docker with the pinned Node image available.`); return;
    }
    check(values.target === 'production' || values.target === 'staging', 'Choose --target staging or production');
    check(values.source && values['private-root'] && values['public-root'], '--source, --private-root and --public-root are required');
    check(Boolean(values.local) !== Boolean(values.host), 'Choose exactly one of --local or --host');
    const store: Store = { target: values.target, privateRoot: values['private-root'], publicRoot: values['public-root'] };
    check(values.edition === undefined || values.edition === 'bundled' || values.edition === 'free', 'Choose --edition bundled or free');
    const build: BuildOptions = { product, target: values.target, source: resolve(values.source), ...(values.edition ? {edition: values.edition} : {}), ...(values['pro-source'] ? {proSource: resolve(values['pro-source'])} : {}), ...(values.notes ? {notes:resolve(values.notes)} : {}), allowWindowsOnly: values['allow-windows-only'] === true };
    let result: unknown;
    if (values.local) result = await publishPlan(store, await prepareRelease(await readBase(store), build), values.apply === true);
    else {
      const host = values.host!; check(/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host), 'Invalid SSH host');
      const sshOptions = ['-o','BatchMode=yes', ...(values.identity ? ['-i',resolve(values.identity)] : [])];
      const remote = `/tmp/pixflow-release-${randomUUID()}`, local = await mkdtemp(join(tmpdir(), 'pixflow-release-'));
      const ssh = (args: string[]) => command('ssh', [...sshOptions,host,args.map(quote).join(' ')]);
      const upload = (source: string, name: string) => command('scp', [...sshOptions,source,`${host}:${remote}/${name}`]);
      const request = async (data: unknown) => { const path = join(local,'request.json'); await writeFile(path,serialize(data)); await upload(path,'request.json'); };
      // Validate paths before any remote operation.
      containerArgs(remote, store, 'read', false);
      try {
        await ssh(['mkdir','-m','700',remote]);
        await upload(fileURLToPath(new URL('./pixflow-release-store.ts',import.meta.url)), 'pixflow-release-store.ts');
        const containerStore = { ...store, privateRoot:'/private', publicRoot:'/public' };
        await request({store:containerStore});
        const base = JSON.parse(await ssh(containerArgs(remote,store,'read',false))) as Base;
        const plan = await prepareRelease(base,build);
        for (let index = 0; index < plan.files.length; index++) {
          const file = plan.files[index]!, name = `artifact-${index}.bin`;
          // Controlled names avoid scp interpreting user source paths as remote expressions.
          const path = join(local,name); await copyFile(file.source,path); await upload(path,name); file.source = name;
        }
        await request({store:containerStore,plan,apply:values.apply === true});
        result = JSON.parse(await ssh(containerArgs(remote,store,'publish',values.apply === true)));
      } finally {
        // Only this invocation's generated scratch directory is removed; release roots are never deleted.
        await ssh(['rm','-rf','--',remote]).catch(error => console.error('Remote scratch cleanup failed:', error.message));
        await rm(local,{recursive:true,force:true});
      }
    }
    console.log(serialize(result).trim());
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
