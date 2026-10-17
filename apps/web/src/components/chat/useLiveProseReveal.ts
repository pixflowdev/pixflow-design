import { useEffect, useRef, type RefObject } from 'react';

/** Fade only new prose blocks. Never rewrites React text, card controls or historical content. */
export function useLiveProseReveal(root: RefObject<HTMLDivElement | null>, live: boolean, revision: string) {
  const seen = useRef(new WeakSet<Element>());
  const mounted = useRef(false);
  useEffect(() => {
    const host=root.current;
    if(!host)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const selecting=!!window.getSelection()?.toString();
    for(const node of host.querySelectorAll(':scope > .stream-prose > p, :scope > .stream-prose > ul, :scope > .stream-prose > ol, :scope > .stream-prose > h1, :scope > .stream-prose > h2, :scope > .stream-prose > h3')) {
      if(mounted.current && live && !seen.current.has(node) && !reduced && !selecting && !document.hidden && typeof node.animate==='function') {
        node.animate([{opacity:0.65},{opacity:1}],{duration:140,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
      }
      seen.current.add(node);
    }
    mounted.current=true;
  },[root,live,revision]);
}
