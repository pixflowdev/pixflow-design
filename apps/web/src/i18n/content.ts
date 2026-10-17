import { CONTENT_LOADERS } from './content-loaders';
import type { LocalizedContentBundle, LocalizedContentIds } from './content-types';
import type {
  DesignSystemSummary,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import type { Locale } from './types';
import { translateLocale } from './locale-runtime';
import { SKILL_DISPLAY_KEYS } from './skill-display';
import { i18nResources } from './resource-store';

const LOCALIZED_CONTENT = i18nResources.content;
const pendingContent = i18nResources.pendingContent;

export function isLocalizedContentLoaded(locale: Locale): boolean {
  const resolved = locale === 'zh-TW' && !CONTENT_LOADERS['zh-TW'] ? 'zh-CN' : locale;
  return !CONTENT_LOADERS[resolved] || Boolean(LOCALIZED_CONTENT[resolved]);
}

/** Fetch only the selected catalogue. Rejected downloads are retryable. */
export function loadLocalizedContent(locale: Locale): Promise<void> {
  const resolved = locale === 'zh-TW' && !CONTENT_LOADERS['zh-TW'] ? 'zh-CN' : locale;
  const loader = CONTENT_LOADERS[resolved];
  if (!loader || LOCALIZED_CONTENT[resolved]) return Promise.resolve();
  const pending = pendingContent.get(resolved);
  if (pending) return pending;
  const request = loader().then((content) => { LOCALIZED_CONTENT[resolved] = content; })
    .finally(() => { pendingContent.delete(resolved); });
  pendingContent.set(resolved, request);
  return request;
}

function buildLocalizedContentIds(content: LocalizedContentBundle): LocalizedContentIds {
  return {
    skills: Object.keys(content.skillCopy),
    designSystems: Object.keys(content.designSystemSummaries),
    designSystemCategories: Object.keys(content.designSystemCategories),
    promptTemplates: Object.keys(content.promptTemplateCopy),
    promptTemplateCategories: Object.keys(content.promptTemplateCategories),
    promptTemplateTags: Object.keys(content.promptTemplateTags),
  };
}

export function getLocalizedContentIds(locale: Locale): LocalizedContentIds | undefined {
  const content = getLocalizedContent(locale);
  return content ? buildLocalizedContentIds(content) : undefined;
}

// True when a locale resolves a built-in-content bundle — either its own
// registered bundle or an intentional script fallback (zh-TW -> zh-CN). When
// false, built-in skill / design-system / prompt-template copy renders in
// English for that locale. Every supported non-English locale should be true.
export function hasLocalizedContent(locale: Locale): boolean {
  return Boolean(CONTENT_LOADERS[locale === 'zh-TW' && !CONTENT_LOADERS['zh-TW'] ? 'zh-CN' : locale]);
}

function getLocalizedContent(locale: Locale): LocalizedContentBundle | undefined {
  const direct = LOCALIZED_CONTENT[locale];
  if (direct) return direct;
  // Traditional Chinese reuses the Simplified Chinese content tables when no
  // dedicated zh-TW bundle exists, matching the zh fallback in
  // `localizedRecordValue` so built-in content stays Chinese instead of
  // silently rendering English.
  if (locale.startsWith('zh')) return LOCALIZED_CONTENT['zh-CN'];
  return undefined;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function localizedRecordValue(
  locale: Locale,
  values: Record<string, string> | undefined,
  options: { includeEnglishFallback?: boolean } = {},
): string | undefined {
  if (!values) return undefined;
  if (values[locale]) return values[locale];
  if (locale === 'zh-TW' && values['zh-CN']) return values['zh-CN'];
  if (locale.startsWith('zh') && values['zh-CN']) return values['zh-CN'];
  if (options.includeEnglishFallback !== false && values.en) return values.en;
  return undefined;
}

type SkillDisplaySummary = Pick<SkillSummary, 'id' | 'name' | 'description'> & Partial<Pick<SkillSummary, 'source' | 'displayName' | 'descriptionI18n'>>;

export function localizeSkillName(locale: Locale, skill: SkillDisplaySummary): string {
  const inline = localizedRecordValue(locale, skill.displayName, { includeEnglishFallback: false });
  if (inline) return inline;
  const key = skill.source !== 'user' ? SKILL_DISPLAY_KEYS[skill.id]?.name : undefined;
  return key ? translateLocale(locale, key) : localizedRecordValue(locale, skill.displayName) ?? skill.name;
}

export function localizeSkillPrompt(locale: Locale, skill: SkillSummary): string | undefined {
  const inline = localizedRecordValue(locale, skill.examplePromptI18n, {
    includeEnglishFallback: false,
  });
  if (inline) return inline;
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.examplePrompt;
  if (translated) return translated;
  const fallback = localizedRecordValue(locale, skill.examplePromptI18n);
  if (fallback) return fallback;
  return skill.examplePrompt ? normalizeText(skill.examplePrompt) : undefined;
}

export function localizeSkillDescription(locale: Locale, skill: SkillDisplaySummary): string {
  const inline = localizedRecordValue(locale, skill.descriptionI18n, {
    includeEnglishFallback: false,
  });
  if (inline) return inline;
  const key = skill.source !== 'user' ? SKILL_DISPLAY_KEYS[skill.id]?.description : undefined;
  if (key) return translateLocale(locale, key);
  if (skill.source === 'user') return normalizeText(localizedRecordValue(locale, skill.descriptionI18n) ?? skill.description);
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.description;
  if (translated) return translated;
  const fallback = localizedRecordValue(locale, skill.descriptionI18n);
  if (fallback) return fallback;
  return normalizeText(skill.description);
}

export function localizeDesignSystemSummary(
  locale: Locale,
  system: DesignSystemSummary,
): string {
  const translated = getLocalizedContent(locale)?.designSystemSummaries[system.id];
  if (translated) return translated;
  return system.summary || system.category || '';
}

export function localizeDesignSystemCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.designSystemCategories[category] ?? category;
}

export function localizePromptTemplateCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.promptTemplateCategories[category] ?? category;
}

export function localizePromptTemplateSummary(
  locale: Locale,
  template: PromptTemplateSummary,
): PromptTemplateSummary {
  const content = getLocalizedContent(locale);
  if (!content) return template;
  const translated = content.promptTemplateCopy[template.id];
  const tags = template.tags?.map((tag) => content.promptTemplateTags[tag] ?? tag);
  return {
    ...template,
    title: translated?.title ?? template.title,
    summary: translated?.summary ?? template.summary,
    category: localizePromptTemplateCategory(locale, template.category || 'General'),
    tags,
  };
}
