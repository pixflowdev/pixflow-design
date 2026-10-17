import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from 'lexical';
import { $createMentionNode } from './MentionNode';
import { buildInlineMentionParts, type InlineMentionEntity } from '../../utils/inlineMentions';
import { pageAnnotationParts } from '../../pixflow/page-annotation';
import { $createAnnotationNode } from './AnnotationNode';
import { $createAnnotationBatchNode } from './AnnotationBatchNode';
import { annotationDraftParts } from '../../pixflow/annotation-draft';

// Rebuild the whole editor from a plain `@token` string. Known `@token`
// runs (matched against `entities`) become atomic MentionNodes; everything
// else is plain text. Newlines map to LineBreakNodes inside a single
// paragraph so serialization round-trips to single `\n`. Caret is placed at
// the end inside the same update so post-seed typing keeps the caret.
export function setComposerFromText(
  editor: LexicalEditor,
  text: string,
  entities: InlineMentionEntity[],
): void {
  // `discrete: true` commits the update synchronously. This matters both for
  // tests reading the state back on the next line AND for the host's
  // setText/clear → onChange round-trip, where a deferred update could let a
  // stale serialize slip through before the rebuild lands. On a mounted editor
  // it behaves like a normal update (just flushed immediately).
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      const appendText = (text: string) => {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) p.append($createLineBreakNode());
        if (!line) return;
        const parts = buildInlineMentionParts(line, entities, { highlightUnknown: false });
        if (!parts) {
          p.append($createTextNode(line));
          return;
        }
        for (const part of parts) {
          if (part.kind === 'mention' && part.entity.kind !== 'unknown') {
            p.append(
              $createMentionNode({
                mentionId: part.entity.id,
                mentionKind: part.entity.kind,
                token: part.text,
                label: part.entity.label,
                title: part.entity.title,
                accentColor: part.entity.accentColor,
              }),
            );
          } else if (part.text) {
            p.append($createTextNode(part.text));
          }
        }
      });
      };
      for (const draftPart of annotationDraftParts(text)) {
        if (typeof draftPart !== 'string') {
          p.append($createAnnotationBatchNode(draftPart.annotations));
          continue;
        }
      for (const part of pageAnnotationParts(draftPart)) {
        if (typeof part === 'string') appendText(part);
        else {
          if (p.getChildrenSize()) p.append($createLineBreakNode());
          appendText(part.comment);
          p.append($createLineBreakNode(), $createAnnotationNode(part.target), $createLineBreakNode());
        }
      }
      }
      root.append(p);
      p.selectEnd();
    },
    { discrete: true },
  );
}
