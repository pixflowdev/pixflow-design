import { useEffect, useState } from 'react';
import { fetchProjectFiles } from '../providers/registry';
import type { ProjectFile } from '../types';

/** Load only the open conversation's files, once on entry and after a turn.
 * A late response from a previous chat must never expose its attachments here. */
export function useConversationFiles(projectId: string | null, completedTurn: string) {
  const [snapshot, setSnapshot] = useState<{ projectId: string; files: ProjectFile[] } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void fetchProjectFiles(projectId, { activeWorkspace: true }).then(files => {
      if (active) setSnapshot({ projectId, files });
    }).catch(() => { /* Keep the last known files during a transient disconnect. */ });
    return () => { active = false; };
  }, [projectId, completedTurn]);
  return snapshot?.projectId === projectId ? snapshot.files : [];
}
