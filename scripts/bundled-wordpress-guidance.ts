import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Only inert, reviewed instructions may be served from the plugin directory. */
export async function copyBundledWordPressGuidance(source: string, target: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Linked bundled guidance: ${entry.name}`);
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyBundledWordPressGuidance(from, to);
      continue;
    }
    if (!entry.isFile() || /\.(?:php\d*|phtml|phar|cgi|html?|svg)(?:\.|$)/i.test(entry.name)
      || !(/\.(?:md|txt|json)$/i.test(entry.name) || /^LICENSE(?:\.[A-Za-z0-9-]+)?$/.test(basename(entry.name)))) {
      throw new Error(`Non-text file cannot ship as public bundled guidance: ${entry.name}`);
    }
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, await readFile(from));
  }
}
