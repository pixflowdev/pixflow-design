import type { PixflowDesignSystem, PixflowEtchSystemPreview, PixflowElementorSystemPreview } from '@open-design/contracts';

/** Client contribution boundary. Core never imports a premium implementation. */
type Previews = { etch: PixflowEtchSystemPreview; elementor: PixflowElementorSystemPreview };
export type BuilderClientExtension<T = PixflowEtchSystemPreview> = {
  context?: (context: Record<string, any>) => Record<string, any>;
  designSystem?: {
    request<T>(path: string, body?: Record<string, unknown>): Promise<T>;
    preview(item: PixflowDesignSystem, global: boolean): Promise<T>;
    apply(item: PixflowDesignSystem, preview: T, global: boolean, overwrite: boolean): Promise<unknown>;
    rollback(): Promise<unknown>;
  };
};

type ExtensionWindow = Window & { pixflowBuilderExtensions?: { [K in keyof Previews]?: BuilderClientExtension<Previews[K]> } };
export function registerBuilderClient<K extends keyof Previews>(id: K, extension: BuilderClientExtension<Previews[K]>): void {
  const host = window as ExtensionWindow;
  const extensions = host.pixflowBuilderExtensions ??= {};
  if (extensions[id]) throw new Error(`Builder client already registered: ${id}`);
  (extensions as Record<K, BuilderClientExtension<Previews[K]>>)[id] = extension;
}
export function builderClient<K extends keyof Previews>(id: K): BuilderClientExtension<Previews[K]> {
  const extension = (window as ExtensionWindow).pixflowBuilderExtensions?.[id];
  if (!extension) throw new Error('This builder integration is unavailable. Activate Pixflow Design Pro and reload the editor.');
  return extension as BuilderClientExtension<Previews[K]>;
}
export function applyBuilderContext<T extends Record<string, any>>(context: T): Record<string, any> {
  const extension = (window as ExtensionWindow).pixflowBuilderExtensions?.[context.editor as keyof Previews];
  return extension?.context?.(context) ?? context;
}
