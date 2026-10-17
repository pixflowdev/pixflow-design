import type { ComponentType } from 'react';

export interface PixflowIconPackInventoryItem {
  id: string;
  name: string;
  file?: string;
  previewUrl: string;
}

/** Public host surface implemented by the separately distributed Assets module. */
export interface AssetsContribution {
  PixflowGoogleFontsSection: ComponentType;
  PixflowIconPacksSection: ComponentType<{ theme: 'light' | 'dark' }>;
  IconSetBuilderModal: ComponentType<{
    portalContainer?: HTMLElement;
    anchor?: HTMLElement | null;
    open: boolean;
    theme: 'light' | 'dark';
    setName: string;
    inventory: PixflowIconPackInventoryItem[];
    selectedIds: string[];
    loading: boolean;
    busy: boolean;
    message: string;
    error: boolean;
    saveAndInstallLabel: string;
    onClose: () => void;
    onToggle: (iconId: string) => void;
    onSave: () => void;
    onSaveAndInstall: () => void;
  }>;
}
