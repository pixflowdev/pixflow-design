export const PIXFLOW_HTML_STRUCTURE_IR_SCHEMA: string;
export const PIXFLOW_HTML_STRUCTURE_REPORT_SCHEMA: string;
export function buildPixflowHtmlStructureIr(input?: Record<string, any>): Record<string, any>;
export function createPixflowStructureProjectionRecorder(input?: Record<string, any>): Record<string, any>;
export function finalizePixflowHtmlStructureProjection(input?: Record<string, any>): { ir: Record<string, any>; report: Record<string, any> };
export function validatePixflowBricksStructureProjection(input?: Record<string, any>): { ok: boolean; errors: Array<Record<string, any>>; warnings: Array<Record<string, any>> };
