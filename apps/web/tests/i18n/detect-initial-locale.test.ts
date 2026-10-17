// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import { detectInitialLocale, detectLocalePreference } from '../../src/i18n';
import { persistPixflowWordPressConfig } from '../../src/pixflow/wordpress-context';

const LS_KEY = 'open-design:locale';
const LS_SOURCE_KEY = 'open-design:locale-source';

function setStoredLocale(locale: string, source: 'manual' | 'untagged' = 'manual'): void {
  window.localStorage.setItem(LS_KEY, locale);
  if (source === 'manual') {
    window.localStorage.setItem(LS_SOURCE_KEY, 'manual');
  } else {
    window.localStorage.removeItem(LS_SOURCE_KEY);
  }
}

function setNavigatorLanguages(languages: readonly string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    get: () => languages,
  });
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => languages[0] ?? 'en',
  });
}

// Track the installed mock so each test can swap it out without leaking
// state into the next case (installMockOpenDesignHost returns an
// uninstall callback that restores the previous value).
let uninstallHost: (() => void) | null = null;

function installHostWithOsLocale(value: unknown): void {
  uninstallHost?.();
  uninstallHost = installMockOpenDesignHost({
    host: {
      // The mock host's defaultHost() already sets client.type to
      // 'desktop'; we only override the field exercised here.
      client: { osLocale: value as string | undefined },
    },
  });
}

function clearHost(): void {
  uninstallHost?.();
  uninstallHost = null;
}

describe('detectInitialLocale priority chain', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearHost();
    setNavigatorLanguages(['en-US']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearHost();
  });

  it('uses the WordPress account language before the browser default', () => {
    persistPixflowWordPressConfig({ restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userLocale: 'pt_BR' });
    setNavigatorLanguages(['en-US']);
    expect(detectInitialLocale()).toBe('pt-BR');
    setStoredLocale('ja');
    expect(detectInitialLocale()).toBe('ja');
  });

  it('uses English for unsupported WordPress locales rather than an unrelated browser language', () => {
    persistPixflowWordPressConfig({ restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userLocale: 'nl_NL' });
    setNavigatorLanguages(['fr-FR']);
    expect(detectInitialLocale()).toBe('en');
  });

  it('uses English when a WordPress host does not provide a user locale', () => {
    persistPixflowWordPressConfig({ restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1' });
    setNavigatorLanguages(['fr-FR']);
    expect(detectInitialLocale()).toBe('en');
  });

  it('ignores corrupted manual storage and follows the WordPress language', () => {
    persistPixflowWordPressConfig({ restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userLocale: 'ar' });
    setStoredLocale('{broken-json}', 'manual');
    setNavigatorLanguages(['fr-FR']);
    expect(detectLocalePreference()).toBe('auto');
    expect(detectInitialLocale()).toBe('ar');
  });

  it('continues automatic detection when locale storage is unavailable', () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LS_KEY || key === LS_SOURCE_KEY) throw new Error('Storage blocked');
      return getItem.call(this, key);
    });
    setNavigatorLanguages(['de-DE']);
    expect(detectLocalePreference()).toBe('auto');
    expect(detectInitialLocale()).toBe('de');
  });

  it('prefers a manually-tagged localStorage pick over host and navigator', () => {
    setStoredLocale('ja', 'manual');
    installHostWithOsLocale('zh-CN');
    setNavigatorLanguages(['fr-FR']);

    expect(detectInitialLocale()).toBe('ja');
  });

  it('ignores an untagged localStorage value when a fresh host locale is available', () => {
    setStoredLocale('ja', 'untagged');
    installHostWithOsLocale('zh-CN');

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('falls through to navigator when an unsupported locale was stored', () => {
    setStoredLocale('xx-YY', 'manual');
    setNavigatorLanguages(['de-DE']);

    expect(detectInitialLocale()).toBe('de');
  });

  it('uses the desktop host OS locale when no localStorage pick exists', () => {
    installHostWithOsLocale('zh-CN');
    setNavigatorLanguages(['en-US']);

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('routes packaged OS locale strings through resolveSystemLocale (zh-Hant → zh-TW)', () => {
    installHostWithOsLocale('zh-Hant-TW');
    setNavigatorLanguages(['en-US']);

    expect(detectInitialLocale()).toBe('zh-TW');
  });

  it('falls back to navigator when host osLocale is missing or not a string', () => {
    installHostWithOsLocale(undefined);
    setNavigatorLanguages(['ko-KR']);
    expect(detectInitialLocale()).toBe('ko');

    installHostWithOsLocale(42);
    setNavigatorLanguages(['fr-FR']);
    expect(detectInitialLocale()).toBe('fr');
  });

  it('falls back to navigator when host osLocale is not in the supported set', () => {
    installHostWithOsLocale('nl-NL');
    setNavigatorLanguages(['pt-PT']);

    expect(detectInitialLocale()).toBe('pt-BR');
  });

  it('falls back to en when nothing else is available', () => {
    clearHost();
    setNavigatorLanguages([]);

    expect(detectInitialLocale()).toBe('en');
  });
});
