import { requestWordPressRest } from './license';

export type PixflowResourcePackOperationStatus =
  | 'queued'
  | 'downloading'
  | 'validating'
  | 'extracting'
  | 'activating'
  | 'deleting'
  | 'repairing'
  | 'complete'
  | 'failed';

export type PixflowResourcePackOperation = {
  id: string;
  slug: string;
  action: string;
  status: PixflowResourcePackOperationStatus | string;
  progress: number;
  message: string;
  updatedAt?: number;
};

export type PixflowResourcePack = {
  slug: string;
  type: string;
  name: string;
  description: string;
  channel: string;
  version: string;
  revision?: string;
  size: number;
  licenseRequired: boolean;
  optional: boolean;
  recommended: boolean;
  retired?: boolean;
  installed: boolean;
  installedVersion: string;
  status: string;
  needsUpdate: boolean;
  compatibility?: {
    minPluginVersion?: string;
    maxPluginVersion?: string;
  };
  operation?: PixflowResourcePackOperation | null;
};

export function pixflowResourcePacksMissingInitially(
  catalog: PixflowResourcePackCatalog | null | undefined,
): PixflowResourcePack[] {
  return (catalog?.packs ?? []).filter(
    (pack) => !pack.retired && (!pack.installed || pack.status === 'repair-needed'),
  );
}

export function pixflowResourcePackAttentionCount(
  catalog: PixflowResourcePackCatalog | null | undefined,
): number {
  return (catalog?.packs ?? []).filter(
    (pack) => !pack.installed || pack.status === 'repair-needed' || pack.needsUpdate,
  ).length;
}

export type PixflowDownloadCounts = {
  available: number;
  installed: number;
  updates: number;
};

/** Counts the Bridge and resource packs as one Downloads catalogue. */
export function pixflowDownloadCounts(
  catalog: PixflowResourcePackCatalog | null | undefined,
  bridge: { installed: boolean; needsUpdate: boolean },
): PixflowDownloadCounts {
  const packs = catalog?.packs ?? [];
  return {
    available: packs.length + 1,
    installed: packs.filter((pack) => pack.installed).length + (bridge.installed ? 1 : 0),
    updates: packs.filter((pack) => pack.installed && pack.needsUpdate && pack.status !== 'repair-needed').length
      + (bridge.needsUpdate ? 1 : 0),
  };
}

export type PixflowResourcePackCatalog = {
  manifest?: {
    schemaVersion?: string;
    product?: string;
    generatedAt?: string;
    sourceUrl?: string;
    minimumPluginVersion?: string;
  };
  packs: PixflowResourcePack[];
  operations?: Record<string, PixflowResourcePackOperation>;
  bridgeMirror?: {
    required?: boolean;
    canonicalOwner?: string;
    status?: string;
    message?: string;
  };
  migration?: {
    legacyBundledResourcesDetected?: boolean;
    preserves?: string[];
  };
};

type ResourcePackMutationResponse = {
  ok?: boolean;
  pack?: PixflowResourcePack;
  operation?: PixflowResourcePackOperation | null;
  status?: string;
  error?: { message?: string };
};

export async function fetchPixflowResourcePacks(refresh = false): Promise<PixflowResourcePackCatalog> {
  const response = await requestWordPressRest<PixflowResourcePackCatalog>(
    `resource-packs${refresh ? '?refresh=true' : ''}`,
  );
  if (!response.ok) {
    throw new Error('Could not load Pixflow resource packs.');
  }

  return {
    ...response.body,
    packs: Array.isArray(response.body.packs) ? response.body.packs : [],
  };
}

export async function mutatePixflowResourcePack(
  slug: string,
  action: 'install' | 'update' | 'repair' | 'delete',
): Promise<ResourcePackMutationResponse> {
  const path = action === 'delete'
    ? `resource-packs/${encodeURIComponent(slug)}`
    : `resource-packs/${encodeURIComponent(slug)}/${action}`;
  const method = action === 'delete' ? 'DELETE' : 'POST';
  const response = await requestWordPressRest<ResourcePackMutationResponse>(path, { method });
  if (!response.ok) {
    const message = response.body?.error?.message || `Resource pack ${action} failed.`;
    throw Object.assign(new Error(message), { response: response.body });
  }

  return response.body;
}
