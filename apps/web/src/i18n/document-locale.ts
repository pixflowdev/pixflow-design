import type { Locale } from './types';

const PIXFLOW_ROOTS = '#pixflow-design-root, #pixflow-design-overlay, .pixflow-design-token-scope, .pixflow-design-portal-scope, .pixflow-bricks-agent-shell';

/** Embedded translations belong to Pixflow, never to the host editor or its content. */
export function synchronizeDocumentLocale(document: Document, locale: Locale, translateDom?: (root: Element) => void, embedded = false): () => void {
  const direction = locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr';
  const apply = (element: Element) => {
    element.setAttribute('lang', locale);
    element.setAttribute('dir', direction);
    translateDom?.(element);
  };
  const roots = document.querySelectorAll(PIXFLOW_ROOTS);
  const embeddedDocument = embedded || roots.length > 0;
  if (!embeddedDocument) {
    apply(document.documentElement);
  } else {
    roots.forEach(apply);
  }
  // Menus, dialogs and annotation panels can be portalled after the language changes.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) {
        if (!embeddedDocument || record.target.closest(PIXFLOW_ROOTS)) translateDom?.(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(PIXFLOW_ROOTS)) apply(node);
      node.querySelectorAll(PIXFLOW_ROOTS).forEach(apply);
      if (!embeddedDocument || node.closest(PIXFLOW_ROOTS)) translateDom?.(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pixflow-i18n-text', 'data-pixflow-i18n-title', 'data-pixflow-i18n-label', 'data-pixflow-i18n-count', 'data-pixflow-i18n-vars'] });
  return () => observer.disconnect();
}
