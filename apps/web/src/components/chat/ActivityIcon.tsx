import {
  IconCircles, IconFileText, IconListDetails, IconPencil, IconSearch,
  IconTerminal2, IconTool, IconWorld, IconCircleCheck,
} from '@tabler/icons-react';
import type { ActivityAction } from './activity-label';

export type ActivityIconKind = ActivityAction | 'thinking' | 'mixed' | 'verify';
const icons = {
  command: IconTerminal2,
  browser: IconWorld,
  edit: IconPencil,
  read: IconFileText,
  search: IconSearch,
  thinking: IconCircles,
  tools: IconTool,
  mixed: IconListDetails,
  verify: IconCircleCheck,
};

/** Decorative activity identity, independent of provider and translated label. */
export function ActivityIcon({ kind }: { kind: ActivityIconKind }) {
  const Glyph = icons[kind];
  return <Glyph size={16} stroke={1.6} aria-hidden="true" focusable="false"
    data-activity-icon={kind} style={{ flexShrink: 0 }} />;
}
