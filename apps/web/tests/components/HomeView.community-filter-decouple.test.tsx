// @vitest-environment jsdom

// Retiring discovery preserves the core composer and personal plugin workflows.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
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

  it('retires the gallery in standalone while preserving the composer type chips', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plugins: PLUGINS }), {status: 200, headers: {'content-type':'application/json'}})));
    render(<I18nProvider initial="en"><HomeView projects={[]} onSubmit={() => undefined} onOpenProject={() => undefined} onViewAllProjects={() => undefined} /></I18nProvider>);
    fireEvent.click(await screen.findByTestId('home-hero-rail-deck'));
    await waitFor(() => expect(screen.getByTestId('home-hero-active-type-chip').textContent).toContain('Slide deck'));
    expect(screen.queryByTestId('plugins-home-section')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-deck')).toBeNull();
  });
  it.each([['prototype', 'prototype'], ['deck', 'deck'], ['live-artifact', 'prototype']])(
    'creates %s through core guidance with no catalogue recipes', async (chipId, projectKind) => {
      const onSubmit = vi.fn();
      const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(
        String(url).includes('/apply') ? {
          query: '', contextItems: [], inputs: [], assets: [], mcpServers: [],
          appliedPlugin: { snapshotId: 'core-snapshot', pluginId: 'od-default', taskKind: 'new-generation' },
          projectMetadata: {},
        } : { plugins: [makeHomePlugin('od-default', 'scenario')] },
      ), {status: 200, headers: {'content-type':'application/json'}}));
      vi.stubGlobal('fetch', fetchMock);
      render(<I18nProvider initial="en"><HomeView projects={[]} onSubmit={onSubmit} onOpenProject={() => undefined} onViewAllProjects={() => undefined} /></I18nProvider>);
      fireEvent.click(await screen.findByTestId(`home-hero-rail-${chipId}`));
      await waitFor(() => expect(screen.getByTestId('home-hero-active-type-chip')).toBeTruthy());
      setHomeHeroPrompt('Create a launch presentation for my studio.');
      fireEvent.click(screen.getByTestId('home-hero-submit'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({pluginId: 'od-default', projectKind})));
      expect(screen.queryByTestId('plugins-home-section')).toBeNull();
    },
  );

});
