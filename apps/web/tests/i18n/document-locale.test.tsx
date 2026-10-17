// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { synchronizeDocumentLocale } from '../../src/i18n/document-locale';
import { I18nProvider, useI18n } from '../../src/i18n';
import { de } from '../../src/i18n/locales/de';
import { getPixflowWordPressConfig, persistPixflowWordPressConfig } from '../../src/pixflow/wordpress-context';

afterEach(() => { cleanup(); document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

describe('embedded language isolation', () => {
  it('follows WordPress by default and resets a manual override across mounted providers', async () => {
    persistPixflowWordPressConfig({ restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userLocale: 'ar' });
    const wordpressBefore = JSON.stringify(getPixflowWordPressConfig());
    function LanguageControl({ name }: { name: string }) {
      const { locale, localePreference, setLocale, resetLocale } = useI18n();
      return <><span>{name}: {localePreference}/{locale}</span><button onClick={() => setLocale('de')}>{name} German</button><button onClick={resetLocale}>{name} automatic</button></>;
    }
    render(<><I18nProvider><LanguageControl name="Panel" /></I18nProvider><I18nProvider><LanguageControl name="Workspace" /></I18nProvider></>);
    await waitFor(() => expect(screen.getByText('Panel: auto/ar')).toBeTruthy());
    fireEvent.click(screen.getByText('Panel German'));
    await waitFor(() => expect(screen.getByText('Workspace: de/de')).toBeTruthy());
    expect(localStorage.getItem('open-design:locale-source')).toBe('manual');
    fireEvent.click(screen.getByText('Workspace automatic'));
    await waitFor(() => expect(screen.getByText('Panel: auto/ar')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Workspace: auto/ar')).toBeTruthy());
    expect(localStorage.getItem('open-design:locale')).toBeNull();
    expect(localStorage.getItem('open-design:locale-source')).toBeNull();
    expect(JSON.stringify(getPixflowWordPressConfig())).toBe(wordpressBefore);
    localStorage.setItem('open-design:locale', 'fr');
    localStorage.setItem('open-design:locale-source', 'manual');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'open-design:locale-source' })));
    await waitFor(() => expect(screen.getByText('Panel: fr/fr')).toBeTruthy());
    localStorage.removeItem('open-design:locale'); localStorage.removeItem('open-design:locale-source');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'open-design:locale-source' })));
    await waitFor(() => expect(screen.getByText('Panel: auto/ar')).toBeTruthy());
  });
  it('keeps the fallback translator stable so effect dependencies cannot cause request loops', () => {
    const { result, rerender } = renderHook(() => useI18n());
    const initial = result.current;
    rerender();
    expect(result.current).toBe(initial);
    expect(result.current.t).toBe(initial.t);
    expect(result.current.t('chat.send')).toBe('Send');
  });
  it('leaves WordPress and editor content direction intact, including new Pixflow portals', async () => {
    document.documentElement.lang = 'en-US'; document.documentElement.dir = 'ltr';
    document.body.innerHTML = '<main id="editor"><p dir="ltr">Existing content</p></main><div id="pixflow-design-root"></div>';
    const stop = synchronizeDocumentLocale(document, 'ar');
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.querySelector('#editor')?.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('#pixflow-design-root')?.getAttribute('dir')).toBe('rtl');
    const portal = document.createElement('div'); portal.className = 'pixflow-design-portal-scope'; document.body.append(portal);
    await Promise.resolve();
    expect(portal.lang).toBe('ar'); expect(portal.dir).toBe('rtl');
    stop();
    const restore = synchronizeDocumentLocale(document, 'ja');
    expect(portal.dir).toBe('ltr'); restore();
  });

  it('sets document language for the standalone app', () => {
    const stop = synchronizeDocumentLocale(document, 'fa');
    expect(document.documentElement.lang).toBe('fa'); expect(document.documentElement.dir).toBe('rtl'); stop();
  });

  it('does not change the host before an embedded portal has mounted', async () => {
    document.documentElement.lang = 'en-US'; document.documentElement.dir = 'ltr';
    const stop = synchronizeDocumentLocale(document, 'ar', undefined, true);
    expect(document.documentElement.lang).toBe('en-US');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<section class="pixflow-design-portal-scope"></section>';
    document.body.append(wrapper);
    await Promise.resolve();
    expect(wrapper.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.dir).toBe('ltr'); stop();
  });

  it('translates editor-owned DOM labels in new portals without changing user text', async () => {
    document.body.innerHTML = '<div id="pixflow-design-root"></div>';
    render(<I18nProvider initial="de"><div /></I18nProvider>);
    const portal = document.createElement('div');
    portal.className = 'pixflow-design-portal-scope';
    portal.innerHTML = '<button data-pixflow-i18n-text="chat.send">Send</button><textarea>Keep this draft</textarea>';
    document.body.append(portal);
    await act(async () => { await Promise.resolve(); });
    expect(portal.querySelector('button')?.textContent).toBe(de['chat.send']);
    expect(portal.querySelector('textarea')?.value).toBe('Keep this draft');
  });

  it('keeps separately mounted panel and workspace providers in sync', async () => {
    function Picker({ name }: { name: string }) {
      const { locale, setLocale } = useI18n();
      return <button onClick={() => setLocale('de')}>{name}: {locale}</button>;
    }
    render(<><I18nProvider initial="en"><Picker name="Panel" /></I18nProvider><I18nProvider initial="en"><Picker name="Workspace" /></I18nProvider></>);
    fireEvent.click(screen.getByText('Panel: en'));
    await waitFor(() => expect(screen.getByText('Workspace: de')).toBeTruthy());
    localStorage.setItem('open-design:locale', 'fr');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'open-design:locale', newValue: 'fr' })));
    await waitFor(() => expect(screen.getByText('Panel: fr')).toBeTruthy()); await waitFor(() => expect(screen.getByText('Workspace: fr')).toBeTruthy());
  });

  it('retranslates native shell updates and interpolation without observing translated attributes', async () => {
    document.documentElement.lang = 'en-US'; document.documentElement.dir = 'ltr';
    document.body.innerHTML = '<main id="editor"><button title="Keep title">Keep content</button></main><div id="pixflow-design-root"><button id="size"></button><button id="collapse"></button></div>';
    render(<I18nProvider initial="de"><div /></I18nProvider>);
    const size = document.querySelector<HTMLButtonElement>('#size')!;
    const collapse = document.querySelector<HTMLButtonElement>('#collapse')!;
    await act(async () => {
      size.title = 'Set panel size SM';
      size.setAttribute('data-pixflow-i18n-title', 'ui.sitemapAgentPanel.setPanelSize');
      size.setAttribute('data-pixflow-i18n-vars', JSON.stringify({ value1: 'SM' }));
      collapse.setAttribute('data-pixflow-i18n-label', 'ui.sitemapAgentPanel.collapsePanel');
      await Promise.resolve();
    });
    expect(size.title).toBe(de['ui.sitemapAgentPanel.setPanelSize'].replace('{value1}', 'SM'));
    expect(collapse.getAttribute('aria-label')).toBe(de['ui.sitemapAgentPanel.collapsePanel']);
    await act(async () => {
      collapse.setAttribute('aria-label', 'Expand panel');
      collapse.setAttribute('data-pixflow-i18n-label', 'ui.sitemapAgentPanel.expandPanel');
      size.setAttribute('data-pixflow-i18n-vars', JSON.stringify({ value1: 'LG' }));
      await Promise.resolve();
    });
    expect(size.title).toBe(de['ui.sitemapAgentPanel.setPanelSize'].replace('{value1}', 'LG'));
    expect(collapse.getAttribute('aria-label')).toBe(de['ui.sitemapAgentPanel.expandPanel']);
    expect(document.querySelector('#editor button')?.textContent).toBe('Keep content');
    expect(document.querySelector('#editor button')?.getAttribute('title')).toBe('Keep title');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en-US');
  });
});
