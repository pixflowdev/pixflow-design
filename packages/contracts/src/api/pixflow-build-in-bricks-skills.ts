export const PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST_SCHEMA =
  'pixflow.build_skill_manifest.v1' as const;

export type PixflowBuildInBricksSkillOwner =
  | 'build-in-bricks'
  | 'shared-web';

export type PixflowBuildInBricksSkillClassification =
  | 'build-specific'
  | 'audited-representation-neutral';

export type PixflowBuildInBricksSkillManifestEntry = {
  id: string;
  owner: PixflowBuildInBricksSkillOwner;
  classification: PixflowBuildInBricksSkillClassification;
  order: number;
  sourcePath: string;
  revision: string;
  contentFingerprint: string;
};

export type PixflowBuildInBricksSkillManifest = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST_SCHEMA;
  version: 1;
  id: 'build-in-bricks';
  revision: string;
  skills: PixflowBuildInBricksSkillManifestEntry[];
};

/**
 * Canonical Build authority served by the authenticated WordPress plugin.
 * The browser transports this document, but the daemon must independently
 * verify every identity field and the instruction fingerprint before use.
 */
export type PixflowBuildInBricksSkillAuthority = {
  manifestSchema: typeof PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST_SCHEMA;
  manifestRevision: string;
  id: string;
  owner: PixflowBuildInBricksSkillOwner;
  classification: PixflowBuildInBricksSkillClassification;
  order: number;
  revision: string;
  fingerprint: string;
  sourcePath: string;
  transportSourcePath: string;
  instruction: string;
};

export const PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST: PixflowBuildInBricksSkillManifest = {
  schema: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST_SCHEMA,
  version: 1,
  id: 'build-in-bricks',
  revision: '2026-08-22.1',
  skills: [
    {
      id: 'build-in-bricks-html-first',
      owner: 'build-in-bricks',
      classification: 'build-specific',
      order: 1,
      sourcePath: 'wordpress/resources/mcp-skills/bricks/workflows/build-in-bricks-html-first.md',
      revision: '1.1.4',
      // Updated deliberately with the reviewed plugin-owned Markdown. The
      // daemon recomputes this SHA-256 over the canonical LF-normalized
      // instruction before every Local CLI provider launch.
      contentFingerprint: 'sha256:65805af5895334a4a5a0477005c55f1229d34c88cada8d7e0d96586e33f62838',
    },
  ],
};

export type PixflowBuildInBricksSkillResolution = {
  manifest: PixflowBuildInBricksSkillManifest;
  approvedSkillIds: string[];
  rejectedSkillIds: string[];
};

export const PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_SCHEMA =
  'pixflow.bricks_converter_skill_pack.v1' as const;

export const PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_REVISION = '2026-10-10.1' as const;

export const PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FINGERPRINT =
  'sha256:c2f8deac57950676ddd5b169bd0a601e7f7d90db1e1842b30ffc4cf298589557' as const;

export const PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_FILES = [
  'bricks-native-prototype/references/native/bricks-native-prototype.md',
  'bricks-native-prototype/references/native/implementation/artifact-contract.md',
  'bricks-native-prototype/references/native/implementation/layout-and-elements.md',
  'bricks-native-prototype/references/native/implementation/page-flow-and-copy.md',
  'bricks-native-prototype/references/native/implementation/theme-style-and-colors.md',
  'bricks-native-prototype/references/native/implementation/validation-and-repair.md',
  'bricks-native-prototype/SKILL.md',
  'bricks-web-prototype/checklist.md',
  'bricks-web-prototype/references/handoff/bricks-bem-classes.md',
  'bricks-web-prototype/references/handoff/bricks-element-options.md',
  'bricks-web-prototype/references/handoff/bricks-framework-tokens.md',
  'bricks-web-prototype/references/handoff/bricks-handoff-critique.md',
  'bricks-web-prototype/references/handoff/bricks-handoff-qa.md',
  'bricks-web-prototype/references/handoff/bricks-handoff.md',
  'bricks-web-prototype/references/handoff/bricks-header-footer.md',
  'bricks-web-prototype/references/handoff/bricks-json-shape.md',
  'bricks-web-prototype/references/handoff/bricks-layout-structure.md',
  'bricks-web-prototype/references/handoff/bricks-live-builder-context.md',
  'bricks-web-prototype/references/handoff/bricks-motion-animation.md',
  'bricks-web-prototype/references/handoff/bricks-project-style-reuse.md',
  'bricks-web-prototype/references/handoff/bricks-runtime-knowledge.md',
  'bricks-web-prototype/references/handoff/bricks-schema-controls.md',
  'bricks-web-prototype/references/handoff/bricks-style-mapping.md',
  'bricks-web-prototype/references/handoff/bricks-theme-styles.md',
  'bricks-web-prototype/references/handoff/bricks-website-clone.md',
  'bricks-web-prototype/references/handoff/components/accordions-tabs.md',
  'bricks-web-prototype/references/handoff/components/blog-query-taxonomy.md',
  'bricks-web-prototype/references/handoff/components/forms.md',
  'bricks-web-prototype/references/handoff/components/maps-counters-ratings.md',
  'bricks-web-prototype/references/handoff/components/media-icons-video.md',
  'bricks-web-prototype/references/handoff/components/sliders-carousels.md',
  'bricks-web-prototype/references/handoff/components/woocommerce.md',
  'bricks-web-prototype/references/library/library-live-streaming.md',
  'bricks-web-prototype/references/library/library-page-planning.md',
  'bricks-web-prototype/references/library/library-section-assembly.md',
  'bricks-web-prototype/references/README.md',
  'bricks-web-prototype/shared/README.md',
  'bricks-web-prototype/SKILL.md',
] as const;

export type PixflowBricksConverterSkillPackFile = {
  path: string;
  fingerprint: string;
  content: string;
};

/**
 * Plugin-owned converter guidance transported to the local runtime per run.
 * The Bridge package contains no Pixflow skill Markdown and may use this pack
 * only after the daemon has independently verified its closed manifest.
 */
export type PixflowBricksConverterSkillPack = {
  schema: typeof PIXFLOW_BRICKS_CONVERTER_SKILL_PACK_SCHEMA;
  revision: string;
  fingerprint: string;
  sourceRoot: string;
  files: PixflowBricksConverterSkillPackFile[];
};

const APPROVED_OWNERS = new Set<PixflowBuildInBricksSkillOwner>([
  'build-in-bricks',
  'shared-web',
]);

/**
 * Validate a product-owned manifest before it becomes generation authority.
 * Runtime callers must use the exported canonical manifest; accepting a
 * request-supplied manifest would move the trust boundary back to the caller.
 */
export function validatePixflowBuildInBricksSkillManifest(
  manifest: PixflowBuildInBricksSkillManifest,
): PixflowBuildInBricksSkillManifest {
  if (manifest.schema !== PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST_SCHEMA) {
    throw new Error('Unsupported Build in Bricks skill manifest schema.');
  }
  const ids = new Set<string>();
  let priorOrder = -1;
  for (const entry of manifest.skills) {
    if (!entry.id || ids.has(entry.id)) {
      throw new Error(`Duplicate or empty Build skill id: ${entry.id || '(empty)'}.`);
    }
    ids.add(entry.id);
    if (!APPROVED_OWNERS.has(entry.owner)) {
      throw new Error(`Unapproved Build skill owner: ${String(entry.owner)}.`);
    }
    if (
      (entry.owner === 'build-in-bricks' && entry.classification !== 'build-specific')
      || (entry.owner === 'shared-web' && entry.classification !== 'audited-representation-neutral')
    ) {
      throw new Error(`Build skill ${entry.id} has inconsistent ownership metadata.`);
    }
    if (!Number.isInteger(entry.order) || entry.order < 1 || entry.order <= priorOrder) {
      throw new Error('Build skill manifest order must be explicit, unique, and ascending.');
    }
    priorOrder = entry.order;
    if (!/^wordpress\/resources\/mcp-skills\/[a-z0-9._/-]+\.md$/i.test(entry.sourcePath)) {
      throw new Error(`Build skill ${entry.id} has an invalid logical source path.`);
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(entry.contentFingerprint)) {
      throw new Error(`Build skill ${entry.id} has an invalid content fingerprint.`);
    }
  }
  if (manifest.skills.length === 0) {
    throw new Error('Build in Bricks requires at least one approved skill.');
  }
  return manifest;
}

/**
 * Resolve ordinary Build against the closed product manifest. Requested ids
 * are diagnostic input only: an unknown or semantically relevant skill never
 * becomes authority merely because a caller supplied it.
 */
export function resolvePixflowBuildInBricksSkillManifest(
  requestedSkillIds: readonly string[] = [],
): PixflowBuildInBricksSkillResolution {
  const manifest = validatePixflowBuildInBricksSkillManifest(
    PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  );
  const approvedSkillIds = manifest.skills.map((entry) => entry.id);
  const approved = new Set(approvedSkillIds);
  const rejectedSkillIds = Array.from(new Set(
    requestedSkillIds
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0 && !approved.has(id)),
  ));
  return { manifest, approvedSkillIds, rejectedSkillIds };
}
