export type PixflowWebsiteCloneResourceRole = 'stylesheet' | 'font' | 'image' | 'media' | 'script';

export type PixflowWebsiteCloneSourceRequest = {
  url: string;
  waitMs?: number;
  projectId?: string;
};

export type PixflowWebsiteCloneCapturedResource = {
  originalUrl: string;
  path: string;
  role: PixflowWebsiteCloneResourceRole;
  contentType: string;
  byteLength: number;
  sha256: string;
  base64: string;
};

export type PixflowWebsiteCloneResourceDecision = {
  url: string;
  retain: boolean;
  role: PixflowWebsiteCloneResourceRole | null;
  reason: string;
};

export type PixflowWebsiteCloneAcquisitionManifest = {
  schema: 'pixflow.website_clone.source.v1';
  version: 1;
  requestedUrl: string;
  finalUrl: string;
  capturedAt: string;
  canonicalPath: string;
  inputKind: 'document_bundle';
  sourceFidelityClone: true;
  retained: PixflowWebsiteCloneResourceDecision[];
  excluded: PixflowWebsiteCloneResourceDecision[];
  warnings: string[];
};

export type PixflowWebsiteCloneSourceResponse = {
  ok: boolean;
  html?: string;
  canonicalPath?: string;
  resources?: PixflowWebsiteCloneCapturedResource[];
  manifest?: PixflowWebsiteCloneAcquisitionManifest;
  message?: string;
};
