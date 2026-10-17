import type { ConnectorDetail } from '@open-design/contracts';

/** Shared connector discovery helpers; independent of the Pro Workspace. */
export function isTrustedConnectorCallbackOrigin(origin: string, currentOrigin?: string): boolean {
  const expectedOrigin = currentOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return false;
  }
}

export function sortConnectorsForDisplay(connectors: ConnectorDetail[]): ConnectorDetail[] {
  return [...connectors].sort((a, b) => {
    const aConnected = a.status === 'connected';
    const bConnected = b.status === 'connected';
    if (aConnected !== bConnected) return aConnected ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}

function normalizedSearchValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function scoreConnectorText(value: string | undefined, query: string, baseScore: number): number | null {
  const normalized = normalizedSearchValue(value);
  if (!normalized) return null;
  if (normalized === query) return baseScore;
  if (normalized.startsWith(query)) return baseScore + 1;
  if (normalized.includes(query)) return baseScore + 2;
  return null;
}

export function getConnectorSearchScore(connector: ConnectorDetail, query: string): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const scores: number[] = [];
  const collect = (value: string | undefined, baseScore: number) => {
    const score = scoreConnectorText(value, normalizedQuery, baseScore);
    if (score !== null) scores.push(score);
  };

  // Connector identity fields carry the most intent: exact and prefix
  // name/provider matches should beat incidental mentions elsewhere.
  collect(connector.name, 0);
  collect(connector.provider, 0);

  // Secondary connector metadata is still searchable, but lower priority.
  collect(connector.category, 3);
  collect(connector.accountLabel, 3);

  // Tool names/titles are more relevant than prose descriptions, but below
  // connector-level identity matches.
  for (const tool of connector.tools) {
    collect(tool.title, 5);
    collect(tool.name, 5);
  }

  // Prose descriptions are broad and often mention other products, so they
  // are intentionally down-ranked rather than excluded.
  collect(connector.description, 8);
  for (const tool of connector.tools) {
    collect(tool.description, 8);
  }

  return scores.length ? Math.min(...scores) : null;
}

export function sortConnectorsForSearch(
  connectors: ConnectorDetail[],
  query: string,
): ConnectorDetail[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sortConnectorsForDisplay(connectors);

  return [...connectors]
    .map((connector) => ({ connector, score: getConnectorSearchScore(connector, normalizedQuery) }))
    .filter((entry): entry is { connector: ConnectorDetail; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const aConnected = a.connector.status === 'connected';
      const bConnected = b.connector.status === 'connected';
      if (aConnected !== bConnected) return aConnected ? -1 : 1;
      return (
        a.connector.name.localeCompare(b.connector.name, undefined, { sensitivity: 'base' }) ||
        a.connector.id.localeCompare(b.connector.id)
      );
    })
    .map((entry) => entry.connector);
}

