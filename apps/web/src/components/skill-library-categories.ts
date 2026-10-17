import type { Dict } from '../i18n/types';

/** Display taxonomy for the curated library; never changes skill IDs or instructions. */
export const skillLibraryCategories = {
  design: { label: 'connectors.category.design', skills: ['brand-kit', 'colour-contrast', 'distinctive-web-design', 'interface-polish', 'responsive-layout', 'web-typography'] },
  planning: { label: 'skillLibrary.categoryPlanning', skills: ['design-brief', 'site-structure-navigation'] },
  motion: { label: 'chat.designToolbox.badge.motion', skills: ['website-animation', 'motion-review'] },
  content: { label: 'manualEdit.tabContent', skills: ['website-copywriting', 'comparison-pages', 'content-strategy', 'interface-copy'] },
  marketing: { label: 'connectors.category.marketing', skills: ['ab-experiments', 'analytics-conversions', 'forms-lead-capture', 'landing-page-optimisation', 'popups-banners', 'pricing-comparisons'] },
  seo: { label: 'skillLibrary.categorySeo', skills: ['data-driven-pages', 'structured-data', 'seo-safe-redesign'] },
  quality: { label: 'automations.filterQuality', skills: ['accessibility-repair', 'component-stress-testing', 'multilingual-rtl', 'web-performance', 'website-audit', 'wordpress-debugging'] },
  images: { label: 'designFiles.sectionImages', skills: ['product-images'] },
  other: { label: 'newproj.tabOther', skills: [] },
} satisfies Record<string, { label: keyof Dict; skills: string[] }>;

export type SkillLibraryCategory = keyof typeof skillLibraryCategories;
export function skillLibraryCategory(id: string): SkillLibraryCategory {
  for (const [category, entry] of Object.entries(skillLibraryCategories)) {
    if ((entry.skills as string[]).includes(id)) return category as SkillLibraryCategory;
  }
  return 'other';
}
