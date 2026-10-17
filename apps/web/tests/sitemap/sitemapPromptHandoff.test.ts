/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  readDirectSitemapPromptHandoff,
  writeDirectSitemapPromptHandoff,
} from '../../src/components/sitemap/lib/sitemapPromptHandoff';

describe('sitemapPromptHandoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips sitemap brief context and stage chip metadata for Prototype handoff', () => {
    writeDirectSitemapPromptHandoff({
      version: 1,
      createdAt: 123,
      targetWpPostId: 42,
      pipeline: 'pixflow_generation_stage_a',
      prompt: 'Create the Contact page.',
      pageTitle: 'Contact',
      sitemapBrief: {
        version: 1,
        updatedAt: '2026-07-01T12:00:00.000Z',
        websiteType: 'SEO agency',
        primaryPurpose: 'Book discovery calls',
        audience: 'Blackpool businesses',
        confidence: 'medium',
        briefMarkdown: '# Sitemap Brief\nSocial Pulse Digital.',
      },
      sitemapBriefMarkdown: '# Sitemap Brief\nSocial Pulse Digital.',
      stageChip: {
        kind: 'sitemap_brief',
        label: 'Sitemap brief',
        detail: 'SEO agency',
      },
      pageIntentContract: {
        pageTitle: 'Contact',
      },
      pixflowDesignRecipe: null,
    });

    const handoff = readDirectSitemapPromptHandoff((value) => Number(value || 0));

    expect(handoff).toEqual(expect.objectContaining({
      targetWpPostId: 42,
      pipeline: 'pixflow_generation_stage_a',
      prompt: 'Create the Contact page.',
      pageTitle: 'Contact',
      sitemapBrief: expect.objectContaining({
        websiteType: 'SEO agency',
        primaryPurpose: 'Book discovery calls',
      }),
      sitemapBriefMarkdown: '# Sitemap Brief\nSocial Pulse Digital.',
      stageChip: {
        kind: 'sitemap_brief',
        label: 'Sitemap brief',
        detail: 'SEO agency',
      },
      pageIntentContract: expect.objectContaining({
        pageTitle: 'Contact',
      }),
    }));
  });
});
