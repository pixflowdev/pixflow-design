import type { PreviewCommentSnapshot } from '../comments';
import type { PreviewComment } from '../types';
import type { Dict } from '../i18n/types';
type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type PopoverBounds = { width: number; height: number; scrollLeft?: number; scrollTop?: number };
type PopoverOffset = { x: number; y: number };
export type AnnotationHoverPopoverProps = {
  target: PreviewCommentSnapshot;
  scale: number;
  // The card floats over the preview iframe at the cursor. Moving onto it pulls
  // the pointer off the iframe, which fires mouseout and would otherwise unmount
  // the card — the cursor then lands back on the iframe and re-triggers it,
  // flickering forever. The host uses these to pin the card while it is hovered
  // (ignoring the iframe's leave) so the tooltip stays put and its values stay
  // selectable/copyable.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};
export type BoardComposerPopoverProps = {
  target: PreviewCommentSnapshot;
  existing: PreviewComment | null;
  draft: string;
  notes: string[];
  onDraft: (value: string) => void;
  onAddDraft: () => void;
  onRemoveQueuedNote: (index: number) => void;
  onClose: () => void;
  onSaveComment: () => void | Promise<void>;
  onSendBatch: () => void | Promise<void>;
  onRemoveMember: (elementId: string) => void;
  onHoverMember?: (elementId: string | null) => void;
  onDeleteComment?: (commentId: string) => void | Promise<void>;
  /** Object-URL thumbnails for images the user attached to this comment. */
  images?: { file: File; url: string }[];
  /** Already-saved attachment thumbnails (read-only) for a re-opened comment. */
  existingImages?: { url: string; name: string }[];
  onAttachImages?: (files: File[]) => void;
  onRemoveImage?: (index: number) => void;
  onPreviewImage?: (index: number) => void;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  t: TranslateFn;
  scale?: number;
  bounds?: PopoverBounds;
  offset?: PopoverOffset;
  docked?: boolean;
  commenting?: boolean;
};
