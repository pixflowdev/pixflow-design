import type { ChatSessionMode } from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment } from '../types';
import type { ChatSendMeta } from './ChatComposer';

/** The home composer and conversation must deliver the same complete turn. */
export interface WorkspaceFirstTurn {
  autoSend?: boolean;
  /** In-memory user gesture only: never restart the microphone after a reload. */
  startVoice?: boolean;
  prompt: string;
  attachments: ChatAttachment[];
  comments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
  sessionMode: ChatSessionMode;
}

export interface WorkspaceCreateHandoff {
  existingProjectId?: string;
  firstTurn?: WorkspaceFirstTurn;
}

const pending = new Map<string, WorkspaceFirstTurn>();
const key = (id: string) => `pixflow:workspace-first-turn:${id}`;

export function stageWorkspaceFirstTurn(id: string, turn: WorkspaceFirstTurn): void {
  pending.set(id, turn);
  try {
    // A live voice connection is never serializable or replayable after reload.
    const { voice: _voice, ...meta } = turn.meta ?? {};
    sessionStorage.setItem(key(id), JSON.stringify({ ...turn, startVoice: undefined, ...(turn.startVoice ? { autoSend: false } : {}), meta }));
  } catch { /* The in-memory handoff still works when storage is unavailable. */ }
}

export function readWorkspaceFirstTurn(id: string): WorkspaceFirstTurn | null {
  const current = pending.get(id);
  if (current) return current;
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as WorkspaceFirstTurn;
    if (typeof value.prompt !== 'string' || !Array.isArray(value.attachments) || !Array.isArray(value.comments)
      || !['design', 'plan', 'chat'].includes(value.sessionMode)) return null;
    return value;
  } catch { return null; }
}

export function clearWorkspaceFirstTurn(id: string): void {
  pending.delete(id);
  try { sessionStorage.removeItem(key(id)); } catch { /* Storage is optional. */ }
}
