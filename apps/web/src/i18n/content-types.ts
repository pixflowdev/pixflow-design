import type { PromptTemplateSummary } from '../types';

type LocalizedSkillCopy = { description?: string; examplePrompt?: string };
type LocalizedPromptTemplateCopy = Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>;
export type LocalizedContentIds = {
  skills: string[];
  designSystems: string[];
  designSystemCategories: string[];
  promptTemplates: string[];
  promptTemplateCategories: string[];
  promptTemplateTags: string[];
};
export type LocalizedContentBundle = {
  skillCopy: Record<string, LocalizedSkillCopy>;
  designSystemSummaries: Record<string, string>;
  designSystemCategories: Record<string, string>;
  promptTemplateCategories: Record<string, string>;
  promptTemplateTags: Record<string, string>;
  promptTemplateCopy: Record<string, LocalizedPromptTemplateCopy>;
};

