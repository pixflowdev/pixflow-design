/** Rebuild original neutral design placeholders; no remote service or model required. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const sharp = require(join(root, 'node_modules/.pnpm/node_modules/sharp')) as (input: Buffer) => { webp(options: { quality: number }): { toBuffer(): Promise<Buffer> } };
const destination = join(root, 'wordpress/assets/design-placeholders');
await mkdir(destination, { recursive: true });
for (const [w, h, ratio] of [[800,800,'1-1'],[1200,900,'4-3'],[1200,800,'3-2'],[1280,720,'16-9'],[900,1200,'3-4'],[720,1280,'9-16']] as const) {
  const x=w/2, y=h/2, s=Math.min(w,h)/5;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#e8e6e1"/><rect x="24" y="24" width="${w-48}" height="${h-48}" rx="16" fill="none" stroke="#c4c2bc" stroke-width="2"/><g transform="translate(${x-s/2} ${y-s/2-30})" fill="none" stroke="#797c75" stroke-width="5" stroke-linejoin="round"><rect width="${s}" height="${s}" rx="12"/><circle cx="${s*.7}" cy="${s*.28}" r="${s*.09}"/><path d="M 5 ${s*.78} L ${s*.33} ${s*.45} L ${s*.62} ${s*.76} L ${s*.78} ${s*.59} L ${s-5} ${s*.8}"/></g><text x="${x}" y="${y+s/2+22}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#50544d">Image placeholder</text><text x="${x}" y="${y+s/2+57}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#686b64">${ratio.replace('-', ':')} · Replace with your image</text></svg>`;
  await writeFile(join(destination, `placeholder-${ratio}.webp`), await sharp(Buffer.from(svg)).webp({quality:85}).toBuffer());
}
