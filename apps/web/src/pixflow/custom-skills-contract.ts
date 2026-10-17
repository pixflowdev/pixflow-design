import type { ComponentType, Dispatch, SetStateAction } from 'react';
import type { AppConfig } from '../types';

export interface CustomSkillsSectionProps {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  onSkillsRefresh?: () => Promise<void> | void;
  onSkillsChanged?: (affectedSkillId?: string) => void;
}

/** The host retains settings and refresh ownership when the add-on is absent. */
export interface CustomSkillsContribution {
  SkillsSection: ComponentType<CustomSkillsSectionProps>;
}
