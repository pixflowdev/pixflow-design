import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { VOICE_PREVIEW_SAMPLES } from './voice-preview-samples.js';

const maximumBytes = 4_000_000;
const pending = new Map<string, Promise<Buffer | null>>();

/** Public, hash-pinned samples work without a Codex desktop installation or API key. */
export async function cachedVoiceSample(voice: string, dataDir: string, request: typeof fetch = fetch): Promise<Buffer | null> {
  if (!Object.hasOwn(VOICE_PREVIEW_SAMPLES, voice)) return null;
  const sample = VOICE_PREVIEW_SAMPLES[voice as keyof typeof VOICE_PREVIEW_SAMPLES];
  const directory = path.join(dataDir, 'voice-previews');
  const target = path.join(directory, `${voice}-${sample.sha256}.wav`);
  const valid = (bytes: Buffer) => bytes.length <= maximumBytes && createHash('sha256').update(bytes).digest('hex') === sample.sha256;
  const existing = pending.get(target);
  if (existing) return existing;
  const task = (async () => {
    try {
      if ((await fs.stat(target)).size <= maximumBytes) {
        const bytes = await fs.readFile(target);
        if (valid(bytes)) return bytes;
      }
    } catch { /* A missing or unreadable cache does not prevent playback. */ }
    try {
      const response = await request(`https://cdn.oaistatic.com/assets/${sample.file}`, {
        signal: AbortSignal.timeout(20_000), redirect: 'error', credentials: 'omit',
      });
      if (!response.ok || Number(response.headers.get('content-length')) > maximumBytes || !response.body) return null;
      const chunks: Buffer[] = []; let size = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > maximumBytes) { await reader.cancel(); return null; }
          chunks.push(Buffer.from(next.value));
        }
      } finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks);
      if (!valid(bytes)) return null;
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(temporary, bytes, { flag: 'wx' });
        await fs.rename(temporary, target);
      } catch { /* Storage failures still allow this preview to play. */ }
      finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
      return bytes;
    } catch { return null; }
  })();
  pending.set(target, task);
  try { return await task; } finally { pending.delete(target); }
}
