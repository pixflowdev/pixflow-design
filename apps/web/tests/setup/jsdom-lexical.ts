// jsdom does not implement geometry for Range/Element, but Lexical's
// `updateDOMSelection` calls `getBoundingClientRect()` on the collapsed
// selection target whenever the editor is the active element (to scroll it
// into view). With a real textarea this never ran; now that HomeHero embeds
// the Lexical contenteditable and we call `editor.focus()`, focused commits
// hit that path and throw `getBoundingClientRect is not a function` inside a
// timer/rAF callback (an uncaught exception that fails the run).
//
// These polyfills are purely additive — they only define geometry methods
// jsdom is missing — so they change no behavior in browsers or node-env
// tests (guarded on `window`). They let the same Lexical editor that already
// powers the project composer be exercised under jsdom on the homepage.

if (typeof window !== 'undefined') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const zeroRect = (): DOMRect => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  });

  if (typeof Range !== 'undefined') {
    if (typeof Range.prototype.getBoundingClientRect !== 'function') {
      Range.prototype.getBoundingClientRect = zeroRect;
    }
    if (typeof Range.prototype.getClientRects !== 'function') {
      Range.prototype.getClientRects = (() =>
        Object.assign([], { item: () => null })) as unknown as Range['getClientRects'];
    }
  }

  if (
    typeof Element !== 'undefined' &&
    typeof Element.prototype.scrollIntoView !== 'function'
  ) {
    Element.prototype.scrollIntoView = () => {};
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // jsdom exposes these media APIs as methods that only emit
  // "Not implemented" errors. Neutral defaults keep unrelated component
  // tests quiet; suites that exercise drawing install richer local spies.
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext'];
  }
  if (typeof HTMLMediaElement !== 'undefined') {
    HTMLMediaElement.prototype.pause = () => {};
  }
}
