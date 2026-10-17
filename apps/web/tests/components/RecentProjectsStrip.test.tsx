// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFiles: vi.fn(async (projectId: string) => {
    if (projectId === 'project-ds') {
      return [{ name: 'logo.svg', path: 'assets/logo.svg', kind: 'image', mtime: 3 }];
    }
    if (projectId === 'project-html') {
      return [{ name: 'index.html', kind: 'html', mtime: 2 }];
    }
    if (projectId === 'project-deck') {
      return [{ name: 'index.html', kind: 'html', mtime: 2 }];
    }
    return [];
  }),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

describe('RecentProjectsStrip', () => {
  it('matches project cards with previews and design-system tags', async () => {
    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.getByText('Design System')).toBeTruthy();
    expect(screen.getAllByText('Prototype').length).toBeGreaterThan(0);
    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');
    expect(designSystemCard).toBeTruthy();
    expect(designSystemCard?.querySelectorAll('.design-card-tag')).toHaveLength(1);

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-logo img')).toBeTruthy();
      expect(container.querySelector('.recent-projects__card-thumb-html iframe')).toBeTruthy();
    });
  });

  it('renders deck project covers without deck navigation controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => `
          <!doctype html>
          <html>
            <head><title>Deck</title></head>
            <body>
              <section class="slide active">First slide</section>
              <section class="slide">Second slide</section>
              <div class="deck-counter"><button id="deck-prev">‹</button><span>1 / 10</span><button id="deck-next">›</button></div>
              <nav class="page-flip-controls" aria-label="Pagination">01 / 10</nav>
            </body>
          </html>
        `,
      })),
    );

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck' },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const deckCard = container.querySelector('[data-project-id="project-deck"]');
    const htmlCard = container.querySelector('[data-project-id="project-html"]');

    await waitFor(() => {
      const deckIframe = deckCard?.querySelector('iframe') as HTMLIFrameElement | null;
      expect(deckIframe?.getAttribute('srcdoc')).toContain('First slide');
      expect(deckIframe?.getAttribute('srcdoc')).toContain('od-recent-deck-real-preview');
      expect(deckIframe?.getAttribute('srcdoc')).toContain('.page-flip-controls');
      expect(deckIframe?.getAttribute('srcdoc')).toContain('[aria-label="Pagination"]');
      expect(deckIframe?.getAttribute('srcdoc')).not.toContain('<script');
      expect(deckIframe?.getAttribute('src')).toBeNull();
      expect(htmlCard?.querySelector('iframe')?.getAttribute('src')).toBe(
        '/api/projects/project-html/files/index.html',
      );
    });
  });

  it('identifies ordinary Build projects independently from Prototype HTML', () => {
    render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-build',
            name: 'Build landing page',
            metadata: {
              kind: 'prototype',
              intent: 'pixflow_bricks_native_prototype',
              pixflowBricksNativePrototype: true,
            } as unknown as Project['metadata'],
          }),
          project({
            id: 'project-prototype',
            name: 'Standalone prototype',
            metadata: { kind: 'prototype' },
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.getByText('Build in Bricks')).toBeTruthy();
    expect(screen.getByText('Prototype')).toBeTruthy();
  });

  it('does not expose internal Build semantic-preflight projects as recent Prototype designs', () => {
    render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-preflight',
            name: 'Bricks request preflight',
            updatedAt: 10,
            metadata: {
              kind: 'other',
              intent: 'pixflow_bricks_semantic_preflight',
              pixflowInternalProject: true,
            },
          }),
          project({
            id: 'project-build',
            name: 'Build source',
            updatedAt: 9,
            metadata: {
              kind: 'build-in-bricks',
              intent: 'pixflow_build_in_bricks_source',
              pixflowBuildInBricksSource: true,
            },
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.queryByText('Bricks request preflight')).toBeNull();
    expect(screen.getByText('Build source')).toBeTruthy();
    expect(screen.getAllByText('Build in Bricks')).toHaveLength(1);
  });
});
