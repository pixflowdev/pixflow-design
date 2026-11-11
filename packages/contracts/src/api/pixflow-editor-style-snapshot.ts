/** Read-only style evidence, never executable agent instructions. */
export interface PixflowEditorStyleSnapshot {
  schema: 'pixflow.editor-styles.v1';
  editor: 'gutenberg' | 'elementor' | 'etch';
  site: string;
  documentId: string;
  revision: string;
  native: unknown;
  rendered: unknown;
  markdown: string;
}
