export type InspectDesignSystemWebsiteRequest = {
  url: string;
};

export type DesignSystemWebsiteEvidence = {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  colors: string[];
  fonts: string[];
  cssVariables: Array<{ name: string; value: string }>;
  imageUrls: string[];
  stylesheetUrls: string[];
  evidenceMarkdown: string;
};

export type InspectDesignSystemWebsiteResponse = {
  evidence: DesignSystemWebsiteEvidence;
};
