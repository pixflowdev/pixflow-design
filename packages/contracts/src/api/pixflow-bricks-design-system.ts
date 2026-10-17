import type { PixflowFrameworkDesignSystemProfile } from './pixflow-framework-design-system.js';
export interface PixflowBricksDesignSystem {
  id: string;
  title: string;
  summary: string;
  revision: number;
  updatedAt: string;
  profile: PixflowFrameworkDesignSystemProfile;
  history?: Omit<PixflowBricksDesignSystem, 'history'>[];
}

export type PixflowDesignSystem = PixflowBricksDesignSystem;
export interface PixflowGutenbergSystemPreview {
  theme: string;
  css: string;
  fingerprint: string;
  previousCss: string;
  manuallyEdited: boolean;
  presetCount: number;
  activeSystem: { id: string; revision: number } | null;
}
export interface PixflowGutenbergSystemResult {
  ok: boolean;
  state: { theme: string; fingerprint: string; history?: unknown[]; activeSystem?: { id: string; revision: number } | null };
}
export interface PixflowElementorSystemPreview {
  css: string;
  kitId: number;
  globals: { custom_colors: Array<{ _id: string; title: string; color: string }>; custom_typography: Array<{ _id: string; title: string; typography_font_family: string }> };
  previousGlobals: PixflowElementorSystemPreview['globals'];
  fingerprint: string;
  previousCss: string;
  manuallyEdited: boolean;
  activeSystem: { id: string; revision: number } | null;
}
export interface PixflowElementorSystemResult {
  ok: boolean;
  state: { kitId: number; css?: string; fingerprint: string; history?: unknown[]; activeSystem?: { id: string; revision: number } | null };
}
export interface PixflowEtchSystemPreview {
  css: string;
  name: string;
  fingerprint: string;
  sheetId: string | null;
  previousCss: string;
  manuallyEdited: boolean;
  existingStylesheets: string[];
  activeSystem: { id: string; revision: number } | null;
}
export interface PixflowEtchSystemResult {
  ok: boolean;
  sheetId: string;
  sheet: { name: string; css: string; type: string };
  state: { fingerprint: string; history?: unknown[]; activeSystem?: { id: string; revision: number } | null };
}
