import { requestWordPressRest } from './license';

export type PixflowWordPressPageTarget = {
  id: number;
  title: string;
  status: string;
  builderUrl: string | null;
  editLink: string | null;
};

export type PixflowWordPressPagesResponse = {
  pages?: PixflowWordPressPageTarget[];
  message?: string;
};

export type PixflowWordPressPageCreateResponse = {
  page?: PixflowWordPressPageTarget;
  message?: string;
};

export type PixflowCurrentBuilderPageResponse = {
  page?: PixflowWordPressPageTarget | null;
  message?: string;
};

export function resolvePixflowCurrentBuilderPageTarget({
  current,
  pages,
  builderPostId,
}: {
  current: PixflowWordPressPageTarget | null;
  pages: PixflowWordPressPageTarget[];
  builderPostId: number | null;
}): PixflowWordPressPageTarget | null {
  const activePostId = Number(builderPostId || 0);
  if (Number.isFinite(activePostId) && activePostId > 0) {
    const builderPage = pages.find((page) => page.id === Math.trunc(activePostId));
    if (builderPage) return builderPage;
  }
  return current?.id ? current : null;
}

// Pixflow-owned: the Handoff to Bricks target picker needs a small, scoped
// WordPress page catalogue without exposing the WP REST nonce to the bridge app.
export async function fetchPixflowWordPressPages(): Promise<PixflowWordPressPageTarget[]> {
  const response = await requestWordPressRest<PixflowWordPressPagesResponse>('bricks/pages');
  if (!response.ok) {
    throw new Error(response.body?.message || 'Could not load WordPress pages.');
  }
  return response.body?.pages ?? [];
}

export async function createPixflowWordPressPage(title: string): Promise<PixflowWordPressPageTarget> {
  const response = await requestWordPressRest<PixflowWordPressPageCreateResponse>('bricks/pages/create', {
    method: 'POST',
    body: { title },
  });
  if (!response.ok || !response.body?.page) {
    throw new Error(response.body?.message || 'Could not create the WordPress page.');
  }
  return response.body.page;
}

export async function fetchPixflowCurrentBuilderPage(): Promise<PixflowWordPressPageTarget | null> {
  const response = await requestWordPressRest<PixflowCurrentBuilderPageResponse>('bricks/pages/current', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(response.body?.message || 'Could not load the current builder page.');
  }
  return response.body?.page ?? null;
}
