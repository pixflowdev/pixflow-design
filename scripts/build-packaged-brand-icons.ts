/** Regenerate tools-pack platform icons from the canonical Pixflow mark.
 * Run with `pnpm exec tsx scripts/build-packaged-brand-icons.ts`.
 * PNG-backed ICO and ICNS containers are assembled locally on every platform.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
type Raster = { resize(width: number, height: number): Raster; png(): Raster; toBuffer(): Promise<Buffer> };
type Sharp = (source: Buffer) => Raster;
let sharp: Sharp;
try {
  sharp = require('sharp') as Sharp;
} catch {
  sharp = require(join(root, 'node_modules/.pnpm/node_modules/sharp')) as Sharp;
}

const mark = await readFile(join(root, 'wordpress/assets/brand/pixflow-plugin-icon.svg'), 'utf8');
const paths = mark.replace(/<\?xml[^>]*>/g, '').replace(/<\/?svg[^>]*>/g, '').trim();
const artwork = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="218" fill="#fff"/>${paths}</svg>`);
const pngs = new Map<number, Buffer>();
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  pngs.set(size, await sharp(artwork).resize(size, size).png().toBuffer());
}
const png = (size: number): Buffer => {
  const bytes = pngs.get(size);
  if (!bytes) throw new Error(`Missing ${size}px raster`);
  return bytes;
};
for (const platform of ['linux', 'mac']) {
  await writeFile(join(root, `tools/pack/resources/${platform}/icon.png`), png(1024));
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const icoHeader = Buffer.alloc(6 + 16 * sizes.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(sizes.length, 4);
let offset = icoHeader.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  icoHeader.writeUInt8(size === 256 ? 0 : size, entry);
  icoHeader.writeUInt8(size === 256 ? 0 : size, entry + 1);
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(png(size).length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += png(size).length;
}
await writeFile(join(root, 'tools/pack/resources/win/icon.ico'), Buffer.concat([icoHeader, ...sizes.map(png)]));

const iconTypes: [string, number][] = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256],
  ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
];
const chunks = iconTypes.map(([type, size]) => {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(8 + png(size).length, 4);
  return Buffer.concat([header, png(size)]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
await writeFile(join(root, 'tools/pack/resources/mac/icon.icns'), Buffer.concat([icnsHeader, ...chunks]));
console.log('Updated Pixflow Design PNG, ICO and ICNS packaged icons.');
