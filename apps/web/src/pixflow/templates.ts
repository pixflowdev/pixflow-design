import { requestWordPressRest } from './license';

export type PixflowTemplateSummary = {
  id: number;
  title: string;
  slug: string;
  thumbnailUrl: string;
  sectionType: string;
  templateRole: string;
  selectionBlurb: string;
  complexity: string;
  tags: string[];
  pageTypes: string[];
  updatedAt: string;
};

export type PixflowTemplateDetail = PixflowTemplateSummary & {
  insertable: boolean;
  payload: unknown[];
  globalClasses: unknown[];
  unsupportedReason: string;
};

export type PixflowTemplatesListResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  templates?: PixflowTemplateSummary[];
};

export type PixflowTemplateDetailResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  template?: PixflowTemplateDetail;
};

export type PixflowTemplateInsertResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  postId?: number;
  count?: number;
  total?: number;
};

export async function fetchPixflowTemplates(): Promise<PixflowTemplatesListResponse> {
  // Pixflow-owned: route template catalog access through WordPress so licensing
  // and remote credentials stay server-side.
  const response = await requestWordPressRest<PixflowTemplatesListResponse>('templates/list');
  return response.body;
}

export async function fetchPixflowTemplateDetail(templateId: number): Promise<PixflowTemplateDetailResponse> {
  const response = await requestWordPressRest<PixflowTemplateDetailResponse>('templates/detail', {
    method: 'POST',
    body: { templateId },
  });
  return response.body;
}

export async function insertPixflowTemplate(input: {
  templateId: number;
  renameClass?: string;
  replaceExisting?: boolean;
}): Promise<PixflowTemplateInsertResponse> {
  const response = await requestWordPressRest<PixflowTemplateInsertResponse>('templates/insert', {
    method: 'POST',
    body: input,
  });
  return response.body;
}
