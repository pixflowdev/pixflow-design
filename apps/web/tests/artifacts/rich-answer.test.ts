import { expect, it } from 'vitest';
import { splitRichAnswer } from '../../src/artifacts/rich-answer';
const card='<question-form id="choice">{"questions":[{"id":"name","label":"Name","type":"text"}]}</question-form>';
it('decodes supported answers and keeps source identity stable on replay',()=>{
  expect(splitRichAnswer('Before'+card+'After').map(s=>s.kind)).toEqual(['text','form','text']);
  expect(splitRichAnswer(card,true)).toEqual(splitRichAnswer(card,false));
});
it('preserves inline and fenced literal examples',()=>{
  for(const text of ['`'+card+'`','```json\n'+card+'\n```\n','```\n'+card]) expect(splitRichAnswer(text,true)).toEqual([{kind:'text',text}]);
});
it('hides malformed, unknown and nested protocol without losing adjacent prose',()=>{
  for(const tag of ['<question-form>{bad}</question-form>','<od-card>{"type":"execute","command":"bad"}</od-card>','<question-form>'+card+'</question-form>']) {
    const result=splitRichAnswer('Before'+tag+'After');
    expect(result.filter(s=>s.kind==='form')).toHaveLength(0);
    expect(result.map(s=>s.kind==='text'?s.text:'').join('')).toBe('BeforeAfter');
    expect(result.at(-1)).toMatchObject({kind:'text',text:expect.stringContaining('After')});
  }
});
it('does not let malformed payload fences hide the following valid card',()=>{
  expect(splitRichAnswer('<od-card>\n```\ninvalid</od-card>'+card).map(s=>s.kind)).toEqual(['form']);
});
it('buffers arbitrary opening and payload splits while retaining earlier prose',()=>{
  for(let i=2;i<card.length;i++) {
    expect(splitRichAnswer('Before'+card.slice(0,i),true)).toEqual([{kind:'text',text:'Before'}]);
  }
  expect(splitRichAnswer('ordinary < value',true)).toEqual([{kind:'text',text:'ordinary < value'}]);
});
