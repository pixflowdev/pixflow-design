import {
  countDesignSystemPreviewModules,
  countNewHtmlArtifacts,
  didRunCreateDesignSystemFile,
  extractToolFilePath,
  isDesignSystemFile,
  isHtmlPath,
  isPreviewModulePath,
  readToolResultId,
  readToolResultIsError,
  readToolUseId,
  WRITE_OR_EDIT_TOOL_NAMES,
} from './run-artifacts.js';

export interface RunSideEffectLedger {
  userVisibleOutputSeen: boolean;
  toolCallSeen: boolean;
  directArtifactEventSeen: boolean;
  liveArtifactSeen: boolean;
  htmlPaths: Set<string>;
  designSystemFileWritten: boolean;
  previewModulePaths: Set<string>;
  pendingWritePathById: Map<string, string>;
}

export function createRunSideEffectLedger(): RunSideEffectLedger {
  return {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    directArtifactEventSeen: false,
    liveArtifactSeen: false,
    htmlPaths: new Set(),
    designSystemFileWritten: false,
    previewModulePaths: new Set(),
    pendingWritePathById: new Map(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function foldRunSideEffectEvent(
  ledger: RunSideEffectLedger,
  record: { event?: unknown; data?: unknown },
): void {
  const data = asRecord(record.data);
  if (record.event === 'stdout') {
    const chunk = data?.chunk;
    if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
      ledger.userVisibleOutputSeen = true;
    }
  }
  if (record.event === 'live_artifact') ledger.liveArtifactSeen = true;
  if (!data) return;
  if (data.type === 'text_delta' || data.type === 'thinking_delta') {
    if (typeof data.delta === 'string' && data.delta.length > 0) {
      ledger.userVisibleOutputSeen = true;
    }
  }
  if (data.type === 'artifact') ledger.directArtifactEventSeen = true;
  if (data.type === 'live_artifact') ledger.liveArtifactSeen = true;
  if (data.type === 'tool_use') {
    ledger.toolCallSeen = true;
    if (record.event !== 'agent' || typeof data.name !== 'string') return;
    if (!WRITE_OR_EDIT_TOOL_NAMES.has(data.name)) return;
    const path = extractToolFilePath(data.input);
    const id = readToolUseId(data);
    if (path && id) ledger.pendingWritePathById.set(id, path);
    return;
  }
  if (data.type !== 'tool_result' || record.event !== 'agent') return;
  const id = readToolResultId(data);
  if (!id) return;
  const path = ledger.pendingWritePathById.get(id);
  if (path === undefined) return;
  ledger.pendingWritePathById.delete(id);
  if (readToolResultIsError(data)) return;
  if (isHtmlPath(path)) ledger.htmlPaths.add(path);
  if (isDesignSystemFile(path)) ledger.designSystemFileWritten = true;
  if (isPreviewModulePath(path)) ledger.previewModulePaths.add(path);
}

export function runSideEffectsForRun(run: any) {
  const ledger = run?.sideEffectLedger as RunSideEffectLedger | undefined;
  if (!ledger) return null;
  return {
    userVisibleOutputSeen: ledger.userVisibleOutputSeen,
    toolCallSeen: ledger.toolCallSeen,
    artifactWriteSeen:
      ledger.directArtifactEventSeen ||
      ledger.htmlPaths.size > 0 ||
      ledger.designSystemFileWritten ||
      ledger.previewModulePaths.size > 0,
    liveArtifactSeen: ledger.liveArtifactSeen,
  };
}

export function runArtifactCountForRun(run: any): number {
  return run?.sideEffectLedger
    ? (run.sideEffectLedger as RunSideEffectLedger).htmlPaths.size
    : countNewHtmlArtifacts(run?.events ?? []);
}

export function runDesignSystemCreatedForRun(run: any): boolean {
  return run?.sideEffectLedger
    ? (run.sideEffectLedger as RunSideEffectLedger).designSystemFileWritten
    : didRunCreateDesignSystemFile(run?.events ?? []);
}

export function runPreviewModuleCountForRun(run: any): number {
  return run?.sideEffectLedger
    ? (run.sideEffectLedger as RunSideEffectLedger).previewModulePaths.size
    : countDesignSystemPreviewModules(run?.events ?? []);
}
