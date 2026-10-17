// @vitest-environment jsdom
import { useRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveProseReveal } from '../../src/components/chat/useLiveProseReveal';
function Prose({lines,live=true}:{lines:string[];live?:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  useLiveProseReveal(root,live,lines.join('\n'));
  return <div ref={root}><div className="stream-prose">{lines.map((line,i)=><p key={i}>{line}</p>)}</div><button>Untouched card</button></div>;
}
const originalAnimate=Object.getOwnPropertyDescriptor(Element.prototype,'animate');
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();if(originalAnimate)Object.defineProperty(Element.prototype,'animate',originalAnimate);else delete (Element.prototype as unknown as {animate?:unknown}).animate;});
it('reveals only new blocks without changing text, replaying history or delaying completion',()=>{
  const animate=vi.fn();
  Object.defineProperty(Element.prototype,'animate',{value:animate,configurable:true});
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const view=render(<Prose lines={['History']}/>);
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Prose lines={['History','New text']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Prose lines={['History','New text grows']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Prose lines={['History','New text grows','Final text']} live={false}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(view.container.textContent).toContain('Final text');
});
it('respects reduced motion',()=>{
  const animate=vi.fn();Object.defineProperty(Element.prototype,'animate',{value:animate,configurable:true});
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const view=render(<Prose lines={['History']}/>);view.rerender(<Prose lines={['History','New']}/>);
  expect(animate).not.toHaveBeenCalled();
});
it('does not animate while hidden or replay hidden text when returning',()=>{
  const animate=vi.fn();Object.defineProperty(Element.prototype,'animate',{value:animate,configurable:true});
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
  const view=render(<Prose lines={['History']}/>);view.rerender(<Prose lines={['History','Hidden text']}/>);
  hidden.mockReturnValue(false);view.rerender(<Prose lines={['History','Hidden text grows']}/>);
  expect(animate).not.toHaveBeenCalled();
});
it('preserves selection and keyboard focus while new text arrives',()=>{
  const animate=vi.fn();Object.defineProperty(Element.prototype,'animate',{value:animate,configurable:true});
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const view=render(<Prose lines={['Selected history']}/>);
  const button=view.container.querySelector('button')!;button.focus();
  const range=document.createRange();range.selectNodeContents(view.container.querySelector('p')!);
  const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
  view.rerender(<Prose lines={['Selected history','New text']}/>);
  expect(selection.toString()).toBe('Selected history');expect(document.activeElement).toBe(button);
  expect(animate).not.toHaveBeenCalled();selection.removeAllRanges();
});
