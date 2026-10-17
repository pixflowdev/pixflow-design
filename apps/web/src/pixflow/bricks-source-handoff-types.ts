/** Representation-neutral HTML source metadata used at the converter handoff. */
export type PixflowBricksSourceMetadata = {
  format: 'single_html' | 'split_html_css_js' | 'inline_recovered';
  sourcePath: string | null;
  compiledPath: string | null;
  htmlPath: string | null;
  cssPath: string | null;
  jsPath: string | null;
  sourceFidelityClone?: boolean;
  daemonSourceMirror?: boolean;
};

/** Canonical evidence attached to an ordinary Build handoff. */
export type PixflowBricksBuildEvidence = {
  screenshots: string[];
  reports: {
    promptBundle: string | null;
    contextCompleteness: string | null;
    designPlan: string | null;
    qualityGate: string | null;
  };
  visualGate: {
    attempted: boolean;
    completed: boolean;
    screenshotCount: number;
    repaired: boolean;
  } | null;
  qualityGate: unknown;
};
