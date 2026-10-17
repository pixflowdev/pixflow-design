// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceHomeTurn } from '../../src/components/WorkspaceHomeComposer';
import { HomeView } from '../../src/components/HomeView';

const scenario = vi.hoisted(() => ({
  turn: { prompt: '', attachments: [], comments: [] } as WorkspaceHomeTurn,
  createPage: vi.fn(),
  currentPage: vi.fn(),
  listPages: vi.fn(),
}));
vi.mock('../../src/pixflow/wordpress-context', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/pixflow/wordpress-context')>()),
  hasPixflowWordPressContext: () => true,
}));
vi.mock('../../src/pixflow/wordpress-pages', () => ({
  createPixflowWordPressPage: scenario.createPage,
  fetchPixflowCurrentBuilderPage: scenario.currentPage,
  fetchPixflowWordPressPages: scenario.listPages,
}));
vi.mock('../../src/components/SkillLibraryPanel', () => ({ SkillLibraryPanel: () => null }));
vi.mock('../../src/components/WorkspaceHomeComposer', async () => {
  const { forwardRef } = await import('react');
  return { WorkspaceHomeComposer: forwardRef((_props: { onSubmit: (turn: WorkspaceHomeTurn) => Promise<boolean> }, _ref) =>
    <button onClick={() => void _props.onSubmit(scenario.turn)}>Send shared turn</button>) };
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plugins: [], servers: [] }))));
  scenario.turn = { prompt: '', attachments: [], comments: [] };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('Workspace Home uses explicit builder destinations', () => {
  it.each([
    'Build a Bricks prototype for my bakery',
    'Convert this HTML design into Bricks',
    'Build this page from Pixflow Library sections',
  ])('keeps natural request as an ordinary chat without implicit page creation: %s', async prompt => {
    scenario.turn = { prompt, attachments: [], comments: [], existingProjectId: 'existing-chat' };
    const submit = vi.fn();
    render(<HomeView projects={[]} onSubmit={submit} onOpenProject={() => {}} onViewAllProjects={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send shared turn' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![0]).toMatchObject({ prompt, projectKind: 'other', existingProjectId: 'existing-chat', firstTurn: { prompt } });
    expect(JSON.stringify(submit.mock.calls[0]![0].projectMetadata)).not.toMatch(/pixflowHtmlToBricks|pixflowLibrary|pixflowBricksNativePrototype|pixflow_html_to_bricks|pixflow_library|pixflow_bricks_native_prototype/);
    expect(scenario.createPage).not.toHaveBeenCalled();
    expect(scenario.currentPage).not.toHaveBeenCalled();
    expect(scenario.listPages).not.toHaveBeenCalled();
  });

  it.each(['Please review this HTML reference', ''])('preserves HTML attachment and exact prompt without generated handoff instructions: %s', async prompt => {
    const attachment: WorkspaceHomeTurn['attachments'][number] = { name: 'reference.html', path: 'attachments/reference.html', kind: 'file' };
    scenario.turn = { prompt, attachments: [attachment], comments: [], existingProjectId: 'existing-chat' };
    const submit = vi.fn();
    render(<HomeView projects={[]} onSubmit={submit} onOpenProject={() => {}} onViewAllProjects={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send shared turn' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const request = submit.mock.calls[0]![0];
    expect(request.prompt).toBe(prompt);
    expect(request.firstTurn.attachments).toEqual([attachment]);
    expect(request.firstTurn.prompt).toBe(prompt);
    expect(request.projectKind).toBe('other');
    expect(JSON.stringify(request.projectMetadata)).not.toMatch(/pixflowHtmlToBricks|pixflowLibrary|pixflowBricksNativePrototype/);
    expect(scenario.createPage).not.toHaveBeenCalled();
    expect(scenario.currentPage).not.toHaveBeenCalled();
    expect(scenario.listPages).not.toHaveBeenCalled();
  });
});
