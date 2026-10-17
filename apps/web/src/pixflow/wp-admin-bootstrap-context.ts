/** Native editors omit the generic admin refresh URL because their verified
 * server context belongs to the editor document, not the REST request screen. */
export function wpAdminBootstrapContextStatus(context: unknown): 'ready' | 'unavailable' {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return 'unavailable';
  const value = context as Record<string, unknown>;
  if (value.editor !== 'etch' && value.editor !== 'elementor') return 'unavailable';
  const screen = value.screen as Record<string, unknown> | undefined;
  const object = value.object as Record<string, unknown> | undefined;
  return screen?.verified === true && screen.isBuilder === true
    && object?.verified === true && object.kind === 'post'
    && typeof object.id === 'number' && Number.isSafeInteger(object.id) && object.id > 0
    ? 'ready' : 'unavailable';
}
