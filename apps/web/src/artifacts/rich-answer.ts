import { computeSkipRanges, rangeContains } from './markdown-context';
import { splitOnQuestionForms, type FormSegment } from './question-form';

/** Display-only decoding. Persisted source stays lossless; unknown OD cards never run actions. */
export function splitRichAnswer(source: string, live = false): FormSegment[] {
  const result: FormSegment[] = [];
  let remaining = source;
  let prose = '';
  const append = () => { if (prose) result.push({kind:'text',text:prose}); prose=''; };
  while (remaining) {
    const view = prose + remaining;
    const {ranges, unclosedFenceStart} = computeSkipRanges(view);
    const code = unclosedFenceStart === null ? ranges : [...ranges, [unclosedFenceStart, view.length] as const];
    const open = /<(question-form|ask-question|od-card)(?=\s|>)[^>]*>/gi;
    let match: RegExpExecArray | null;
    let found: RegExpExecArray | null = null;
    while ((match=open.exec(remaining))) {
      if (!rangeContains(code, prose.length+match.index)) { found=match; break; }
    }
    if (!found) {
      // Withhold only a possible protocol prefix at the live tail, not ordinary '<' prose.
      const partial = live ? /<(?:question-form|ask-question|od-card)?[^<>]*$/i.exec(remaining) : null;
      const tail=partial?.[0].toLowerCase() ?? '';
      const prefix=tail.length>1 && ['<question-form','<ask-question','<od-card'].some(tag=>tag.startsWith(tail) || tail.startsWith(tag));
      prose += prefix && partial && !rangeContains(code,prose.length+partial.index) ? remaining.slice(0,partial.index) : remaining;
      break;
    }
    prose += remaining.slice(0,found.index);
    const tag=found[1]!.toLowerCase();
    const bodyStart=found.index+found[0].length;
    // Consume the whole outer envelope, including malformed nested envelopes.
    // Stopping at the first closing tag leaks the outer closing tag into prose.
    const boundaries = new RegExp(`<(/?)${tag}(?=\\s|>)[^>]*>`, 'gi');
    boundaries.lastIndex = bodyStart;
    let depth = 1;
    let ending: RegExpExecArray | null = null;
    let boundary: RegExpExecArray | null;
    while ((boundary = boundaries.exec(remaining))) {
      depth += boundary[1] ? -1 : 1;
      if (depth === 0) { ending = boundary; break; }
    }
    if (!ending) break; // Incomplete protocol stays out of prose even after an interrupted run.
    const end=ending.index+ending[0].length;
    const raw=remaining.slice(found.index,end);
    if (tag !== 'od-card') {
      const nested=/<(?:question-form|ask-question|od-card)(?=\s|>)/i.test(remaining.slice(bodyStart,ending.index));
      const form=nested ? undefined : splitOnQuestionForms(raw).find(segment=>segment.kind==='form');
      if (form) { append(); result.push(form); }
    }
    remaining=remaining.slice(end);
  }
  append();
  return result;
}
