import {build} from 'esbuild';
import {mkdir, writeFile, copyFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {storeConfiguration, storeFiles, storeManifest, nativeStoreConfiguration} from './src/store-package';

const root = import.meta.dirname;
const out = resolve(root, '../../../.tmp/chrome-store/browser');
await mkdir(out, {recursive: true});
// Refuse contamination rather than deleting unknown files or shipping them.
for (const file of await readdir(out)) if (!(storeFiles as readonly string[]).includes(file)) throw Error(`Unexpected Store file: ${file}`);
for (const name of ['background', 'content', 'page', 'popup']) {
  await build({entryPoints: [resolve(root, 'src', name + '.ts')], outfile: resolve(out, name + '.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120'});
}
for (const file of ['popup.html', 'popup.css']) await copyFile(resolve(root, file), resolve(out, file));
await copyFile(resolve(root, '../../../wordpress/assets/brand/pixflow-plugin-icon.svg'), resolve(out, 'brand.svg'));
await copyFile(resolve(root, '../../pack/resources/linux/icon.png'), resolve(out, 'icon.png'));
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(storeManifest(), null, 2));
await writeFile(resolve(out, 'config.json'), JSON.stringify(storeConfiguration, null, 2));
const id = process.argv[2];
if (id) {
  const config = nativeStoreConfiguration(id);
  const nativeOut = resolve(root, '../../../.tmp/chrome-store/native');
  await mkdir(nativeOut, {recursive: true});
  for (const [source, output] of [['host', 'host'], ['install-cli', 'install']]) {
    await build({entryPoints: [resolve(root, 'src', source + '.ts')], outfile: resolve(nativeOut, output + '.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24'});
  }
  await writeFile(resolve(nativeOut, 'config.json'), JSON.stringify(config, null, 2));
}
console.log(out);
