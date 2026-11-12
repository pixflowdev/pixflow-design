export type MediaFolderProvider = 'pixflow' | 'happyfiles';
export interface MediaFolder { id: number; name: string; parent: number; count: number; position: number }
export interface MediaFolderInventory { provider: MediaFolderProvider; folders: MediaFolder[]; writable: boolean; happyfilesAvailable: boolean; multiple: boolean }
export interface MediaFolderChange { provider: MediaFolderProvider; action: 'create' | 'update' | 'delete' | 'assign' | 'reorder'; id?: number; beforeId?: number; name?: string; parent?: number; attachmentIds?: number[]; append?: boolean }
