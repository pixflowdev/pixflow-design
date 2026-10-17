export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_SCHEMA = 'pixflow.build_in_bricks.source_index.v1' as const;

export type PixflowBuildInBricksSourceScope = 'full_page' | 'section' | 'component';

export type PixflowBuildInBricksSourceFile = {
  path: string;
  hash: string;
  required: boolean;
};

export type PixflowBuildInBricksSourceIndexEntry = {
  sourceId: string;
  version: number;
  projectId: string;
  targetPostId: number;
  scope: PixflowBuildInBricksSourceScope;
  fragmentNamespace: string | null;
  placement: Record<string, unknown> | null;
  files: {
    html: PixflowBuildInBricksSourceFile;
    css: PixflowBuildInBricksSourceFile;
    js: PixflowBuildInBricksSourceFile | null;
  };
  sourceHash: string;
  convertedElementIds: string[];
  convertedGlobalClassIds: string[];
  /**
   * Canonical identity of the currently accepted Pixflow-owned native Bricks
   * subtree. It deliberately excludes unrelated page elements so a scoped
   * follow-up is not blocked by edits outside Pixflow ownership.
   */
  nativeContentFingerprint?: string | null;
  nativeContentFingerprintAlgorithm?: 'pixflow-owned-bricks-subtree-v1' | null;
  handoffId: string | null;
  runId: string | null;
  contextRevision: string;
  /** Effective Bricks Theme Style snapshot used for generation/review/repair. */
  themeStyleSnapshotHash?: string | null;
  skillVersion: string;
  status: 'active' | 'superseded' | 'stale' | 'conflict';
  createdAt: string;
  updatedAt: string;
  lastSuccessfulConversionAt: string;
  previousSourceId: string | null;
};

export type PixflowBuildInBricksSourceIndex = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_SCHEMA;
  version: 1;
  updatedAt: string;
  entries: PixflowBuildInBricksSourceIndexEntry[];
};

export type PixflowBuildInBricksSourceLookupStatus =
  | 'available'
  | 'missing'
  | 'stale'
  | 'ambiguous'
  | 'conflict'
  | 'unsupported_legacy';

export type PixflowBuildInBricksSourceLookup = {
  status: PixflowBuildInBricksSourceLookupStatus;
  entry: PixflowBuildInBricksSourceIndexEntry | null;
  message: string;
  /** Independent retained-source conflicts; callers must not collapse Theme Style drift into native-content drift. */
  conflicts?: Array<
    | 'native_content_drift'
    | 'native_verification_unavailable'
    | 'theme_style_drift'
    | 'theme_style_verification_unavailable'
    | 'legacy_page_content_drift'
  >;
};
