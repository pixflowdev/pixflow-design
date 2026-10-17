/**
 * Stylesheet custom properties are design-token declarations and belong in
 * Pixflow's route/stage-b colour system, not a Bricks class `_cssCustom`
 * bucket. Inline element custom properties use a separate preservation path.
 */
export function omitStageBStylesheetCustomPropertyDeclarations(declarations) {
  if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
    return {};
  }
  return Object.fromEntries(Object.entries(declarations)
    .filter(([property]) => !String(property || '').trim().startsWith('--')));
}
