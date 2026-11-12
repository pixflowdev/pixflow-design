import type { MediaFolderChange, MediaFolderInventory, MediaFolderProvider } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
export class MediaFoldersError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function mediaFolders(provider: MediaFolderProvider, change?: MediaFolderChange, signal?: AbortSignal): Promise<MediaFolderInventory> {
  const response = await pixflowWordPressRestFetch(`/media/folders?provider=${provider}`, change ? {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(change), signal,
  } : {cache:'no-store', signal});
  const result = await response.json();
  if (!response.ok) throw new MediaFoldersError(result.message || 'Could not update media folders.', response.status);
  return result;
}
