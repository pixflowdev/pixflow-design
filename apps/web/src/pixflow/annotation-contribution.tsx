import * as I18n from '../i18n';
import type { AnnotationHoverPopoverProps, BoardComposerPopoverProps } from './annotation-board-contract';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import type { PreviewDrawOverlayProps } from './preview-annotation-contract';
import { useAnnotationAvailability } from './annotation-availability';

export interface PageAnnotationControlProps {
  onSend?: (prompt: string, screenshots?: File[]) => Promise<boolean>;
  onAdd: (prompt: string, screenshots?: File[]) => void | Promise<void>;
  /** Append ordinary reference text without replacing annotation or attachment state. */
  onAddText?: (prompt: string) => void | Promise<void>;
  onOpenSettings: () => void; disabled: boolean; streaming: boolean; contextKey?: string; draftPrompt?: string;
}
export interface AnnotationContribution {
  AnnotationHoverPopover: React.ComponentType<AnnotationHoverPopoverProps>;
  BoardComposerPopover: React.ComponentType<BoardComposerPopoverProps>;
  PageAnnotationControl: React.ComponentType<PageAnnotationControlProps>;
  PreviewDrawOverlay: React.ComponentType<PreviewDrawOverlayProps>;
}
export type AnnotationFactory = (host: { modules: Record<string, unknown> }) => AnnotationContribution;
let factory: AnnotationFactory | undefined, contribution: AnnotationContribution | undefined;
/** Use the calling surface's React instance, including the separately built Bricks panel.
 * Pro provides implementations; Free never imports or downloads premium modules. */
function renderer() {
  const next = (window as typeof window & { PixflowAnnotationsFactory?: AnnotationFactory }).PixflowAnnotationsFactory;
  if (next !== factory) {
    factory = next;
    contribution = next?.({ modules: { react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSXRuntime, 'pixflow-host-i18n': I18n } });
  }
  return contribution;
}
export function PageAnnotationControl(props: PageAnnotationControlProps) {
  const available = useAnnotationAvailability();
  const Component = available && renderer()?.PageAnnotationControl;
  return Component ? <Component {...props} /> : null;
}
export function PreviewDrawOverlay(props: PreviewDrawOverlayProps) {
  const available = useAnnotationAvailability();
  const Component = available && renderer()?.PreviewDrawOverlay;
  return Component ? <Component {...props} /> : <>{props.children}</>;
}

export function AnnotationHoverPopover(props: AnnotationHoverPopoverProps) {
  const Component = useAnnotationAvailability() && renderer()?.AnnotationHoverPopover;
  return Component ? <Component {...props} /> : null;
}
export function BoardComposerPopover(props: BoardComposerPopoverProps) {
  const Component = useAnnotationAvailability() && renderer()?.BoardComposerPopover;
  return Component ? <Component {...props} /> : null;
}
