export const PIXFLOW_HTML_STYLE_OWNERSHIP_SCHEMA: string;
export function parsePixflowStylesheetDeclarations(cssText?: string): Array<Record<string, any>>;
export function resolvePixflowSimpleClassCascade(input?: Record<string, any>): {
  declarationsByClass: Map<string, Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
};
export function buildPixflowStyleOwnershipReport(input?: Record<string, any>): Record<string, any>;
export function extractPixflowCssClassNames(selector?: string): string[];
export function replacePixflowCssClassSelector(selector: string, className: string, replacement: string): string;
export function encodePixflowCssIdentifier(value?: string): string;
