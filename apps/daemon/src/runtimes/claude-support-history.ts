import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeSupportStages, type ClaudeSupportStage } from '@open-design/contracts';

type Event = { at: string; stage: ClaudeSupportStage; exitCode?: number };
type Row = Event & { site: string; source: 'desktop' | 'cli' | null };
const retention = 7 * 86400 * 1000;
const siteHash = (site: string) => createHash('sha256').update(site).digest('hex');

/** Contains only events emitted by the Pixflow-owned Claude login child. */
export class ClaudeSupportHistory {
  private path: string;
  private writeFailed = false;
  constructor(dataDir: string) { this.path = join(dataDir, 'pixflow-claude-support.json'); }
  private read(): Row[] {
    let stat;
    try { stat = lstatSync(this.path); } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []; throw err; }
    if (!stat.isFile() || stat.size > 96 * 1024) throw new Error('Support history unavailable');
    const data: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Invalid support history');
    const now = Date.now();
    return data.slice(-128).filter(r => r && /^[a-f0-9]{64}$/.test(r.site) && claudeSupportStages.includes(r.stage)
      && [null,'desktop','cli'].includes(r.source) && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at))
      && new Date(r.at).toISOString() === r.at && Date.parse(r.at) >= now-retention && Date.parse(r.at) <= now
      && (r.exitCode == null || Number.isInteger(r.exitCode)))
      .map(({ site, source, at, stage, exitCode }) => ({ site, source, at, stage, ...(exitCode != null ? {exitCode} : {}) }));
  }
  append(site: string, source: Row['source'], event: Event) {
    const tmp = this.path + '.' + randomUUID() + '.tmp';
    try {
      const rows = [...this.read(), { ...event, source, site: siteHash(site) }].slice(-128);
      writeFileSync(tmp, JSON.stringify(rows), { flag: 'wx', mode: 0o600 }); renameSync(tmp, this.path);
      this.writeFailed = false;
    } catch { this.writeFailed = true; }
    finally { try { unlinkSync(tmp); } catch { /* Successfully renamed or never created. */ } }
  }
  snapshot(site: string) {
    try {
      const rows = this.read().filter(r => r.site === siteHash(site)).slice(-32);
      return { storage: this.writeFailed ? 'file-unavailable' as const : 'private-file' as const, source: rows.at(-1)?.source ?? null,
        milestones: rows.map(({at, stage, exitCode}) => ({at, stage, ...(exitCode == null ? {} : {exitCode})})) };
    } catch { return { storage: 'file-unavailable' as const, source: null, milestones: [] }; }
  }
}
