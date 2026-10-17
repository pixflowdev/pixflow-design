/** Diagnostics from the installed Elementor parser; warnings never imply rollback. */
export type ElementorValidationWarning = { elementId: string; path: string; message: string };
export type ElementorValidationReport = { warnings?: ElementorValidationWarning[] };
