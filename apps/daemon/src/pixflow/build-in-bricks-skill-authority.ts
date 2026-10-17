import { createHash } from 'node:crypto';

import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  validatePixflowBuildInBricksSkillManifest,
  type PixflowBuildInBricksSkillAuthority,
  type PixflowBuildInBricksSkillManifest,
  type PixflowBuildInBricksSkillManifestEntry,
} from '@open-design/contracts';

export type LoadedBuildInBricksSkillAuthority = {
  id: string;
  name: string;
  body: string;
  dir: null;
  logicalSourcePath: string;
  revision: string;
  fingerprint: string;
  owner: PixflowBuildInBricksSkillManifestEntry['owner'];
  classification: PixflowBuildInBricksSkillManifestEntry['classification'];
  order: number;
  mode: 'design-system';
  craftRequires: [];
  critiquePolicy: null;
};

export function canonicalizeBuildSkillContent(value: string): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim() + '\n';
}

export function fingerprintBuildSkillContent(value: string): string {
  return `sha256:${createHash('sha256')
    .update(canonicalizeBuildSkillContent(value), 'utf8')
    .digest('hex')}`;
}

export function assertBuildInBricksRequestedSkillsAllowed(
  requestedSkillIds: readonly unknown[],
  manifest: PixflowBuildInBricksSkillManifest = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
): void {
  validatePixflowBuildInBricksSkillManifest(manifest);
  const allowed = new Set(manifest.skills.map((entry) => entry.id));
  const rejected = Array.from(new Set(
    requestedSkillIds
      .map((id) => typeof id === 'string' ? id.trim() : '')
      .filter((id) => id.length > 0 && !allowed.has(id)),
  ));
  if (rejected.length > 0) {
    throw new Error(
      `BUILD_SKILL_AUTHORITY_REJECTED: ordinary Build cannot load unapproved skill ids: ${rejected.join(', ')}`,
    );
  }
}

/**
 * Validate the canonical Build authority transported from the authenticated
 * WordPress plugin. The plugin owns the Markdown; the Bridge owns no duplicate
 * file and treats every browser-supplied field as untrusted until it matches
 * the daemon's compiled manifest and recomputed instruction fingerprint.
 */
export async function loadBuildInBricksSkillAuthorities({
  authority,
  manifest = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
}: {
  authority: PixflowBuildInBricksSkillAuthority | null | undefined;
  manifest?: PixflowBuildInBricksSkillManifest;
}): Promise<LoadedBuildInBricksSkillAuthority[]> {
  validatePixflowBuildInBricksSkillManifest(manifest);
  if (!authority || typeof authority !== 'object') {
    throw new Error('BUILD_SKILL_AUTHORITY_MISSING: WordPress did not supply the canonical Build ability.');
  }
  if (manifest.skills.length !== 1) {
    throw new Error('BUILD_SKILL_AUTHORITY_MANIFEST_UNSUPPORTED: expected one canonical plugin authority.');
  }
  const entry = manifest.skills[0]!;
  const checks: Array<[boolean, string]> = [
    [authority.manifestSchema === manifest.schema, 'MANIFEST_SCHEMA_MISMATCH'],
    [authority.manifestRevision === manifest.revision, 'MANIFEST_REVISION_MISMATCH'],
    [authority.id === entry.id, 'ID_MISMATCH'],
    [authority.owner === entry.owner, 'OWNER_MISMATCH'],
    [authority.classification === entry.classification, 'CLASSIFICATION_MISMATCH'],
    [authority.order === entry.order, 'ORDER_MISMATCH'],
    [authority.revision === entry.revision, 'REVISION_MISMATCH'],
    [authority.sourcePath === entry.sourcePath, 'SOURCE_PATH_MISMATCH'],
    [authority.transportSourcePath === entry.sourcePath, 'TRANSPORT_SOURCE_PATH_MISMATCH'],
    [authority.fingerprint === entry.contentFingerprint, 'DECLARED_HASH_MISMATCH'],
  ];
  for (const [valid, code] of checks) {
    if (!valid) throw new Error(`BUILD_SKILL_AUTHORITY_${code}: ${entry.id}`);
  }
  const body = String(authority.instruction || '').trim();
  if (!body) throw new Error(`BUILD_SKILL_AUTHORITY_EMPTY: ${entry.id}`);
  const fingerprint = fingerprintBuildSkillContent(body);
  if (fingerprint !== entry.contentFingerprint || fingerprint !== authority.fingerprint) {
    throw new Error(
      `BUILD_SKILL_AUTHORITY_HASH_MISMATCH: ${entry.id} expected ${entry.contentFingerprint} but resolved ${fingerprint}`,
    );
  }
  return [{
    id: entry.id,
    name: entry.id,
    body,
    dir: null,
    logicalSourcePath: entry.sourcePath,
    revision: entry.revision,
    fingerprint,
    owner: entry.owner,
    classification: entry.classification,
    order: entry.order,
    mode: 'design-system',
    craftRequires: [],
    critiquePolicy: null,
  }];
}
