/**
 * Aggregates Read/Write/Edit tool_use events into one row per file path.
 *
 * The chat surface renders individual `FileReadCard` / `FileWriteCard` /
 * `FileEditCard` cards inline (and collapses runs of the same family
 * behind a `Editing ×3, Done` disclosure). This module powers the
 * complementary "files this turn" summary that lives at the top of the
 * assistant message — visible while the run streams and persisting once
 * it finishes — so users can scan every file the agent touched without
 * expanding tool-group disclosures.
 */
import type { AgentEvent } from '../types';

export type FileOpKind = 'read' | 'write' | 'edit';
export type FileOpStatus = 'running' | 'done' | 'error';

export interface FileOpEntry {
  /** Basename — used as both display label and the lookup key passed to
   *  `onRequestOpenFile`, since the project-file API keys on basenames. */
  path: string;
  /** Original full path the agent passed; kept for tooltips. */
  fullPath: string;
  /** Distinct ops applied to this file, in encounter order. */
  ops: FileOpKind[];
  /** Per-op tool_use count for this file. Sum across ops equals total. */
  opCounts: Record<FileOpKind, number>;
  /** Total tool_use count for this file (>= ops.length when an op repeats). */
  total: number;
  /** Worst status across all calls for this file: error > running > done. */
  status: FileOpStatus;
}

const READ_NAMES = new Set(['Read', 'read_file']);
const WRITE_NAMES = new Set(['Write', 'create_file']);
const EDIT_NAMES = new Set(['Edit', 'str_replace_edit', 'MultiEdit', 'multi_edit']);
const DELETE_NAMES = new Set(['Delete', 'delete', 'delete_file', 'remove_file', 'rm_file', 'unlink_file']);

function classify(name: string): FileOpKind | null {
  if (READ_NAMES.has(name)) return 'read';
  if (WRITE_NAMES.has(name)) return 'write';
  if (EDIT_NAMES.has(name)) return 'edit';
  return null;
}

function extractPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as { file_path?: unknown; path?: unknown };
  if (typeof obj.file_path === 'string' && obj.file_path) return obj.file_path;
  if (typeof obj.path === 'string' && obj.path) return obj.path;
  return null;
}

function basename(input: string): string {
  const segments = input.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? input;
}

function mergeStatus(a: FileOpStatus, b: FileOpStatus): FileOpStatus {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'running' || b === 'running') return 'running';
  return 'done';
}

export function deriveFileOps(events: AgentEvent[] | undefined): FileOpEntry[] {
  if (!events || events.length === 0) return [];
  const resultByToolId = new Map<
    string,
    Extract<AgentEvent, { kind: 'tool_result' }>
  >();
  for (const ev of events) {
    if (ev.kind === 'tool_result') resultByToolId.set(ev.toolUseId, ev);
  }

  const byPath = new Map<string, FileOpEntry>();
  for (const ev of events) {
    if (ev.kind !== 'tool_use') continue;
    const kind = classify(ev.name);
    if (!kind) continue;
    const fullPath = extractPath(ev.input);
    if (!fullPath || fullPath === '(unnamed)') continue;
    const result = resultByToolId.get(ev.id);
    const status: FileOpStatus =
      result == null ? 'running' : result.isError ? 'error' : 'done';
    const existing = byPath.get(fullPath);
    if (existing) {
      if (!existing.ops.includes(kind)) existing.ops.push(kind);
      existing.opCounts[kind] += 1;
      existing.total += 1;
      existing.status = mergeStatus(existing.status, status);
    } else {
      const opCounts: Record<FileOpKind, number> = { read: 0, write: 0, edit: 0 };
      opCounts[kind] = 1;
      byPath.set(fullPath, {
        path: basename(fullPath),
        fullPath,
        ops: [kind],
        opCounts,
        total: 1,
        status,
      });
    }
  }

  return Array.from(byPath.values());
}

/** True when a turn attempted a project-file mutation, successful or not. */
export function hasFileMutationToolUse(events: AgentEvent[] | undefined): boolean {
  for (const event of events ?? []) {
    if (event.kind !== 'tool_use') continue;
    if (WRITE_NAMES.has(event.name) || EDIT_NAMES.has(event.name) || DELETE_NAMES.has(event.name)) {
      return true;
    }
    if (event.name === 'Bash' && hasSimpleBashDelete(event.input)) return true;
  }
  return false;
}

function hasSimpleBashDelete(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const command = (input as { command?: unknown }).command;
  if (typeof command !== 'string' || !command.trim()) return false;
  const tokens = shellWords(command);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token !== 'rm' && token !== 'unlink') continue;
    if (i > 0 && !isShellSeparator(tokens[i - 1]!)) continue;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const next = tokens[j]!;
      if (isShellSeparator(next)) break;
      if (token === 'rm' && next.startsWith('-')) continue;
      if (!looksUnsafeForFileList(next)) return true;
    }
  }
  return false;
}

function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  const flush = () => {
    if (!current) return;
    words.push(current);
    current = '';
  };
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]!;
    if (quote) {
      if (char === quote) quote = null;
      else if (quote === '"' && char === '\\' && i + 1 < command.length) {
        i += 1;
        current += command[i]!;
      } else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === '&' || char === '|') {
      flush();
      if (command[i + 1] === char) {
        words.push(`${char}${char}`);
        i += 1;
      } else words.push(char);
      continue;
    }
    if (char === ';') {
      flush();
      words.push(char);
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      i += 1;
      current += command[i]!;
      continue;
    }
    current += char;
  }
  flush();
  return words;
}

function isShellSeparator(token: string): boolean {
  return token === '&&' || token === '||' || token === ';' || token === '|' || token === '&';
}

function looksUnsafeForFileList(token: string): boolean {
  if (!token || token === '/' || token === '.' || token === '..') return true;
  return /[*?[\]{}$`<>|&;]/.test(token);
}

export type FileOpCounts = Record<FileOpKind, number>;

/** Total tool_use count per op family across `entries`. */
export function countFileOps(entries: FileOpEntry[]): FileOpCounts {
  const counts: FileOpCounts = { read: 0, write: 0, edit: 0 };
  for (const entry of entries) {
    counts.read += entry.opCounts.read;
    counts.write += entry.opCounts.write;
    counts.edit += entry.opCounts.edit;
  }
  return counts;
}
