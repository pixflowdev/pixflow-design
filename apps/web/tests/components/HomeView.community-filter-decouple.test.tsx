// @vitest-environment jsdom

// Red spec for the example-chip ↔ Community filter decoupling.
//
// The hero chip rail (Prototype / Slide deck / ...) and the Community
// grid expose the same artifact taxonomy, but they are independent
// surfaces: picking a chip drives what the composer will generate,
// while the Community pills only filter the gallery the user is
// browsing. Binding them means any chip interaction (including the
// default active chip on first paint) silently rewrites the user's
// browsing filter — so the gallery must stay on its own selection.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
const wpContext = vi.hoisted(() => ({ active: false }));
vi.mock('../../src/pixflow/wordpress-context', async (original) => ({ ...(await original<typeof import('../../src/pixflow/wordpress-context')>()), hasPixflowWordPressContext: () => wpContext.active }));

function makeHomePlugin(id: string, mode: string) {
  return {
    id,
    title: id,
    version: '1.0.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title: id,
      version: '1.0.0',
      description: `${id} fixture`,
      od: { kind: 'scenario', taskKind: 'new-generation', mode },
    },
  };
}

const PLUGINS = [
  makeHomePlugin('example-web-prototype', 'prototype'),
  makeHomePlugin('example-simple-deck', 'deck'),
];

function ariaSelected(testId: string): string | null {
  return screen.getByTestId(testId).getAttribute('aria-selected');
}

describe('HomeView community filter decoupling', () => {
  afterEach(() => {
    wpContext.active = false;
    vi.unstubAllGlobals();
    cleanup();
  });

  it('retires the Community gallery in WordPress even when a stale catalogue is returned', async () => {
    wpContext.active = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plugins: PLUGINS, skills: [], pro: true, error: null }), {status: 200, headers: {'content-type':'application/json'}})));
    render(<I18nProvider initial="en"><HomeView projects={[]} onSubmit={() => undefined} onOpenProject={() => undefined} onViewAllProjects={() => undefined} /></I18nProvider>);
    await waitFor(() => expect(screen.queryByTestId('plugins-home-pill-category-all')).toBeNull());
    expect(screen.queryByTestId('plugins-home-pill-category-deck')).toBeNull();
  });

  it('keeps the Community category selection independent from the hero type chips', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && (url === '/api/plugins' || url === '/api/plugins?view=summary')) {
        return new Response(JSON.stringify({ plugins: PLUGINS }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    // Home boots with a default active type chip; the Community grid must
    // still come up unfiltered ("All"), not pre-snapped to that chip.
    await waitFor(() => {
      expect(screen.getByTestId('plugins-home-pill-category-deck')).toBeTruthy();
    });
    expect(ariaSelected('plugins-home-pill-category-all')).toBe('true');
    expect(ariaSelected('plugins-home-pill-category-prototype')).toBe('false');

    // Picking another chip drives the composer, not the gallery filter.
    fireEvent.click(await screen.findByTestId('home-hero-rail-deck'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-type-chip').textContent).toContain('Slide deck');
    });
    expect(ariaSelected('plugins-home-pill-category-all')).toBe('true');
    expect(ariaSelected('plugins-home-pill-category-deck')).toBe('false');

    // And the gallery's own pills still work locally.
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-deck'));
    expect(ariaSelected('plugins-home-pill-category-deck')).toBe('true');
  });
});
