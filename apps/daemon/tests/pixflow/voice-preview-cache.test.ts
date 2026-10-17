import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
vi.mock('../../src/pixflow/voice-preview-samples.js',()=>({VOICE_PREVIEW_SAMPLES:{cove:{file:'cove.test.wav',sha256:createHash('sha256').update('RIFF0000WAVEtest').digest('hex')}}}));
import { cachedVoiceSample } from '../../src/pixflow/voice-preview-cache.js';
const directories: string[]=[];
async function directory(){const value=await fs.mkdtemp(path.join(os.tmpdir(),'voice-cache-test-'));directories.push(value);return value;}
afterEach(async()=>{await Promise.all(directories.splice(0).map(dir=>fs.rm(dir,{recursive:true,force:true})));});
it('shares a cold download and reuses the verified disk sample while offline',async()=>{
 const dir=await directory();const bytes=Buffer.from('RIFF0000WAVEtest');const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
 const results=await Promise.all([cachedVoiceSample('cove',dir,request),cachedVoiceSample('cove',dir,request)]);
 expect(results).toEqual([bytes,bytes]);expect(request).toHaveBeenCalledOnce();
 expect(request.mock.calls[0]?.[0]).toBe('https://cdn.oaistatic.com/assets/cove.test.wav');
 expect(request.mock.calls[0]?.[1]).toMatchObject({credentials:'omit',redirect:'error'});
 const offline=vi.fn<typeof fetch>().mockRejectedValue(new Error('Offline'));
 expect(await cachedVoiceSample('cove',dir,offline)).toEqual(bytes);expect(offline).not.toHaveBeenCalled();
});
it('rejects unsupported voices, modified downloads and oversized responses without caching failures',async()=>{
 const dir=await directory();const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('modified'));
 expect(await cachedVoiceSample('../cove',dir,request)).toBeNull();expect(request).not.toHaveBeenCalled();
 expect(await cachedVoiceSample('cove',dir,request)).toBeNull();
 request.mockResolvedValueOnce(new Response('bad',{headers:{'content-length':'4000001'}}));
 expect(await cachedVoiceSample('cove',dir,request)).toBeNull();
 request.mockResolvedValueOnce(new Response('RIFF0000WAVEtest'));
 expect(await cachedVoiceSample('cove',dir,request)).toEqual(Buffer.from('RIFF0000WAVEtest'));
 expect(request).toHaveBeenCalledTimes(3);
});
it('repairs a corrupted disk sample using its pinned public asset',async()=>{
 const dir=await directory();const request=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('RIFF0000WAVEtest'));
 await cachedVoiceSample('cove',dir,request);
 const cache=path.join(dir,'voice-previews');const files=await fs.readdir(cache);await fs.writeFile(path.join(cache,files[0]!),'corrupted');
 expect(await cachedVoiceSample('cove',dir,request)).toEqual(Buffer.from('RIFF0000WAVEtest'));
 expect(request).toHaveBeenCalledTimes(2);
});
