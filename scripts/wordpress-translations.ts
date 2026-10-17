import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type WordPressMessage = { message: string; domain: string; references: string[] };

/** Static gettext calls only. Protocol names and user-authored content are never translated. */
export function readWordPressMessages(source: string, filename: string): WordPressMessage[] {
  const pattern = /\b(?:__|_e|esc_html__|esc_attr__|esc_html_e|esc_attr_e)\s*\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*['"](pixflow-design(?:-pro)?)['"]\s*\)/g;
  return [...source.matchAll(pattern)].map((match) => {
    const literal = match[1]!;
    const single = literal[0] === "'";
    const message = literal.slice(1, -1).replace(single ? /\\(['\\])/g : /\\(["\\nrt$])/g, (_, escape: string) => ({ n: '\n', r: '\r', t: '\t' })[escape] ?? escape);
    return { message, domain: match[2]!, references: [`${filename}:${source.slice(0, match.index).split('\n').length}`] };
  });
}

export async function collectWordPressMessages(root: string, proRoot?: string): Promise<WordPressMessage[]> {
  const messages = new Map<string, WordPressMessage>();
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.name.endsWith('.php')) for (const record of readWordPressMessages(await readFile(filename, 'utf8'), path.relative(root, filename).replaceAll('\\', '/'))) {
        const id = `${record.domain}\0${record.message}`;
        const previous = messages.get(id);
        if (previous) previous.references.push(...record.references);
        else messages.set(id, record);
      }
    }
  }
  await walk(path.join(root, 'wordpress/src'));
  if (proRoot) await walk(path.join(proRoot, 'wordpress-pro/src'));
  return [...messages.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.message.localeCompare(b.message));
}

/** GNU MO, UTF-8, deterministic byte-sorted msgids; compatible with WordPress 6.0+. */
export function compileMo(messages: Map<string, string>): Buffer {
  const pairs = [...messages].map(([id, text]) => [Buffer.from(id), Buffer.from(text)] as const).sort((a, b) => Buffer.compare(a[0], b[0]));
  const count = pairs.length;
  const tableEnd = 28 + count * 16;
  const total = tableEnd + pairs.reduce((size, pair) => size + pair[0].length + pair[1].length + 2, 0);
  const output = Buffer.alloc(total);
  output.writeUInt32LE(0x950412de, 0);
  output.writeUInt32LE(count, 8);
  output.writeUInt32LE(28, 12);
  output.writeUInt32LE(28 + count * 8, 16);
  // Older WordPress POMO readers use hash_addr as the end of the translation
  // lookup table, including when hash_length is zero.
  output.writeUInt32LE(tableEnd, 24);
  let offset = tableEnd;
  for (let column = 0; column < 2; column++) for (let index = 0; index < count; index++) {
    const text = pairs[index]![column]!;
    const slot = 28 + column * count * 8 + index * 8;
    output.writeUInt32LE(text.length, slot);
    output.writeUInt32LE(offset, slot + 4);
    text.copy(output, offset);
    offset += text.length + 1;
  }
  return output;
}

export function printfPlaceholders(value: string): string[] {
  return [...value.matchAll(/%(?:\d+\$)?[-+0 #'\d.]*(?:s|d|f)/g)].map(match => match[0]).sort();
}
