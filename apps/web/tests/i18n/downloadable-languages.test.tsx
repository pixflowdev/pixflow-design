// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

vi.mock('../../src/i18n/locale-loaders', () => ({ LOCALE_LOADERS: {
  de: () => import('../../src/pixflow/language-packs').then((client) => client.loadInstalledLanguage('de')).then((pack) => pack.dictionary),
  ar: () => import('../../src/pixflow/language-packs').then((client) => client.loadInstalledLanguage('ar')).then((pack) => pack.dictionary),
} }));
vi.mock('../../src/i18n/content-loaders', () => ({ CONTENT_LOADERS: {
  de: () => import('../../src/pixflow/language-packs').then((client) => client.loadInstalledLanguage('de')).then((pack) => pack.content),
  ar: () => import('../../src/pixflow/language-packs').then((client) => client.loadInstalledLanguage('ar')).then((pack) => pack.content),
} }));
vi.mock('../../src/components/CustomSelect', () => ({ CustomSelect: ({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) =>
  <select aria-label="Language" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}));

import { I18nProvider, applyLocalePreference, useI18n } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { i18nResources } from '../../src/i18n/resource-store';
import { LanguagePreferenceControl } from '../../src/components/LanguagePreferenceControl';
import { getLanguagePackStatus, loadInstalledLanguage } from '../../src/pixflow/language-packs';
import { persistPixflowWordPressConfig } from '../../src/pixflow/wordpress-context';

const content = { skillCopy: {}, designSystemSummaries: {}, designSystemCategories: {}, promptTemplateCategories: {}, promptTemplateTags: {}, promptTemplateCopy: {} };
const pack = (locale: 'de' | 'ar') => ({ schema: 1, locale, dictionary: { ...en, 'chat.send': locale === 'de' ? 'Senden' : 'إرسال' }, content });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const status = (installed: string[] = [], canInstall = true) => ({ canInstall, languages: ['en', 'de', 'ar'].map((locale) => ({ locale, installed: locale === 'en' || installed.includes(locale) })) });
let site = 0;

function Chat({ name }: { name: string }) {
  const { locale, localePreference, t } = useI18n();
  const [draft, setDraft] = useState('My existing draft');
  return <><output>{name}: {localePreference}/{locale}/{t('chat.send')}</output><input aria-label={`${name} draft`} value={draft} onChange={(event) => setDraft(event.target.value)} /></>;
}
function surfaces() {
  return render(<><I18nProvider><LanguagePreferenceControl /><Chat name="Panel" /></I18nProvider><I18nProvider><Chat name="Workspace" /></I18nProvider></>);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  delete i18nResources.dictionaries.de; delete i18nResources.dictionaries.ar;
  delete i18nResources.content.de; delete i18nResources.content.ar;
  i18nResources.selectionRevision += 1;
  persistPixflowWordPressConfig({ restBaseUrl: `http://localhost/site-${++site}/wp-json/pixflow-design/v1`, restNonce: 'nonce', userLocale: 'en_US' });
  document.body.innerHTML = '<div id="pixflow-design-root"></div><main id="native-editor" dir="ltr">Saved page content</main>';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('downloadable WordPress languages', () => {
  it('applies an installed language selected before the inventory finishes loading', async () => {
    let finishStatus!: (value: Response) => void;
    const fetcher = vi.fn((url: string) => url.endsWith('/de') ? Promise.resolve(response(pack('de'))) : new Promise<Response>((resolve) => { finishStatus = resolve; }));
    vi.stubGlobal('fetch', fetcher); surfaces();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'de' } });
    expect(screen.getByText('Panel: auto/en/Send')).toBeTruthy();
    await act(async () => { finishStatus(response(status(['de']))); });
    await screen.findByText('Workspace: de/de/Senden');
    expect(screen.queryByText(en['settings.languageDownload'])).toBeNull();
    expect(localStorage.getItem('open-design:locale')).toBe('de');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer missing-language choice pending for explicit download when inventory arrives', async () => {
    let finishStatus!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finishStatus = resolve; }));
    vi.stubGlobal('fetch', fetcher); surfaces();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'de' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    await act(async () => { finishStatus(response(status(['de']))); });
    await screen.findByText(en['settings.languageDownload']);
    expect(screen.getByText('Panel: auto/en/Send')).toBeTruthy();
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('ar');
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps English and saved preference until an explicit download succeeds, then switches all roots and RTL without remounting drafts', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      if (init.method === 'POST') return new Promise<Response>((resolve) => { finish = resolve; });
      return Promise.resolve(response(status()));
    });
    vi.stubGlobal('fetch', fetcher);
    surfaces();
    await waitFor(() => expect(screen.queryByText(en['settings.languageChecking'])).toBeNull());
    const input = screen.getByLabelText('Panel draft');
    fireEvent.change(input, { target: { value: 'Preserve unsent customer text' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Panel: auto/en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    expect(screen.getByText(en['settings.languageDownloading'])).toBeTruthy();
    expect(document.querySelector('#pixflow-design-root')?.getAttribute('dir')).toBe('ltr');
    await act(async () => { finish(response(pack('ar'))); });
    await waitFor(() => expect(screen.getByText('Workspace: ar/ar/إرسال')).toBeTruthy());
    expect(screen.getByText('Panel: ar/ar/إرسال')).toBeTruthy();
    expect(screen.getByLabelText('Panel draft')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Preserve unsent customer text');
    expect(document.querySelector('#pixflow-design-root')?.getAttribute('dir')).toBe('rtl');
    expect(document.querySelector('#native-editor')?.getAttribute('dir')).toBe('ltr');
    expect(localStorage.getItem('open-design:locale')).toBe('ar');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('preserves an unavailable saved automatic locale and offers a download instead of installing silently', async () => {
    persistPixflowWordPressConfig({ restBaseUrl: `http://localhost/auto-${site}/wp-json/pixflow-design/v1`, restNonce: 'nonce', userLocale: 'ar' });
    const fetcher = vi.fn((url: string, _init: RequestInit) => Promise.resolve(url.endsWith('/ar') ? response({}, 404) : response(status())));
    vi.stubGlobal('fetch', fetcher); surfaces();
    await screen.findByText(en['settings.languageDownload']);
    expect(screen.getByText('Panel: auto/en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    expect(fetcher.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/ar'))).toHaveLength(1);
  });

  it('does not change a manual preference or direction after a failed download and permits retry', async () => {
    localStorage.setItem('open-design:locale', 'en'); localStorage.setItem('open-design:locale-source', 'manual');
    let posts = 0;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => Promise.resolve(init.method === 'POST' ? (++posts === 1 ? response({}, 503) : response(pack('ar'))) : response(status()))));
    surfaces(); await waitFor(() => expect(screen.queryByText(en['settings.languageChecking'])).toBeNull());
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    await screen.findByRole('alert');
    expect(screen.getByText('Panel: en/en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBe('en');
    expect(document.querySelector('#pixflow-design-root')?.getAttribute('dir')).toBe('ltr');
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    await screen.findByText('Workspace: ar/ar/إرسال');
    expect(posts).toBe(2);
  });

  it('does not let an earlier download override a newer selection', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => init.method === 'POST' ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(response(status()))));
    surfaces(); await waitFor(() => expect(screen.queryByText(en['settings.languageChecking'])).toBeNull());
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'en' } });
    await screen.findByText('Panel: en/en/Send');
    await act(async () => { finish(response(pack('ar'))); });
    expect(screen.getByText('Workspace: en/en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBe('en');
  });

  it('keeps a newer choice in another root when a download finishes, while retaining the installed pack', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => init.method === 'POST' ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(response(status()))));
    render(<><I18nProvider><LanguagePreferenceControl /><Chat name="Panel" /></I18nProvider><I18nProvider><LanguagePreferenceControl /><Chat name="Workspace" /></I18nProvider></>);
    await waitFor(() => expect(screen.queryAllByText(en['settings.languageChecking'])).toHaveLength(0));
    const selectors = screen.getAllByLabelText('Language');
    fireEvent.change(selectors[0]!, { target: { value: 'ar' } });
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    fireEvent.change(selectors[1]!, { target: { value: 'en' } });
    await screen.findByText('Workspace: en/en/Send');
    await act(async () => { finish(response(pack('ar'))); });
    expect(screen.getByText('Panel: en/en/Send')).toBeTruthy();
    fireEvent.change(selectors[1]!, { target: { value: 'ar' } });
    await screen.findByText('Workspace: ar/ar/إرسال');
    expect(screen.queryByText(en['settings.languageDownload'])).toBeNull();
  });

  it('invalidates a slow selection when another tab changes the saved language', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/de') ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(response(status(['de'])))));
    surfaces();
    const pending = applyLocalePreference('de');
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    localStorage.setItem('open-design:locale', 'en'); localStorage.setItem('open-design:locale-source', 'manual');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'open-design:locale', newValue: 'en' })));
    await screen.findByText('Workspace: en/en/Send');
    await act(async () => { finish(response(pack('de'))); await pending; });
    expect(screen.getByText('Panel: en/en/Send')).toBeTruthy();
    expect(localStorage.getItem('open-design:locale')).toBe('en');
  });

  it('recovers when the old missing-pack read finishes after installation', async () => {
    persistPixflowWordPressConfig({ restBaseUrl: `http://localhost/delayed-${site}/wp-json/pixflow-design/v1`, restNonce: 'nonce', userLocale: 'ar' });
    let finishRead!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (init.method === 'POST') return Promise.resolve(response(pack('ar')));
      if (url.endsWith('/ar')) return new Promise<Response>((resolve) => { finishRead = resolve; });
      return Promise.resolve(response(status()));
    }));
    surfaces(); await screen.findByText(en['settings.languageDownload']);
    fireEvent.click(screen.getByText(en['settings.languageDownload']));
    await act(async () => { finishRead(response({}, 404)); });
    await screen.findByText('Workspace: auto/ar/إرسال');
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deduplicates installed dictionary/content fetches and sends nonce through query REST transport', async () => {
    persistPixflowWordPressConfig({ restBaseUrl: `http://localhost/query-${site}/?rest_route=%2Fpixflow-design%2Fv1`, restNonce: 'nonce' });
    const fetcher = vi.fn(() => Promise.resolve(response(pack('de')))); vi.stubGlobal('fetch', fetcher);
    await Promise.all([loadInstalledLanguage('de'), loadInstalledLanguage('de')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('rest_route')).toBe('/pixflow-design/v1/language-packs/de');
    expect(init.headers).toEqual({ 'X-WP-Nonce': 'nonce' });
    expect(init.credentials).toBe('same-origin');
  });

  it('does not show install controls to a user without installation permission', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response(status([], false)))));
    surfaces(); await waitFor(() => expect(screen.queryByText(en['settings.languageChecking'])).toBeNull());
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'de' } });
    expect(screen.getByText(en['settings.languageAdminRequired'])).toBeTruthy();
    expect(screen.queryByText(en['settings.languageDownload'])).toBeNull();
  });

  it('rejects incorrect locale payloads and retries failed status without changing chat data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(pack('ar'))).mockResolvedValueOnce(response(pack('de')));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadInstalledLanguage('de')).rejects.toThrow('Invalid language pack');
    await expect(loadInstalledLanguage('de')).resolves.toMatchObject({ locale: 'de' });
    await applyLocalePreference('de');
    expect(localStorage.getItem('open-design:locale')).toBe('de');
    fetcher.mockResolvedValueOnce(response({}));
    await expect(getLanguagePackStatus()).rejects.toThrow('Invalid language status');
  });

  it('offers an installed-language update and applies it immediately to both roots while preserving drafts', async () => {
    localStorage.setItem('open-design:locale', 'de'); localStorage.setItem('open-design:locale-source', 'manual');
    const currentStatus = status(['de']);
    const updateStatus = { ...currentStatus, languages: currentStatus.languages.map((item) => ({ ...item, updateAvailable: item.locale === 'de' })) };
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (init.method === 'POST') return new Promise<Response>((resolve) => { finish = resolve; });
      return Promise.resolve(response(url.endsWith('/de') ? pack('de') : updateStatus));
    }));
    surfaces(); await screen.findByText('Panel: de/de/Senden');
    const input = screen.getByLabelText('Panel draft');
    fireEvent.change(input, { target: { value: 'Keep draft during language update' } });
    fireEvent.click(await screen.findByText(en['updater.download']));
    expect(screen.getByText(en['updater.downloading'])).toBeTruthy();
    expect(screen.getByText('Workspace: de/de/Senden')).toBeTruthy();
    await act(async () => { finish(response({ ...pack('de'), dictionary: { ...pack('de').dictionary, 'chat.send': 'Jetzt senden' } })); });
    await screen.findByText('Workspace: de/de/Jetzt senden');
    expect(screen.getByText('Panel: de/de/Jetzt senden')).toBeTruthy();
    expect(screen.queryByText(en['updater.download'])).toBeNull();
    expect(screen.getByLabelText('Panel draft')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Keep draft during language update');
    expect(localStorage.getItem('open-design:locale')).toBe('de');
    expect(localStorage.getItem('open-design:locale-source')).toBe('manual');
  });

  it('keeps the previously installed dictionary and update action when updating fails', async () => {
    localStorage.setItem('open-design:locale', 'ar'); localStorage.setItem('open-design:locale-source', 'manual');
    const currentStatus = status(['ar']);
    const updateStatus = { ...currentStatus, languages: currentStatus.languages.map((item) => ({ ...item, updateAvailable: item.locale === 'ar' })) };
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => Promise.resolve(
      init.method === 'POST' ? response({}, 503) : response(url.endsWith('/ar') ? pack('ar') : updateStatus),
    )));
    surfaces(); await screen.findByText('Panel: ar/ar/إرسال');
    fireEvent.click(await screen.findByText(en['updater.download']));
    await screen.findByRole('alert');
    expect(screen.getByText('Workspace: ar/ar/إرسال')).toBeTruthy();
    expect(screen.getByText(en['updater.download'])).toBeTruthy();
    expect(i18nResources.dictionaries.ar?.['chat.send']).toBe('إرسال');
    expect(document.querySelector('#pixflow-design-root')?.getAttribute('dir')).toBe('rtl');
    expect(localStorage.getItem('open-design:locale')).toBe('ar');
  });
});
