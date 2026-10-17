const scope = '#pixflow-design-root, #pixflow-design-overlay, .pixflow-design-token-scope, .pixflow-design-portal-scope, .pixflow-bricks-agent-shell';
const controls = 'input, textarea, form';
let installed = false;

/** Pixflow settings are not login forms. Never modify field values or focus. */
export function protectPixflowInputAutofill(root: ParentNode): void {
  const candidates = [...root.querySelectorAll(controls)];
  if (root instanceof Element && root.matches(controls)) candidates.unshift(root);
  for (const element of candidates) {
    if (!element.closest(scope)) continue;
    const attrs = {
      autocomplete: element.getAttribute('type') === 'password' ? 'new-password' : 'off',
      'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other',
    };
    for (const [name, value] of Object.entries(attrs)) {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }
  }
}

export function installPixflowInputAutofillProtection(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  protectPixflowInputAutofill(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') protectPixflowInputAutofill(record.target as Element);
      else for (const node of record.addedNodes) {
        if (node instanceof Element) protectPixflowInputAutofill(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'autocomplete'] });
}
