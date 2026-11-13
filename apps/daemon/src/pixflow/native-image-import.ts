import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PixflowDirectSiteRunRequest } from '@open-design/contracts';

export async function importNativeImage(item: Record<string, unknown>, threadId: string, codexHome: string | undefined,
  session: PixflowDirectSiteRunRequest['session'], signal: AbortSignal) {
  let encoded = typeof item.result === 'string' ? item.result : '';
  if (!encoded && typeof item.savedPath === 'string') {
    if (!/^[\da-f-]{36}$/i.test(threadId)) throw new Error('Invalid image session.');
    const directory = await fs.realpath(path.join(codexHome || path.join(os.homedir(), '.codex'), 'generated_images', threadId));
    const file = await fs.realpath(item.savedPath);
    if (path.dirname(file) !== directory || (await fs.stat(file)).size > 32 * 1024 * 1024) throw new Error('Invalid generated image path or size.');
    encoded = (await fs.readFile(file)).toString('base64');
  }
  if (!encoded || encoded.length > 45_000_000) throw new Error('Codex did not return a usable image.');
  const bytes = Buffer.from(encoded, 'base64');
  const format = bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 ? 'jpeg'
    : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' ? 'webp' : null;
  if (!format) throw new Error('Unsupported generated image format.');
  const response = await fetch(session.endpoint, {method:'POST', redirect:'error',
    signal:AbortSignal.any([signal, AbortSignal.timeout(45000)]),
    headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json',Origin:new URL(session.endpoint).origin},
    body:JSON.stringify({tool:'media.import',arguments:{contentBase64:encoded,mimeType:'image/'+format,
      filename:'generated-image.'+format,title:'Generated image',source:'generated'}})});
  if (!response.ok) throw new Error('WordPress declined the generated image (HTTP '+response.status+').');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object') throw new Error('Invalid WordPress Media receipt.');
  const media = value as Record<string, unknown>;
  if (!Number.isSafeInteger(media.attachmentId) || Number(media.attachmentId) <= 0 || typeof media.url!=='string' || typeof media.libraryUrl!=='string') throw new Error('WordPress did not confirm the Media library item.');
  return {attachmentId:Number(media.attachmentId),url:media.url,libraryUrl:media.libraryUrl,title:String(media.title||'')};
}
