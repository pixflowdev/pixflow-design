import type { MarketplacePluginEntry } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import { resolveMarketplaceEntryVersion } from '../src/registry/versioning.js';

function entry(versions: MarketplacePluginEntry['versions']): MarketplacePluginEntry {
  return {
    name: 'vendor/example',
    source: 'github:vendor/example@v1.0.0/plugin',
    version: '1.0.0',
    versions,
  } as MarketplacePluginEntry;
}

describe('marketplace npm range compatibility', () => {
  it('locks the minor for a zero-major caret range', () => {
    const resolved = resolveMarketplaceEntryVersion(entry([
      { version: '0.2.0', source: 's020' },
      { version: '0.2.5', source: 's025' },
      { version: '0.3.0', source: 's030' },
    ]), '^0.2.0');

    expect(resolved?.version).toBe('0.2.5');
  });

  it('locks the patch for a zero-major zero-minor caret range', () => {
    const resolved = resolveMarketplaceEntryVersion(entry([
      { version: '0.0.3', source: 's003' },
      { version: '0.0.4', source: 's004' },
    ]), '^0.0.3');

    expect(resolved?.version).toBe('0.0.3');
  });

  it('does not select prereleases for a stable caret range', () => {
    const resolved = resolveMarketplaceEntryVersion(entry([
      { version: '0.2.0', source: 's020' },
      { version: '0.2.1-beta.1', source: 's021b' },
    ]), '^0.2.0');

    expect(resolved?.version).toBe('0.2.0');
  });
});
