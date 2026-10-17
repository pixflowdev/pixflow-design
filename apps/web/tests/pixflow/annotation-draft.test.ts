import {describe,it,expect} from 'vitest';
import {annotationDraftParts,annotationsInDraft,formatAnnotationDraft,replaceDraftAnnotations} from '../../src/pixflow/annotation-draft';
import type {PageAnnotation} from '../../src/pixflow/page-annotation';
const note={comment:'A "quoted" { change }\nSecond line',target:{tag:'h1',label:'Heading',selector:'#hero',url:'https://example.test/'}} as PageAnnotation;
describe('annotation draft envelope',()=>{
  it('preserves text on either side and parses braces inside strings',()=>{
    const wire='Before\n'+formatAnnotationDraft([note])+'\nAfter';
    expect(annotationsInDraft(wire)).toEqual([note]);
    expect(annotationDraftParts(wire)).toEqual(['Before\n',{annotations:[note]},'\nAfter']);
    expect(replaceDraftAnnotations(wire,[])).toBe('Before\n\nAfter');
  });
  it('never hides malformed target data as an empty attachment',()=>{
    const invalid=formatAnnotationDraft([{...note,target:{...note.target,selector:undefined}}] as unknown as PageAnnotation[]);
    expect(annotationDraftParts(invalid)).toEqual([invalid]);
    expect(annotationsInDraft(invalid)).toEqual([]);
  });
  it('updates all comments atomically instead of appending another batch',()=>{
    const next=replaceDraftAnnotations(formatAnnotationDraft([note]),[note,{...note,comment:'Second'}]);
    expect(annotationDraftParts(next)).toHaveLength(1);
    expect(annotationsInDraft(next)).toHaveLength(2);
    expect(formatAnnotationDraft([])).toBe('');
  });
});
