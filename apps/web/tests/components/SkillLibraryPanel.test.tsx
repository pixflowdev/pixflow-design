// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SkillLibraryPanel } from '../../src/components/SkillLibraryPanel';
import { availableSkillUpdates, useSkillLibraryCatalogue } from '../../src/components/useSkillLibraryCatalogue';
import { en } from '../../src/i18n/locales/en';
import type { SkillLibraryResponse } from '@open-design/contracts';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useT: () => (key: keyof typeof en) => en[key] }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => true }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: request }));
const item = { id: 'website-animation', name: 'Website Animation', description: 'Scoped motion', version: '1.0.0', installedVersion: null as string | null, enabled: false, canInstall: true, updateAvailable: false, canRollback: false, digest: 'a'.repeat(64) };
afterEach(cleanup);
beforeEach(() => {
  request.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
describe('official skill management', () => {
  it('opens a read-only card preview, switches supporting files and restores focus on Escape', async () => {
    const preview = { ...item, license: 'GPL-2.0-or-later', files: { 'SKILL.md': '# Motion instructions', 'references/checks.md': '<script>do not execute</script>' } };
    request.mockResolvedValue(new Response(JSON.stringify(preview)));
    render(<SkillLibraryPanel presentation="cards" catalogue={catalogueFor({ skills: [item], pro: true, error: null })} onChange={async () => {}} />);
    const trigger = screen.getByRole('button', { name: item.name }); trigger.focus(); fireEvent.click(trigger);
    const modal = screen.getByRole('dialog', { name: item.name });
    await within(modal).findByText('# Motion instructions');
    expect(request.mock.calls[0]![0]).toContain('action=preview&id=website-animation&digest=');
    expect(request.mock.calls[0]![1].method).toBeUndefined();
    fireEvent.click(within(modal).getByRole('button', { name: 'references/checks.md' }));
    expect(within(modal).getByText('<script>do not execute</script>')).toBeTruthy();
    expect(modal.querySelector('script')).toBeNull();
    fireEvent(modal, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
    expect(request).toHaveBeenCalledOnce();
  });
  it('retries a failed preview without enabling installation until verified', async () => {
    request.mockResolvedValueOnce(new Response('{"error":"Download unavailable"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...item, license: 'GPL', files: { 'SKILL.md': 'Verified instructions' } })));
    render(<SkillLibraryPanel presentation="cards" catalogue={catalogueFor({ skills: [item], pro: true, error: null })} onChange={async () => {}} />);
    fireEvent.click(screen.getByText(item.description));
    const modal = screen.getByRole('dialog');
    await within(modal).findByText('Download unavailable');
    expect(within(modal).getByRole('button', { name: 'Install' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(modal).getByRole('button', { name: 'Try again' }));
    await within(modal).findByText('Verified instructions');
    expect(within(modal).getByRole('button', { name: 'Install' }).hasAttribute('disabled')).toBe(false);
  });
  it('installs from the verified modal using the catalogue digest', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ ...item, license: 'GPL', files: { 'SKILL.md': 'Read me first' } })))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const changed = vi.fn(async () => {});
    render(<SkillLibraryPanel presentation="cards" onChange={changed} catalogue={catalogueFor({ skills: [item], pro: true, error: null })} />);
    fireEvent.click(screen.getByRole('button', { name: item.name }));
    const modal = screen.getByRole('dialog');
    await within(modal).findByText('Read me first');
    fireEvent.click(within(modal).getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[1]![1].body)).toEqual({ id: item.id, action: 'install', digest: item.digest });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
  it('combines category filters and search while preserving installed skills and actions', () => {
    const skills = [item, { ...item, id: 'interface-polish', name: 'Interface Polish', description: 'Refine spacing', installedVersion: '1.0.0', enabled: true }];
    render(<SkillLibraryPanel presentation="cards" catalogue={{ state: { skills, pro: true, error: null }, error: '', setError: vi.fn(), load: vi.fn() }} onChange={async () => {}} />);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Design 1' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Interface Polish' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Interface Polish/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'motion' } });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText(en['context.noMatches'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Motion 1' }));
    expect(screen.getByRole('heading', { name: 'Website Animation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All 2' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(skills[1]!.enabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it('installs from Home cards using the reviewed digest and refreshes the composer catalogue', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [item], pro: true, error: null })))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [{ ...item, installedVersion: '1.0.0', enabled: true }], pro: true, error: null })));
    const refresh = vi.fn(async () => {});
    render(<SkillLibraryPanel presentation="cards" onChange={refresh} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await screen.findByRole('switch', { name: /Website Animation/ });
    expect(JSON.parse(request.mock.calls[1]![1].body)).toEqual({ id: item.id, action: 'install', digest: item.digest });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
  it('searches Home cards without altering the stored catalogue or installation state', () => {
    const skills = [item, { ...item, id: 'seo', name: 'SEO', description: 'Search visibility', installedVersion: '1.0.0', enabled: true }];
    render(<SkillLibraryPanel presentation="cards" catalogue={{ state: { skills, pro: true, error: null }, error: '', setError: vi.fn(), load: vi.fn() }} onChange={async () => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'visibility' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'SEO' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-skill-matches-this' } });
    expect(screen.getByText(en['context.noMatches'])).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(skills[1]!.enabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  const catalogueFor = (state: SkillLibraryResponse) => ({ state, error: '', setError: vi.fn(), load: vi.fn(async () => {}) });
  const displayedNames = () => screen.getAllByRole('article').map(card => card.querySelector('h4, h5')?.textContent);
  it('promotes installed skills on a new visit but keeps an installation in place during the current visit', () => {
    const available = { ...item, id: 'available', name: 'Available skill' };
    const newlyInstalled = { ...item, id: 'new-install', name: 'New installation' };
    const installed = { ...item, id: 'installed', name: 'Installed skill', installedVersion: '1.0.0' };
    const initial = { skills: [available, newlyInstalled, installed], pro: true, error: null };
    const updated = { ...initial, skills: [available, { ...newlyInstalled, installedVersion: '1.0.0', enabled: true }, installed] };
    const view = render(<SkillLibraryPanel catalogue={catalogueFor(initial)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['Installed skill', 'Available skill', 'New installation']);
    expect(screen.getByRole('heading', { name: 'Available to install' })).toBeTruthy();
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor(updated)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['Installed skill', 'Available skill', 'New installation']);
    view.unmount();
    render(<SkillLibraryPanel catalogue={catalogueFor(updated)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['New installation', 'Installed skill', 'Available skill']);
  });
  it('keeps a newly installed final card in place without an available-to-install heading', () => {
    const initial = { skills: [item], pro: true, error: null };
    const view = render(<SkillLibraryPanel catalogue={catalogueFor(initial)} onChange={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Available to install' })).toBeTruthy();
    const card = screen.getByRole('article');
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor({ ...initial, skills: [{ ...item, installedVersion: '1.0.0', enabled: true }] })} onChange={async () => {}} />);
    expect(screen.queryByRole('heading', { name: 'Available to install' })).toBeNull();
    expect(screen.getByRole('article')).toBe(card);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
  it('does not advertise installation availability when all remaining cards are unavailable', () => {
    render(<SkillLibraryPanel catalogue={catalogueFor({ skills: [{ ...item, canInstall: false }], pro: false, error: null })} onChange={async () => {}} />);
    expect(screen.queryByRole('heading', { name: 'Available to install' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Install' }).hasAttribute('disabled')).toBe(true);
  });
  it('groups enabled overlapping installations first without duplicating members shared by several pairs', () => {
    const skills = ['available', 'installed', 'first', 'second', 'third'].map(id => ({ ...item, id, name: id, installedVersion: id === 'available' ? null : '1.0.0', enabled: id !== 'available' }));
    render(<SkillLibraryPanel catalogue={catalogueFor({ skills, pro: true, error: null, overlaps: [['first', 'second'], ['second', 'third']] })} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['first', 'second', 'third', 'installed', 'available']);
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] }).querySelectorAll('article')).toHaveLength(3);
    expect(screen.getByRole('region', { name: en['settings.libraryInstalled'] }).querySelectorAll('article')).toHaveLength(1);
  });
  it('immediately groups an enabled installed skill with its overlapping partner during the same visit', () => {
    const first = { ...item, id: 'first', name: 'First', installedVersion: '1.0.0', enabled: true };
    const second = { ...first, id: 'second', name: 'Second', enabled: false };
    const ordinary = { ...first, id: 'ordinary', name: 'Ordinary' };
    const initial: SkillLibraryResponse = { skills: [ordinary, first, second], pro: true, error: null, overlaps: [['first', 'second']] };
    const updated = { ...initial, skills: [ordinary, first, { ...second, enabled: true }] };
    const view = render(<SkillLibraryPanel catalogue={catalogueFor(initial)} onChange={async () => {}} />);
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor(updated)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['First', 'Second', 'Ordinary']);
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] }).querySelectorAll('article')).toHaveLength(2);
    view.unmount();
    render(<SkillLibraryPanel catalogue={catalogueFor(updated)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['First', 'Second', 'Ordinary']);
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] }).querySelectorAll('article')).toHaveLength(2);
  });
  it('does not create a partial overlap group when a disabled member is enabled again during the visit', async () => {
    const first = { ...item, id: 'first', name: 'First', installedVersion: '1.0.0', enabled: true };
    const second = { ...first, id: 'second', name: 'Second' };
    const initial = { skills: [first, second], pro: true, error: null, overlaps: [['first', 'second']] };
    request.mockResolvedValueOnce(new Response(JSON.stringify(initial)))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...initial, skills: [first, { ...second, enabled: false }] })))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify(initial)));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    fireEvent.click(await screen.findByRole('switch', { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Second/ }).getAttribute('aria-checked')).toBe('false'));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Second/ }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('switch', { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Second/ }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText(en['skillLibrary.overlapTitle'])).toBeTruthy();
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] }).querySelectorAll('article')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: en['settings.libraryInstalled'] })).toBeNull();
  });
  it('extends an existing overlap group when another installed member is enabled, without duplicate cards', () => {
    const skills = ['ordinary', 'first', 'second', 'third'].map(id => ({ ...item, id, name: id, installedVersion: '1.0.0', enabled: id !== 'third' }));
    const initial: SkillLibraryResponse = { skills, pro: true, error: null, overlaps: [['first', 'second'], ['second', 'third']] };
    const view = render(<SkillLibraryPanel catalogue={catalogueFor(initial)} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['first', 'second', 'ordinary', 'third']);
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor({ ...initial, skills: skills.map(skill => ({ ...skill, enabled: true })) })} onChange={async () => {}} />);
    expect(displayedNames()).toEqual(['first', 'second', 'third', 'ordinary']);
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] }).querySelectorAll('article')).toHaveLength(3);
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });
  it('leaves grouping and enabled state unchanged when enabling a skill fails', async () => {
    const first = { ...item, id: 'first', name: 'First', installedVersion: '1.0.0', enabled: true };
    const second = { ...first, id: 'second', name: 'Second', enabled: false };
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, second], pro: true, error: null, overlaps: [['first', 'second']] })))
      .mockResolvedValueOnce(new Response('{"error":"Could not save"}', { status: 500 }));
    const changed = vi.fn(async () => {});
    render(<SkillLibraryPanel onChange={changed} />);
    fireEvent.click(await screen.findByRole('switch', { name: /Second/ }));
    expect(await screen.findByText('Could not save')).toBeTruthy();
    expect(screen.queryByRole('region', { name: en['skillLibrary.overlapTitle'] })).toBeNull();
    expect(screen.getByRole('switch', { name: /Second/ }).getAttribute('aria-checked')).toBe('false');
    expect(changed).not.toHaveBeenCalled();
  });
  it('clears obsolete overlap and installed sections after disable and removal without changing any skill itself', () => {
    const first = { ...item, id: 'first', name: 'First', installedVersion: '1.0.0', enabled: true };
    const second = { ...first, id: 'second', name: 'Second' };
    const state: SkillLibraryResponse = { skills: [first, second, item], pro: true, error: null, overlaps: [['first', 'second']] };
    const view = render(<SkillLibraryPanel catalogue={catalogueFor(state)} onChange={async () => {}} />);
    expect(screen.getByRole('region', { name: en['skillLibrary.overlapTitle'] })).toBeTruthy();
    const disabled = { ...state, skills: [first, { ...second, enabled: false }, item] };
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor(disabled)} onChange={async () => {}} />);
    expect(screen.queryByRole('region', { name: en['skillLibrary.overlapTitle'] })).toBeNull();
    expect(screen.getByRole('region', { name: en['settings.libraryInstalled'] }).querySelectorAll('article')).toHaveLength(2);
    view.rerender(<SkillLibraryPanel catalogue={catalogueFor({ ...state, skills: [{ ...first, installedVersion: null }, { ...second, installedVersion: null }, item] })} onChange={async () => {}} />);
    expect(screen.queryByRole('region', { name: en['settings.libraryInstalled'] })).toBeNull();
    expect(screen.queryByText(en['skillLibrary.overlapTitle'])).toBeNull();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(request).not.toHaveBeenCalled();
    expect(first.enabled).toBe(true);
    expect(second.installedVersion).toBe('1.0.0');
  });
  it('bypasses the catalogue cache only when explicitly refreshed', async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ skills: [item], pro: true, error: null })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    await screen.findByText('Website Animation');
    expect(request.mock.calls[0]?.[0]).toBe('/skill-library');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(request.mock.calls[1]?.[0]).toBe('/skill-library?refresh=1'));
  });
  it('warns about enabled overlaps without disabling skills and clears the warning after disabling', async () => {
    const first = { ...item, id: 'interface-polish', name: 'Interface Polish', installedVersion: '1.0.0', enabled: true };
    const second = { ...first, id: 'web-typography', name: 'Typography & Readability' };
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, second], pro: true, error: null, overlaps: [[first.id, second.id]] })))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, { ...second, enabled: false }], pro: true, error: null, overlaps: [] })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    expect(await screen.findByText(en['skillLibrary.overlapTitle'])).toBeTruthy();
    expect(screen.getAllByRole('switch').every(button => button.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('switch', { name: /Typography/ }));
    await waitFor(() => expect(screen.queryByText(en['skillLibrary.overlapTitle'])).toBeNull());
    expect(JSON.parse(request.mock.calls[1]![1].body).action).toBe('disable');
  });
  it.each([false, true])('does not warn for inactive or uninstalled skills (Pro %s)', async pro => {
    request.mockResolvedValue(new Response(JSON.stringify({ skills: [item, { ...item, id: 'motion-review' }], pro, error: null, overlaps: [[item.id, 'motion-review']] })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    await screen.findByText('Skill library');
    expect(screen.queryByText(en['skillLibrary.overlapTitle'])).toBeNull();
  });
  it('shares one catalogue with navigation and clears its count after updating', async () => {
    const pending = { ...item, installedVersion: '0.9.0', updateAvailable: true };
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [pending], pro: true, error: null })))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [{ ...pending, installedVersion: '1.0.0', updateAvailable: false }], pro: true, error: null })));
    function SettingsHarness() {
      const catalogue = useSkillLibraryCatalogue();
      return <><output aria-label="Skill update count">{availableSkillUpdates(catalogue.state).length}</output><SkillLibraryPanel catalogue={catalogue} onChange={async () => {}} /></>;
    }
    render(<SettingsHarness />);
    const update = await screen.findByRole('button', { name: /Update all/ });
    expect(screen.getByLabelText('Skill update count').textContent).toBe('1');
    expect(request).toHaveBeenCalledOnce();
    fireEvent.click(update);
    await waitFor(() => expect(screen.getByLabelText('Skill update count').textContent).toBe('0'));
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('updates only eligible installed skills sequentially using reviewed digests', async () => {
    const first = { ...item, installedVersion: '0.9.0', updateAvailable: true };
    const second = { ...first, id: 'motion-review', name: 'Motion Review', digest: 'b'.repeat(64) };
    const unavailable = { ...first, id: 'blocked-skill', canInstall: false };
    let finishFirst!: (response: Response) => void;
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, second, unavailable, { ...item, id: 'new-skill' }], pro: true, error: null })))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [], pro: true, error: null })));
    const changed = vi.fn(async () => {});
    render(<SkillLibraryPanel onChange={changed} />);
    fireEvent.click(await screen.findByRole('button', { name: /Update all/ }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Update all/ }).hasAttribute('disabled')).toBe(true);
    finishFirst(new Response('{"ok":true}'));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(request.mock.calls.filter(call => call[1]?.method === 'POST').map(call => JSON.parse(call[1].body))).toEqual([
      { id: first.id, action: 'install', digest: first.digest }, { id: second.id, action: 'install', digest: second.digest },
    ]);
  });
  it('reports partial failure, continues the batch and keeps the failed update available', async () => {
    const first = { ...item, installedVersion: '0.9.0', updateAvailable: true };
    const second = { ...first, id: 'motion-review', name: 'Motion Review' };
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, second], pro: true, error: null })))
      .mockResolvedValueOnce(new Response('{"error":"Signature rejected"}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [first, { ...second, installedVersion: '1.0.0', updateAvailable: false }], pro: true, error: null })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Update all/ }));
    expect(await screen.findByText('Website Animation: Signature rejected')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Update available' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Update all/ }).hasAttribute('disabled')).toBe(false);
    expect(request.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(2);
  });
  it('sends the reviewed digest and refreshes the shared catalogue after installation', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [item], error: null, pro: true })))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [{ ...item, installedVersion: '1.0.0', enabled: true }], error: null, pro: true })));
    const changed = vi.fn(async () => {});
    render(<SkillLibraryPanel onChange={changed} />);
    fireEvent.click(await screen.findByText(en['settings.libraryInstallButton']));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[1]![1].body)).toEqual({ id: item.id, action: 'install', digest: item.digest });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
  it('requires explicit removal confirmation and keeps removal available after expiry', async () => {
    request.mockImplementation(async (_path, init) => new Response(JSON.stringify(init ? { ok: true } : { skills: [{ ...item, installedVersion: '1.0.0', canInstall: false }], pro: false, error: null })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Website Animation' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en['skillLibrary.removalNote'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en['chat.comments.remove'] }));
    await waitFor(() => expect(request.mock.calls.some(call => call[1]?.body?.includes('"remove"'))).toBe(true));
  });
  it('retains installed controls during a catalogue outage', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ skills: [{ ...item, installedVersion: '1.0.0', canInstall: false }], pro: true, error: 'Library unavailable' })));
    render(<SkillLibraryPanel onChange={async () => {}} />);
    expect(await screen.findByText('Library unavailable')).toBeTruthy();
    expect(screen.getByText('Website Animation')).toBeTruthy();
  });
  it('does not show an install gate for Free without the add-on', async () => {
    request.mockResolvedValue(new Response('{"skills":[],"pro":false,"error":null}'));
    const { container } = render(<SkillLibraryPanel onChange={async () => {}} />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
  it('reports a failed install without reporting success or removing the card', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ skills: [item], error: null, pro: true })))
      .mockResolvedValueOnce(new Response('{"error":"Signature rejected"}', { status: 400 }));
    const changed = vi.fn(async () => {});
    render(<SkillLibraryPanel onChange={changed} />);
    fireEvent.click(await screen.findByText(en['settings.libraryInstallButton']));
    expect(await screen.findByText('Signature rejected')).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByText('Website Animation')).toBeTruthy();
  });
});


