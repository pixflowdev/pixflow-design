import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  syncPixflowDesignSystemDraftIntoBricks,
  syncPixflowDesignSystemIntoBricks,
  syncPixflowDesignSystemStructureIntoBricks,
  syncBricksLibrarySystem,
} from '../../src/pixflow/framework-builder-sync';
import type { PixflowDesignSystemProfile } from '../../src/pixflow/framework';

const profile = {
  colors: {
    main: { background: '#ffffff', foreground: '#eeeeee', heading: '#111111', text: '#222222', accent: '#3366ff' },
    secondary: { background: '#111111', foreground: '#222222', heading: '#ffffff', text: '#eeeeee', accent: '#88aaff' },
    tertiary: { background: '#f4f4f4', foreground: '#dddddd', heading: '#101010', text: '#202020', accent: '#2255dd' },
    quaternary: { background: '#220f44', foreground: '#1a0b33', heading: '#ffffff', text: '#ffffff', accent: '#ffffff' },
  },
  sourcePalette: [],
  neutralTintHex: null,
  colorSchemeCount: 4,
  headingFont: 'Inter',
  bodyFont: 'Inter',
  typographySize: 'regular',
  headingWeightPreset: 'medium',
  headingStylePreset: 'default',
  designStyle: 'default',
  buttonStylePreset: 'default',
  buttonGradientEnd: '#bd1276',
  buttonRadius: 'medium',
  surfaceRadius: 'medium',
} satisfies PixflowDesignSystemProfile;

describe('Pixflow framework builder sync', () => {
  it('merges only the applied library system and preserves unsaved native styles', () => {
    const dom = new JSDOM('<html><head></head><body><main class="brx-body"></main></body></html>');
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('Node', dom.window.Node);
    const state = { globalClasses: [{ id: 'unsaved', settings: { _padding: '25px' } }], globalVariables: [{ id: 'local', name: 'local', value: '12px' }], themeStyles: { local: { label: 'Unsaved theme' } }, unsavedChanges: ['content'], forceRender: 0 };
    const host = dom.window.document.querySelector('.brx-body') as HTMLElement & { __vue_app__: unknown };
    host.__vue_app__ = { config: { globalProperties: { $_state: state } } };
    syncBricksLibrarySystem('pds-test', { globalClasses: [{ id: 'unsaved', settings: {} }, { id: 'pds-test-heading', name: 'heading' }], globalVariables: [{ id: 'pds-test-accent', name: 'pds-test-accent', value: '#123456' }], themeStyles: { unrelated: {}, 'pds-test': { label: 'Applied' } } });
    expect(state.globalClasses).toEqual([{ id: 'unsaved', settings: { _padding: '25px' } }, { id: 'pds-test-heading', name: 'heading' }]);
    expect(state.globalVariables[0]?.id).toBe('local');
    expect(state.themeStyles).toEqual({ local: { label: 'Unsaved theme' }, 'pds-test': { label: 'Applied' } });
    expect(state.unsavedChanges).toEqual(['content']);
    expect(dom.window.document.getElementById('pixflow-library-pds-test')?.textContent).toContain('--pds-test-accent:#123456');
    dom.window.close();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('announces the authoritative scheme count to the live canvas bridge', () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<!doctype html><html><head></head><body><iframe></iframe></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/builder',
    });
    const iframe = dom.window.document.querySelector('iframe');
    const canvasWindow = iframe?.contentWindow;
    const canvasDocument = iframe?.contentDocument;
    if (!canvasWindow || !canvasDocument) throw new Error('Expected a same-origin canvas document.');
    canvasDocument.body.innerHTML = '<main class="brx-body"></main>';
    const canvasHost = canvasDocument.querySelector('.brx-body') as HTMLElement & {
      __vue_app__?: Record<string, unknown>;
    };
    const rerenderControls = vi.fn();
    canvasHost.__vue_app__ = {
      config: {
        globalProperties: {
          $_state: { rerenderControls: 0 },
          $_rerenderControls: rerenderControls,
        },
      },
    };

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('HTMLStyleElement', dom.window.HTMLStyleElement);

    const received: number[] = [];
    canvasWindow.addEventListener('pixflow-design:live-structure-profile', (event) => {
      received.push(Number((event as CustomEvent).detail?.colorSchemeCount));
    });

    syncPixflowDesignSystemIntoBricks({}, profile);

    expect(received).toEqual([4]);
    expect(rerenderControls).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(rerenderControls).toHaveBeenCalledTimes(3);
    dom.window.close();
  });

  it('posts the live scheme count into canvas frames whose documents are inaccessible', () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<!doctype html><html><body><iframe id="bricks-builder-iframe"></iframe></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/builder',
    });
    const frame = dom.window.document.querySelector('iframe');
    const canvasWindow = frame?.contentWindow;
    if (!canvasWindow) throw new Error('Expected a canvas window.');
    const postMessage = vi.spyOn(canvasWindow, 'postMessage');
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: null });

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('HTMLStyleElement', dom.window.HTMLStyleElement);

    syncPixflowDesignSystemStructureIntoBricks(profile);

    expect(postMessage).toHaveBeenCalledWith({
      source: 'pixflow-design',
      type: 'pixflow-design:live-structure-profile',
      profile: { colorSchemeCount: 4 },
    }, dom.window.location.origin);
    dom.window.close();
  });

  it('updates the provided Bricks store and rebuilds its global-class lookup after save', () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<!doctype html><html><head></head><body><main class=brx-body></main></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/builder',
    });
    const host = dom.window.document.querySelector('.brx-body') as HTMLElement & {
      __vue_app__?: Record<string, unknown>;
    };
    const staleClasses = [
      { id: 'stale', name: 'color-scheme-5' },
      { id: 'rwbopf', name: 'color-scheme-2' },
    ];
    const providedState = {
      content: [],
      globalClasses: staleClasses,
      globalClassIndexById: { stale: 0, rwbopf: 1 },
      globalClassesTimestamp: 'before-save',
      styleManager: {
        globalClasses: staleClasses,
      },
      forceRender: 0,
      rerenderControls: 0,
      globalChanges: 0,
      unsavedChanges: ['user-change'],
    };
    const forceRender = vi.fn();
    const forceRenderActiveInstance = vi.fn();
    const rerenderControls = vi.fn();
    host.__vue_app__ = {
      config: {
        globalProperties: {
          $_forceRender: forceRender,
          $_forceRenderActiveInstance: forceRenderActiveInstance,
          $_rerenderControls: rerenderControls,
        },
      },
      _context: {
        provides: { bricksStore: providedState },
      },
    };

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('HTMLStyleElement', dom.window.HTMLStyleElement);

    const nextClasses = [
      { id: 'rwbopf', name: 'color-scheme-2' },
      { id: 'eymqui', name: 'color-scheme-3' },
      { id: 'pfsq04', name: 'color-scheme-4' },
    ];
    syncPixflowDesignSystemIntoBricks({ globalClasses: nextClasses }, profile);

    expect(providedState.globalClasses).toEqual(nextClasses);
    expect(providedState.globalClassIndexById).toEqual({ rwbopf: 0, eymqui: 1, pfsq04: 2 });
    expect(providedState.globalClassesTimestamp).not.toBe('before-save');
    expect(providedState.styleManager.globalClasses).toBe(providedState.globalClasses);
    expect(providedState.unsavedChanges).toEqual(['user-change']);
    expect(forceRender).toHaveBeenCalledTimes(1);
    expect(forceRenderActiveInstance).toHaveBeenCalledTimes(1);
    expect(rerenderControls).toHaveBeenCalledTimes(1);
    dom.window.close();
  });

  it('publishes changed scheme colours to the canvas before the save response returns', () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<!doctype html><html><head></head><body><iframe></iframe></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/builder',
    });
    const iframe = dom.window.document.querySelector('iframe');
    const canvasDocument = iframe?.contentDocument;
    if (!canvasDocument) throw new Error('Expected a same-origin canvas document.');
    canvasDocument.head.innerHTML = '<style id="pixflow-color-scheme-classes">.color-scheme-2{--background:var(--s2-background);}</style>';
    canvasDocument.body.innerHTML = '<main class="brx-body"><section class="color-scheme-2"></section></main>';

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('HTMLStyleElement', dom.window.HTMLStyleElement);

    const changedProfile = {
      ...profile,
      colors: {
        ...profile.colors,
        secondary: {
          ...profile.colors.secondary,
          background: '#d83b48',
          foreground: '#ac2f39',
        },
      },
    } satisfies PixflowDesignSystemProfile;

    syncPixflowDesignSystemDraftIntoBricks(changedProfile);

    expect(canvasDocument.documentElement.style.getPropertyValue('--s2-background')).toBe('#d83b48');
    expect(canvasDocument.documentElement.style.getPropertyValue('--s2-foreground')).toBe('#ac2f39');
    expect(canvasDocument.getElementById('pixflow-design-system-live-sync')?.textContent).toContain(
      '.color-scheme-2',
    );
    dom.window.close();
  });
});
