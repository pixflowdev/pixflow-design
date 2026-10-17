// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { Dict } from '../../src/i18n/types';

const requests = vi.hoisted(() => ({
  de: vi.fn<() => Promise<Dict>>(),
  ar: vi.fn<() => Promise<Dict>>(),
  fr: vi.fn<() => Promise<Dict>>(),
}));
vi.mock('../../src/i18n/locale-loaders', () => ({ LOCALE_LOADERS: requests }));
vi.mock('../../src/i18n/content-loaders', () => ({ CONTENT_LOADERS: {} }));

import { I18nProvider, loadLocaleResources, useI18n } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';

afterEach(() => { cleanup(); localStorage.clear(); });

function Control({ name }: { name: string }) {
  const { t, setLocale, locale } = useI18n();
  const [draft, setDraft] = useState('Keep my unsent draft');
  return <section>
    <input aria-label={`${name} draft`} value={draft} onChange={(event) => setDraft(event.target.value)} />
    <span>{name}: {locale}/{t('chat.send')}</span>
    <button onClick={() => setLocale('de')}>{name} German</button>
    <button onClick={() => setLocale('ar')}>{name} Arabic</button>
  </section>;
}

describe('language resource delivery', () => {
  it('does not download other languages for English', async () => {
    await loadLocaleResources('en');
    expect(requests.de).not.toHaveBeenCalled();
    expect(requests.ar).not.toHaveBeenCalled();
    expect(requests.fr).not.toHaveBeenCalled();
  });

  it('shares pending downloads across roots, keeps drafts mounted, and ignores late language completion', async () => {
    let finishGerman!: (value: Dict) => void;
    requests.de.mockImplementation(() => new Promise((resolve) => { finishGerman = resolve; }));
    requests.ar.mockResolvedValue({ ...en, 'chat.send': 'إرسال' });
    render(<><I18nProvider initial="en"><Control name="Panel" /></I18nProvider><I18nProvider initial="en"><Control name="Workspace" /></I18nProvider></>);
    const input = screen.getByLabelText('Panel draft');
    fireEvent.change(input, { target: { value: 'Existing customer text' } });
    fireEvent.click(screen.getByText('Panel German'));
    expect(requests.de).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Workspace: en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    expect(screen.getByLabelText('Panel draft')).toBe(input);
    fireEvent.click(screen.getByText('Workspace Arabic'));
    await waitFor(() => expect(screen.getByText('Panel: ar/إرسال')).toBeTruthy());
    expect(requests.ar).toHaveBeenCalledTimes(1);
    await act(async () => { finishGerman({ ...en, 'chat.send': 'Senden' }); });
    expect(screen.getByText('Panel: ar/إرسال')).toBeTruthy();
    expect((screen.getByLabelText('Panel draft') as HTMLInputElement).value).toBe('Existing customer text');
    expect(screen.getByLabelText('Panel draft')).toBe(input);
    fireEvent.click(screen.getByText('Panel German'));
    await waitFor(() => expect(screen.getByText('Workspace: de/Senden')).toBeTruthy());
    expect(requests.de).toHaveBeenCalledTimes(1);
  });

  it('allows a failed download to retry without retaining a rejected cache entry', async () => {
    requests.fr.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ...en, 'chat.send': 'Envoyer' });
    await expect(loadLocaleResources('fr')).rejects.toThrow('Offline');
    await expect(loadLocaleResources('fr')).resolves.toBeUndefined();
    render(<I18nProvider initial="fr"><Control name="Recovered" /></I18nProvider>);
    expect(screen.getByText('Recovered: fr/Envoyer')).toBeTruthy();
    expect(requests.fr).toHaveBeenCalledTimes(2);
  });
});
