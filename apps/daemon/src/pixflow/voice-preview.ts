import fs from 'node:fs/promises';
import { codexAppArchiveCandidates } from '../runtimes/executables.js';
import { createRequire } from 'node:module';
import { PIXFLOW_CODEX_VOICES } from '@open-design/contracts';

type AsarEntry = { files?: Record<string, AsarEntry>; offset?: string; size?: number; unpacked?: boolean; link?: string };

// Electron treats .asar paths as virtual directories. Sample offsets require the
// physical archive bytes, so use its unpatched filesystem in packaged runtimes.
const archiveFs: typeof fs = process.versions.electron
  ? (createRequire(import.meta.url)('original-fs') as { promises: typeof fs }).promises
  : fs;

/** Read only a named voice sample from a locally installed app, never a caller-provided path. */
export async function readVoiceSample(archive: string, voice: string): Promise<Buffer | null> {
  if (!(PIXFLOW_CODEX_VOICES as readonly string[]).includes(voice)) return null;
  const file = await archiveFs.open(archive, 'r');
  try {
    const prefix = Buffer.alloc(16); await file.read(prefix,0,16,0);
    const size = prefix.readUInt32LE(12), dataStart = 8 + prefix.readUInt32LE(4);
    if (size < 2 || size > 32_000_000 || dataStart < size + 16) return null;
    const header = Buffer.alloc(size); await file.read(header,0,size,16);
    const tree = JSON.parse(header.toString()) as AsarEntry;
    const assets = tree.files?.webview?.files?.assets?.files;
    const entry = Object.entries(assets ?? {}).find(([name]) => new RegExp(`^${voice}\\.en\\.[a-z0-9-]+\\.wav$`).test(name))?.[1];
    if (!entry || entry.unpacked || entry.link || !entry.size || entry.size > 4_000_000 || !/^\d+$/.test(entry.offset ?? '')) return null;
    const audio = Buffer.alloc(entry.size);
    const result = await file.read(audio,0,audio.length,dataStart+Number(entry.offset));
    return result.bytesRead === audio.length && audio.toString('ascii',0,4)==='RIFF' && audio.toString('ascii',8,12)==='WAVE' ? audio : null;
  } finally { await file.close(); }
}

export async function installedVoiceSample(voice: string): Promise<Buffer | null> {
  if (!(PIXFLOW_CODEX_VOICES as readonly string[]).includes(voice)) return null;
  for (const archive of await codexAppArchiveCandidates()) {
    const audio = await readVoiceSample(archive,voice).catch(()=>null);
    if (audio) return audio;
  }
  return null;
}
