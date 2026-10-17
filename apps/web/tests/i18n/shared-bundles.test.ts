// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('separately built Core and Pro translation consumers', () => {
  it('shares dictionary, catalogue and notifications across separate module instances', async () => {
    const host = await import('../../src/i18n');
    const hostStoreModule = await import('../../src/i18n/resource-store');
    vi.resetModules();
    const proContent = await import('../../src/i18n/content');
    const proDictionary = await import('../../src/i18n/locale-runtime');
    const proStoreModule = await import('../../src/i18n/resource-store');
    expect(proStoreModule).not.toBe(hostStoreModule);
    expect(proStoreModule.i18nResources).toBe(hostStoreModule.i18nResources);
    const notified = vi.fn();
    proStoreModule.i18nResources.listeners.add(notified);
    try {
      await host.loadLocaleResources('de');
      expect(proDictionary.translateLocale('de', 'chat.send')).toBe(host.translateLocale('de', 'chat.send'));
      expect(proDictionary.translateLocale('de', 'chat.send')).not.toBe('Send');
      expect(proContent.getLocalizedContentIds('de')?.designSystems).toContain('airbnb');
      expect(proContent.localizeDesignSystemSummary('de', {
        id: 'airbnb', title: 'Airbnb', category: 'Travel', summary: 'Existing English summary',
      })).not.toBe('Existing English summary');
      expect(notified).toHaveBeenCalledTimes(1);
    } finally {
      proStoreModule.i18nResources.listeners.delete(notified);
    }
  });
});
