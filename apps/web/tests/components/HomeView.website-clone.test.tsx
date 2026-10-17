// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const WEBSITE_CLONE_PLUGIN = {
  id: 'example-web-clone',
  title: 'Website Clone',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/example-web-clone',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/example-web-clone',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'example-web-clone',
    title: 'Website Clone',
    version: '0.1.0',
    description: 'Recreate a public website with an audit trail.',
    od: {
      kind: 'scenario' as const,
      taskKind: 'new-generation' as const,
      mode: 'prototype' as const,
      useCase: { query: 'Clone {{targetUrl}}.' },
      inputs: [
        {
          name: 'targetUrl',
          type: 'string' as const,
          required: true,
          label: 'Public website URL',
        },
      ],
    },
  },
};

describe('HomeView Website Clone recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('recovers the core scenario directly when the mounted catalog summary is stale', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (url === '/api/plugins?view=summary') {
        return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      }
      if (url === '/api/plugins/example-web-clone') {
        return new Response(JSON.stringify(WEBSITE_CLONE_PLUGIN), { status: 200 });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
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

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-type-chip').textContent).toContain('Website Clone');
    });
    expect(screen.queryByText(/Bundled scenario .* is not installed/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/example-web-clone', { cache: 'no-store' });
  });

  it('submits a public URL pasted into the first-class clone composer as targetUrl', async () => {
    const onSubmit = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (url === '/api/plugins?view=summary') {
        return new Response(JSON.stringify({ plugins: [WEBSITE_CLONE_PLUGIN] }), { status: 200 });
      }
      if (url === '/api/plugins/example-web-clone/apply') {
        const request = JSON.parse(String(init?.body || '{}')) as { inputs?: { targetUrl?: string } };
        return new Response(JSON.stringify({
          query: WEBSITE_CLONE_PLUGIN.manifest.od.useCase.query,
          contextItems: [],
          inputs: WEBSITE_CLONE_PLUGIN.manifest.od.inputs,
          assets: [],
          mcpServers: [],
          trust: 'trusted',
          capabilitiesGranted: ['prompt:inject'],
          capabilitiesRequired: ['prompt:inject'],
          appliedPlugin: {
            snapshotId: 'snap-web-clone',
            pluginId: 'example-web-clone',
            pluginVersion: '0.1.0',
            manifestSourceDigest: 'a'.repeat(64),
            inputs: request.inputs,
            resolvedContext: { items: [] },
            capabilitiesGranted: ['prompt:inject'],
            capabilitiesRequired: ['prompt:inject'],
            assetsStaged: [],
            taskKind: 'new-generation',
            appliedAt: 0,
            connectorsRequired: [],
            connectorsResolved: [],
            mcpServers: [],
            status: 'fresh',
          },
          projectMetadata: { kind: 'prototype', intent: 'web-clone' },
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={onSubmit}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    await waitFor(() => expect(screen.getByTestId('home-hero-active-type-chip')).toBeTruthy());
    await setHomeHeroPrompt('https://ramos-app.webflow.io/');
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-clone/apply',
      expect.anything(),
    ));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'https://ramos-app.webflow.io/',
      pluginId: 'example-web-clone',
      pluginInputs: { targetUrl: 'https://ramos-app.webflow.io/' },
    })));
  });
});
