import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Enumerate dependencies evidenced in Free output and its source snapshot, not the workspace. */
export async function writeDirectoryNotices(root: string, pluginDirectory: string): Promise<void> {
  const packages = new Set<string>();
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (/\.(?:js|css)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/node_modules\/\.pnpm\/([^/\s"']+)\/node_modules\/((?:@[^/\s"']+\/)?[^/\s"']+)\//g)) {
          packages.add(`node_modules/.pnpm/${match[1]}/node_modules/${match[2]}`);
        }
      }
    }
  }
  await scan(join(pluginDirectory, 'assets'));
  // Some re-export modules disappear from runtime output but their original
  // source accompanies the rebuild project and still needs attribution.
  const recipes = await readdir(join(pluginDirectory, 'source')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of recipes.filter(name => name.endsWith('.json'))) {
    const recipe = JSON.parse(await readFile(join(pluginDirectory, 'source', name), 'utf8'));
    if (recipe.schema !== 1 || !recipe.inputs) continue;
    for (const path of Object.keys(recipe.inputs)) {
      const match = path.match(/^(node_modules\/\.pnpm\/[^/]+\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
      if (match?.[1]) packages.add(match[1]);
    }
  }
  if (!packages.size) throw new Error('No dependency evidence in directory assets; build readable assets before collecting notices.');
  const sections: string[] = [
    'PIXFLOW DESIGN FREE - THIRD-PARTY NOTICES',
    'This inventory is generated from dependencies evidenced in this directory build.\nWordPress supplies React and ReactDOM; they are not bundled in this target.\nRetained dependency comments and source notices remain applicable.',
  ];
  const inventory: { name: string; version: string; license: unknown; texts: string[] }[] = [];
  for (const relative of [...packages].sort()) {
    const directory = join(root, relative);
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const licenseFiles = (await readdir(directory)).filter(name => /^(?:licen[cs]e|notice|copying)(?:[._-].*)?$/i.test(name));
    if (!licenseFiles.length) throw new Error(`Bundled dependency has no licence text: ${metadata.name}`);
    const license = metadata.license ?? metadata.licenses ?? 'See included licence text';
    const texts: string[] = [];
    for (const file of licenseFiles.sort()) {
      const text = await readFile(join(directory, file), 'utf8');
      texts.push(`${file}\n${text}`);
    }
    inventory.push({ name: metadata.name, version: metadata.version, license, texts: licenseFiles });
    sections.push(`${metadata.name} ${metadata.version}\nDeclared licence: ${typeof license === 'string' ? license : JSON.stringify(license)}\n\n${texts.join('\n\n')}`);
  }
  sections.push('Remix Icon 4.7.0\nCopyright RemixIcon.com\nSource: https://github.com/Remix-Design/RemixIcon/tree/v4.7.0\nThe font is unchanged. CSS is modified to load only the bundled WOFF2.\n\n' + await readFile(join(root, 'wordpress/directory/vendor/remixicon/LICENSE.txt'), 'utf8'));
  const artwork = JSON.parse(await readFile(join(pluginDirectory, 'assets/app/provider-asset-sources.json'), 'utf8'));
  sections.push('ASSET AND GUIDANCE ATTRIBUTION\n\nBundled skill directories retain their individual LICENSE files and source credits.\nDirectory provider artwork: Lobe Icons v6.0.0, revision 8a1b2821bb768c484fe8da20c5e1838b6bf551a9 (MIT), and original Pixflow neutral glyphs (MIT).\nExact source URLs, hashes and the neutral substitutions are recorded in assets/app/provider-asset-sources.json.\nMarks identify their respective services; copyright licensing does not grant trademark rights or imply endorsement.\nThe website distribution retains its separately managed artwork.');
  for (const source of artwork.sources) {
    if (!/^LICENSE-[a-z-]+\.txt$/.test(source.licenseFile)) throw new Error('Invalid artwork licence path.');
    sections.push(source.licenseFile + '\n\n' + await readFile(join(pluginDirectory, 'assets/app/brand-licences', source.licenseFile), 'utf8'));
  }
  await writeFile(join(pluginDirectory, 'THIRD-PARTY-NOTICES.txt'), sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
  await writeFile(join(pluginDirectory, 'resources/dependency-licences.json'), JSON.stringify({ schema: 1, packages: inventory }, null, 2) + '\n');
}
