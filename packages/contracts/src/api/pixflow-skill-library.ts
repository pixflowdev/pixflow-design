/** Site-owned optional skills. IDs exposed to composers include an immutable digest. */
export type SkillLibraryAction = 'install' | 'enable' | 'disable' | 'rollback' | 'remove';
export interface SkillLibraryItem {
  id: string;
  name: string;
  description: string;
  version: string;
  installedVersion: string | null;
  enabled: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  canRollback: boolean;
  digest: string | null;
}
export interface SkillLibraryResponse {
  skills: SkillLibraryItem[]; error: string | null; pro: boolean;
  /** Pairs of enabled official skills covering the same work; advisory only. */
  overlaps?: Array<[string, string]>;
}
export interface SkillLibraryMutation { id: string; action: SkillLibraryAction; digest?: string }
/** Verified catalogue package preview; never installs or enables a skill. */
export interface SkillLibraryPreview {
  id: string; name: string; description: string; version: string; digest: string;
  license: string; files: Record<string, string>;
}
