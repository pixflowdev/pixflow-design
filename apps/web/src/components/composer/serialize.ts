import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  type EditorState,
} from 'lexical';
import { $isMentionNode } from './MentionNode';
import type { InlineMentionEntity } from '../../utils/inlineMentions';
import type { ChatSkillMention } from '@open-design/contracts';

export interface SerializedComposer {
  text: string;
  /** Entities backed by an actual MentionNode currently in the tree. */
  present: InlineMentionEntity[];
  skillMentions: ChatSkillMention[];
}

// Walk the tree by hand rather than calling `root.getTextContent()`, which
// joins block-level children with `\n\n`. The editor is constrained to a
// single paragraph (INSERT_PARAGRAPH is rewritten to a line break), so the
// outer block join is defensive only — when it does fire it uses a single
// `\n` so the wire format never grows a phantom blank line.
export function serializeComposer(state: EditorState): SerializedComposer {
  return state.read(() => {
    const present: InlineMentionEntity[] = [];
    const skillMentions: ChatSkillMention[] = [];
    const blocks: string[] = [];
    let blockStart = 0;
    for (const block of $getRoot().getChildren()) {
      if (!$isParagraphNode(block)) {
        // Stray non-paragraph block (shouldn't happen): fall back to its text.
        const text = block.getTextContent();
        blocks.push(text);
        blockStart += text.length + 1;
        continue;
      }
      let line = '';
      for (const child of block.getChildren()) {
        if ($isMentionNode(child)) {
          const entity = child.getEntity();
          const token = child.getToken();
          if (entity.kind === 'skill') {
            skillMentions.push({ start: blockStart + line.length, token, label: entity.label });
          }
          line += token;
          present.push(entity);
        } else if ($isLineBreakNode(child)) {
          line += '\n';
        } else if ($isTextNode(child)) {
          line += child.getTextContent();
        } else if ($isElementNode(child)) {
          line += child.getTextContent();
        }
      }
      blocks.push(line);
      blockStart += line.length + 1;
    }
    return { text: blocks.join('\n'), present, skillMentions };
  });
}
