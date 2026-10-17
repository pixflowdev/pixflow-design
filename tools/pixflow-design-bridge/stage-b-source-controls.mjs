/**
 * Identify source rules that prove a Prototype HTML design contains native
 * value-entry controls. This compatibility module stays as MJS so the
 * standalone bridge can execute it directly without a workspace build.
 */
export function collectStageBSourceControlRules(sourceRules) {
  const rules = Array.isArray(sourceRules) ? sourceRules : [];
  return rules.filter((rule) => {
    const selector = typeof rule?.selector === 'string' ? rule.selector.trim() : '';

    // Buttons (including tabs, accordions, filters, and CTAs) are ordinary
    // interactive controls, not evidence that the source contains a form
    // field. A label is likewise insufficient without an actual value-entry
    // control. Source semantic parity independently counts the real DOM.
    const controlMatch = selector.match(/(^|[\s>+~,])(input|textarea|select)(?=$|[\s.#:[>+~,])/i);
    if (!controlMatch) return false;

    const declarations = rule?.declarations && typeof rule.declarations === 'object' && !Array.isArray(rule.declarations)
      ? rule.declarations
      : {};
    const formControlProperties = [
      'width',
      'height',
      'min-height',
      'border',
      'background',
      'background-color',
      'color',
      'padding',
      'border-radius',
      'box-shadow',
      'font-size',
      'font-weight',
      'letter-spacing',
      'outline',
      'display',
    ];
    return Object.keys(declarations).some((key) => formControlProperties.includes(key));
  });
}

/**
 * Form submission/reset controls are actions, but they are not navigation
 * affordances and must not be compared with Bricks `settings.link` output.
 * A missing `type` inside a form has native submit semantics.
 */
export function countStageBSourceFormNonLinkButtons(html) {
  const source = typeof html === 'string' ? html : '';
  let count = 0;
  for (const formMatch of source.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)) {
    const formHtml = formMatch[0];
    for (const buttonMatch of formHtml.matchAll(/<button\b([^>]*)>/gi)) {
      const attributes = buttonMatch[1] || '';
      const typeMatch = attributes.match(/\btype\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i);
      const type = String(typeMatch?.[1] || typeMatch?.[2] || 'submit').trim().toLowerCase();
      if (type === 'submit' || type === 'reset') count += 1;
    }
  }
  return count;
}
