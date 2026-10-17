import type { ReactNode } from 'react';
import type { PreviewVisualMarkKind } from '../types';
export interface Point { x: number; y: number }
export interface Stroke { points: Point[] }
export interface NormalizedRect { x: number; y: number; width: number; height: number }
export type MarkTool = 'box' | 'pen';
export interface CaptureTarget {
  filePath?: string;
  elementId?: string;
  selector?: string;
  label?: string;
  text?: string;
  position: { x: number; y: number; width: number; height: number };
  htmlHint?: string;
}
export interface PreviewSnapshot {
  dataUrl: string;
  w: number;
  h: number;
}
export type CaptureFrameRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export const ANNOTATION_EVENT = 'opendesign:annotation';
export type AnnotationAction = 'draft' | 'queue' | 'send';
export type DrawToolbarElement =
  | 'rect'
  | 'pen'
  | 'undo'
  | 'redo'
  | 'attach_image'
  | 'annotation_submit'
  | 'exit';

export interface AnnotationEventDetail {
  file: File | null;
  note: string;
  action: AnnotationAction;
  filePath?: string;
  markKind?: PreviewVisualMarkKind;
  bounds?: { x: number; y: number; width: number; height: number };
  target?: CaptureTarget | null;
  /** Images the user attached in the markup composer to combine with the mark. */
  extraFiles?: File[];
  ack?: (result: { ok: boolean; message?: string }) => void;
}

export interface PreviewDrawOverlayProps {
  children: ReactNode;
  active?: boolean;
  captureViewport?: boolean;
  onActiveChange?: (active: boolean) => void;
  captureTarget?: CaptureTarget | null;
  captureSnapshot?: () => Promise<PreviewSnapshot | null>;
  captureFrameRect?: () => CaptureFrameRect | null;
  filePath?: string;
  hideChrome?: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  onToolbarClick?: (element: DrawToolbarElement, submitAction?: AnnotationAction) => void;
}
