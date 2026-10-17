import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migratePlugins } from '../src/plugins/persistence.js';
import { addMarketplace, ensureMarketplaceManifest, getMarketplace, refreshMarketplace, resolvePluginInMarketplaces } from '../src/plugins/marketplaces.js';

let db: Database.Database;
const manifestText = JSON.stringify({ specVersion: '1.0.0', name: 'saved-catalogue', version: '1.0.0', plugins: [{ name: 'saved-skill', source: 'github:owner/saved-skill', version: '1.0.0' }] });
const retiredUrls = [
  'https://open-design.ai/marketplace/open-design-marketplace.json',
  'https://pixflow.dev/plugins/community/open-design-marketplace.json',
  'https://raw.githubusercontent.com/nexu-io/open-design/legacy/branch/plugins/registry/community/open-design-marketplace.json',
  'https://raw.githubusercontent.com/nexu-io/open-design/main/plugins/registry/official/open-design-marketplace.json',
  'https://raw.githubusercontent.com/pixflowdev/pixflow-design/main/plugins/registry/community/open-design-marketplace.json',
];

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);');
  migratePlugins(db);
});
afterEach(() => db.close());

describe('retired inherited catalogues', () => {
  it.each(retiredUrls)('rejects adding %s before any network request', async (url) => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => manifestText }));
    const result = await addMarketplace(db, { url, fetcher });
    expect(result).toMatchObject({ ok: false, status: 410 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(retiredUrls)('preserves saved %s bytes while refusing refresh and new resolution', async (url) => {
    ensureMarketplaceManifest(db, { id: 'saved', url, trust: 'restricted', manifestText, now: 123 });
    const before = getMarketplace(db, 'saved');
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => manifestText }));
    expect(await refreshMarketplace(db, 'saved', fetcher)).toMatchObject({ ok: false, status: 410 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(getMarketplace(db, 'saved')).toEqual(before);
    expect(resolvePluginInMarketplaces(db, 'saved-skill')).toBeNull();
  });

  it.each(['https://personal.example/catalogue.json', 'https://raw.githubusercontent.com/customer/my-catalogue/main/plugins/registry/community/open-design-marketplace.json'])('keeps personal catalogue %s available', async (url) => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => manifestText }));
    const added = await addMarketplace(db, { url, fetcher });
    if (!added.ok) throw new Error(added.message);
    expect(await refreshMarketplace(db, added.row.id, fetcher)).toMatchObject({ ok: true });
    expect(resolvePluginInMarketplaces(db, 'saved-skill')?.source).toBe('github:owner/saved-skill');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
