import type { MemoryEntry, MemoryListResponse } from '@open-design/contracts';
import { pixflowRuntimeFetch } from './runtime-fetch';

export type SavedMemory = MemoryEntry & { version?: number };
export const SAVED_MEMORY_CHANGED = 'pixflow-design:saved-memory-changed';

export async function memoryRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await pixflowRuntimeFetch(`/api/memory${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(response.status === 409
    ? 'This memory changed in another tab. Close the editor and reopen it before saving.'
    : `Could not ${init?.method ? 'update' : 'load'} memory. Please try again (${response.status}).`);
  return response.json() as Promise<T>;
}

/** Read every page: export and management must not silently stop at 50 records. */
export async function loadSavedMemories(): Promise<MemoryListResponse> {
  const first = await memoryRequest<MemoryListResponse>('?limit=100');
  const entries = [...first.entries];
  const seen = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (seen.has(cursor)) throw new Error('Memory pagination could not finish. Please refresh and try again.');
    seen.add(cursor);
    const page = await memoryRequest<MemoryListResponse>(`?limit=100&cursor=${encodeURIComponent(cursor)}`);
    entries.push(...page.entries);
    cursor = page.nextCursor;
  }
  return { ...first, entries: [...new Map(entries.map(entry => [entry.id, entry])).values()], nextCursor: null };
}

export async function exportSavedMemories(): Promise<string> {
  const list = await loadSavedMemories();
  const entries: SavedMemory[] = [];
  for (const summary of list.entries) {
    const result = await memoryRequest<{ entry: SavedMemory }>(`/${encodeURIComponent(summary.id)}`);
    entries.push(result.entry);
  }
  // Exclude extraction credentials and diagnostic logs from the portable export.
  return JSON.stringify({ format: 'pixflow-memory', version: 1, enabled: list.enabled,
    chatExtractionEnabled: list.chatExtractionEnabled, index: list.index, entries }, null, 2);
}

export function memoryIndexOf(value: unknown): Array<{ id: string; type: string; name: string; description: string }> {
  if (value && typeof value === 'object' && (value as { enabled?: boolean }).enabled === false) return [];
  const entries = value && typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries)
    ? (value as { entries: unknown[] }).entries : [];
  return entries.slice(0, 24).map((entry) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return { id: String(item.id || ''), type: String(item.type || ''), name: String(item.name || ''), description: String(item.description || '') };
  }).filter((entry) => entry.id && entry.name);
}
